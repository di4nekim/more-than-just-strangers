const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");
const { authenticateWebSocketEvent } = require("../shared/auth");

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

        // TODO: Verify that the authenticated user has access to this chat
        // This would involve checking if userId is a participant in the chat

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
        
        try {
            await apiGateway.send(new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify(response)
            }));
        } catch (sendError) {
            // Handle GoneException specifically - this is expected when connection drops
            if (sendError.name === 'GoneException') {
                console.log('Connection no longer available (client disconnected), skipping response send');
                return { statusCode: 200 };
            }
            throw sendError; // Re-throw other send errors
        }
        
        return { statusCode: 200 };
        
    } catch (error) {
        console.error('Error in fetchChatHistory:', error);
        
        // Only try to send error response if it's not a connection issue
        if (error.name !== 'GoneException') {
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
                // Handle GoneException in error response too
                if (sendError.name === 'GoneException') {
                    console.log('Cannot send error response - connection no longer available');
                } else {
                    console.error('Error sending error response:', sendError);
                }
            }
        } else {
            console.log('Main error was GoneException - connection no longer available');
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
                            action: 'fetchChatHistory',
                            error: error.message === 'FIREBASE_TOKEN_MISSING' 
                                ? 'Authentication required. Firebase ID token missing.' 
                                : 'Invalid or expired Firebase ID token'
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