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
    
    try {
        const connectionId = event.requestContext.connectionId;

        // Find the connection in the database
        const scanParams = {
            TableName: process.env.CONNECTIONS_TABLE,
            FilterExpression: 'connectionId = :connectionId',
            ExpressionAttributeValues: {
                ':connectionId': connectionId
            }
        };

        const scanResult = await dynamoDB.scan(scanParams).promise();
        if (!scanResult.Items || scanResult.Items.length === 0) {
            return { statusCode: 404, body: 'Connection not found' };
        }

        const connection = scanResult.Items[0];

        // Update the connection status
        const updateParams = {
            TableName: process.env.CONNECTIONS_TABLE,
            Key: {
                userId: connection.userId,
                otherUserId: connection.otherUserId
            },
            UpdateExpression: 'SET connectionId = :nullValue',
            ExpressionAttributeValues: {
                ':nullValue': null
            }
        };

        await dynamoDB.update(updateParams).promise();
        return { statusCode: 200, body: 'Disconnected successfully' };
    } catch (error) {
        console.error('Error in onDisconnect:', error);
        return { statusCode: 500, body: "Error disconnecting: " + error.message };
    }
};
