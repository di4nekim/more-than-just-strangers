/**
 * Test setup utilities for E2E integration tests with AWS dev environment
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
    DynamoDBDocumentClient, 
    PutCommand, 
    DeleteCommand, 
    GetCommand
} = require('@aws-sdk/lib-dynamodb');
const { ApiGatewayManagementApiClient } = require('@aws-sdk/client-apigatewaymanagementapi');

// AWS dev environment configuration
const TEST_REGION = process.env.AWS_REGION || 'us-east-1';

// Actual AWS table names from your deployment
const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE || 'ConversationsV2';
const USER_METADATA_TABLE = process.env.USER_METADATA_TABLE || 'UserMetadataV2';
const MESSAGES_TABLE = process.env.MESSAGES_TABLE || 'MessagesV2';

// AWS clients configured for deployed environment
const dynamoClient = new DynamoDBClient({
    region: TEST_REGION
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Seeds test data into DynamoDB
 */
async function seedTestData(testData) {
    const promises = [];

    for (const [tableName, items] of Object.entries(testData)) {
        for (const item of items) {
            promises.push(
                docClient.send(new PutCommand({
                    TableName: tableName,
                    Item: item
                }))
            );
        }
    }

    await Promise.all(promises);
    console.log('✅ Test data seeded successfully');
}

/**
 * Cleans up test data from DynamoDB
 */
async function cleanupTestData(testData) {
    const promises = [];

    for (const [tableName, items] of Object.entries(testData)) {
        for (const item of items) {
            promises.push(
                docClient.send(new DeleteCommand({
                    TableName: tableName,
                    Key: { PK: item.PK, SK: item.SK || undefined }
                }))
            );
        }
    }

    await Promise.all(promises);
    console.log('✅ Test data cleaned up successfully');
}

/**
 * Creates a test conversation object
 */
function createTestConversation(chatId, participants = ['user1', 'user2'], status = 'active') {
    return {
        PK: `CHAT#${chatId}`,
        SK: 'METADATA',
        participants,
        startTime: new Date().toISOString(),
        status,
        createdAt: new Date().toISOString()
    };
}

/**
 * Creates a test user metadata object
 */
function createTestUserMetadata(userId, connectionId = null, status = 'online') {
    const metadata = {
        PK: `USER#${userId}`,
        status,
        lastSeen: new Date().toISOString()
    };
    
    if (connectionId) {
        metadata.connectionId = connectionId;
    }
    
    return metadata;
}

/**
 * Sets up the test environment for AWS deployment
 */
async function setupTestEnvironment() {
    console.log('🚀 Setting up E2E test environment for AWS deployment...');
    
    // Set environment variables for the lambda
    process.env.AWS_REGION = TEST_REGION;
    process.env.CONVERSATIONS_TABLE = CONVERSATIONS_TABLE;
    process.env.USER_METADATA_TABLE = USER_METADATA_TABLE;
    process.env.MESSAGES_TABLE = MESSAGES_TABLE;
    
    // Get WebSocket API URL from environment or use default dev stage
    const websocketApiUrl = process.env.WEBSOCKET_API_URL || 
        `https://${process.env.WEBSOCKET_API_ID}.execute-api.${TEST_REGION}.amazonaws.com/Dev`;
    process.env.WEBSOCKET_API_URL = websocketApiUrl;
    
    console.log('✅ E2E test environment configured for AWS deployment');
}

/**
 * Tears down the test environment
 */
async function teardownTestEnvironment() {
    console.log('🧹 Tearing down E2E test environment...');
    // Clean up any remaining test data if needed
    console.log('✅ E2E test environment cleaned up');
}

/**
 * Executes a test with setup and cleanup
 */
async function withTestEnvironment(testFn) {
    await setupTestEnvironment();
    try {
        await testFn();
    } finally {
        await teardownTestEnvironment();
    }
}

/**
 * Validates AWS credentials and permissions
 */
async function validateAWSAccess() {
    try {
        // Simple DynamoDB operation to validate access
        await docClient.send(new GetCommand({
            TableName: USER_METADATA_TABLE,
            Key: { PK: 'TEST_VALIDATION_KEY' }
        }));
        console.log('✅ AWS access validated');
        return true;
    } catch (error) {
        console.error('❌ AWS access validation failed:', error.message);
        return false;
    }
}

module.exports = {
    // Configuration
    TEST_REGION,
    CONVERSATIONS_TABLE,
    USER_METADATA_TABLE,
    MESSAGES_TABLE,
    
    // Clients
    docClient,
    
    // Setup/Teardown
    setupTestEnvironment,
    teardownTestEnvironment,
    withTestEnvironment,
    validateAWSAccess,
    
    // Data management
    seedTestData,
    cleanupTestData,
    createTestConversation,
    createTestUserMetadata
}; 