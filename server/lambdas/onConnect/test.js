const { handler } = require('./index');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
    const mockUpdate = jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
    });

    return {
        DynamoDB: {
            DocumentClient: jest.fn(() => ({
                update: mockUpdate
            }))
        }
    };
});

describe('onConnect Lambda', () => {
    const mockEvent = {
        requestContext: {
            connectionId: 'test-connection-id-123'
        },
        queryStringParameters: {
            userId: 'test-user-123'
        }
    };

    beforeEach(() => {
        process.env.USER_METADATA_TABLE = 'test-user-metadata-table';
        process.env.AWS_REGION = 'us-east-1';
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('successfully stores new connection', async () => {
        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(200);
        expect(response.body).toBe('Connection stored');
    });

    test('handles existing connection', async () => {
        // Mock the DynamoDB update to throw ConditionalCheckFailedException
        const AWS = require('aws-sdk');
        const mockDynamoDB = new AWS.DynamoDB.DocumentClient();
        mockDynamoDB.update.mockReturnValue({
            promise: jest.fn().mockRejectedValue({
                code: 'ConditionalCheckFailedException'
            })
        });

        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(409);
        expect(response.body).toBe('Connection already exists');
    });

    test('handles server error', async () => {
        // Mock the DynamoDB update to throw a generic error
        const AWS = require('aws-sdk');
        const mockDynamoDB = new AWS.DynamoDB.DocumentClient();
        mockDynamoDB.update.mockReturnValue({
            promise: jest.fn().mockRejectedValue(new Error('Test error'))
        });

        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(500);
        expect(response.body).toBe('Internal server error');
    });

    test('handles non-existent userId', async () => {
        // Mock the DynamoDB update to throw ValidationException
        const AWS = require('aws-sdk');
        const mockDynamoDB = new AWS.DynamoDB.DocumentClient();
        mockDynamoDB.update.mockReturnValue({
            promise: jest.fn().mockRejectedValue({
                code: 'ValidationException',
                message: 'The provided key element does not match the schema'
            })
        });

        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(500);
        expect(response.body).toBe('Internal server error');
    });
}); 