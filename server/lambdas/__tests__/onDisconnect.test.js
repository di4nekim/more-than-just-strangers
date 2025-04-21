import AWS from 'aws-sdk';
import AWSMock from 'aws-sdk-mock';
import { handler } from '../onDisconnect';

describe('onDisconnect Lambda Function', () => {
    const validEvent = {
        requestContext: {
            connectionId: 'test-connection-id'
        }
    };

    beforeEach(() => {
        // Reset mocks before each test
        AWSMock.restore();
        AWSMock.setSDKInstance(AWS);
    });

    test('should successfully handle disconnection', async () => {
        // Mock successful DynamoDB operations
        AWSMock.mock('DynamoDB.DocumentClient', 'scan', (params, callback) => {
            callback(null, { Items: [{ connectionId: 'test-connection-id', userId: 'user1', otherUserId: 'user2' }] });
        });

        AWSMock.mock('DynamoDB.DocumentClient', 'update', (params, callback) => {
            callback(null, {});
        });

        const response = await handler(validEvent);
        expect(response.statusCode).toBe(200);
        expect(response.body).toBe('Disconnected successfully');
    });

    test('should return 404 when connection is not found', async () => {
        AWSMock.mock('DynamoDB.DocumentClient', 'scan', (params, callback) => {
            callback(null, { Items: [] });
        });

        const response = await handler(validEvent);
        expect(response.statusCode).toBe(404);
        expect(response.body).toBe('Connection not found');
    });

    test('should handle DynamoDB scan errors gracefully', async () => {
        AWSMock.mock('DynamoDB.DocumentClient', 'scan', (params, callback) => {
            callback(new Error('DynamoDB error'));
        });

        const response = await handler(validEvent);
        expect(response.statusCode).toBe(500);
        expect(response.body).toContain('Error disconnecting:');
    });

    test('should handle DynamoDB update errors gracefully', async () => {
        AWSMock.mock('DynamoDB.DocumentClient', 'scan', (params, callback) => {
            callback(null, { Items: [{ connectionId: 'test-connection-id', userId: 'user1', otherUserId: 'user2' }] });
        });

        AWSMock.mock('DynamoDB.DocumentClient', 'update', (params, callback) => {
            callback(new Error('DynamoDB error'));
        });

        const response = await handler(validEvent);
        expect(response.statusCode).toBe(500);
        expect(response.body).toContain('Error disconnecting:');
    });
}); 