const AWS = require('aws-sdk');

const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION
});

const apiGateway = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: process.env.WEBSOCKET_ENDPOINT
});

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body);
        const { chatId } = body.data;
        const connectionId = event.requestContext.connectionId;

        if (!chatId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    action: 'error',
                    data: { error: 'Missing chatId' }
                })
            };
        }

        // Get conversation metadata
        const conversation = await dynamoDB.get({
            TableName: process.env.CONVERSATIONS_TABLE,
            Key: { PK: `CHAT#${chatId}` }
        }).promise();

        if (!conversation.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    action: 'error',
                    data: { error: 'Conversation not found' }
                })
            };
        }

        // Send conversation metadata to the requesting user
        await apiGateway.postToConnection({
            ConnectionId: connectionId,
            Data: JSON.stringify({
                action: 'conversationSync',
                data: {
                    chatId: conversation.Item.PK.replace('CHAT#', ''),
                    participants: conversation.Item.participants,
                    lastMessage: conversation.Item.lastMessage,
                    lastUpdated: conversation.Item.lastUpdated,
                    endedBy: conversation.Item.endedBy,
                    endReason: conversation.Item.endReason,
                    createdAt: conversation.Item.createdAt
                }
            })
        }).promise();

        return {
            statusCode: 200,
            body: JSON.stringify({
                action: 'conversationSync',
                data: { message: 'Conversation synchronized' }
            })
        };

    } catch (error) {
        console.error('Error syncing conversation:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                action: 'error',
                data: { error: 'Internal server error' }
            })
        };
    }
}; 