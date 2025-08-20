const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
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
// Configure DynamoDB client for AWS SDK v3
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});
const dynamoDB = DynamoDBDocumentClient.from(client);

// Configure API Gateway Management API for WebSocket responses
const websocketApiUrl = process.env.WEBSOCKET_API_URL;
if (!websocketApiUrl) {
    throw new Error('WEBSOCKET_API_URL environment variable is required');
}
const apiGateway = new ApiGatewayManagementApiClient({
    endpoint: websocketApiUrl
});

// Main handler logic
const handlerLogic = async (event, context) => {
    const connectionId = event.requestContext.connectionId;
    
    // Get authenticated user info
    const { userId } = event.userInfo;
    console.log('Authenticated user requesting chat history:', userId);
    
    try {
        console.log('Event:', JSON.stringify(event, null, 2));
        
        // Parse the WebSocket message body
        let body;
        try {
            body = JSON.parse(event.body);
        } catch (error) {
            await apiGateway.send(new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                    action: 'error',
                    data: { 
                        action: 'fetchChatHistory',
                        error: 'Invalid JSON in request body' 
                    }
                })
            }));
            return { statusCode: 200 };
        }

        // Extract parameters from the action/data structure
        const data = body.data || {};
        const { chatId, limit = 20, lastEvaluatedKey } = data;

        if (!chatId) {
            await apiGateway.send(new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                    action: 'error',
                    data: { 
                        action: 'fetchChatHistory',
                        error: 'Missing chatId parameter' 
                    }
                })
            }));
            return { statusCode: 200 };
        }

        // Get conversation to verify user is a participant
        console.log('fetchChatHistory: Getting conversation for chatId:', chatId);
        let conversation;
        try {
            const conversationResponse = await dynamoDB.send(new GetCommand({
                TableName: process.env.CONVERSATIONS_TABLE,
                Key: { PK: `CHAT#${chatId}` }
            }));
            conversation = conversationResponse.Item;
        } catch (error) {
            console.error('Error fetching conversation:', error);
            await apiGateway.send(new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                    action: 'error',
                    data: { 
                        action: 'fetchChatHistory',
                        error: 'Failed to verify chat access', 
                        details: error.message 
                    }
                })
            }));
            return { statusCode: 200 };
        }

        if (!conversation) {
            console.log('fetchChatHistory: Conversation not found for chatId:', chatId);
            await apiGateway.send(new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                    action: 'error',
                    data: { 
                        action: 'fetchChatHistory',
                        error: 'Conversation not found' 
                    }
                })
            }));
            return { statusCode: 200 };
        }

        // Verify the authenticated user is a participant in this conversation
        const isParticipant = conversation.userAId === userId || conversation.userBId === userId;
        if (!isParticipant) {
            console.log('fetchChatHistory: User not authorized for this conversation:', userId);
            await apiGateway.send(new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                    action: 'error',
                    data: { 
                        action: 'fetchChatHistory',
                        error: 'Unauthorized - user not participant in this conversation' 
                    }
                })
            }));
            return { statusCode: 200 };
        }

        console.log('fetchChatHistory: User authorized, fetching chat history');

        // Query messages for the chat
        const params = {
            TableName: process.env.MESSAGES_TABLE,
            KeyConditionExpression: 'PK = :chatId',
            ExpressionAttributeValues: {
                ':chatId': `CHAT#${chatId}`
            },
            ScanIndexForward: false, // false = descending order (newest first)
            Limit: limit
        };

        // Add ExclusiveStartKey if provided
        if (lastEvaluatedKey) {
            try {
                params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastEvaluatedKey));
            } catch (error) {
                console.log('Invalid lastEvaluatedKey, ignoring:', error);
            }
        }

        console.log('Querying messages with params:', params);
        const result = await dynamoDB.send(new QueryCommand(params));
        console.log('DynamoDB query result:', result);
        
        // Send the chat history back to the client
        const response = {
            action: 'chatHistory',
            data: {
                messages: result.Items || [],
                lastEvaluatedKey: result.LastEvaluatedKey 
                    ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey))
                    : null,
                hasMore: !!result.LastEvaluatedKey
            }
        };
        
        console.log('Sending chat history response:', response);
        
        await apiGateway.send(new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: JSON.stringify(response)
        }));
        
        return { statusCode: 200 };
        
    } catch (error) {
        console.error('Error:', error);
        try {
            await apiGateway.send(new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                    action: 'error',
                    data: { 
                        action: 'fetchChatHistory',
                        error: 'Internal server error', 
                        details: error.message 
                    }
                })
            }));
        } catch (sendError) {
            console.error('Error sending error response:', sendError);
        }
        return { statusCode: 200 };
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
        
        const connectionId = event.requestContext?.connectionId;
        
        if (connectionId) {
            try {
                await apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: JSON.stringify({
                        action: 'error',
                        data: { 
                            error: error.message === 'JWT_TOKEN_MISSING' 
                                ? 'Authentication required. JWT token missing.' 
                                : 'Invalid or expired JWT token'
                        }
                    })
                }));
            } catch (sendError) {
                console.error('Error sending auth error response:', sendError);
            }
        }
        
        return { statusCode: 200 }; // Return 200 for WebSocket to maintain connection
    }
}; 