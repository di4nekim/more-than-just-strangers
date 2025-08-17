const AWS = require('aws-sdk');
const { handler } = require('../index');

// Set up test environment variables for DynamoDB Local
process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000';
process.env.AWS_REGION = 'us-east-1';
process.env.USER_METADATA_TABLE = 'UserMetadata';
process.env.CONVERSATIONS_TABLE = 'Conversations';
process.env.WEBSOCKET_API_URL = 'http://localhost:3001';

// Initialize DynamoDB Document Client for local testing
const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION,
    endpoint: process.env.DYNAMODB_ENDPOINT,
    credentials: {
        accessKeyId: 'fake',
        secretAccessKey: 'fake'
    }
});

describe('setReady Lambda Integration Tests', () => {
    let dynamoDB;
    const testTableName = process.env.TABLE_NAME || 'test-table';

    beforeAll(() => {
        dynamoDB = new AWS.DynamoDB.DocumentClient();
    });

    beforeEach(async () => {
        // Clear the test table
        const items = await dynamoDB.scan({ TableName: testTableName }).promise();
        await Promise.all(
            items.Items.map(item =>
                dynamoDB.delete({
                    TableName: testTableName,
                    Key: { PK: item.PK, SK: item.SK }
                }).promise()
            )
        );
    });

    test('should set ready status for first user', async () => {
        // Insert test user
        await dynamoDB.put({
            TableName: testTableName,
            Item: {
                PK: 'USER#test-user-1',
                SK: 'METADATA',
                userId: 'test-user-1',
                chatId: 'test-chat-1',
                questionIndex: 0,
                ready: false,
                createdAt: new Date().toISOString()
            }
        }).promise();

        const event = {
            body: JSON.stringify({
                chatId: 'test-chat-1',
                userId: 'test-user-1',
                readyToAdvance: true
            })
        };

        const response = await handler(event);
        expect(response.statusCode).toBe(200);

        // Verify user is marked as ready
        const userMetadata = await dynamoDB.get({
            TableName: testTableName,
            Key: {
                PK: 'USER#test-user-1',
                SK: 'METADATA'
            }
        }).promise();

        expect(userMetadata.Item.ready).toBe(true);
    });

    test('should advance question index when both users are ready', async () => {
        // Insert both users
        await Promise.all([
            dynamoDB.put({
                TableName: testTableName,
                Item: {
                    PK: 'USER#test-user-1',
                    SK: 'METADATA',
                    userId: 'test-user-1',
                    chatId: 'test-chat-1',
                    questionIndex: 0,
                    ready: true,
                    createdAt: new Date().toISOString()
                }
            }).promise(),
            dynamoDB.put({
                TableName: testTableName,
                Item: {
                    PK: 'USER#test-user-2',
                    SK: 'METADATA',
                    userId: 'test-user-2',
                    chatId: 'test-chat-1',
                    questionIndex: 0,
                    ready: false,
                    createdAt: new Date().toISOString()
                }
            }).promise()
        ]);

        const otherUserEvent = {
            body: JSON.stringify({
                chatId: 'test-chat-1',
                userId: 'test-user-2',
                readyToAdvance: true
            })
        };

        const response = await handler(otherUserEvent);
        expect(response.statusCode).toBe(200);

        // Verify both users' question indices were incremented
        const [userAMetadata, userBMetadata] = await Promise.all([
            dynamoDB.get({
                TableName: testTableName,
                Key: {
                    PK: 'USER#test-user-1',
                    SK: 'METADATA'
                }
            }).promise(),
            dynamoDB.get({
                TableName: testTableName,
                Key: {
                    PK: 'USER#test-user-2',
                    SK: 'METADATA'
                }
            }).promise()
        ]);

        expect(userAMetadata.Item.questionIndex).toBe(1);
        expect(userBMetadata.Item.questionIndex).toBe(1);
        expect(userAMetadata.Item.ready).toBe(false);
        expect(userBMetadata.Item.ready).toBe(false);
    });

    test('should handle invalid user ID', async () => {
        const event = {
            requestContext: {
                connectionId: 'invalid-connection'
            },
            body: JSON.stringify({
                action: 'setReady',
                data: {
                    userId: 'invalid-user',
                    chatId: 'test-chat-1'
                }
            })
        };

        const response = await handler(event);
        expect(response.statusCode).toBe(404);
    });
}); 