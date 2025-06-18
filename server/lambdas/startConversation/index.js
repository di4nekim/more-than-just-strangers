const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

// Configure AWS SDK v3 client
const dynamoDbClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});
const dynamoDB = DynamoDBDocumentClient.from(dynamoDbClient);

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body);
        const { userAId, userBId } = body.data;

        if (!userAId || !userBId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    action: 'error',
                    data: { error: 'Missing userAId or userBId' }
                })
            };
        }

        const chatParticipants = [userAId, userBId].sort();
        const chatId = `${chatParticipants[0]}#${chatParticipants[1]}`;
        const timestamp = new Date().toISOString();

        // Create new conversation record
        const conversationParams = {
            TableName: process.env.CONVERSATIONS_TABLE,
            Item: {
                PK: `CHAT#${chatId}`,
                chatId,
                participants: [userAId, userBId],
                lastMessage: null,
                lastUpdated: timestamp,
                endedBy: null,
                endReason: null,
                createdAt: timestamp,
            }
        };

        await dynamoDB.send(new PutCommand(conversationParams));

        return {
            statusCode: 200,
            body: JSON.stringify({
                action: 'conversationStarted',
                data: {
                    chatId,
                    participants: [userAId, userBId],
                    createdAt: timestamp
                }
            })
        };

    } catch (error) {
        console.error('Error starting conversation:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                action: 'error',
                data: { error: 'Internal server error' }
            })
        };
    }
};
