const AWS = require('aws-sdk');

module.exports.handler = async (event) => {
    const dynamodb = new AWS.DynamoDB.DocumentClient();
    let payload;

    try {
        // If triggered via API Gateway or Lambda invocation
        payload = typeof event.body === 'string' ? JSON.parse(event.body) : event;
    } catch (error) {
        console.error('Failed to parse payload:', error);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid payload' })
        };
    }

    const { messageId, senderId, receiverId, message, timestamp = new Date().toISOString() } = payload;

    if (!senderId || !receiverId || !message || !messageId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing required fields' })
        };
    }

    const params = {
        TableName: process.env.MESSAGE_QUEUE_TABLE,
        Item: {
            messageId,
            senderId,
            receiverId,
            message,
            timestamp,
            delivered: false
        }
    };

    try {
        await dynamodb.put(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Message queued successfully' })
        };
    } catch (error) {
        console.error('Error writing to MessageQueue table:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not queue message' })
        };
    }
};
