const AWS = require('aws-sdk');
const { handler } = require('../index');

jest.mock('aws-sdk', () => {
    const mockDynamoDB = {
        query: jest.fn().mockReturnThis(),
        promise: jest.fn()
    };
    return {
        DynamoDB: {
            DocumentClient: jest.fn(() => mockDynamoDB)
        }
    };
});

describe('getConversations Lambda', () => {
    let mockEvent;
    let dynamoDB;

    beforeEach(() => {
        mockEvent = {
            queryStringParameters: {
                userId: 'test-user'
            }
        };
        dynamoDB = new AWS.DynamoDB.DocumentClient();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should return 400 when userId is missing', async () => {
        mockEvent.queryStringParameters = null;
        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toEqual({ error: 'Missing userId parameter' });
    });

    it('should return conversations when successful', async () => {
        const mockConversations = [
            { chatId: 'chat1', lastMessage: 'Hello' },
            { chatId: 'chat2', lastMessage: 'Hi' }
        ];
        dynamoDB.promise.mockResolvedValueOnce({ Items: mockConversations });

        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({ conversations: mockConversations });
    });

    it('should return 500 when DynamoDB query fails', async () => {
        dynamoDB.promise.mockRejectedValueOnce(new Error('DynamoDB error'));

        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(500);
        expect(JSON.parse(response.body)).toEqual({ error: 'Internal Server Error' });
    });
}); 