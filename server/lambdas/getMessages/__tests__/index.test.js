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

describe('getMessages Lambda', () => {
    let mockEvent;
    let dynamoDB;

    beforeEach(() => {
        mockEvent = {
            queryStringParameters: {
                chatId: 'test-chat'
            }
        };
        dynamoDB = new AWS.DynamoDB.DocumentClient();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should return 400 when chatId is missing', async () => {
        mockEvent.queryStringParameters = null;
        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toEqual({ error: 'Missing chatId parameter' });
    });

    it('should return messages when successful', async () => {
        const mockMessages = [
            { messageId: 'msg1', content: 'Hello' },
            { messageId: 'msg2', content: 'Hi' }
        ];
        dynamoDB.promise.mockResolvedValueOnce({ Items: mockMessages });

        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({ messages: mockMessages });
    });

    it('should return 500 when DynamoDB query fails', async () => {
        dynamoDB.promise.mockRejectedValueOnce(new Error('DynamoDB error'));

        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(500);
        expect(JSON.parse(response.body)).toEqual({ error: 'Internal Server Error' });
    });
}); 