// sends message to the user's active websocket connection
// modified to either send msg immediately or put into messageQueue
const { createDynamoDB, createApiGateway } = require('./config/aws');
const WebSocket = require('ws');



exports.handler = async (event) => {

    const dynamoDB = createDynamoDB();
    const apiGateway = createApiGateway();

    // For testing purposes
    const ws = new WebSocket('wss://your-api-gateway-endpoint');

    ws.on('open', function open() {
    console.log('Connected to WebSocket');
    ws.send(JSON.stringify({
        action: 'sendMessage',
        data: {
        senderId: 'testUser',
        message: 'Hello, world!',
        messageId: 'testMessageId'
        }
    }));
    });

    ws.on('message', function incoming(data) {
    console.log('Received:', data);
    });

    ws.on('error', function error(err) {
    console.error('WebSocket error:', err);
    });

    ws.on('close', function close() {
    console.log('WebSocket connection closed');
    });
    
    try {
        let body;
        try {
            body = JSON.parse(event.body);
        } catch (parseError) {
            return { statusCode: 400, body: { status: 'error', message: 'Invalid request body' } };
        }

        // Check for action field and route accordingly
        const { action } = body;
        if (action !== 'sendMessage') {
            return { statusCode: 400, body: { status: 'error', message: 'Invalid action' } };
        }

        // Extract message details
        const { senderId, receiverId, message, messageId } = body;

        // Validate required parameters
        if (!senderId || !receiverId || !message || !messageId) {
            return { statusCode: 400, body: { status: 'error', message: 'Missing required parameters' } };
        }

        try {
            // Check if there's an active connection
            const getParams = {
                TableName: process.env.CONNECTIONS_TABLE,
                Key: {
                    userId: senderId,
                    otherUserId: receiverId
                }
            };

            const connection = await dynamoDB.get(getParams).promise();
            if (!connection.Item || !connection.Item.connectionId) {
                return { statusCode: 403, body: { status: 'error', message: 'Connection not found' } };
            }

            // Store the message
            const putParams = {
                TableName: process.env.MESSAGES_TABLE,
                Item: {
                    messageId,
                    senderId,
                    receiverId,
                    message,
                    timestamp: new Date().toISOString(),
                    delivered: false
                }
            };

            await dynamoDB.put(putParams).promise();

            // Try to send the message if receiver is connected
            if (connection.Item.connectionId) {
                try {
                    await apiGateway.postToConnection({
                        ConnectionId: connection.Item.connectionId,
                        Data: JSON.stringify({
                            senderId,
                            message
                        })
                    }).promise();

                    // Update message as delivered
                    const updateParams = {
                        TableName: process.env.MESSAGES_TABLE,
                        Key: {
                            senderId,
                            timestamp: putParams.Item.timestamp
                        },
                        UpdateExpression: 'SET delivered = :delivered',
                        ExpressionAttributeValues: {
                            ':delivered': true
                        }
                    };

                    await dynamoDB.update(updateParams).promise();
                } catch (sendError) {
                    console.error('Error sending message:', sendError);
                    return { statusCode: 500, body: { status: 'error', message: 'Error sending message' } };
                }
            } else {
                // Queue the message if no active connection
                const queueParams = {
                    TableName: process.env.MESSAGE_QUEUE_TABLE,
                    Item: {
                        messageId: Date.now().toString(), // Simple unique ID
                        senderId,
                        receiverId,
                        message,
                        timestamp: new Date().toISOString(),
                        delivered: false
                    }
                };
                
                try {
                    await dynamoDB.put(queueParams).promise();
                } catch (queueError) {
                    console.error('Error queuing message:', queueError);
                    return { statusCode: 500, body: { status: 'error', message: 'Error queuing message' } };
                }
            }
            

            return { statusCode: 200, body: { status: 'success', message: 'Message sent and stored successfully' } };
        } catch (dbError) {
            console.error('Database error:', dbError);
            return { statusCode: 500, body: { status: 'error', message: 'Error sending message' } };
        }
    } catch (error) {
        console.error('Error in sendMessage:', error);
        return { statusCode: 500, body: { status: 'error', message: 'Error sending message' } };
    }
};
