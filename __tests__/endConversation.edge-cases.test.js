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
const {
    createMockConversation,
    createMockUserMetadata,
    createMockEvent,
    validateSuccessResponse,
    validateErrorResponse,
    TEST_ENV
} = require('./helpers/testHelpers');

describe('endConversation Lambda Edge Cases Tests', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    describe('WebSocket Connection Edge Cases', () => {
        test('should handle WebSocket connection timeout', async () => {
            const mockConversation = createMockConversation('timeout-test');
            const mockUserMetadata = createMockUserMetadata('user2', 'slow-connection-123');

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
            
            // Simulate connection timeout
            const timeoutError = new Error('Connection timeout');
            timeoutError.code = 'TimeoutError';
            mockApiGatewayPost.mockReturnValue({
                promise: () => Promise.reject(timeoutError)
            });

            const event = createMockEvent('timeout-test', 'user1', 'Connection issues');
            const result = await handler(event);

            // Should still succeed despite notification failure
            validateSuccessResponse(result, 'timeout-test', 'user1');
        });

        test('should handle WebSocket connection forbidden error', async () => {
            const mockConversation = createMockConversation('forbidden-test');
            const mockUserMetadata = createMockUserMetadata('user2', 'forbidden-connection-456');

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
            
            // Simulate forbidden error (403)
            const error = new Error('Access denied');
            error.statusCode = 403;
            mockApiGatewayPost.mockReturnValue({
                promise: () => Promise.reject(error)
            });

            const event = createMockEvent('forbidden-test', 'user1', 'Access denied');
            const result = await handler(event);

            validateSuccessResponse(result, 'forbidden-test', 'user1');
        });
    });

    describe('Data Consistency Edge Cases', () => {
        test('should handle conversation with missing participants array', async () => {
            const mockConversation = {
                PK: 'CHAT#missing-participants',
                startTime: '2023-01-01T10:00:00Z',
                status: 'active'
                // Missing participants array
            };

            // Mock DynamoDB get response
            mockDynamoGet.mockReturnValue({
                promise: () => Promise.resolve({ Item: mockConversation })
            });

            // Mock DynamoDB update
            mockDynamoUpdate.mockReturnValue({
                promise: () => Promise.resolve({})
            });

            const event = createMockEvent('missing-participants', 'user1', 'Missing participants');

            // Should handle gracefully without throwing
            const result = await handler(event);
            
            // Should still succeed but won't send notifications
            validateSuccessResponse(result, 'missing-participants', 'user1');
        });

        test('should handle conversation with empty participants array', async () => {
            const mockConversation = createMockConversation('empty-participants', []);

            // Mock DynamoDB get response
            mockDynamoGet.mockReturnValue({
                promise: () => Promise.resolve({ Item: mockConversation })
            });

            // Mock DynamoDB update
            mockDynamoUpdate.mockReturnValue({
                promise: () => Promise.resolve({})
            });

            const event = createMockEvent('empty-participants', 'user1', 'Empty participants');
            const result = await handler(event);

            validateSuccessResponse(result, 'empty-participants', 'user1');
        });
    });

    describe('Special Character Handling', () => {
        test('should handle special characters in reason', async () => {
            const specialReason = '💔 User ended conversation due to 🚫 inappropriate behavior & emojis!';
            
            const mockConversation = createMockConversation('special-chars');
            const mockUserMetadata = createMockUserMetadata('user2', 'connection-special');

            let capturedReason;

            // Mock DynamoDB get responses
            mockDynamoGet
                .mockReturnValueOnce({
                    promise: () => Promise.resolve({ Item: mockConversation })
                })
                .mockReturnValueOnce({
                    promise: () => Promise.resolve({ Item: mockUserMetadata })
                });
            
            // Mock DynamoDB update and capture the reason
            mockDynamoUpdate.mockImplementation((params) => {
                capturedReason = params.ExpressionAttributeValues[':endReason'];
                return {
                    promise: () => Promise.resolve({})
                };
            });

            // Mock API Gateway
            mockApiGatewayPost.mockImplementation((params) => {
                const data = JSON.parse(params.Data);
                expect(data.data.endReason).toBe(specialReason);
                return {
                    promise: () => Promise.resolve({})
                };
            });

            const event = createMockEvent('special-chars', 'user1', specialReason);
            const result = await handler(event);

            validateSuccessResponse(result, 'special-chars', 'user1');
            expect(capturedReason).toBe(specialReason);
        });
    });
}); 