const AWS = require('aws-sdk');

module.exports.handler = async (event) => {
    try{
        console.log('Received event:', JSON.stringify(event));

         // config document client for local dev via DynamoDB Local + Docker
        const isLocal = !!process.env.DYNAMODB_ENDPOINT;
        const dynamodb = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
            accessKeyId: isLocal ? "fake" : undefined,
            secretAccessKey: isLocal ? "fake" : undefined,
        });
        const apiGateway = new AWS.ApiGatewayManagementApi({
            endpoint: process.env.WEBSOCKET_API_URL 
              ? process.env.WEBSOCKET_API_URL.replace("wss://", "").replace("/prod", "")
              : "localhost:3001"
          });
        const lambda = new AWS.Lambda();
    
        const connectionId = event.requestContext.connectionId;
    
        let body;
        try {
            body = JSON.parse(event.body);
            console.log('Parsed body:', body);
        } catch {
            return { statusCode: 400, body: 'Invalid request body' };
        }
        
        const { action, data } = body;
        
        if (!action || !data) {
            return { statusCode: 400, body: 'Missing action or data' };
        }

        // Handle initial connection message
        if (action === 'connect') {
            const { userId } = data;
            if (!userId) {
                return { statusCode: 400, body: 'Missing userId in connect message' };
            }

            // Update connection with userId
            const updateParams = {
                TableName: process.env.CONNECTIONS_TABLE,
                Key: { ConnectionID: connectionId },
                UpdateExpression: 'SET userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': userId
                }
            };

            try {
                await dynamodb.update(updateParams).promise();
                return { statusCode: 200, body: 'Connection updated with userId' };
            } catch (error) {
                console.error('Error updating connection:', error);
                return { statusCode: 500, body: 'Error updating connection' };
            }
        }
        
        const { senderId, receiverId, message, messageId } = data;
    
        console.log('Sender ID:', senderId, 'Receiver ID:', receiverId, 'Message ID:', messageId);
    
        // Validate sender connection
        const getParams = {
            TableName: process.env.CONNECTIONS_TABLE,
            Key: { ConnectionID: connectionId }
        };

        
        let connection;
        try {
            connection = await dynamodb.get(getParams).promise();
            console.log('Connection found:', connection);
        } catch (error) {
            console.error('DynamoDB get error:', error);
            return { statusCode: 500, body: 'Error retrieving connection' };
        }
    
        if (!connection.Item) {
            return { statusCode: 403, body: 'Connection not found' };
        }
    
        const timestamp = new Date().toISOString();

        const chatParticipants = [senderId, receiverId].sort();
        const ChatID = `${chatParticipants[0]}#${chatParticipants[1]}`;

        console.log('ChatID:', ChatID);

        // Save message to MESSAGES_TABLE
        const putParams = {
            TableName: process.env.MESSAGES_TABLE,
            Item: {
            ChatID: ChatID,
            Timestamp: timestamp,
            SenderID: senderId,
            ReceiverID: receiverId,
            Message: message,
            MessageID: messageId,
            Delivered: false
            }
        };
        try {
            await dynamodb.put(putParams).promise();
            console.log('Message saved to MESSAGES_TABLE:', putParams.Item);
        } catch (error) {
            console.error('DynamoDB put error:', error);
            return { statusCode: 500, body: 'Error saving message' };
        }
    
        // Attempt to send message to receiver
        let receiverConnection;
        try {
            receiverConnection = await findConnectionByUserId(receiverId, dynamodb);
            console.log('Receiver connection:', receiverConnection);
        } catch (error) {
            console.error('DynamoDB scan error in findConnectionByUserId:', error);
            return { statusCode: 500, body: 'Error finding receiver connection' };
        }
    
        if (receiverConnection) {
            try {
                await sendDirectMessage(apiGateway, receiverConnection.connectionId, { senderId, message });
                console.log('Message delivered to receiver');
    
                // Mark as delivered
                const updateParams = {
                    TableName: process.env.MESSAGES_TABLE,
                    Key: { messageId },
                    UpdateExpression: 'SET delivered = :delivered',
                    ExpressionAttributeValues: { ':delivered': true }
                };
                try {
                    await dynamodb.update(updateParams).promise();
                } catch (error) {
                    console.error('DynamoDB update error:', error);
                    return { statusCode: 500, body: 'Error updating message status' };
                }
            } catch (err) {
                console.error('Error delivering message:', err);
    
                // Queue message
                try {
                    console.log('Queueing message');
                    await lambda.invoke({
                        FunctionName: process.env.MESSAGE_QUEUE_HANDLER_FUNCTION_NAME
,
                        InvocationType: 'Event',
                        Payload: JSON.stringify({ messageId, senderId, receiverId, message, timestamp })
                    }).promise();
                } catch (error) {
                    console.error('Lambda invocation error:', error);
                    return { statusCode: 500, body: 'Error queueing message' };
                }
            }
        } else {
            // Receiver not connected: queue message
            try {
                console.log('Queueing message');
                await lambda.invoke({
                    FunctionName: process.env.MESSAGE_QUEUE_HANDLER_FUNCTION_NAME
,
                    InvocationType: 'Event',
                    Payload: JSON.stringify({ messageId, senderId, receiverId, message, timestamp })
                }).promise();
            } catch (error) {
                console.error('Lambda invocation error:', error);
                return { statusCode: 500, body: 'Error queuing message' };
            }      
        }
    
        return { statusCode: 200, body: 'Message processed successfully' };
    }   catch (error) {
            console.error('Unexpected handler error:', error);
            return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Unknown error' }) };
        }
        
};

async function findConnectionByUserId(userId, dynamodb) {
    const params = {
        TableName: process.env.CONNECTIONS_TABLE,
        FilterExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId }
    };
    const result = await dynamodb.scan(params).promise();
    return result.Items && result.Items[0];
}

async function sendDirectMessage(apiGateway, connectionId, payload) {
    return apiGateway.postToConnection({
        ConnectionId: connectionId,
        Data: JSON.stringify(payload)
    }).promise();
}

console.log('Message processed successfully');
