// DEPRECATED: refactored
const AWS = require('aws-sdk');

module.exports.handler = async (event) => {
    // config document client for local dev via DynamoDB Local + Docker
    const isLocal = !!process.env.DYNAMODB_ENDPOINT;
    const dynamodb = new AWS.DynamoDB.DocumentClient({
        region: process.env.AWS_REGION || 'us-east-1',
        endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
        accessKeyId: isLocal ? "fake" : undefined,
        secretAccessKey: isLocal ? "fake" : undefined,
    });
    let payload;

    console.log('Event received:', event);

    try {
        // If triggered via API Gateway or Lambda invocation
        payload = typeof event.body === 'string' ? JSON.parse(event.body) : event;
        console.log('Parsed payload:', payload);
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

    console.log('Payload details:', { messageId, senderId, receiverId, message, timestamp });

    try {
        await dynamodb.put(params).promise();
        console.log('DynamoDB put params:', params);
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
