/**
 * Lambda function to handle setting a user's ready status and advancing the conversation
 * when both users are ready.
 * 
 * @param {Object} event - The event object containing the WebSocket connection details and request body
 * @returns {Object} Response object with status code and body
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand, DeleteCommand, GetCommand, QueryCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { authenticateWebSocketEvent } = require("../shared/auth");
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");
const { 
    createErrorResponse, 
    createSuccessResponse, 
    extractAction, 
    extractRequestId,
    handleDynamoDBError,
    handleApiGatewayError
} = require("../shared/errorHandler");

// Configure AWS SDK v3 client
const dynamoDbClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});
const dynamoDB = DynamoDBDocumentClient.from(dynamoDbClient);

// Main handler logic
const handlerLogic = async (event) => {
    console.log('setReady: Function started');
    console.log('setReady: Event received:', JSON.stringify(event, null, 2));
    console.log('setReady: Event body:', event.body);
    console.log('setReady: Event requestContext:', event.requestContext);
    
    // Get authenticated user info
    const { userId } = event.userInfo;
    console.log('setReady: Authenticated user:', userId);
    
    try {
        // Parse the request body
        let payload;
        try {
            payload = JSON.parse(event.body);
        } catch (error) {
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(400, 'Invalid JSON in request body', action, {
                operation: 'request_parsing',
                errorMessage: error.message
            }, requestId);
        }

        // Validate required fields
        const { ready } = payload;
        if (typeof ready !== 'boolean') {
            console.log('setReady: Invalid ready value:', ready);
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(400, 'Invalid ready value. Must be a boolean.', action, {
                operation: 'request_validation',
                requiredField: 'ready',
                providedValue: ready,
                expectedType: 'boolean'
            }, requestId);
        }

        // Get current user metadata
        let currentUserMetadata;
        try {
            currentUserMetadata = await dynamoDB.send(new GetCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${userId}` }
            }));
        } catch (error) {
            console.error('setReady: Error retrieving user metadata:', error);
            return handleDynamoDBError(error, extractAction(event), {
                operation: 'user_metadata_retrieval',
                resource: 'user_metadata',
                tableName: process.env.USER_METADATA_TABLE,
                userId
            });
        }

        if (!currentUserMetadata.Item) {
            // Create new user metadata if it doesn't exist
            try {
                await dynamoDB.send(new PutCommand({
                    TableName: process.env.USER_METADATA_TABLE,
                    Item: {
                        PK: `USER#${userId}`,
                        ready: ready,
                        lastSeen: new Date().toISOString(),
                        questionIndex: 1
                    }
                }));
                console.log('setReady: User metadata created successfully in DynamoDB');
            } catch (error) {
                console.error('setReady: Error creating user metadata:', error);
                return handleDynamoDBError(error, extractAction(event), {
                    operation: 'user_metadata_creation',
                    resource: 'user_metadata',
                    tableName: process.env.USER_METADATA_TABLE,
                    userId
                });
            }
        } else {
            // Update existing user metadata
            try {
                await dynamoDB.send(new UpdateCommand({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${userId}` },
                    UpdateExpression: 'SET ready = :ready, lastSeen = :lastSeen',
                    ExpressionAttributeValues: {
                        ':ready': ready,
                        ':lastSeen': new Date().toISOString()
                    }
                }));
                console.log('setReady: User metadata updated successfully in DynamoDB');
            } catch (error) {
                console.error('setReady: Error updating user metadata:', error);
                return handleDynamoDBError(error, extractAction(event), {
                    operation: 'user_metadata_update',
                    resource: 'user_metadata',
                    tableName: process.env.USER_METADATA_TABLE,
                    userId
                });
            }
        }

        // If user is setting ready to true, add them to matchmaking queue
        if (ready) {
            try {
                // Check if user is already in a conversation
                if (currentUserMetadata.Item?.chatId) {
                    console.log('setReady: User already in conversation, removing from matchmaking queue');
                    // Remove from matchmaking queue if they exist
                    try {
                        await dynamoDB.send(new DeleteCommand({
                            TableName: process.env.MATCHMAKING_QUEUE_TABLE || 'MatchmakingQueue-Dev',
                            Key: { PK: `USER#${userId}` }
                        }));
                    } catch (error) {
                        // Ignore error if user wasn't in queue
                        console.log('setReady: User was not in matchmaking queue');
                    }
                } else {
                    // Add to matchmaking queue
                    const queueItem = {
                        PK: `USER#${userId}`,
                        userId: userId,
                        status: 'waiting',
                        joinedAt: new Date().toISOString()
                    };

                    await dynamoDB.send(new PutCommand({
                        TableName: process.env.MATCHMAKING_QUEUE_TABLE || 'MatchmakingQueue-Dev',
                        Item: queueItem
                    }));

                    console.log('setReady: User added to matchmaking queue');
                }
            } catch (error) {
                console.error('setReady: Error managing matchmaking queue:', error);
                // Continue execution even if queue management fails
            }
        } else {
            // If user is setting ready to false, remove them from matchmaking queue
            try {
                await dynamoDB.send(new DeleteCommand({
                    TableName: process.env.MATCHMAKING_QUEUE_TABLE || 'MatchmakingQueue-Dev',
                    Key: { PK: `USER#${userId}` }
                }));
                console.log('setReady: User removed from matchmaking queue');
            } catch (error) {
                // Ignore error if user wasn't in queue
                console.log('setReady: User was not in matchmaking queue');
            }
        }

        // Send response back to the user via WebSocket
        try {
            const response = {
                action: 'readyStatusUpdated',
                data: {
                    userId: userId,
                    ready: ready,
                    timestamp: new Date().toISOString()
                }
            };

            if (currentUserMetadata.Item?.connectionId) {
                await apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: currentUserMetadata.Item.connectionId,
                    Data: JSON.stringify(response)
                }));
                console.log(`setReady: Sent readyStatusUpdated response to user ${userId}`);
            } else {
                console.error(`setReady: No connection ID found for user ${userId}`);
                console.error(`setReady: User metadata:`, currentUserMetadata.Item);
                console.error(`setReady: User metadata keys:`, currentUserMetadata.Item ? Object.keys(currentUserMetadata.Item) : 'No item');
            }
        } catch (error) {
            console.error(`setReady: Error sending readyStatusUpdated response to user ${userId}:`, error);
            console.error(`setReady: Error details:`, {
                error: error.message,
                stack: error.stack,
                userId: userId,
                connectionId: currentUserMetadata.Item?.connectionId
            });
            
            if (error.name === 'GoneException') {
                console.error('setReady: Connection is stale, user probably disconnected');
            } else {
                console.error('setReady: Error in WebSocket response logic:', error);
            }
        }

        console.log('setReady: Ready status updated successfully');
        const action = extractAction(event);
        const requestId = extractRequestId(event);
        return createSuccessResponse(200, {
            action: 'readyStatusUpdated',
            data: {
                userId: userId,
                ready: ready,
                timestamp: new Date().toISOString()
            }
        }, action, requestId);

    } catch (error) {
        console.error('setReady: Error updating ready status:', error);
        const action = extractAction(event);
        const requestId = extractRequestId(event);
        return createErrorResponse(500, 'Internal server error', action, {
            operation: 'ready_status_update',
            errorType: error.name || 'UnknownError',
            errorMessage: error.message || 'An unexpected error occurred'
        }, requestId);
    }
};

// Wrap the handler with authentication middleware
exports.handler = async (event, context) => {
    try {
        const userInfo = await authenticateWebSocketEvent(event);
        // Add user info to event for handler to use
        event.userInfo = userInfo;
        return await handlerLogic(event, context);
    } catch (error) {
        console.error('Authentication failed:', error.message);
        
        if (error.message === 'FIREBASE_TOKEN_MISSING') {
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(401, 'Authentication required. Firebase ID token missing.', action, {
                operation: 'authentication',
                authType: 'firebase'
            }, requestId);
        } else if (error.message === 'FIREBASE_TOKEN_INVALID') {
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(401, 'Invalid or expired Firebase ID token', action, {
                operation: 'authentication',
                authType: 'firebase'
            }, requestId);
        } else {
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(500, 'Internal Server Error', action, {
                operation: 'authentication',
                errorMessage: error.message
            }, requestId);
        }
    }
};
