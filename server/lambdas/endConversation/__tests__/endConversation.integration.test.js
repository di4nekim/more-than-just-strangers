// Mock AWS SDK before importing anything else
const mockDynamoGet = jest.fn();
const mockDynamoUpdate = jest.fn();
const mockApiGatewayPost = jest.fn();

jest.mock('aws-sdk', () => ({
    DynamoDB: {
        DocumentClient: jest.fn(() => ({
            get: mockDynamoGet,
            update: mockDynamoUpdate
        }))
    },
    ApiGatewayManagementApi: jest.fn(() => ({
        postToConnection: mockApiGatewayPost
    }))
}));

// Mock environment variables
process.env.AWS_REGION = 'us-east-1';
process.env.CONVERSATIONS_TABLE = 'test-conversations-table';
process.env.USER_METADATA_TABLE = 'test-user-metadata-table';
process.env.WEBSOCKET_API_URL = 'https://test-websocket-api.execute-api.us-east-1.amazonaws.com/dev';

// Now require the handler after mocks are set up
const { handler } = require('../index');

describe('endConversation Lambda Integration Tests', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    describe('Success Cases', () => {
        test('should successfully end conversation and notify other user', async () => {
            const mockConversation = {
                PK: 'CHAT#test-chat-123',
                participants: ['user1', 'user2'],
                startTime: '2023-01-01T10:00:00Z',
                status: 'active'
            };

            const mockUserMetadata = {
                PK: 'USER#user2',
                connectionId: 'connection-123',
                status: 'online'
            };

            // Mock DynamoDB get responses
            mockDynamoGet
                .mockReturnValueOnce({
                    promise: () => Promise.resolve({ Item: mockConversation })
                })
                .mockReturnValueOnce({
                    promise: () => Promise.resolve({ Item: mockUserMetadata })
                });

            // Mock DynamoDB update
            mockDynamoUpdate.mockReturnValue({
                promise: () => Promise.resolve({})
            });

            // Mock API Gateway postToConnection
            mockApiGatewayPost.mockReturnValue({
                promise: () => Promise.resolve({})
            });

            const event = {
                body: JSON.stringify({
                    data: {
                        chatId: 'test-chat-123',
                        userId: 'user1',
                        reason: 'User ended conversation'
                    }
                })
            };

            const result = await handler(event);
            
            expect(result.statusCode).toBe(200);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('conversationEnded');
            expect(responseBody.data.chatId).toBe('test-chat-123');
            expect(responseBody.data.endedBy).toBe('user1');
            expect(responseBody.data.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/);

            // Verify DynamoDB calls
            expect(mockDynamoGet).toHaveBeenCalledTimes(2);
            expect(mockDynamoUpdate).toHaveBeenCalledTimes(1);
            expect(mockApiGatewayPost).toHaveBeenCalledTimes(1);
        });

        test('should end conversation when other user is not connected', async () => {
            const mockConversation = {
                PK: 'CHAT#test-chat-456',
                participants: ['user1', 'user3'],
                startTime: '2023-01-01T10:00:00Z',
                status: 'active'
            };

            const mockUserMetadata = {
                PK: 'USER#user3',
                status: 'offline'
                // No connectionId - user is not connected
            };

            mockDynamoGet
                .mockReturnValueOnce({
                    promise: () => Promise.resolve({ Item: mockConversation })
                })
                .mockReturnValueOnce({
                    promise: () => Promise.resolve({ Item: mockUserMetadata })
                });

            mockDynamoUpdate.mockReturnValue({
                promise: () => Promise.resolve({})
            });

            const event = {
                body: JSON.stringify({
                    data: {
                        chatId: 'test-chat-456',
                        userId: 'user1',
                        reason: 'Inappropriate behavior'
                    }
                })
            };

            const result = await handler(event);
            
            expect(result.statusCode).toBe(200);
            // API Gateway should not be called for offline users
            expect(mockApiGatewayPost).not.toHaveBeenCalled();
        });

        test('should handle notification failure gracefully', async () => {
            const mockConversation = {
                PK: 'CHAT#test-chat-789',
                participants: ['user1', 'user4'],
                startTime: '2023-01-01T10:00:00Z',
                status: 'active'
            };

            const mockUserMetadata = {
                PK: 'USER#user4',
                connectionId: 'stale-connection-456',
                status: 'online'
            };

            mockDynamoGet
                .mockReturnValueOnce({
                    promise: () => Promise.resolve({ Item: mockConversation })
                })
                .mockReturnValueOnce({
                    promise: () => Promise.resolve({ Item: mockUserMetadata })
                });

            mockDynamoUpdate.mockReturnValue({
                promise: () => Promise.resolve({})
            });

            // Mock API Gateway to fail (stale connection)
            const error = new Error('Connection is stale');
            error.statusCode = 410;
            mockApiGatewayPost.mockReturnValue({
                promise: () => Promise.reject(error)
            });

            const event = {
                body: JSON.stringify({
                    data: {
                        chatId: 'test-chat-789',
                        userId: 'user1',
                        reason: 'Connection lost'
                    }
                })
            };

            const result = await handler(event);
            
            // Should still return success even if notification fails
            expect(result.statusCode).toBe(200);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('conversationEnded');
        });
    });

    describe('Error Cases', () => {
        test('should return 400 when chatId is missing', async () => {
            const event = {
                body: JSON.stringify({
                    data: {
                        userId: 'user1',
                        reason: 'Test reason'
                    }
                })
            };

            const result = await handler(event);
            
            expect(result.statusCode).toBe(400);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('error');
            expect(responseBody.data.error).toBe('Missing chatId or userId');
        });

        test('should return 400 when userId is missing', async () => {
            const event = {
                body: JSON.stringify({
                    data: {
                        chatId: 'test-chat-123',
                        reason: 'Test reason'
                    }
                })
            };

            const result = await handler(event);
            
            expect(result.statusCode).toBe(400);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('error');
            expect(responseBody.data.error).toBe('Missing chatId or userId');
        });

        test('should return 404 when conversation not found', async () => {
            // Mock DynamoDB to return no conversation
            mockDynamoGet.mockReturnValue({
                promise: () => Promise.resolve({ Item: null })
            });

            const event = {
                body: JSON.stringify({
                    data: {
                        chatId: 'non-existent-chat',
                        userId: 'user1',
                        reason: 'Test reason'
                    }
                })
            };

            const result = await handler(event);
            
            expect(result.statusCode).toBe(404);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('error');
            expect(responseBody.data.error).toBe('Conversation not found');
        });

        test('should return 500 when DynamoDB get fails', async () => {
            // Mock DynamoDB to throw error
            mockDynamoGet.mockReturnValue({
                promise: () => Promise.reject(new Error('DynamoDB connection failed'))
            });

            const event = {
                body: JSON.stringify({
                    data: {
                        chatId: 'test-chat-123',
                        userId: 'user1',
                        reason: 'Test reason'
                    }
                })
            };

            const result = await handler(event);
            
            expect(result.statusCode).toBe(500);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('error');
            expect(responseBody.data.error).toBe('Internal server error');
        });

        test('should return 500 when event body is invalid JSON', async () => {
            const event = {
                body: 'invalid json string'
            };

            const result = await handler(event);
            
            expect(result.statusCode).toBe(500);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('error');
            expect(responseBody.data.error).toBe('Internal server error');
        });
    });

    describe('Edge Cases', () => {
        test('should handle conversation with single participant', async () => {
            const mockConversation = {
                PK: 'CHAT#single-user-chat',
                participants: ['user1'], // Only one participant
                startTime: '2023-01-01T10:00:00Z',
                status: 'active'
            };

            mockDynamoGet.mockReturnValue({
                promise: () => Promise.resolve({ Item: mockConversation })
            });

            mockDynamoUpdate.mockReturnValue({
                promise: () => Promise.resolve({})
            });

            const event = {
                body: JSON.stringify({
                    data: {
                        chatId: 'single-user-chat',
                        userId: 'user1',
                        reason: 'Test reason'
                    }
                })
            };

            const result = await handler(event);
            
            expect(result.statusCode).toBe(200);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('conversationEnded');
        });

        test('should handle other user metadata not found', async () => {
            const mockConversation = {
                PK: 'CHAT#test-chat-metadata-missing',
                participants: ['user1', 'user-not-found'],
                startTime: '2023-01-01T10:00:00Z',
                status: 'active'
            };

            mockDynamoGet
                .mockReturnValueOnce({
                    promise: () => Promise.resolve({ Item: mockConversation })
                })
                .mockReturnValueOnce({
                    promise: () => Promise.resolve({ Item: null }) // User metadata not found
                });

            mockDynamoUpdate.mockReturnValue({
                promise: () => Promise.resolve({})
            });

            const event = {
                body: JSON.stringify({
                    data: {
                        chatId: 'test-chat-metadata-missing',
                        userId: 'user1',
                        reason: 'Test reason'
                    }
                })
            };

            const result = await handler(event);
            
            expect(result.statusCode).toBe(200);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('conversationEnded');
        });
    });
}); 