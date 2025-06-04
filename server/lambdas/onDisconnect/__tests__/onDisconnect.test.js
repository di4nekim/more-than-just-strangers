const AWS = require('aws-sdk');
const AWSMock = require('aws-sdk-mock');

describe('onDisconnect Lambda Function', () => {
    const validEvent = {
        requestContext: {
            connectionId: 'conn1'
        },
        body: JSON.stringify({ data: { userId: 'user1' } })
    };

    beforeEach(() => {
        // Reset mocks
        AWSMock.restore();
        AWSMock.setSDKInstance(AWS);
        // Clear require cache for the handler
        delete require.cache[require.resolve('../index.js')];
        
        // Set required environment variables
        process.env.USER_METADATA_TABLE = 'UserMetadata';
        process.env.CONNECTIONS_TABLE = 'Connections';
    });

    afterAll(() => {
        AWSMock.restore();
    });

    test('should successfully handle disconnection', async () => {
        let updateCalled = false;
        let deleteCalled = false;

        AWSMock.mock('DynamoDB.DocumentClient', 'scan', (params, callback) => {
            callback(null, { Items: [{ PK: 'user1', connectionId: 'conn1' }] });
        });
        AWSMock.mock('DynamoDB.DocumentClient', 'update', (params, callback) => {
            console.log('Update params:', params);
            expect(params.TableName).toBe('UserMetadata');
            expect(params.Key.PK).toBe('user1');
            expect(params.UpdateExpression).toBe('REMOVE connectionId');
            updateCalled = true;
            callback(null, {});
        });
        AWSMock.mock('DynamoDB.DocumentClient', 'delete', (params, callback) => {
            deleteCalled = true;
            callback(null, {});
        });

        const { handler } = require('../index.js');
        const response = await handler(validEvent);
        
        expect(updateCalled).toBe(true);
        expect(deleteCalled).toBe(true);
        expect(response.statusCode).toBe(200);
        expect(response.body).toBe('Disconnected successfully');
    }, 10000);

    test('should handle DynamoDB update errors gracefully', async () => {
        AWSMock.mock('DynamoDB.DocumentClient', 'scan', (params, callback) => {
            callback(null, { Items: [{ PK: 'user1', connectionId: 'conn1' }] });
        });
        AWSMock.mock('DynamoDB.DocumentClient', 'update', (params, callback) => {
            callback(new Error('DynamoDB error'));
        });
        AWSMock.mock('DynamoDB.DocumentClient', 'delete', () => {
            throw new Error('Delete should not be called if update fails');
        });

        const { handler } = require('../index.js');
        const response = await handler(validEvent);
        expect(response.statusCode).toBe(500);
        expect(response.body).toBe('Error updating user metadata');
    }, 10000);

    test('should handle JSON parse or missing userId errors gracefully', async () => {
        const invalidEvent = {
            requestContext: {
                connectionId: 'conn1'
            },
            body: 'invalid-json'
        };
        const { handler } = require('../index.js');
        const response = await handler(invalidEvent);
        expect(response.statusCode).toBe(500);
        expect(response.body).toContain('Error disconnecting');
    });
}); 