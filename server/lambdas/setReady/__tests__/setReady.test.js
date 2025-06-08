const AWS = require('aws-sdk');
const { handler } = require('../index');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
    const mockDynamoDB = {
        get: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        promise: jest.fn()
    };

    const mockApiGateway = {
        postToConnection: jest.fn().mockReturnThis(),
        promise: jest.fn()
    };

    return {
        DynamoDB: {
            DocumentClient: jest.fn(() => mockDynamoDB)
        },
        ApiGatewayManagementApi: jest.fn(() => mockApiGateway)
    };
});

describe('setReady Lambda', () => {
    let mockEvent;
    const mockUserId = 'user123';
    const mockOtherUserId = 'user456';
    const mockChatId = 'chat789';
    const mockConnectionId = 'conn123';
    let dynamoDB, apiGateway;

    beforeEach(() => {
        jest.clearAllMocks();
        dynamoDB = new AWS.DynamoDB.DocumentClient();
        apiGateway = new AWS.ApiGatewayManagementApi();
        mockEvent = {
            requestContext: {
                connectionId: mockConnectionId
            },
            body: JSON.stringify({
                action: 'setReady',
                data: {
                    userId: mockUserId,
                    chatId: mockChatId
                }
            })
        };
        process.env.USER_METADATA_TABLE = 'user-metadata-table';
        process.env.CONVERSATIONS_TABLE = 'conversations-table';
        process.env.WEBSOCKET_API_URL = 'wss://test-api.execute-api.region.amazonaws.com/prod';
    });

    test('should return 400 for missing request body', async () => {
        const event = { ...mockEvent, body: null };
        const response = await handler(event);
        expect(response.statusCode).toBe(400);
        expect(response.body).toBe('Missing request body');
    });

    test('should return 400 for invalid JSON body', async () => {
        const event = { ...mockEvent, body: 'invalid-json' };
        const response = await handler(event);
        expect(response.statusCode).toBe(400);
        expect(response.body).toBe('Invalid request body');
    });

    test('should return 400 for missing required fields', async () => {
        const event = {
            ...mockEvent,
            body: JSON.stringify({
                action: 'setReady',
                data: {}
            })
        };
        const response = await handler(event);
        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body).error).toBe('Missing required fields');
    });

    test('should return 404 when user not found', async () => {
        dynamoDB.promise.mockResolvedValueOnce({ Item: null });
        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(404);
        expect(response.body).toBe('User not found');
    });

    test('should return 403 when connection ID does not match', async () => {
        dynamoDB.promise.mockResolvedValueOnce({
            Item: {
                PK: `USER#${mockUserId}`,
                connectionId: 'different-connection-id'
            }
        });
        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(403);
        expect(response.body).toBe('User connection does not match');
    });

    test('should successfully set ready status when other user is not ready', async () => {
        // 1. get user metadata
        dynamoDB.promise.mockResolvedValueOnce({
            Item: {
                PK: `USER#${mockUserId}`,
                connectionId: mockConnectionId
            }
        });
        // 2. update ready status
        dynamoDB.promise.mockResolvedValueOnce({});
        // 3. get conversation
        dynamoDB.promise.mockResolvedValueOnce({
            Item: {
                PK: `CHAT#${mockChatId}`,
                userAId: mockUserId,
                userBId: mockOtherUserId
            }
        });
        // 4. get other user metadata (not ready)
        dynamoDB.promise.mockResolvedValueOnce({
            Item: {
                PK: `USER#${mockOtherUserId}`,
                isReady: false
            }
        });
        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(200);
        expect(dynamoDB.update).toHaveBeenCalledWith(expect.objectContaining({
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${mockUserId}` },
            UpdateExpression: 'SET isReady = :ready',
            ExpressionAttributeValues: {
                ':ready': true
            }
        }));
    });

    test('should advance question index and notify both users when both are ready', async () => {
        // 1. get user metadata
        dynamoDB.promise.mockResolvedValueOnce({
            Item: {
                PK: `USER#${mockUserId}`,
                connectionId: mockConnectionId
            }
        });
        // 2. update ready status
        dynamoDB.promise.mockResolvedValueOnce({});
        // 3. get conversation
        dynamoDB.promise.mockResolvedValueOnce({
            Item: {
                PK: `CHAT#${mockChatId}`,
                userAId: mockUserId,
                userBId: mockOtherUserId
            }
        });
        // 4. get other user metadata (ready)
        dynamoDB.promise.mockResolvedValueOnce({
            Item: {
                PK: `USER#${mockOtherUserId}`,
                isReady: true,
                connectionId: 'other-connection-id'
            }
        });
        // 5. update question index for userA
        dynamoDB.promise.mockResolvedValueOnce({
            Attributes: { questionIndex: 1 }
        });
        // 6. update question index for userB
        dynamoDB.promise.mockResolvedValueOnce({
            Attributes: { questionIndex: 1 }
        });
        // 7. get userA metadata for WebSocket
        dynamoDB.promise.mockResolvedValueOnce({
            Item: {
                PK: `USER#${mockUserId}`,
                connectionId: mockConnectionId
            }
        });
        // 8. get userB metadata for WebSocket
        dynamoDB.promise.mockResolvedValueOnce({
            Item: {
                PK: `USER#${mockOtherUserId}`,
                connectionId: 'other-connection-id'
            }
        });
        // 9. WebSocket postToConnection resolves
        apiGateway.promise.mockResolvedValue({});
        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(200);
        expect(dynamoDB.update).toHaveBeenCalledTimes(3); // ready status + 2 question indices
        expect(apiGateway.postToConnection).toHaveBeenCalledTimes(2);
        expect(apiGateway.postToConnection).toHaveBeenCalledWith(expect.objectContaining({
            ConnectionId: mockConnectionId,
            Data: JSON.stringify({
                action: 'advanceQuestion',
                questionIndex: 1
            })
        }));
    });

    test('should handle errors gracefully', async () => {
        // 1. get user metadata throws error
        dynamoDB.promise.mockRejectedValueOnce(new Error('Database error'));
        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(500);
        expect(JSON.parse(response.body).error).toBe('Internal Server Error');
    });
}); 