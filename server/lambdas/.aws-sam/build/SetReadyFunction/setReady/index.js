/**
 * Lambda function to handle setting a user's ready status for question advancement
 * and advancing the conversation when both users are ready.
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

// Initialize API Gateway client
let apiGateway;
try {
    const websocketApiUrl = process.env.WEBSOCKET_API_URL;
    if (!websocketApiUrl) {
        throw new Error('WEBSOCKET_API_URL environment variable is required');
    }
    apiGateway = new ApiGatewayManagementApiClient({
        endpoint: websocketApiUrl
    });
    console.log('✓ API Gateway client created successfully');
    console.log('API Gateway endpoint configured:', websocketApiUrl);
} catch (error) {
    console.error('CRITICAL: Failed to create API Gateway client:', error);
    throw new Error(`API Gateway client creation failed: ${error.message}`);
}

// Main handler logic
const handlerLogic = async (event) => {
    console.log('setReady: Function started');
    console.log('setReady: Event received:', JSON.stringify(event, null, 2));
    console.log('setReady: Event body:', event.body);
    console.log('setReady: Event body type:', typeof event.body);
    console.log('setReady: Event requestContext:', event.requestContext);
    console.log('setReady: Event headers:', event.headers);
    console.log('setReady: Event queryStringParameters:', event.queryStringParameters);
    
    // Get authenticated user info
    const { userId } = event.userInfo;
    console.log('setReady: Authenticated user:', userId);
    
    try {
        // Parse the request body
        let payload;
        try {
            payload = JSON.parse(event.body);
            console.log('setReady: Parsed payload:', JSON.stringify(payload, null, 2));
            console.log('setReady: Payload keys:', Object.keys(payload));
            console.log('setReady: Payload.data:', payload.data);
            console.log('setReady: Payload.data keys:', payload.data ? Object.keys(payload.data) : 'No data field');
        } catch (error) {
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(400, 'Invalid JSON in request body', action, {
                operation: 'request_parsing',
                errorMessage: error.message
            }, requestId);
        }

        // Validate required fields
        const { ready } = payload.data || payload;
        if (typeof ready !== 'boolean') {
            console.log('setReady: Invalid ready value:', ready);
            console.log('setReady: Full payload:', JSON.stringify(payload, null, 2));
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(400, 'Invalid ready value. Must be a boolean.', action, {
                operation: 'request_validation',
                requiredField: 'ready',
                providedValue: ready,
                expectedType: 'boolean',
                payloadStructure: payload
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
                
                // If user is setting ready to false, remove them from matchmaking queue
                if (ready === false) {
                    console.log('setReady: User setting ready to false, removing from matchmaking queue...');
                    try {
                        await dynamoDB.send(new DeleteCommand({
                            TableName: process.env.MATCHMAKING_QUEUE_TABLE,
                            Key: { PK: `USER#${userId}` }
                        }));
                        console.log('setReady: User removed from matchmaking queue successfully');
                    } catch (error) {
                        console.warn('setReady: Failed to remove user from matchmaking queue (user may not have been in queue):', error);
                        // Don't fail the entire operation if queue removal fails
                        // The user might not have been in the queue to begin with
                    }
                }
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

        // Check if both users are ready and advance question if they are
        if (ready && currentUserMetadata.Item?.chatId) {
            try {
                console.log('setReady: User is ready and in conversation, checking if both users are ready');
                
                // Get conversation details to find the other user
                const conversationResult = await dynamoDB.send(new GetCommand({
                    TableName: process.env.CONVERSATIONS_TABLE || 'Conversations-Dev',
                    Key: { PK: `CHAT#${currentUserMetadata.Item.chatId}` }
                }));

                if (conversationResult.Item) {
                    const { userAId, userBId } = conversationResult.Item;
                    const otherUserId = userId === userAId ? userBId : userAId;
                    
                    console.log('setReady: Found other user in conversation:', otherUserId);
                    
                    // Get the other user's metadata to check if they're also ready
                    const otherUserResult = await dynamoDB.send(new GetCommand({
                        TableName: process.env.USER_METADATA_TABLE,
                        Key: { PK: `USER#${otherUserId}` }
                    }));

                    if (otherUserResult.Item && otherUserResult.Item.ready) {
                        console.log('setReady: Both users are ready, advancing question');
                        
                        // Both users are ready, advance the question
                        const currentQuestionIndex = currentUserMetadata.Item.questionIndex || 1;
                        const newQuestionIndex = currentQuestionIndex + 1;
                        
                        // Update question index for current user
                        const currentUserUpdateResult = await dynamoDB.send(new UpdateCommand({
                            TableName: process.env.USER_METADATA_TABLE,
                            Key: { PK: `USER#${userId}` },
                            UpdateExpression: 'SET questionIndex = :questionIndex, ready = :ready',
                            ExpressionAttributeValues: {
                                ':questionIndex': newQuestionIndex,
                                ':ready': false
                            },
                            ReturnValues: 'ALL_NEW'
                        }));

                        // Update question index for other user
                        const otherUserUpdateResult = await dynamoDB.send(new UpdateCommand({
                            TableName: process.env.USER_METADATA_TABLE,
                            Key: { PK: `USER#${otherUserId}` },
                            UpdateExpression: 'SET questionIndex = :questionIndex, ready = :ready',
                            ExpressionAttributeValues: {
                                ':questionIndex': newQuestionIndex,
                                ':ready': false
                            },
                            ReturnValues: 'ALL_NEW'
                        }));

                        console.log('setReady: Question advanced to index:', newQuestionIndex);
                        console.log('setReady: Note: Users will see the new question on their next page refresh or when they reconnect');

                        // Send advanceQuestion message to both users
                        const advanceQuestionMessage = {
                            action: 'advanceQuestion',
                            data: {
                                questionIndex: newQuestionIndex,
                                ready: false
                            }
                        };

                        // Send to current user
                        if (currentUserMetadata.Item.connectionId) {
                            try {
                                await apiGateway.send(new PostToConnectionCommand({
                                    ConnectionId: currentUserMetadata.Item.connectionId,
                                    Data: JSON.stringify(advanceQuestionMessage)
                                }));
                                console.log(`setReady: Sent advanceQuestion to current user ${userId}`);
                            } catch (error) {
                                if (error.name === 'GoneException') {
                                    console.log(`setReady: Connection is stale for current user ${userId}, they will need to refresh to see the question advancement`);
                                    // Clean up stale connection ID
                                    try {
                                        await dynamoDB.send(new UpdateCommand({
                                            TableName: process.env.USER_METADATA_TABLE,
                                            Key: { PK: `USER#${userId}` },
                                            UpdateExpression: 'REMOVE connectionId'
                                        }));
                                        console.log(`setReady: Removed stale connectionId for user ${userId}`);
                                    } catch (cleanupError) {
                                        console.warn(`setReady: Failed to cleanup stale connectionId for user ${userId}:`, cleanupError);
                                    }
                                } else {
                                    console.error(`setReady: Error sending advanceQuestion to current user ${userId}:`, error);
                                }
                            }
                        }

                        // Send to other user
                        if (otherUserResult.Item.connectionId) {
                            try {
                                await apiGateway.send(new PostToConnectionCommand({
                                    ConnectionId: otherUserResult.Item.connectionId,
                                    Data: JSON.stringify(advanceQuestionMessage)
                                }));
                                console.log(`setReady: Sent advanceQuestion to other user ${otherUserId}`);
                            } catch (error) {
                                if (error.name === 'GoneException') {
                                    console.log(`setReady: Connection is stale for other user ${otherUserId}, they will need to refresh to see the question advancement`);
                                    // Clean up stale connection ID
                                    try {
                                        await dynamoDB.send(new UpdateCommand({
                                            TableName: process.env.USER_METADATA_TABLE,
                                            Key: { PK: `USER#${otherUserId}` },
                                            UpdateExpression: 'REMOVE connectionId'
                                        }));
                                        console.log(`setReady: Removed stale connectionId for user ${otherUserId}`);
                                    } catch (cleanupError) {
                                        console.warn(`setReady: Failed to cleanup stale connectionId for user ${otherUserId}:`, cleanupError);
                                    }
                                } else {
                                    console.error(`setReady: Error sending advanceQuestion to other user ${otherUserId}:`, error);
                                }
                            }
                        }
                    } else {
                        console.log('setReady: Other user is not ready yet, waiting for them');
                    }
                } else {
                    console.log('setReady: No conversation found for chatId:', currentUserMetadata.Item.chatId);
                }
            } catch (error) {
                console.error('setReady: Error checking if both users are ready:', error);
                // Continue execution even if question advancement fails
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
