import AWS from 'aws-sdk';
import AWSMock from 'aws-sdk-mock';
import { handler } from '../sendMessage';

describe('sendMessage Lambda Function', () => {
    const validEvent = {
        requestContext: {
            connectionId: 'test-connection-id'
        },
        body: JSON.stringify({
            senderId: 'user1',
            receiverId: 'user2',
            message: 'Hello, world!'
        })
    };

    beforeEach(() => {
        // Reset mocks before each test
        AWSMock.restore();
        AWSMock.setSDKInstance(AWS);

        // Set up AWS configuration
        AWS.config.update({
            region: 'us-east-1',
            accessKeyId: 'test',
            secretAccessKey: 'test'
        });

        // Set up environment variables
        process.env.WEBSOCKET_API_URL = 'http://localhost:3001';
        process.env.CONNECTIONS_TABLE = 'test-connections-table';
        process.env.MESSAGES_TABLE = 'test-messages-table';
    });

    test('should successfully send a message', async () => {
        // Mock successful DynamoDB operations
        AWSMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
            callback(null, { Item: { connectionId: 'test-connection-id', userId: 'user1', otherUserId: 'user2' } });
        });

        AWSMock.mock('DynamoDB.DocumentClient', 'put', (params, callback) => {
            callback(null, {});
        });

        AWSMock.mock('DynamoDB.DocumentClient', 'update', (params, callback) => {
            callback(null, {});
        });

        AWSMock.mock('ApiGatewayManagementApi', 'postToConnection', (params, callback) => {
            callback(null, {});
        });

        const response = await handler(validEvent);
        expect(response.statusCode).toBe(200);
        expect(response.body).toBe('Message sent successfully');
    });

    test('should return 400 when senderId is missing', async () => {
        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            body: JSON.stringify({
                receiverId: 'user2',
                message: 'Hello, world!'
            })
        };

        const response = await handler(event);
        expect(response.statusCode).toBe(400);
        expect(response.body).toBe('Missing required parameters');
    });

    test('should return 400 when receiverId is missing', async () => {
        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            body: JSON.stringify({
                senderId: 'user1',
                message: 'Hello, world!'
            })
        };

        const response = await handler(event);
        expect(response.statusCode).toBe(400);
        expect(response.body).toBe('Missing required parameters');
    });

    test('should return 400 when message is missing', async () => {
        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            body: JSON.stringify({
                senderId: 'user1',
                receiverId: 'user2'
            })
        };

        const response = await handler(event);
        expect(response.statusCode).toBe(400);
        expect(response.body).toBe('Missing required parameters');
    });

    test('should return 403 when connection is not found', async () => {
        AWSMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
            callback(null, { Item: null });
        });

        const response = await handler(validEvent);
        expect(response.statusCode).toBe(403);
        expect(response.body).toBe('Connection not found');
    });

    test('should handle DynamoDB errors gracefully', async () => {
        AWSMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
            callback(new Error('DynamoDB error'));
        });

        const response = await handler(validEvent);
        expect(response.statusCode).toBe(500);
        expect(response.body).toContain('Error sending message:');
    });

    test('should handle message sending errors gracefully', async () => {
        AWSMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
            callback(null, { Item: { connectionId: 'test-connection-id', userId: 'user1', otherUserId: 'user2' } });
        });

        AWSMock.mock('DynamoDB.DocumentClient', 'put', (params, callback) => {
            callback(null, {});
        });

        AWSMock.mock('ApiGatewayManagementApi', 'postToConnection', (params, callback) => {
            callback(new Error('Failed to send message'));
        });

        const response = await handler(validEvent);
        expect(response.statusCode).toBe(500);
        expect(response.body).toContain('Error sending message:');
    });
}); 