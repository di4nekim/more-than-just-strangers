import { handler } from '../onConnect';
import AWS from 'aws-sdk';
import AWSMock from 'aws-sdk-mock';

describe('onConnect Lambda Function', () => {
    const validEvent = {
        requestContext: {
            connectionId: 'test-connection-id'
        },
        queryStringParameters: {
            userId: 'user1',
            otherUserId: 'user2'
        }
    };

    beforeEach(() => {
        // Reset mocks before each test
        AWSMock.restore();
        AWSMock.setSDKInstance(AWS);
    });

    afterAll(() => {
        // Restore AWS mocks after all tests
        AWSMock.restore();
    });

    test('should successfully handle a connection with valid parameters', async () => {
        // Mock successful DynamoDB operations
        AWSMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
            callback(null, { Item: null }); // No existing connection
        });

        const putSpy = jest.fn((params, callback) => {
            callback(null, {});
        });

        AWSMock.mock('DynamoDB.DocumentClient', 'put', putSpy);

        AWSMock.mock('DynamoDB.DocumentClient', 'query', (params, callback) => {
            callback(null, { Items: [] }); // No undelivered messages
        });

        const response = await handler(validEvent);
        expect(response.statusCode).toBe(200);
        expect(response.body).toBe('Connected and undelivered messages sent');

        // Verify that the put method was called with the correct parameters
        expect(putSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                TableName: process.env.CONNECTIONS_TABLE,
                Item: {
                    userId: 'user1',
                    otherUserId: 'user2',
                    connectionId: 'test-connection-id',
                    timestamp: expect.any(String) // Check that timestamp is a string
                }
            }),
            expect.any(Function)
        );
    });

    test('should return 400 when userId is missing', async () => {
        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            queryStringParameters: {
                otherUserId: 'user2'
            }
        };

        const response = await handler(event);
        expect(response.statusCode).toBe(400);
        expect(response.body).toBe('Missing required parameters');
    });

    test('should return 400 when otherUserId is missing', async () => {
        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            queryStringParameters: {
                userId: 'user1'
            }
        };

        const response = await handler(event);
        expect(response.statusCode).toBe(400);
        expect(response.body).toBe('Missing required parameters');
    });

    test('should handle DynamoDB errors gracefully', async () => {
        AWSMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
            callback(new Error('DynamoDB error'));
        });

        const response = await handler(validEvent);
        expect(response.statusCode).toBe(500);
        expect(response.body).toContain('Error connecting:');
    });

    test('should return 409 when connection already exists', async () => {
        AWSMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
            callback(null, { Item: { connectionId: 'existing-connection-id' } });
        });

        const response = await handler(validEvent);
        expect(response.statusCode).toBe(409);
        expect(response.body).toBe('Connection already exists');
    });

}); 

