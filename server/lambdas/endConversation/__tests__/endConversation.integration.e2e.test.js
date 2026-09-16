/**
 * E2E Integration Tests for endConversation Lambda
 * Tests the actual flow with real AWS dependencies via AWS deployment
 */

const endConversationHandler = require('../index').handler;
const { 
    setupTestEnvironment, 
    teardownTestEnvironment, 
    seedTestData, 
    cleanupTestData,
    createTestConversation,
    createTestUserMetadata,
    CONVERSATIONS_TABLE,
    USER_METADATA_TABLE,
    validateAWSAccess
} = require('./helpers/testSetup');

// Runs against real, deployed AWS resources; skipped unless explicitly enabled:
//   ENABLE_INTEGRATION_TESTS=true jest server/lambdas/endConversation
const describeIntegration = process.env.ENABLE_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

// The handler authenticates every call, so a real Firebase ID token is required;
// its user becomes participant 1 of the seeded conversation:
//   FIREBASE_TEST_ID_TOKEN=<id token> ENABLE_INTEGRATION_TESTS=true jest server/lambdas/endConversation
const TEST_ID_TOKEN = process.env.FIREBASE_TEST_ID_TOKEN || '';
const tokenUid = (() => {
    try {
        const claims = JSON.parse(Buffer.from(TEST_ID_TOKEN.split('.')[1], 'base64').toString('utf8'));
        return claims.user_id || claims.sub || null;
    } catch (error) {
        return null;
    }
})();

// Mirrors what API Gateway delivers: the token in the query string, chatId at the body root.
const authedEvent = (body) => ({
    requestContext: { connectionId: 'e2e-connection', requestId: 'e2e-request' },
    queryStringParameters: { token: TEST_ID_TOKEN },
    body: JSON.stringify(body)
});

describeIntegration('endConversation E2E Integration Test', () => {
    let testChatId;
    let testUserId1;
    let testUserId2;
    let testData;

    beforeAll(async () => {
        // Validate AWS access before running tests
        const hasAccess = await validateAWSAccess();
        if (!hasAccess) {
            throw new Error('Cannot access AWS resources. Please check your AWS credentials and permissions.');
        }
        
        await setupTestEnvironment();
        
        // Setup test data
        testChatId = 'e2e-test-chat-' + Date.now();
        testUserId1 = tokenUid || 'e2e-user-1-' + Date.now();
        testUserId2 = 'e2e-user-2-' + Date.now();
        
        testData = {
            [CONVERSATIONS_TABLE]: [
                createTestConversation(testChatId, [testUserId1, testUserId2], 'active')
            ],
            [USER_METADATA_TABLE]: [
                createTestUserMetadata(testUserId1, 'connection-1', 'online'),
                createTestUserMetadata(testUserId2, 'connection-2', 'online')
            ]
        };
        
        await seedTestData(testData);
    });

    afterAll(async () => {
        await cleanupTestData(testData);
        await teardownTestEnvironment();
    });

    describe('Happy Path - End Conversation Successfully', () => {
        test('should end conversation and update DynamoDB', async () => {
            const event = authedEvent({ action: 'endConversation', data: { chatId: testChatId, endReason: 'user_ended' } });

            const result = await endConversationHandler(event);

            expect(result.statusCode).toBe(200);
            
            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('conversationEnded');
            expect(responseBody.data.chatId).toBe(testChatId);
            expect(responseBody.data.endedBy).toBe(testUserId1);
            expect(responseBody.data.timestamp).toBeDefined();
        });
    });

    describe('Error Cases', () => {
        test('should return 400 for missing chatId', async () => {
            const event = authedEvent({ action: 'endConversation', data: { endReason: 'user_ended' } });

            const result = await endConversationHandler(event);

            expect(result.statusCode).toBe(400);

            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('error');
            expect(responseBody.data.error).toBe('Missing chatId');
        });

        test('should return 401 for an unauthenticated request', async () => {
            const event = {
                requestContext: { connectionId: 'e2e-connection' },
                body: JSON.stringify({ action: 'endConversation', data: { chatId: testChatId, endReason: 'user_ended' } })
            };

            const result = await endConversationHandler(event);

            expect(result.statusCode).toBe(401);
        });

        test('should return 404 for non-existent conversation', async () => {
            const event = authedEvent({ action: 'endConversation', data: { chatId: 'non-existent-chat', endReason: 'user_ended' } });

            const result = await endConversationHandler(event);

            expect(result.statusCode).toBe(404);
            
            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('error');
            expect(responseBody.data.error).toBe('Conversation not found');
        });
    });

    describe('Data Validation', () => {
        test('should properly format timestamp', async () => {
            const event = authedEvent({ action: 'endConversation', data: { chatId: testChatId, endReason: 'test_end' } });

            const result = await endConversationHandler(event);
            
            expect(result.statusCode).toBe(200);
            
            const responseBody = JSON.parse(result.body);
            const timestamp = responseBody.data.timestamp;
            
            // Should be valid ISO 8601 timestamp
            expect(new Date(timestamp).toISOString()).toBe(timestamp);
            
            // Should be recent (within last 5 seconds)
            const timeDiff = Date.now() - new Date(timestamp).getTime();
            expect(timeDiff).toBeLessThan(5000);
        });
    });
}); 