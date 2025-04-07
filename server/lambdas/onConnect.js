// stores connection ID in dynamoDB
// modified to deliver msgs in messageQueue, if exists
const { createDynamoDB, createApiGateway } = require('./config/aws');

exports.handler = async (event) => {
    const dynamoDB = createDynamoDB();
    const apiGateway = createApiGateway();

    try {
        // Extract parameters from query string
        const { userId, otherUserId } = event.queryStringParameters || {};
        const connectionId = event.requestContext.connectionId;

        // Validate required parameters
        if (!userId || !otherUserId) {
            return { statusCode: 400, body: 'Missing required parameters' };
        }

        try {
            // Check if connection already exists
            const getParams = {
                TableName: process.env.CONNECTIONS_TABLE,
                Key: {
                    userId,
                    otherUserId
                }
            };

            const existingConnection = await dynamoDB.get(getParams).promise();
            if (existingConnection.Item) {
                return { statusCode: 409, body: 'Connection already exists' };
            }

            // Store the connection
            const putParams = {
                TableName: process.env.CONNECTIONS_TABLE,
                Item: {
                    userId,
                    otherUserId,
                    connectionId,
                    timestamp: new Date().toISOString()
                }
            };

            await dynamoDB.put(putParams).promise();

            // Retrieve undelivered messages from MessageQueue
            const messageQuery = {
                TableName: process.env.MESSAGE_QUEUE_TABLE,
                IndexName: "receiverId-index",
                KeyConditionExpression: "receiverId = :userId",
                ExpressionAttributeValues: { ":userId": userId },
            };

            const messageResults = await dynamoDB.query(messageQuery).promise();

            // Send all undelivered messages
            for (const message of messageResults.Items || []) {
                try {
                    await apiGateway.postToConnection({
                        ConnectionId: connectionId,
                        Data: JSON.stringify({
                            senderId: message.senderId,
                            receiverId: message.receiverId,
                            message: message.message,
                        }),
                    }).promise();

                    // Mark message as delivered
                    const updateMessageParams = {
                        TableName: process.env.MESSAGE_QUEUE_TABLE,
                        Key: { messageId: message.messageId },
                        UpdateExpression: "SET delivered = :delivered",
                        ExpressionAttributeValues: { ":delivered": true },
                    };
                    await dynamoDB.update(updateMessageParams).promise();
                } catch (messageError) {
                    console.error('Error sending message:', messageError);
                    // Continue with other messages even if one fails
                }
            }

            return { statusCode: 200, body: 'Connected and undelivered messages sent' };
        } catch (dbError) {
            console.error('Database error:', dbError);
            return { statusCode: 500, body: "Error connecting: " + dbError.message };
        }
    } catch (error) {
        console.error('Error in onConnect:', error);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
};
