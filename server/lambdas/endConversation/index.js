const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");
const { authenticateWebSocketEvent } = require("../shared/auth");


const { 
    createErrorResponse, 
    createSuccessResponse, 
    extractAction, 
    extractRequestId,
    handleDynamoDBError,
    handleApiGatewayError,
    handleValidationError
} = require("../shared/errorHandler");
// Configure AWS SDK v3 clients
const dynamoDbClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});
const dynamoDB = DynamoDBDocumentClient.from(dynamoDbClient);

const apiGateway = new ApiGatewayManagementApiClient({
    apiVersion: '2018-11-29',
    endpoint: process.env.WEBSOCKET_API_URL
});

// Main handler logic
const handlerLogic = async (event) => {
    console.log('endConversation: Function started');
    console.log('endConversation: Event received:', JSON.stringify(event, null, 2));
    
    // Get authenticated user info
    const { userId } = event.userInfo;
    console.log('endConversation: Authenticated user:', userId);
    
    try {
        // Parse the request body
        let payload;
        try {
            payload = JSON.parse(event.body);
        } catch (error) {
            const action = extractAction(event);
        const requestId = extractRequestId(event);
        return createErrorResponse(400, 'Invalid JSON in request body', action, {
            operation: 'lambda_execution'
        }, requestId);;
        }

        // Validate required fields
        const { chatId, reason } = payload;
        if (!chatId) {
            console.log('endConversation: Missing chatId');
            return {
                statusCode: 400,
                body: JSON.stringify({
                    action: 'error',
                    data: { error: 'Missing chatId' }
                })
            };
        }

        console.log('endConversation: Ending conversation:', chatId);

        // Get conversation to find other participant
        const conversation = await dynamoDB.send(new GetCommand({
            TableName: process.env.CONVERSATIONS_TABLE,
            Key: { PK: `CHAT#${chatId}` }
        }));

        if (!conversation.Item) {
            console.log('endConversation: Conversation not found');
            return {
                statusCode: 404,
                body: JSON.stringify({
                    action: 'error',
                    data: { error: 'Conversation not found' }
                })
            };
        }

        // Verify the authenticated user is a participant in this conversation
        const isParticipant = conversation.Item.userAId === userId || conversation.Item.userBId === userId;
        if (!isParticipant) {
            console.log('endConversation: User not authorized for this conversation:', userId);
            return {
                statusCode: 403,
                body: JSON.stringify({
                    action: 'error',
                    data: { error: 'Unauthorized - user not participant in this conversation' }
                })
            };
        }

        // Update conversation as ended
        const timestamp = new Date().toISOString();
        await dynamoDB.send(new UpdateCommand({
            TableName: process.env.CONVERSATIONS_TABLE,
            Key: { PK: `CHAT#${chatId}` },
            UpdateExpression: 'SET endedBy = :endedBy, endReason = :endReason, lastUpdated = :lastUpdated',
            ExpressionAttributeValues: {
                ':endedBy': userId,
                ':endReason': reason || 'User ended conversation',
                ':lastUpdated': timestamp
            }
        }));

        console.log('endConversation: Conversation marked as ended');

        // Determine the other user in the conversation
        const otherUserId = conversation.Item.userAId === userId ? conversation.Item.userBId : conversation.Item.userAId;

        // Clear both participants' conversation state so they can be rematched.
        // Without this, startConversation keeps rejecting them as "already in a conversation".
        const clearUserState = (participantId) => dynamoDB.send(new UpdateCommand({
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${participantId}` },
            UpdateExpression: 'SET ready = :notReady, lastUpdated = :lastUpdated REMOVE chatId, questionIndex',
            ExpressionAttributeValues: {
                ':notReady': false,
                ':lastUpdated': timestamp
            }
        }));
        await Promise.all([clearUserState(userId), clearUserState(otherUserId)]);
        console.log('endConversation: Cleared conversation state for both participants');

        // Get other user's connection status
        const otherUserMetadata = await dynamoDB.send(new GetCommand({
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${otherUserId}` }
        }));

        // If other user is connected, notify them
        if (otherUserMetadata.Item?.connectionId) {
            console.log('endConversation: Notifying other user');
            try {
                await apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: otherUserMetadata.Item.connectionId,
                    Data: JSON.stringify({
                        action: 'conversationEnded',
                        data: {
                            chatId,
                            endedBy: userId,
                            endReason: reason || 'User ended conversation',
                            timestamp
                        }
                    })
                }));
            } catch (error) {
                console.error('Error notifying other user:', error);
                // Continue execution even if notification fails
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                action: 'conversationEnded',
                data: {
                    chatId,
                    endedBy: userId,
                    timestamp
                }
            })
        };

    } catch (error) {
        console.error('Error ending conversation:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                action: 'error',
                data: { error: 'Internal server error' }
            })
        };
    }
};

// Wrap the handler with authentication middleware.
// template.yaml configures `Handler: endConversation/index.handler`, so this export
// must exist (previously only handlerLogic was defined, making the lambda fail to load).
exports.handler = async (event, context) => {
    try {
        const userInfo = await authenticateWebSocketEvent(event);
        event.userInfo = userInfo;
        return await handlerLogic(event, context);
    } catch (error) {
        console.error('endConversation: Authentication failed:', error.message);
        const action = extractAction(event);
        const requestId = extractRequestId(event);
        if (error.message === 'FIREBASE_TOKEN_MISSING') {
            return createErrorResponse(401, 'Authentication required. Firebase ID token missing.', action, {
                operation: 'authentication'
            }, requestId);
        } else if (error.message === 'FIREBASE_TOKEN_INVALID') {
            return createErrorResponse(401, 'Invalid or expired Firebase ID token', action, {
                operation: 'authentication'
            }, requestId);
        }
        return createErrorResponse(500, 'Internal Server Error', action, {
            operation: 'authentication',
            error: error.message
        }, requestId);
    }
};
