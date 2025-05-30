const AWS = require('aws-sdk');

module.exports.handler = async (event) => {
    console.log('Lambda triggered with event:', JSON.stringify(event));
    
    try {
         // config document client for local dev via DynamoDB Local + Docker
        const isLocal = !!process.env.DYNAMODB_ENDPOINT;
        const dynamoDB = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
            accessKeyId: isLocal ? "fake" : undefined,
            secretAccessKey: isLocal ? "fake" : undefined,
        });
        const connectionId = event.requestContext.connectionId;
        const userId = event.queryStringParameters?.userId;

        // Check if connection already exists
        const getParams = {
            TableName: process.env.CONNECTIONS_TABLE,
            Key: {
                ConnectionID: connectionId
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
                ConnectionID: connectionId,
                UserID: userId,
                timestamp: new Date().toISOString()
            }
        };

        await dynamoDB.put(putParams).promise();

        return { statusCode: 200, body: 'Connected successfully' };
    } catch (error) {
        console.error('Error in onConnect:', error);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
};