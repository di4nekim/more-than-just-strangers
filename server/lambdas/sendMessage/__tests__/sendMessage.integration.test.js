// Mock AWS SDK at the very top
const mockPostToConnection = jest.fn().mockReturnValue({
    promise: () => Promise.resolve({})
});
jest.mock('aws-sdk', () => {
    const originalModule = jest.requireActual('aws-sdk');
    return {
        ...originalModule,
        ApiGatewayManagementApi: jest.fn(() => ({
            postToConnection: mockPostToConnection
        }))
    };
});

const AWS = require('aws-sdk');
const { handler } = require('../index.js');

// Set up test environment variables
process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000';
process.env.AWS_REGION = 'us-east-1';
process.env.USER_METADATA_TABLE = 'UserMetadata';
process.env.CONVERSATIONS_TABLE = 'Conversations';
process.env.MESSAGES_TABLE = 'Messages';
process.env.WEBSOCKET_API_URL = 'http://localhost:3001';

// Initialize DynamoDB Document Client
const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION,
    endpoint: process.env.DYNAMODB_ENDPOINT,
    credentials: {
        accessKeyId: 'fake',
        secretAccessKey: 'fake'
    }
});

// Helper functions for test data management
async function createUser(userId, connectionId = null, chatId = null, ready = false) {
    const params = {
        TableName: process.env.USER_METADATA_TABLE,
        Item: {
            PK: `USER#${userId}`,
            connectionId,
            lastSeen: new Date().toISOString(),
            chatId,
            ready
        }
    };
    await dynamoDB.put(params).promise();
}

async function createConversation(chatId, userAId, userBId) {
    const params = {
        TableName: process.env.CONVERSATIONS_TABLE,
        Item: {
            PK: `CHAT#${chatId}`,
            GSI1_PK: `USER#${userAId}`,
            GSI1_SK: `CHAT#${chatId}`,
            userAId,
            userBId,
            lastMessage: {
                content: 'Previous message',
                sentAt: new Date().toISOString(),
                senderId: userAId,
                messageId: 'prev-msg-123'
            },
            lastUpdated: new Date().toISOString()
        }
    };
    await dynamoDB.put(params).promise();
}

async function cleanupTestData(userId, chatId) {
    // Clean up user metadata
    await dynamoDB.delete({
        TableName: process.env.USER_METADATA_TABLE,
        Key: { PK: `USER#${userId}` }
    }).promise();

    // Clean up conversation
    await dynamoDB.delete({
        TableName: process.env.CONVERSATIONS_TABLE,
        Key: { PK: `CHAT#${chatId}` }
    }).promise();

    // Clean up messages
    const messages = await dynamoDB.query({
        TableName: process.env.MESSAGES_TABLE,
        KeyConditionExpression: 'PK = :chatKey',
        ExpressionAttributeValues: {
            ':chatKey': `CHAT#${chatId}`
        }
    }).promise();

    for (const message of messages.Items || []) {
        await dynamoDB.delete({
            TableName: process.env.MESSAGES_TABLE,
            Key: {
                PK: message.PK,
                SK: message.SK
            }
        }).promise();
    }
}

describe('WebSocket Lambda Integration Tests', () => {
    const mockUserId = 'user1';
    const mockReceiverId = 'user2';
    const mockConnectionId = 'test-connection-id';
    const mockReceiverConnectionId = 'receiver-connection-id';
    const mockChatId = 'chat123';
    const mockMessageId = 'msg-123';
    const mockTimestamp = new Date().toISOString();

    beforeEach(async () => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Set up test data
        await createUser(mockUserId, mockConnectionId, mockChatId, true);
        await createUser(mockReceiverId, mockReceiverConnectionId, mockChatId, true);
        await createConversation(mockChatId, mockUserId, mockReceiverId);
    });

    afterEach(async () => {
        // Clean up test data
        await cleanupTestData(mockUserId, mockChatId);
        await cleanupTestData(mockReceiverId, mockChatId);
    });

    describe('Connect Action', () => {
        test('should successfully connect a new user', async () => {
            const newUserId = 'newUser';
            const event = {
                requestContext: {
                    connectionId: 'new-connection-id',
                    domainName: 'test.execute-api.region.amazonaws.com',
                    stage: 'test'
                },
                body: JSON.stringify({
                    action: 'connect',
                    data: {
                        userId: newUserId
                    }
                })
            };

            const response = await handler(event);
            expect(response.statusCode).toBe(200);
            expect(JSON.parse(response.body).message).toBe('Connection stored');

            // Verify user was created
            const user = await dynamoDB.get({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${newUserId}` }
            }).promise();

            expect(user.Item).toMatchObject({
                connectionId: 'new-connection-id',
                ready: false
            });
        });

        test('should connect existing user and send queued messages', async () => {
            // Create a queued message
            await dynamoDB.put({
                TableName: process.env.MESSAGES_TABLE,
                Item: {
                    PK: `CHAT#${mockChatId}`,
                    SK: `MSG#${mockMessageId}`,
                    messageId: mockMessageId,
                    chatId: mockChatId,
                    senderId: mockReceiverId,
                    content: 'Queued message',
                    sentAt: mockTimestamp,
                    queued: true
                }
            }).promise();

            const event = {
                requestContext: {
                    connectionId: mockConnectionId,
                    domainName: 'test.execute-api.region.amazonaws.com',
                    stage: 'test'
                },
                body: JSON.stringify({
                    action: 'connect',
                    data: {
                        userId: mockUserId
                    }
                })
            };

            const response = await handler(event);
            expect(response.statusCode).toBe(200);
            expect(JSON.parse(response.body).message).toBe('Connection stored');

            // Verify WebSocket message was sent
            expect(mockPostToConnection).toHaveBeenCalledWith({
                ConnectionId: mockConnectionId,
                Data: expect.stringContaining('"action":"message"')
            });
        });
    });

    describe('SendMessage Action', () => {
        test('should successfully send message when receiver is online', async () => {
            const event = {
                requestContext: {
                    connectionId: mockConnectionId,
                    domainName: 'test.execute-api.region.amazonaws.com',
                    stage: 'test'
                },
                body: JSON.stringify({
                    action: 'sendMessage',
                    data: {
                        chatId: mockChatId,
                        sentAt: mockTimestamp,
                        content: 'Hello, world!',
                        messageId: mockMessageId,
                        senderId: mockUserId
                    }
                })
            };

            const response = await handler(event);
            expect(response.statusCode).toBe(200);
            expect(JSON.parse(response.body).message).toBe('Message sent successfully');

            // Verify WebSocket message was attempted
            expect(mockPostToConnection).toHaveBeenCalledWith({
                ConnectionId: mockReceiverConnectionId,
                Data: expect.stringContaining('"action":"message"')
            });

            // Verify message was stored
            const messages = await dynamoDB.query({
                TableName: process.env.MESSAGES_TABLE,
                KeyConditionExpression: 'PK = :chatKey',
                ExpressionAttributeValues: {
                    ':chatKey': `CHAT#${mockChatId}`
                }
            }).promise();

            expect(messages.Items).toHaveLength(1);
            expect(messages.Items[0]).toMatchObject({
                chatId: mockChatId,
                messageId: mockMessageId,
                senderId: mockUserId,
                content: 'Hello, world!',
                sentAt: mockTimestamp,
                queued: false
            });

            // Verify conversation was updated with last message
            const conversation = await dynamoDB.get({
                TableName: process.env.CONVERSATIONS_TABLE,
                Key: { PK: `CHAT#${mockChatId}` }
            }).promise();

            expect(conversation.Item).toMatchObject({
                lastUpdated: mockTimestamp,
                lastMessage: {
                    content: 'Hello, world!',
                    sentAt: mockTimestamp
                }
            });
        });

        test('should store message when receiver is offline', async () => {
            // Set receiver offline by removing their connection
            await dynamoDB.update({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${mockReceiverId}` },
                UpdateExpression: 'SET connectionId = :connectionId',
                ExpressionAttributeValues: {
                    ':connectionId': null
                }
            }).promise();

            const event = {
                requestContext: {
                    connectionId: mockConnectionId,
                    domainName: 'test.execute-api.region.amazonaws.com',
                    stage: 'test'
                },
                body: JSON.stringify({
                    action: 'sendMessage',
                    data: {
                        chatId: mockChatId,
                        sentAt: mockTimestamp,
                        content: 'Hello, world!',
                        messageId: mockMessageId,
                        senderId: mockUserId
                    }
                })
            };

            const response = await handler(event);
            expect(response.statusCode).toBe(200);
            expect(JSON.parse(response.body).message).toBe('Message sent successfully');

            // Verify no WebSocket message was attempted
            expect(mockPostToConnection).not.toHaveBeenCalled();

            // Verify message was stored as queued
            const messages = await dynamoDB.query({
                TableName: process.env.MESSAGES_TABLE,
                KeyConditionExpression: 'PK = :chatKey',
                ExpressionAttributeValues: {
                    ':chatKey': `CHAT#${mockChatId}`
                }
            }).promise();

            expect(messages.Items).toHaveLength(1);
            expect(messages.Items[0]).toMatchObject({
                chatId: mockChatId,
                messageId: mockMessageId,
                senderId: mockUserId,
                content: 'Hello, world!',
                sentAt: mockTimestamp,
                queued: true
            });

            // Verify conversation was updated with last message even when receiver is offline
            const conversation = await dynamoDB.get({
                TableName: process.env.CONVERSATIONS_TABLE,
                Key: { PK: `CHAT#${mockChatId}` }
            }).promise();

            expect(conversation.Item).toMatchObject({
                lastUpdated: mockTimestamp,
                lastMessage: {
                    content: 'Hello, world!',
                    sentAt: mockTimestamp
                }
            });
        });

        test('should return 403 when sender connection does not match', async () => {
            const event = {
                requestContext: {
                    connectionId: 'different-connection-id',
                    domainName: 'test.execute-api.region.amazonaws.com',
                    stage: 'test'
                },
                body: JSON.stringify({
                    action: 'sendMessage',
                    data: {
                        chatId: mockChatId,
                        sentAt: mockTimestamp,
                        content: 'Hello, world!',
                        messageId: mockMessageId,
                        senderId: mockUserId
                    }
                })
            };

            const response = await handler(event);
            expect(response.statusCode).toBe(403);
            expect(JSON.parse(response.body).error).toBe('Sender connection does not match');

            // Verify no WebSocket message was attempted
            expect(mockPostToConnection).not.toHaveBeenCalled();
        });

        test('should return 404 when conversation not found', async () => {
            const event = {
                requestContext: {
                    connectionId: mockConnectionId,
                    domainName: 'test.execute-api.region.amazonaws.com',
                    stage: 'test'
                },
                body: JSON.stringify({
                    action: 'sendMessage',
                    data: {
                        chatId: 'non-existent-chat',
                        sentAt: mockTimestamp,
                        content: 'Hello, world!',
                        messageId: mockMessageId,
                        senderId: mockUserId
                    }
                })
            };

            const response = await handler(event);
            expect(response.statusCode).toBe(404);
            expect(JSON.parse(response.body).error).toBe('Conversation not found');

            // Verify no WebSocket message was attempted
            expect(mockPostToConnection).not.toHaveBeenCalled();
        });

        test('should return 400 for invalid message data', async () => {
            const event = {
                requestContext: {
                    connectionId: mockConnectionId,
                    domainName: 'test.execute-api.region.amazonaws.com',
                    stage: 'test'
                },
                body: JSON.stringify({
                    action: 'sendMessage',
                    data: {
                        chatId: mockChatId,
                        // Missing required fields
                        content: '',
                        messageId: '',
                        senderId: '',
                        sentAt: 'invalid-date'
                    }
                })
            };

            const response = await handler(event);
            expect(response.statusCode).toBe(400);
            expect(JSON.parse(response.body).error).toBe('Invalid or missing fields');

            // Verify no WebSocket message was attempted
            expect(mockPostToConnection).not.toHaveBeenCalled();
        });
    });
}); 