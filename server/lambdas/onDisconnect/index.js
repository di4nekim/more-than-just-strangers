const AWS = require('aws-sdk');

module.exports.handler = async (event) => {
   // config document client for local dev via DynamoDB Local + Docker
   const isLocal = !!process.env.DYNAMODB_ENDPOINT;
   const dynamoDB = new AWS.DynamoDB.DocumentClient({
       region: process.env.AWS_REGION || 'us-east-1',
       endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
       accessKeyId: isLocal ? "fake" : undefined,
       secretAccessKey: isLocal ? "fake" : undefined,
   });
    
    try {
        const connectionId = event.requestContext.connectionId;
        const userId = event.queryStringParameters?.userId; // userID from query string is temp; validate via Cognito later


        // get user metadata
        const getUserParams = {
            TableName: process.env.USER_METADATA_TABLE,
            Key: { connectionId }
        };

        const userResult = await dynamoDB.get(getUserParams).promise();


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
