/**
 * Lambda function to handle WebSocket disconnections.
 * Removes the connection ID from DynamoDB and updates user metadata.
 * 
 * @param {Object} event - The event object containing the WebSocket connection details and request body
 * @returns {Object} Response object with status code and body
 */
const AWS = require('aws-sdk');

module.exports.handler = async (event) => {
    try {
        // config document client for local dev via DynamoDB Local + Docker
        const isLocal = !!process.env.DYNAMODB_ENDPOINT;
        const dynamoDB = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
            accessKeyId: isLocal ? "fake" : undefined,
            secretAccessKey: isLocal ? "fake" : undefined,
        });

        // handle both production and test environments
        const connectionId = event.requestContext?.connectionId || event.connectionId;
        
        if (!event.body) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing request body' }) };
        }

        let body;
        try {
            body = JSON.parse(event.body);
        } catch (error) {
            return { statusCode: 500, body: `Error disconnecting: ${error.message}` };
        }

        if (!body.data || !body.data.userId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing userId in request body' }) };
        }

        const { userId } = body.data;

        if (!connectionId) {
            return {
                statusCode: 400,
                body: 'Missing connectionId'
            };
        }

        if (userMetadata.Items && userMetadata.Items.length > 0) {
            // update user metadata to remove connection
            try {
                await dynamoDB.update({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${userId}` },
                    UpdateExpression: 'REMOVE connectionId SET lastSeen = :timestamp',
                    ExpressionAttributeValues: {
                        ':timestamp': new Date().toISOString()
                    }
                }).promise();
            } catch (error) {
                console.error('Error updating user metadata:', error);
                return {
                    statusCode: 500,
                    body: 'Error updating user metadata'
                };
            }
        } else {
            return {
                statusCode: 500,
                body: 'Error updating user metadata'
            };
        }

        return {
            statusCode: 200,
            body: 'Disconnected successfully'
        };
    } catch (error) {
        console.error('Error in onDisconnect:', error);
        return { statusCode: 500, body: `Error disconnecting: ${error.message}` };
    }
};
