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
    const testUserId = 'test-user-' + Date.now();
    const testOtherUserId = 'test-other-user-' + Date.now();
    const testChatId = 'test-chat-' + Date.now();
    const testConnectionId = 'test-connection-' + Date.now();
    const otherConnectionId = 'other-connection-' + Date.now();

    // Setup test data before all tests
    beforeAll(async () => {
        // Create test user metadata
        await dynamoDB.put({
            TableName: process.env.USER_METADATA_TABLE,
            Item: {
                PK: `USER#${testUserId}`,
                connectionId: testConnectionId,
                isReady: false,
                questionIndex: 0
            }
        }).promise();

        // Create test other user metadata
        await dynamoDB.put({
            TableName: process.env.USER_METADATA_TABLE,
            Item: {
                PK: `USER#${testOtherUserId}`,
                connectionId: otherConnectionId,
                isReady: false,
                questionIndex: 0
            }
        }).promise();

        // Create test conversation
        await dynamoDB.put({
            TableName: process.env.CONVERSATIONS_TABLE,
            Item: {
                PK: `CHAT#${testChatId}`,
                userAId: testUserId,
                userBId: testOtherUserId
            }
        }).promise();
    });

    // Cleanup test data after all tests
    afterAll(async () => {
        try {
            await dynamoDB.delete({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${testUserId}` }
            }).promise();

            await dynamoDB.delete({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${testOtherUserId}` }
            }).promise();

            await dynamoDB.delete({
                TableName: process.env.CONVERSATIONS_TABLE,
                Key: { PK: `CHAT#${testChatId}` }
            }).promise();
        } catch (error) {
            console.error('Error cleaning up test data:', error);
        }
    });

    test('should set ready status for first user', async () => {
        const event = {
            requestContext: {
                connectionId: testConnectionId
            },
            body: JSON.stringify({
                action: 'setReady',
                data: {
                    userId: testUserId,
                    chatId: testChatId
                }
            })
        };

        const response = await handler(event);
        expect(response.statusCode).toBe(200);

        // Verify user is marked as ready
        const userMetadata = await dynamoDB.get({
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${testUserId}` }
        }).promise();

        expect(userMetadata.Item.isReady).toBe(true);
    });

    test('should advance question index when both users are ready', async () => {
        // First, set the other user as ready
        const otherUserEvent = {
            requestContext: {
                connectionId: otherConnectionId
            },
            body: JSON.stringify({
                action: 'setReady',
                data: {
                    userId: testOtherUserId,
                    chatId: testChatId
                }
            })
        };

        const response = await handler(otherUserEvent);
        expect(response.statusCode).toBe(200);

        // Verify both users' question indices were incremented
        const [userAMetadata, userBMetadata] = await Promise.all([
            dynamoDB.get({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${testUserId}` }
            }).promise(),
            dynamoDB.get({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${testOtherUserId}` }
            }).promise()
        ]);

        expect(userAMetadata.Item.questionIndex).toBe(1);
        expect(userBMetadata.Item.questionIndex).toBe(1);
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
                    chatId: testChatId
                }
            })
        };

        const response = await handler(event);
        expect(response.statusCode).toBe(404);
    });
}); 