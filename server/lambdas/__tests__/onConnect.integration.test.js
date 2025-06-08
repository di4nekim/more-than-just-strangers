// @jest-environment node
const AWS = require('aws-sdk');
const { handler } = require('../onConnect/index.js');
console.log('handler:', handler);
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

// Initialize DynamoDB Document Client
const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION
});

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;

// Helper function to get connection from DynamoDB
async function getConnection(connectionId) {
    const params = {
        TableName: CONNECTIONS_TABLE,
        Key: {
            ConnectionID: connectionId
        }
    };
    const result = await dynamoDB.get(params).promise();
    return result.Item;
}

// Helper function to delete connection from DynamoDB
    async function deleteConnection(connectionId) {
    const params = {
        TableName: CONNECTIONS_TABLE,
        Key: {
            ConnectionID: connectionId
        }
    };
    await dynamoDB.delete(params).promise();
}

describe('onConnect Live Integration Tests', () => {
    const testEvent = {
        requestContext: {
            connectionId: 'test-connection-id'
        },
        // queryStringParameters: {
        //     userId: 'integrationUser1',
        //     otherUserId: 'integrationUser2'
        // }
    };


    afterEach(async () => {
        // Clean up the test data
        await deleteConnection(testEvent.requestContext.connectionId);
    });

    test('should store a new connection in DynamoDB', async () => {
        const response = await handler(testEvent);
        expect(response.statusCode).toBe(200);

        const connection = await getConnection(testEvent.requestContext.connectionId);
        expect(connection).toBeDefined();
        expect(connection.ConnectionID).toBe(testEvent.requestContext.connectionId);
    });

    test('should not create a duplicate connection', async () => {
        // First connection
        await handler(testEvent);

        // Attempt to create duplicate connection
        const response = await handler(testEvent);
        expect(response.statusCode).toBe(409);
        expect(response.body).toBe('Connection already exists');
    });
}); 