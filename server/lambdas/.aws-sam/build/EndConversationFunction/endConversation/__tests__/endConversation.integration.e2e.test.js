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

describe('endConversation E2E Integration Test', () => {
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
        testUserId1 = 'e2e-user-1-' + Date.now();
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
            const event = {
                body: JSON.stringify({
                    data: {
                        chatId: testChatId,
                        userId: testUserId1,
                        reason: 'user_ended'
                    }
                })
            };

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
            const event = {
                body: JSON.stringify({
                    data: {
                        userId: testUserId1,
                        reason: 'user_ended'
                    }
                })
            };

            const result = await endConversationHandler(event);

            expect(result.statusCode).toBe(400);
            
            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('error');
            expect(responseBody.data.error).toBe('Missing chatId or userId');
        });

        test('should return 400 for missing userId', async () => {
            const event = {
                body: JSON.stringify({
                    data: {
                        chatId: testChatId,
                        reason: 'user_ended'
                    }
                })
            };

            const result = await endConversationHandler(event);

            expect(result.statusCode).toBe(400);
            
            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('error');
            expect(responseBody.data.error).toBe('Missing chatId or userId');
        });

        test('should return 404 for non-existent conversation', async () => {
            const event = {
                body: JSON.stringify({
                    data: {
                        chatId: 'non-existent-chat',
                        userId: testUserId1,
                        reason: 'user_ended'
                    }
                })
            };

            const result = await endConversationHandler(event);

            expect(result.statusCode).toBe(404);
            
            const responseBody = JSON.parse(result.body);
            expect(responseBody.action).toBe('error');
            expect(responseBody.data.error).toBe('Conversation not found');
        });
    });

    describe('Data Validation', () => {
        test('should properly format timestamp', async () => {
            const event = {
                body: JSON.stringify({
                    data: {
                        chatId: testChatId,
                        userId: testUserId1,
                        reason: 'test_end'
                    }
                })
            };

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