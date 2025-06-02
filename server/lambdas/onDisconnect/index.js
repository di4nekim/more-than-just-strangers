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
        const userId = event.body.userId; // userID from query string is temp; validate via Cognito later

        // update user metadata to remove connectionId, log lastSeen timestamp
        const updateUserParams = {
            TableName: process.env.USER_METADATA_TABLE,
            Key: { userId },
            UpdateExpression: 'SET connectionId = :nullValue, lastSeen = :timestamp',
            ExpressionAttributeValues: {
                ':nullValue': null,
                ':timestamp': new Date().toISOString()
            }
        };

        try{
            await dynamoDB.update(updateUserParams).promise();
        } catch (error) {
            console.error('Error updating user metadata:', error);
            return { statusCode: 500, body: "Error updating user metadata" };
        }

        return { statusCode: 200, body: 'Disconnected successfully' };
    } catch (error) {
        console.error('Error in onDisconnect:', error);
        return { statusCode: 500, body: "Error disconnecting: " + error.message };
    }
};
