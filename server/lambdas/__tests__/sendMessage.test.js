const AWS = require('aws-sdk');
const AWSMock = require('aws-sdk-mock');
AWSMock.setSDKInstance(AWS);

const { handler } = require('../sendMessage.js');


describe('sendMessage Unit Tests', () => {
    const validEvent = {
        requestContext: {
            connectionId: 'test-connection-id'
        },
        body: JSON.stringify({
            action: 'sendMessage',
            senderId: 'user1',
            receiverId: 'user2',
            message: 'Hello, world!',
            messageId: 'msg-123',
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

    afterEach(() => {
        AWSMock.restore(); // Clean slate after each test
      });
      

    test('should successfully send a message', async () => {
        AWSMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
            callback(null, { Item: { connectionId: 'test-connection-id' } });
        });
    
        AWSMock.mock('DynamoDB.DocumentClient', 'scan', (params, callback) => {
            callback(null, {
                Items: [{ connectionId: 'receiver-connection-id', userId: 'user2' }]
            });
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
        expect(response.body).toBe('Message processed successfully');
    });


    test('should queue the message if receiver is offline', async () => {
        // Mock sender connection
        AWSMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
            callback(null, { Item: { connectionId: 'test-connection-id' } });
        });

        // Mock receiver lookup: return no active connection
        AWSMock.mock('DynamoDB.DocumentClient', 'scan', (params, callback) => {
            callback(null, { Items: [] }); // receiver is not connected
        });

        // Mock writing message to main MESSAGES_TABLE
        AWSMock.mock('DynamoDB.DocumentClient', 'put', (params, callback) => {
            callback(null, {});
        });

        // Mock invoking messageQueue Lambda
        AWSMock.mock('Lambda', 'invoke', (params, callback) => {
            expect(params.FunctionName).toBe('messageQueueHandler');
            callback(null, {}); // Simulate success
        });

        const response = await handler(validEvent);
        expect(response.statusCode).toBe(200);
        expect(response.body).toBe('Message processed successfully');
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
        expect(response.body).toBe('Error retrieving connection');
    });

    test('should handle message sending errors gracefully', async () => {
        AWSMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
            callback(null, { Item: { connectionId: 'test-connection-id', userId: 'user1', otherUserId: 'user2' } });
        });

        AWSMock.mock('DynamoDB.DocumentClient', 'scan', (params, callback) => {
            callback(null, {
              Items: [{ connectionId: 'receiver-connection-id', userId: 'user2' }]
            });
          });

        AWSMock.mock('DynamoDB.DocumentClient', 'put', (params, callback) => {
            callback(null, {});
        });

        const postSpy = jest.fn((params, callback) => {
            callback(new Error('Failed to send message'));
        });
        AWSMock.mock('ApiGatewayManagementApi', 'postToConnection', postSpy);

        AWSMock.mock('Lambda', 'invoke', (params, callback) => {
            expect(params.FunctionName).toBe('messageQueueHandler');
            callback(null, {}); // Simulate success
        });

        const response = await handler(validEvent);
        expect(response.statusCode).toBe(200);
        expect(response.body).toBe('Message processed successfully');
        expect(postSpy).toHaveBeenCalled(); 
    });
}); 