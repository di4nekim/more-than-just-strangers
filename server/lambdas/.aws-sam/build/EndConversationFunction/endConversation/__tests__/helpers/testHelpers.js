/**
 * Test helpers for endConversation lambda tests
 */

/**
 * Creates a mock conversation object
 */
const createMockConversation = (chatId, participants = ['user1', 'user2'], status = 'active') => ({
    PK: `CHAT#${chatId}`,
    participants,
    startTime: '2023-01-01T10:00:00Z',
    status
});

/**
 * Creates a mock user metadata object
 */
const createMockUserMetadata = (userId, connectionId = null, status = 'online') => {
    const metadata = {
        PK: `USER#${userId}`,
        status
    };
    
    if (connectionId) {
        metadata.connectionId = connectionId;
    }
    
    return metadata;
};

/**
 * Creates a mock Lambda event
 */
const createMockEvent = (chatId, userId, reason = 'Test reason') => ({
    body: JSON.stringify({
        data: {
            chatId,
            userId,
            reason
        }
    })
});

/**
 * Creates a mock Lambda event with missing parameters
 */
const createIncompleteEvent = (missingField) => {
    const data = {
        chatId: 'test-chat',
        userId: 'test-user',
        reason: 'Test reason'
    };
    
    delete data[missingField];
    
    return {
        body: JSON.stringify({ data })
    };
};

/**
 * Creates a mock Lambda event with invalid JSON
 */
const createInvalidJsonEvent = () => ({
    body: 'invalid json string'
});

/**
 * Validates ISO timestamp format
 */
const isValidISOTimestamp = (timestamp) => {
    return /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(timestamp);
};

/**
 * Validates response structure for success cases
 */
const validateSuccessResponse = (response, expectedChatId, expectedUserId) => {
    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body);
    expect(body.action).toBe('conversationEnded');
    expect(body.data.chatId).toBe(expectedChatId);
    expect(body.data.endedBy).toBe(expectedUserId);
    expect(isValidISOTimestamp(body.data.timestamp)).toBe(true);
    
    return body;
};

/**
 * Validates response structure for error cases
 */
const validateErrorResponse = (response, expectedStatusCode, expectedErrorMessage) => {
    expect(response.statusCode).toBe(expectedStatusCode);
    
    const body = JSON.parse(response.body);
    expect(body.action).toBe('error');
    expect(body.data.error).toBe(expectedErrorMessage);
    
    return body;
};

/**
 * Creates mock DynamoDB get function that handles multiple scenarios
 */
const createMockDynamoGet = (mockData) => (params, callback) => {
    const item = mockData[params.Key.PK];
    callback(null, { Item: item || null });
};

/**
 * Creates mock DynamoDB update function with validation
 */
const createMockDynamoUpdate = (expectedTableName, validationFn) => (params, callback) => {
    expect(params.TableName).toBe(expectedTableName);
    
    if (validationFn) {
        validationFn(params);
    }
    
    callback(null, {});
};

/**
 * Creates mock API Gateway postToConnection function with validation
 */
const createMockApiGatewayPost = (validationFn) => (params, callback) => {
    if (validationFn) {
        validationFn(params);
    }
    
    callback(null, {});
};

/**
 * Creates mock API Gateway postToConnection function that fails
 */
const createFailingApiGatewayPost = (errorMessage, statusCode = 500) => (params, callback) => {
    const error = new Error(errorMessage);
    error.statusCode = statusCode;
    callback(error);
};

/**
 * Environment variable constants for tests
 */
const TEST_ENV = {
    AWS_REGION: 'us-east-1',
    CONVERSATIONS_TABLE: 'test-conversations-table',
    USER_METADATA_TABLE: 'test-user-metadata-table',
    WEBSOCKET_API_URL: 'https://test-websocket-api.execute-api.us-east-1.amazonaws.com/dev'
};

module.exports = {
    createMockConversation,
    createMockUserMetadata,
    createMockEvent,
    createIncompleteEvent,
    createInvalidJsonEvent,
    isValidISOTimestamp,
    validateSuccessResponse,
    validateErrorResponse,
    createMockDynamoGet,
    createMockDynamoUpdate,
    createMockApiGatewayPost,
    createFailingApiGatewayPost,
    TEST_ENV
}; 