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
            console.log('endConversation: Parsed payload:', JSON.stringify(payload, null, 2));
        } catch (error) {
            console.error('endConversation: Failed to parse JSON body:', error.message);
            console.log('endConversation: Raw event.body:', event.body);
            const action = extractAction(event);
        const requestId = extractRequestId(event);
        return createErrorResponse(400, 'Invalid JSON in request body', action, {
            operation: 'lambda_execution'
        }, requestId);;
        }

        // Extract data from the WebSocket message structure
        const { data } = payload;
        if (!data) {
            console.log('endConversation: Missing data field in payload');
            console.log('endConversation: Available payload keys:', Object.keys(payload));
            return {
                statusCode: 400,
                body: JSON.stringify({
                    action: 'error',
                    data: { error: 'Missing data field in request' }
                })
            };
        }

        // Validate required fields from data
        const { chatId, reason } = data;
        console.log('endConversation: Extracted chatId from data:', chatId);
        console.log('endConversation: Extracted reason from data:', reason);
        console.log('endConversation: Full data payload keys:', Object.keys(data));
        
        if (!chatId) {
            console.log('endConversation: Missing chatId in data');
            console.log('endConversation: Available data fields:', Object.keys(data));
            console.log('endConversation: Data values:', JSON.stringify(data, null, 2));
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

        // Get other user's metadata BEFORE clearing it, so we can use their connectionId
        console.log('🔥 endConversation: Getting other user metadata for notification');
        const otherUserMetadata = await dynamoDB.send(new GetCommand({
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${otherUserId}` }
        }));
        console.log('🔥 endConversation: Other user metadata retrieved:', JSON.stringify(otherUserMetadata.Item, null, 2));

        // Clear chatId from both users' metadata to mark them as available for new conversations
        console.log('endConversation: Clearing chatId from both users metadata');
        await Promise.all([
            // Clear chatId from the user who ended the conversation
            dynamoDB.send(new UpdateCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${userId}` },
                UpdateExpression: 'REMOVE chatId SET ready = :ready, questionIndex = :questionIndex, lastUpdated = :lastUpdated',
                ExpressionAttributeValues: {
                    ':ready': false,
                    ':questionIndex': 0,
                    ':lastUpdated': timestamp
                }
            })),
            // Clear chatId from the other user
            dynamoDB.send(new UpdateCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${otherUserId}` },
                UpdateExpression: 'REMOVE chatId SET ready = :ready, questionIndex = :questionIndex, lastUpdated = :lastUpdated',
                ExpressionAttributeValues: {
                    ':ready': false,
                    ':questionIndex': 0,
                    ':lastUpdated': timestamp
                }
            }))
        ]);

        console.log('🔥 endConversation: Both users metadata cleared successfully');
        
        // IMMEDIATELY try to notify other user while we know their connection ID
        // Do this BEFORE any verification steps to maximize chance of delivery
        console.log('🔥 endConversation: Attempting immediate notification to other user');
        
        if (otherUserMetadata.Item?.connectionId) {
            console.log('🔥 endConversation: Found other user connectionId, sending notification immediately');
            console.log('🔥 endConversation: Other user connectionId:', otherUserMetadata.Item.connectionId);
            
            try {
                const message = {
                    action: 'conversationEnded',
                    data: {
                        chatId,
                        endedBy: userId,
                        endReason: reason || 'User ended conversation',
                        timestamp
                    }
                };
                console.log('🔥 endConversation: Sending immediate notification:', JSON.stringify(message, null, 2));
                
                await apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: otherUserMetadata.Item.connectionId,
                    Data: JSON.stringify(message)
                }));
                
                console.log('🔥 endConversation: Immediate notification sent successfully!');
            } catch (error) {
                console.error('🔥 endConversation: Immediate notification failed:', error);
                
                // If notification fails, clean up the stale connection
                if (error.name === 'GoneException') {
                    console.log('🔥 endConversation: Cleaning up stale connection after failed notification');
                    try {
                        await dynamoDB.send(new UpdateCommand({
                            TableName: process.env.USER_METADATA_TABLE,
                            Key: { PK: `USER#${otherUserId}` },
                            UpdateExpression: 'REMOVE connectionId SET lastUpdated = :lastUpdated',
                            ExpressionAttributeValues: {
                                ':lastUpdated': timestamp
                            }
                        }));
                        console.log('🔥 endConversation: Cleaned up stale connection');
                    } catch (cleanupError) {
                        console.error('🔥 endConversation: Error cleaning up stale connection:', cleanupError);
                    }
                }
            }
        } else {
            console.log('🔥 endConversation: No connectionId found for other user');
        }
        
        // Verify the database updates by reading back the user metadata
        console.log('🔥 endConversation: Verifying database updates...');
        try {
            const verifyUser1 = await dynamoDB.send(new GetCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${userId}` }
            }));
            const verifyUser2 = await dynamoDB.send(new GetCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${otherUserId}` }
            }));
            
            console.log('🔥 endConversation: User1 metadata after update:', JSON.stringify(verifyUser1.Item, null, 2));
            console.log('🔥 endConversation: User2 metadata after update:', JSON.stringify(verifyUser2.Item, null, 2));
            console.log('🔥 endConversation: User1 chatId after update:', verifyUser1.Item?.chatId);
            console.log('🔥 endConversation: User2 chatId after update:', verifyUser2.Item?.chatId);
        } catch (verifyError) {
            console.error('🔥 endConversation: Error verifying database updates:', verifyError);
        }

        // Notification was already attempted immediately after database update

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

// Export the handler for AWS Lambda
module.exports = { 
    handler: async (event, context) => {
        try {
            const userInfo = await authenticateWebSocketEvent(event);
            // Add user info to event for handler to use
            event.userInfo = userInfo;
            return await handlerLogic(event, context);
        } catch (error) {
            console.error('Authentication failed:', error.message);
            
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            
            if (error.message === 'FIREBASE_TOKEN_MISSING') {
                return createErrorResponse(401, 'Authentication required. Firebase ID token missing.', action, {
                    operation: 'authentication',
                    authType: 'firebase'
                }, requestId);
            } else if (error.message === 'FIREBASE_TOKEN_INVALID') {
                return createErrorResponse(401, 'Invalid or expired Firebase ID token', action, {
                    operation: 'authentication',
                    authType: 'firebase'
                }, requestId);
            } else {
                return createErrorResponse(500, 'Internal Server Error', action, {
                    operation: 'authentication',
                    errorMessage: error.message
                }, requestId);
            }
        }
    }
};
