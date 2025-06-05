const AWS = require('aws-sdk');

// config document client for local dev via DynamoDB Local + Docker
const isLocal = !!process.env.DYNAMODB_ENDPOINT;
const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
    accessKeyId: isLocal ? "fake" : undefined,
    secretAccessKey: isLocal ? "fake" : undefined,
    maxRetries: 3,
    retryDelayOptions: { base: 300 }
});

const validateInput = (body) => {
    if (!body || typeof body !== 'object') {
        throw new Error('Invalid request body');
    }
    if (body.action !== 'getCurrentState') {
        throw new Error('Invalid action');
    }
    if (!body.data || !body.data.userId) {
        throw new Error('Missing userId');
    }
};

exports.handler = async (event) => {
    try {
        // Parse the WebSocket message body
        let body;
        try {
            body = JSON.parse(event.body);
        } catch (error) {
            return {
                statusCode: 400,
                body: JSON.stringify({ 
                    action: 'error',
                    data: { error: 'Invalid JSON in request body' }
                })
            };
        }

        try {
            validateInput(body);
        } catch (error) {
            return {
                statusCode: 400,
                body: JSON.stringify({ 
                    action: 'error',
                    data: { error: error.message }
                })
            };
        }

        const { userId } = body.data;

        // Get user metadata from DynamoDB
        const params = {
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: userId }
        };

        let userMetadata;
        try {
            userMetadata = await dynamoDB.get(params).promise();
            if (!userMetadata.Item) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ 
                        action: 'error',
                        data: { error: 'User not found' }
                    })
                };
            }
        } catch (error) {
            console.error('Error getting user metadata:', error);
            // Handle specific DynamoDB errors
            if (error.code === 'ResourceNotFoundException') {
                return {
                    statusCode: 500,
                    body: JSON.stringify({ 
                        action: 'error',
                        data: { error: 'Database table not found' }
                    })
                };
            }
            if (error.code === 'ValidationException') {
                // Treat as not found for get
                return {
                    statusCode: 404,
                    body: JSON.stringify({ 
                        action: 'error',
                        data: { error: 'User not found' }
                    })
                };
            }
            return {
                statusCode: 500,
                body: JSON.stringify({ 
                    action: 'error',
                    data: { error: 'Error retrieving user metadata' }
                })
            };
        }

        const item = userMetadata.Item;
        // Return the current state with null checks for optional fields
        return {
            statusCode: 200,
            body: JSON.stringify({
                action: 'currentState',
                data: {
                    userId: item.PK,
                    connectionId: item.connectionId || null,
                    chatId: item.chatId || null,
                    ready: item.ready || false,
                    questionIndex: item.questionIndex || 0,
                    lastSeen: item.lastSeen || new Date().toISOString(),
                    createdAt: item.createdAt || new Date().toISOString()
                }
            })
        };
    } catch (error) {
        console.error('Error in getCurrentState:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                action: 'error',
                data: { error: 'Internal server error' }
            })
        };
    }
};
