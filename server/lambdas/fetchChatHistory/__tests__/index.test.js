const AWS = require('aws-sdk');
const { handler } = require('../index');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
    const mockQuery = jest.fn();
    const mockDocumentClient = jest.fn(() => ({
        query: mockQuery
    }));
    return {
        DynamoDB: {
            DocumentClient: mockDocumentClient
        }
    };
});

describe('fetchChatHistory Lambda', () => {
    let mockQuery;
    
    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();
        mockQuery = AWS.DynamoDB.DocumentClient().query;
        
        // Set up environment variables
        process.env.MESSAGES_TABLE = 'test-messages-table';
        process.env.AWS_REGION = 'us-east-1';
    });

    test('should return 400 when chatId is missing', async () => {
        const event = {
            queryStringParameters: {}
        };

        const response = await handler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(400);
        expect(body.message).toBe('Missing chatId parameter');
    });

    test('should fetch chat history successfully', async () => {
        const mockMessages = [
            { PK: 'CHAT#123', message: 'Hello' },
            { PK: 'CHAT#123', message: 'World' }
        ];

        mockQuery.mockImplementation(() => ({
            promise: () => Promise.resolve({
                Items: mockMessages,
                LastEvaluatedKey: null
            })
        }));

        const event = {
            queryStringParameters: {
                chatId: '123'
            }
        };

        const response = await handler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(body.messages).toEqual(mockMessages);
        expect(body.hasMore).toBe(false);
        expect(mockQuery).toHaveBeenCalledWith({
            TableName: 'test-messages-table',
            KeyConditionExpression: 'PK = :chatId',
            ExpressionAttributeValues: {
                ':chatId': 'CHAT#123'
            },
            ScanIndexForward: false,
            Limit: 50
        });
    });

    test('should handle pagination correctly', async () => {
        const mockLastEvaluatedKey = { PK: 'CHAT#123', SK: 'MSG#456' };
        const mockMessages = [
            { PK: 'CHAT#123', message: 'Hello' }
        ];

        mockQuery.mockImplementation(() => ({
            promise: () => Promise.resolve({
                Items: mockMessages,
                LastEvaluatedKey: mockLastEvaluatedKey
            })
        }));

        const event = {
            queryStringParameters: {
                chatId: '123',
                lastEvaluatedKey: encodeURIComponent(JSON.stringify(mockLastEvaluatedKey))
            }
        };

        const response = await handler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(body.messages).toEqual(mockMessages);
        expect(body.hasMore).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
            ExclusiveStartKey: mockLastEvaluatedKey
        }));
    });

    test('should handle custom limit parameter', async () => {
        const event = {
            queryStringParameters: {
                chatId: '123',
                limit: '10'
            }
        };

        await handler(event);

        expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
            Limit: 10
        }));
    });

    test('should handle DynamoDB errors', async () => {
        mockQuery.mockImplementation(() => ({
            promise: () => Promise.reject(new Error('DynamoDB error'))
        }));

        const event = {
            queryStringParameters: {
                chatId: '123'
            }
        };

        const response = await handler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(500);
        expect(body.message).toBe('Internal server error');
        expect(body.error).toBe('DynamoDB error');
    });
}); 