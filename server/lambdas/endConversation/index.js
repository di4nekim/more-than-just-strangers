const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");

// Configure AWS SDK v3 clients
const dynamoDbClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});
const dynamoDB = DynamoDBDocumentClient.from(dynamoDbClient);

const apiGateway = new ApiGatewayManagementApiClient({
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
        const conversation = await dynamoDB.send(new GetCommand({
            TableName: process.env.CONVERSATIONS_TABLE,
            Key: { PK: `CHAT#${chatId}` }
        }));

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
        await dynamoDB.send(new UpdateCommand({
            TableName: process.env.CONVERSATIONS_TABLE,
            Key: { PK: `CHAT#${chatId}` },
            UpdateExpression: 'SET endedBy = :endedBy, endReason = :endReason, lastUpdated = :lastUpdated',
            ExpressionAttributeValues: {
                ':endedBy': userId,
                ':endReason': reason,
                ':lastUpdated': timestamp
            }
        }));

        // Find the other participant - handle both Array and Set formats
        let otherUserId;
        if (Array.isArray(conversation.Item.participants)) {
            otherUserId = conversation.Item.participants.find(id => id !== userId);
        } else if (conversation.Item.participants instanceof Set) {
            otherUserId = [...conversation.Item.participants].find(id => id !== userId);
        } else {
            console.error('Invalid participants format:', typeof conversation.Item.participants);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    action: 'error',
                    data: { error: 'Invalid participants format' }
                })
            };
        }

        // Get other user's connection status
        const otherUserMetadata = await dynamoDB.send(new GetCommand({
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${otherUserId}` }
        }));

        // If other user is connected, notify them
        if (otherUserMetadata.Item?.connectionId) {
            try {
                await apiGateway.send(new PostToConnectionCommand({
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
