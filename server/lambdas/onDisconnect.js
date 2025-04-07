// removes disconnected user's connectionID from dynamoDB, cleans up stale connections
const { createDynamoDB } = require('./config/aws');

exports.handler = async (event) => {
    const dynamoDB = createDynamoDB();
    
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
