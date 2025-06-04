const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        if (!event.queryStringParameters || !event.queryStringParameters.userId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing userId parameter' })
            };
        }

        const { userId } = event.queryStringParameters;

        // Get user's conversations
        const params = {
            TableName: process.env.CONVERSATIONS_TABLE,
            IndexName: 'UserConversationsIndex',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId
            }
        };

        const result = await dynamoDB.query(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ conversations: result.Items })
        };
    } catch (error) {
        console.error('Error in getConversations:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
}; 