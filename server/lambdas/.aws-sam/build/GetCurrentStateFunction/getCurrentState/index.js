const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
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

const validateInput = (body) => {
    if (!body || typeof body !== 'object') {
        throw new Error('Invalid request body');
    }
    if (body.action !== 'getCurrentState') {
        throw new Error('Invalid action');
    }
    if (!body.data || !body.data.userId) {
        throw new Error('Missing userId');
    }
};

// Main handler logic with authentication
const handlerLogic = async (event) => {
    const connectionId = event.requestContext.connectionId;
    
    // Get authenticated user info from the event (added by auth middleware)
    const { userId, email } = event.userInfo;
    console.log('Authenticated user requesting current state:', userId, email);
    
    try {
        console.log('Event:', JSON.stringify(event, null, 2));
        
        if (!connectionId) {
            throw new Error('Missing connectionId');
        }
        
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

        // Validate required fields - extract userId from payload.data to match frontend message format
        const { userId: requestUserId } = payload.data || {};
        if (!requestUserId) {
            const action = extractAction(event);
        const requestId = extractRequestId(event);
        return createErrorResponse(400, 'Missing userId in request', action, {
            operation: 'lambda_execution'
        }, requestId);;
        }

        // Verify the authenticated user is requesting their own state
        if (requestUserId !== userId) {
            console.log('User ID mismatch. Authenticated:', userId, 'Requested:', requestUserId);
            const action = extractAction(event);
        const requestId = extractRequestId(event);
        return createErrorResponse(403, 'Unauthorized - can only request own state', action, {
            operation: 'lambda_execution'
        }, requestId);;
        }

        // Get user metadata from DynamoDB
        const params = {
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${userId}` }
        };

        let userMetadata;
        try {
            console.log('Querying DynamoDB with params:', params);
            userMetadata = await dynamoDB.send(new GetCommand(params));
            console.log('DynamoDB response:', userMetadata);
            
            if (!userMetadata.Item) {
                console.log('User not found, creating default response');
                // Send default/empty state for new user
                await apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: JSON.stringify({
                        action: 'currentState',
                        data: {
                            userId: userId,
                            connectionId: connectionId,
                            chatId: null,
                            ready: false,
                            questionIndex: 0,
                            lastSeen: new Date().toISOString(),
                            createdAt: new Date().toISOString()
                        }
                    })
                }));
                return { statusCode: 200 };
            }
        } catch (error) {
            console.error('Error getting user metadata:', error);
            await apiGateway.send(new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify({ 
                    action: 'error',
                    data: { error: 'Error retrieving user metadata' }
                })
            }));
            return { statusCode: 200 };
        }

        const item = userMetadata.Item;
        
        console.log('🔥 getCurrentState: Raw user metadata from database:', JSON.stringify(item, null, 2));
        console.log('🔥 getCurrentState: item.chatId value:', item.chatId);
        console.log('🔥 getCurrentState: typeof item.chatId:', typeof item.chatId);
        console.log('🔥 getCurrentState: item.chatId === null:', item.chatId === null);
        console.log('🔥 getCurrentState: item.chatId === undefined:', item.chatId === undefined);
        
        // Send the current state back to the client
        const response = {
            action: 'currentState',
            data: {
                userId: item.PK.replace('USER#', ''),
                connectionId: item.connectionId || connectionId,
                chatId: item.chatId || null,
                ready: item.ready || false,
                questionIndex: item.questionIndex || 0,
                lastSeen: item.lastSeen || new Date().toISOString(),
                createdAt: item.createdAt || new Date().toISOString()
            }
        };
        
        console.log('🔥 getCurrentState: Sending response:', JSON.stringify(response, null, 2));
        
        await apiGateway.send(new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: JSON.stringify(response)
        }));
        
        return { statusCode: 200 };
        
    } catch (error) {
        console.error('Error in getCurrentState:', error);
        try {
            await apiGateway.send(new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify({ 
                    action: 'error',
                    data: { error: 'Internal server error' }
                })
            }));
        } catch (sendError) {
            console.error('Error sending error response:', sendError);
        }
        return { statusCode: 200 };
    }
};

// Wrap the handler with authentication middleware
module.exports.handler = async (event, context) => {
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
