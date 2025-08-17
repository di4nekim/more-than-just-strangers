const AWS = require('aws-sdk');

const testUserId = 'test-user-1';
const testTableName = 'UserMetadata';
const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    accessKeyId: 'fake',
    secretAccessKey: 'fake',
});

// Set environment variables for the Lambda function
process.env.USER_METADATA_TABLE = testTableName;
process.env.DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Ensure the table exists before running tests
beforeAll(async () => {
  const dynamodbRaw = new AWS.DynamoDB({
    region: process.env.AWS_REGION,
    endpoint: process.env.DYNAMODB_ENDPOINT,
    accessKeyId: 'fake',
    secretAccessKey: 'fake',
  });
  try {
    await dynamodbRaw.describeTable({ TableName: testTableName }).promise();
  } catch (err) {
    if (err.code === 'ResourceNotFoundException') {
      await dynamodbRaw.createTable({
        TableName: testTableName,
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' }
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' }
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }).promise();
      // Wait for table to become active
      await dynamodbRaw.waitFor('tableExists', { TableName: testTableName }).promise();
    } else {
      throw err;
    }
  }
});

// Now require the handler after env vars are set
const { handler } = require('../index.js');

// Add clearTable helper function
async function clearTable(tableName) {
  const data = await dynamoDB.scan({ TableName: tableName }).promise();
  if (!data.Items.length) return;
  await Promise.all(
    data.Items.map(item =>
      dynamoDB.delete({
        TableName: tableName,
        Key: { PK: item.PK }
      }).promise()
    )
  );
}

describe('getCurrentState Lambda Function (Integration)', () => {
    const validEvent = {
        body: JSON.stringify({
            action: 'getCurrentState',
            data: {
                userId: testUserId
            }
        })
    };

    const mockTimestamp = new Date().toISOString();
    const testUserItem = {
        PK: testUserId,
        connectionId: 'test-connection-1',
        chatId: 'test-chat-1',
        ready: true,
        questionIndex: 2,
        lastSeen: mockTimestamp,
        createdAt: mockTimestamp
    };

    beforeAll(async () => {
        await clearTable(testTableName);
    });

    afterAll(async () => {
        await clearTable(testTableName);
    });

    test('should return 400 if userId is missing', async () => {
        const invalidEvent = {
            body: JSON.stringify({
                action: 'getCurrentState',
                data: {}
            })
        };
        const response = await handler(invalidEvent);
        expect(response.statusCode).toBe(400);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.action).toBe('error');
        expect(responseBody.data.error).toBe('Missing userId');
    });

    test('should return 404 if user is not found', async () => {
        // Ensure user does not exist
        await dynamoDB.delete({
            TableName: testTableName,
            Key: { PK: testUserId }
        }).promise();
        const response = await handler(validEvent);
        expect(response.statusCode).toBe(404);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.action).toBe('error');
        expect(responseBody.data.error).toBe('User not found');
    });

    test('should return user state successfully', async () => {
        // Clear any existing data
        await clearTable(testTableName);

        // Insert test user
        console.log('Inserting test user:', testUserItem);
        try {
            await dynamoDB.put({
                TableName: testTableName,
                Item: testUserItem
            }).promise();
            console.log('Successfully inserted test user');
        } catch (error) {
            console.error('Error inserting test user:', error);
            throw error;
        }

        // Verify the item was inserted
        try {
            const verifyItem = await dynamoDB.get({
                TableName: testTableName,
                Key: { PK: testUserId }
            }).promise();
            console.log('Verified item in DB:', verifyItem.Item);
            if (!verifyItem.Item) {
                throw new Error('Test user was not found in database after insertion');
            }
        } catch (error) {
            console.error('Error verifying test user:', error);
            throw error;
        }

        const response = await handler(validEvent);
        console.log('Handler response:', response);
        expect(response.statusCode).toBe(200);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.action).toBe('currentState');
        expect(responseBody.data).toEqual({
            userId: testUserId,
            connectionId: 'test-connection-1',
            chatId: 'test-chat-1',
            ready: true,
            questionIndex: 2,
            lastSeen: mockTimestamp,
            createdAt: mockTimestamp
        });
    });

    test('should handle DynamoDB errors gracefully', async () => {
        // Temporarily set an invalid table name to force an error
        const oldTable = process.env.USER_METADATA_TABLE;
        process.env.USER_METADATA_TABLE = 'NonExistentTable';
        const response = await handler(validEvent);
        expect(response.statusCode).toBe(500);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.action).toBe('error');
        expect(responseBody.data.error).toBe('Database table not found');
        process.env.USER_METADATA_TABLE = oldTable;
    });
}); 