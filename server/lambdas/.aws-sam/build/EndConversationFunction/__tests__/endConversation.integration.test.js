const AWS = require('aws-sdk');
const { handler } = require('../index');

// Mock AWS SDK for websocket operations
jest.mock('aws-sdk', () => {
    const mockPostToConnection = jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
    });

    const mockApiGateway = {
        postToConnection: mockPostToConnection
    };

    const mockDynamoDB = {
        get: jest.fn().mockReturnValue({
            promise: jest.fn()
        }),
        update: jest.fn().mockReturnValue({
            promise: jest.fn()
        })
    };

    return {
        DynamoDB: {
            DocumentClient: jest.fn(() => mockDynamoDB)
        },
        ApiGatewayManagementApi: jest.fn(() => mockApiGateway),
        mockPostToConnection,
        mockDynamoDB
    };
});

describe('endConversation Lambda Integration Tests', () => {
    const mockChatId = 'test-chat-123';
    const mockUserId = 'user-123';
    const mockOtherUserId = 'user-456';
    const mockConnectionId = 'connection-123';
    const mockReason = 'test reason';

    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();
        
        // Set up environment variables
        process.env.CONVERSATIONS_TABLE = 'test-conversations-table';
        process.env.USER_METADATA_TABLE = 'test-user-metadata-table';
        process.env.WEBSOCKET_API_URL = 'test-websocket-endpoint';
        process.env.AWS_REGION = 'us-east-1';
    });

    test('successfully ends conversation and notifies other participant', async () => {
        // Mock DynamoDB responses
        AWS.mockDynamoDB.get.mockImplementation((params) => {
            if (params.TableName === process.env.CONVERSATIONS_TABLE) {
                return {
                    promise: () => Promise.resolve({
                        Item: {
                            PK: `CHAT#${mockChatId}`,
                            participants: [mockUserId, mockOtherUserId]
                        }
                    })
                };
            } else if (params.TableName === process.env.USER_METADATA_TABLE) {
                return {
                    promise: () => Promise.resolve({
                        Item: {
                            PK: `USER#${mockOtherUserId}`,
                            connectionId: mockConnectionId
                        }
                    })
                };
            }
        });

        AWS.mockDynamoDB.update.mockReturnValue({
            promise: () => Promise.resolve({})
        });

        const event = {
            body: JSON.stringify({
                data: {
                    chatId: mockChatId,
                    userId: mockUserId,
                    reason: mockReason
                }
            })
        };

        const response = await handler(event);
        const responseBody = JSON.parse(response.body);

        // Verify response
        expect(response.statusCode).toBe(200);
        expect(responseBody.action).toBe('conversationEnded');
        expect(responseBody.data.chatId).toBe(mockChatId);
        expect(responseBody.data.endedBy).toBe(mockUserId);

        // Verify DynamoDB calls
        expect(AWS.mockDynamoDB.get).toHaveBeenCalledTimes(2);
        expect(AWS.mockDynamoDB.update).toHaveBeenCalledTimes(1);
        expect(AWS.mockDynamoDB.update.mock.calls[0][0].UpdateExpression)
            .toContain('endedBy');
        expect(AWS.mockDynamoDB.update.mock.calls[0][0].UpdateExpression)
            .toContain('endReason');

        // Verify websocket notification
        expect(AWS.mockPostToConnection).toHaveBeenCalledTimes(1);
        expect(AWS.mockPostToConnection.mock.calls[0][0].ConnectionId)
            .toBe(mockConnectionId);
    });

    test('returns 400 when chatId or userId is missing', async () => {
        const event = {
            body: JSON.stringify({
                data: {
                    chatId: mockChatId
                    // userId is missing
                }
            })
        };

        const response = await handler(event);
        const responseBody = JSON.parse(response.body);

        expect(response.statusCode).toBe(400);
        expect(responseBody.action).toBe('error');
        expect(responseBody.data.error).toBe('Missing chatId or userId');
    });

    test('returns 404 when conversation is not found', async () => {
        AWS.mockDynamoDB.get.mockReturnValue({
            promise: () => Promise.resolve({ Item: null })
        });

        const event = {
            body: JSON.stringify({
                data: {
                    chatId: mockChatId,
                    userId: mockUserId,
                    reason: mockReason
                }
            })
        };

        const response = await handler(event);
        const responseBody = JSON.parse(response.body);

        expect(response.statusCode).toBe(404);
        expect(responseBody.action).toBe('error');
        expect(responseBody.data.error).toBe('Conversation not found');
    });

    test('continues execution when websocket notification fails', async () => {
        // Mock DynamoDB responses
        AWS.mockDynamoDB.get.mockImplementation((params) => {
            if (params.TableName === process.env.CONVERSATIONS_TABLE) {
                return {
                    promise: () => Promise.resolve({
                        Item: {
                            PK: `CHAT#${mockChatId}`,
                            participants: [mockUserId, mockOtherUserId]
                        }
                    })
                };
            } else if (params.TableName === process.env.USER_METADATA_TABLE) {
                return {
                    promise: () => Promise.resolve({
                        Item: {
                            PK: `USER#${mockOtherUserId}`,
                            connectionId: mockConnectionId
                        }
                    })
                };
            }
        });

        AWS.mockDynamoDB.update.mockReturnValue({
            promise: () => Promise.resolve({})
        });

        // Mock websocket notification failure
        AWS.mockPostToConnection.mockReturnValue({
            promise: () => Promise.reject(new Error('Websocket error'))
        });

        const event = {
            body: JSON.stringify({
                data: {
                    chatId: mockChatId,
                    userId: mockUserId,
                    reason: mockReason
                }
            })
        };

        const response = await handler(event);
        const responseBody = JSON.parse(response.body);

        // Should still return success even if websocket notification fails
        expect(response.statusCode).toBe(200);
        expect(responseBody.action).toBe('conversationEnded');
    });
}); 