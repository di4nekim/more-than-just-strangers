const AWS = require('aws-sdk');

const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION
});

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

        await dynamoDB.put(conversationParams).promise();

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
