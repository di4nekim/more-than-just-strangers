const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Handler for adding a message to the queue
exports.addMessageToQueue = async (event) => {
    const { chatId, senderId, receiverId, message } = JSON.parse(event.body);
    const params = {
        TableName: 'MessageQueue',
        Item: {
            messageId: AWS.util.uuid.v4(),
            chatId: chatId,
            senderId: senderId,
            receiverId: receiverId,
            message: message,
            timestamp: new Date().toISOString(),
            delivered: false
        }
    };

    try {
        await dynamodb.put(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Message added to queue successfully' })
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not add message to queue' })
        };
    }
};

// Handler for fetching undelivered messages
exports.fetchUndeliveredMessages = async (event) => {
    const { receiverId } = event.pathParameters;
    const params = {
        TableName: 'MessageQueue',
        FilterExpression: 'receiverId = :receiverId AND delivered = :delivered',
        ExpressionAttributeValues: {
            ':receiverId': receiverId,
            ':delivered': false
        }
    };

    try {
        const data = await dynamodb.scan(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify(data.Items)
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not fetch undelivered messages' })
        };
    }
}; 