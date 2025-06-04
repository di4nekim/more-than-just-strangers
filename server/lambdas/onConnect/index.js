const AWS = require('aws-sdk');

module.exports.handler = async (event) => {
    // console.log('Lambda triggered with event:', JSON.stringify(event));
    
    try {
        // validate that we have a connectionId
        if (!event.requestContext || !event.requestContext.connectionId) {
            console.error('No connectionId found in event');
            return { 
                statusCode: 400, 
                body: JSON.stringify({ 
                    error: 'Missing connectionId in request'
                })
            };
        }

        const connectionId = event.requestContext.connectionId;
        console.log(`New WebSocket connection established: ${connectionId}`);

        // config document client for local dev via DynamoDB Local + Docker
        const isLocal = !!process.env.DYNAMODB_ENDPOINT;
        const dynamoDB = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
            accessKeyId: isLocal ? "fake" : undefined,
            secretAccessKey: isLocal ? "fake" : undefined,
        });

        // Check if connection already exists
        try {
            const existingConnection = await dynamoDB.get({
                TableName: process.env.CONNECTIONS_TABLE || 'connections',
                Key: { connectionId }
            }).promise();

            if (existingConnection.Item) {
                return {
                    statusCode: 409,
                    body: JSON.stringify({ error: 'Connection already exists' })
                };
            }
        } catch (error) {
            console.error('Error checking existing connection:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Internal Server Error' })
            };
        }

        // Store the new connection
        try {
            await dynamoDB.put({
                TableName: process.env.CONNECTIONS_TABLE || 'connections',
                Item: { connectionId }
            }).promise();

            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Connection established', connectionId })
            };
        } catch (error) {
            console.error('Error storing connection:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Internal Server Error' })
            };
        }

    } catch (error) {
        console.error('Error in onConnect:', error);
        return { 
            statusCode: 500, 
            body: 'Internal server error'
        };
    }
};