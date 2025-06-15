const AWSMock = require('aws-sdk-mock');
const AWS = require('aws-sdk');

// Set environment variables FIRST
process.env.AWS_REGION = 'us-east-1';
process.env.CONVERSATIONS_TABLE = 'test-conversations-table';
process.env.USER_METADATA_TABLE = 'test-user-metadata-table';
process.env.WEBSOCKET_API_URL = 'https://test-websocket-api.execute-api.us-east-1.amazonaws.com/dev';

// Set up mocks BEFORE requiring the handler
AWSMock.setSDKInstance(AWS);

// Now require the handler and helpers after mocks are set up
const { handler } = require('../index');
const {
    createMockConversation,
    createMockUserMetadata,
    createMockEvent,
    createMockDynamoGet,
    createMockDynamoUpdate,
    createMockApiGatewayPost,
    createFailingApiGatewayPost,
    validateSuccessResponse,
    validateErrorResponse,
    TEST_ENV
} = require('./helpers/testHelpers');

describe('endConversation Lambda Edge Cases Tests', () => {
    beforeEach(() => {
        // Ensure clean state for each test
        AWSMock.restore();
    });

    afterEach(() => {
        // Clean up after each test
        AWSMock.restore();
    });

    describe('WebSocket Connection Edge Cases', () => {
        test('should handle WebSocket connection timeout', async () => {
            const mockData = {
                'CHAT#timeout-test': createMockConversation('timeout-test'),
                'USER#user2': createMockUserMetadata('user2', 'slow-connection-123')
            };

            AWSMock.mock('DynamoDB.DocumentClient', 'get', createMockDynamoGet(mockData));
            AWSMock.mock('DynamoDB.DocumentClient', 'update', createMockDynamoUpdate(TEST_ENV.CONVERSATIONS_TABLE));
            
            // Simulate connection timeout
            AWSMock.mock('ApiGatewayManagementApi', 'postToConnection', (params, callback) => {
                const error = new Error('Connection timeout');
                error.code = 'TimeoutError';
                callback(error);
            });

            const event = createMockEvent('timeout-test', 'user1', 'Connection issues');
            const result = await handler(event);

            // Should still succeed despite notification failure
            validateSuccessResponse(result, 'timeout-test', 'user1');
        });

        test('should handle WebSocket connection forbidden error', async () => {
            const mockData = {
                'CHAT#forbidden-test': createMockConversation('forbidden-test'),
                'USER#user2': createMockUserMetadata('user2', 'forbidden-connection-456')
            };

            AWSMock.mock('DynamoDB.DocumentClient', 'get', createMockDynamoGet(mockData));
            AWSMock.mock('DynamoDB.DocumentClient', 'update', createMockDynamoUpdate(TEST_ENV.CONVERSATIONS_TABLE));
            
            // Simulate forbidden error (403)
            const error = new Error('Access denied');
            error.statusCode = 403;
            AWSMock.mock('ApiGatewayManagementApi', 'postToConnection', (params, callback) => {
                callback(error);
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

            const mockData = {
                'CHAT#missing-participants': mockConversation
            };

            AWSMock.mock('DynamoDB.DocumentClient', 'get', createMockDynamoGet(mockData));
            AWSMock.mock('DynamoDB.DocumentClient', 'update', createMockDynamoUpdate(TEST_ENV.CONVERSATIONS_TABLE));

            const event = createMockEvent('missing-participants', 'user1', 'Missing participants');

            // Should handle gracefully without throwing
            const result = await handler(event);
            
            // Should still succeed but won't send notifications
            validateSuccessResponse(result, 'missing-participants', 'user1');
        });

        test('should handle conversation with empty participants array', async () => {
            const mockConversation = createMockConversation('empty-participants', []);

            const mockData = {
                'CHAT#empty-participants': mockConversation
            };

            AWSMock.mock('DynamoDB.DocumentClient', 'get', createMockDynamoGet(mockData));
            AWSMock.mock('DynamoDB.DocumentClient', 'update', createMockDynamoUpdate(TEST_ENV.CONVERSATIONS_TABLE));

            const event = createMockEvent('empty-participants', 'user1', 'Empty participants');
            const result = await handler(event);

            validateSuccessResponse(result, 'empty-participants', 'user1');
        });
    });

    describe('Special Character Handling', () => {
        test('should handle special characters in reason', async () => {
            const specialReason = '💔 User ended conversation due to 🚫 inappropriate behavior & emojis!';
            
            const mockData = {
                'CHAT#special-chars': createMockConversation('special-chars'),
                'USER#user2': createMockUserMetadata('user2', 'connection-special')
            };

            let capturedReason;

            AWSMock.mock('DynamoDB.DocumentClient', 'get', createMockDynamoGet(mockData));
            
            AWSMock.mock('DynamoDB.DocumentClient', 'update', (params, callback) => {
                capturedReason = params.ExpressionAttributeValues[':endReason'];
                callback(null, {});
            });

            AWSMock.mock('ApiGatewayManagementApi', 'postToConnection', (params, callback) => {
                const data = JSON.parse(params.Data);
                expect(data.data.endReason).toBe(specialReason);
                callback(null, {});
            });

            const event = createMockEvent('special-chars', 'user1', specialReason);
            const result = await handler(event);

            validateSuccessResponse(result, 'special-chars', 'user1');
            expect(capturedReason).toBe(specialReason);
        });
    });
}); 