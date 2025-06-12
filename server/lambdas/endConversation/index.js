const AWS = require('aws-sdk');

const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || 'us-east-1'
});

const apiGateway = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: process.env.WEBSOCKET_API_URL
});

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body);
        const { chatId, userId, reason } = body.data;

        if (!chatId || !userId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    action: 'error',
                    data: { error: 'Missing chatId or userId' }
                })
            };
        }

        // Get conversation to find other participant
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

        // Update conversation as ended
        const timestamp = new Date().toISOString();
        await dynamoDB.update({
            TableName: process.env.CONVERSATIONS_TABLE,
            Key: { PK: `CHAT#${chatId}` },
            UpdateExpression: 'SET endedBy = :endedBy, endReason = :endReason, lastUpdated = :lastUpdated',
            ExpressionAttributeValues: {
                ':endedBy': userId,
                ':endReason': reason ,
                ':lastUpdated': timestamp
            }
        }).promise();

        // Find the other participant
        const otherUserId = conversation.Item.participants.find(id => id !== userId);

        // Get other user's connection status
        const otherUserMetadata = await dynamoDB.get({
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${otherUserId}` }
        }).promise();

        // If other user is connected, notify them
        if (otherUserMetadata.Item?.connectionId) {
            try {
                await apiGateway.postToConnection({
                    ConnectionId: otherUserMetadata.Item.connectionId,
                    Data: JSON.stringify({
                        action: 'conversationEnded',
                        data: {
                            chatId,
                            endedBy: userId,
                            endReason: reason,
                            timestamp
                        }
                    })
                }).promise();
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
