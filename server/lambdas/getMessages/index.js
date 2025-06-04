const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        if (!event.queryStringParameters || !event.queryStringParameters.chatId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing chatId parameter' })
            };
        }

        const { chatId } = event.queryStringParameters;

        // Get messages for the chat
        const params = {
            TableName: process.env.MESSAGES_TABLE,
            KeyConditionExpression: 'PK = :chatId',
            ExpressionAttributeValues: {
                ':chatId': `CHAT#${chatId}`
            }
        };

        const result = await dynamoDB.query(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ messages: result.Items })
        };
    } catch (error) {
        console.error('Error in getMessages:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
}; 