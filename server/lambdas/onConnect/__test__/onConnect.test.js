const { handler } = require('../index');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
    const mockGet = jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Item: null })
    });
    const mockPut = jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
    });

    return {
        DynamoDB: {
            DocumentClient: jest.fn(() => ({
                get: mockGet,
                put: mockPut
            }))
        }
    };
});

describe('onConnect Lambda', () => {
    const mockEvent = {
        requestContext: {
            connectionId: 'test-connection-id-123'
        }
    };

    beforeEach(() => {
        process.env.CONNECTIONS_TABLE = 'test-connections-table';
        process.env.AWS_REGION = 'us-east-1';
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('successfully establishes new connection', async () => {
        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.message).toBe('Connection established');
        expect(body.connectionId).toBe('test-connection-id-123');
    });

    test('handles existing connection', async () => {
        // Mock the DynamoDB get to return an existing connection
        const AWS = require('aws-sdk');
        const mockDynamoDB = new AWS.DynamoDB.DocumentClient();
        mockDynamoDB.get.mockReturnValue({
            promise: jest.fn().mockResolvedValue({
                Item: { connectionId: 'test-connection-id-123' }
            })
        });

        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(409);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Connection already exists');
    });

    test('handles missing connectionId', async () => {
        const invalidEvent = { requestContext: {} };
        const response = await handler(invalidEvent);
        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Missing connectionId in request');
    });

    test('handles DynamoDB get error', async () => {
        // Mock the DynamoDB get to throw an error
        const AWS = require('aws-sdk');
        const mockDynamoDB = new AWS.DynamoDB.DocumentClient();
        mockDynamoDB.get.mockReturnValue({
            promise: jest.fn().mockRejectedValue(new Error('DynamoDB error'))
        });

        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(500);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Internal Server Error');
    });

    test('handles DynamoDB put error', async () => {
        // Mock the DynamoDB put to throw an error
        const AWS = require('aws-sdk');
        const mockDynamoDB = new AWS.DynamoDB.DocumentClient();
        mockDynamoDB.put.mockReturnValue({
            promise: jest.fn().mockRejectedValue(new Error('DynamoDB error'))
        });

        const response = await handler(mockEvent);
        expect(response.statusCode).toBe(500);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Internal Server Error');
    });

    test('handles unexpected errors', async () => {
        // Simulate an error by passing an event that will throw
        const response = await handler(undefined);
        expect(response.statusCode).toBe(500);
        expect(response.body).toBe('Internal server error');
    });
}); 