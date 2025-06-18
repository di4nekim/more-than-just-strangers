const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");
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

exports.handler = async (event, context) => {
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

        // Extract parameters from the action/data structure
        const data = body.data || {};
        const { chatId, limit = 20, lastEvaluatedKey } = data;

        if (!chatId) {
            await apiGateway.send(new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                    action: 'error',
                    data: { error: 'Missing chatId parameter' }
                })
            }));
            return { statusCode: 200 };
        }

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
                    data: { error: 'Internal server error', details: error.message }
                })
            }));
        } catch (sendError) {
            console.error('Error sending error response:', sendError);
        }
        return { statusCode: 200 };
    }
}; 