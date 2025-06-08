const AWS = require('aws-sdk');

module.exports.handler = async (event) => {
    const dynamoDB = new AWS.DynamoDB.DocumentClient();
    const apiGateway = (AWSInstance = AWS) => {
        return new AWSInstance.ApiGatewayManagementApi({
          endpoint: process.env.WEBSOCKET_API_URL 
            ? process.env.WEBSOCKET_API_URL.replace("wss://", "").replace("/prod", "")
            : "localhost:3001"
        });
    };
    const lambda = (AWSInstance = AWS) => {
        return new AWSInstance.Lambda();
    };

    const connectionId = event.requestContext.connectionId;

    let body;
    try {
        body = JSON.parse(event.body);
    } catch {
        return { statusCode: 400, body: 'Invalid request body' };
    }

    const { action, senderId, receiverId, message, messageId } = body;

    if (action !== 'sendMessage' || !senderId || !receiverId || !message || !messageId) {
        return { statusCode: 400, body: 'Missing required parameters' };
    }

    // Validate sender connection
    const getParams = {
        TableName: process.env.CONNECTIONS_TABLE,
        Key: { connectionId }
    };

    
    let connection;
    try {
        connection = await dynamoDB.get(getParams).promise();
    } catch (error) {
        console.error('DynamoDB get error:', error);
        return { statusCode: 500, body: 'Error retrieving connection' };
    }

    if (!connection.Item) {
        return { statusCode: 403, body: 'Connection not found' };
    }

    const timestamp = new Date().toISOString();

    // Save message to MESSAGES_TABLE
    const putParams = {
        TableName: process.env.MESSAGES_TABLE,
        Item: { messageId, senderId, receiverId, message, timestamp, delivered: false }
    };
    try {
        await dynamoDB.put(putParams).promise();
    } catch (error) {
        console.error('DynamoDB put error:', error);
        return { statusCode: 500, body: 'Error saving message' };
    }

    // Attempt to send message to receiver
    const receiverConnection = await findConnectionByUserId(receiverId, dynamoDB);
    if (receiverConnection) {
        try {
            await sendDirectMessage(apiGateway, receiverConnection.connectionId, { senderId, message });

            // Mark as delivered
            const updateParams = {
                TableName: process.env.MESSAGES_TABLE,
                Key: { messageId },
                UpdateExpression: 'SET delivered = :delivered',
                ExpressionAttributeValues: { ':delivered': true }
            };
            try {
                await dynamoDB.update(updateParams).promise();
            } catch (error) {
                console.error('DynamoDB update error:', error);
                return { statusCode: 500, body: 'Error updating message status' };
            }
        } catch (err) {
            console.error('Error delivering message:', err);

            // Queue message
            try {
                await lambda.invoke({
                    FunctionName: 'messageQueueHandler',
                    InvocationType: 'Event',
                    Payload: JSON.stringify({ messageId, senderId, receiverId, message, timestamp })
                }).promise();
            } catch (error) {
                console.error('Lambda invocation error:', error);
                return { statusCode: 500, body: 'Error queuing message' };
            }
        }
    } else {
        // Receiver not connected: queue message
        try {
            await lambda.invoke({
                FunctionName: 'messageQueueHandler',
                InvocationType: 'Event',
                Payload: JSON.stringify({ messageId, senderId, receiverId, message, timestamp })
            }).promise();
        } catch (error) {
            console.error('Lambda invocation error:', error);
            return { statusCode: 500, body: 'Error queuing message' };
        }      
    }

    return { statusCode: 200, body: 'Message processed successfully' };
};

async function findConnectionByUserId(userId, dynamoDB) {
    const params = {
        TableName: process.env.CONNECTIONS_TABLE,
        FilterExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId }
    };
    const result = await dynamoDB.scan(params).promise();
    return result.Items && result.Items[0];
}

async function sendDirectMessage(apiGateway, connectionId, payload) {
    return apiGateway.postToConnection({
        ConnectionId: connectionId,
        Data: JSON.stringify(payload)
    }).promise();
}
