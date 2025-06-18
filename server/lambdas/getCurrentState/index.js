const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");

// Configure DynamoDB client for AWS SDK v3
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});
const dynamoDB = DynamoDBDocumentClient.from(client);

// Configure API Gateway Management API for WebSocket responses
const apiGateway = new ApiGatewayManagementApiClient({
    endpoint: process.env.WEBSOCKET_API_URL 
      ? process.env.WEBSOCKET_API_URL
      : "https://82hp8bmge8.execute-api.us-east-1.amazonaws.com/Dev"
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

exports.handler = async (event) => {
    const connectionId = event.requestContext.connectionId;
    
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
                    data: { error: 'Invalid JSON in request body' }
                })
            }));
            return { statusCode: 200 };
        }

        try {
            validateInput(body);
        } catch (error) {
            await apiGateway.send(new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify({ 
                    action: 'error',
                    data: { error: error.message }
                })
            }));
            return { statusCode: 200 };
        }

        const { userId } = body.data;

        // Get user metadata from DynamoDB
        const params = {
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${userId}` }  // Fixed: Add USER# prefix
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
        
        console.log('Sending response:', response);
        
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
