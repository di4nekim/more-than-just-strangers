/**
 * Lambda function to authenticate WebSocket messages.
 * This function is called when the first message is received from a WebSocket connection.
 * It validates the Firebase token and moves the connection from pending to authenticated state.
 * 
 * @param {Object} event - The event object containing the WebSocket message
 * @returns {Object} Response object with status code and body
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { verifyIdToken } = require("../shared/firebase-config");

// AWS Region configuration
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Main handler logic
const handlerLogic = async (event) => {
    console.log('authenticateMessage: Function started');
    console.log('authenticateMessage: Event received:', JSON.stringify(event, null, 2));
    
    try {
        const connectionId = event.requestContext.connectionId;
        if (!connectionId) {
            console.error('authenticateMessage: Missing connectionId');
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Missing connectionId',
                    message: 'Connection ID is required'
                })
            };
        }

        // Parse the message body
        let messageBody;
        try {
            messageBody = JSON.parse(event.body);
        } catch (error) {
            console.error('authenticateMessage: Invalid JSON in message body:', error);
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Invalid JSON',
                    message: 'Message body must be valid JSON'
                })
            };
        }

        // Check if this is an authentication message
        if (messageBody.action !== 'authenticate') {
            console.log('authenticateMessage: Not an authentication message, skipping');
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Not an authentication message',
                    action: messageBody.action
                })
            };
        }

        // Extract the Firebase token
        const token = messageBody.token;
        if (!token) {
            console.error('authenticateMessage: Missing Firebase token');
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Missing token',
                    message: 'Firebase ID token is required for authentication'
                })
            };
        }

        // Validate the Firebase token
        let decodedToken;
        try {
            decodedToken = await verifyIdToken(token);
            console.log('authenticateMessage: Firebase token validated successfully for user:', decodedToken.uid);
        } catch (error) {
            console.error('authenticateMessage: Firebase token validation failed:', error);
            return {
                statusCode: 401,
                body: JSON.stringify({
                    error: 'Invalid token',
                    message: 'Firebase ID token is invalid or expired'
                })
            };
        }

        // Configure DynamoDB clients
        const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
        const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);

        const userMetadataTable = process.env.USER_METADATA_TABLE || 'UserMetadataV2';

        // Extract user ID from the validated Firebase token
        const userId = decodedToken.uid;
        console.log('authenticateMessage: User ID from token:', userId);

        // Check if user already exists
        const userKey = { PK: `USER#${userId}` };
        const existingUser = await dynamoDB.send(new GetCommand({
            TableName: userMetadataTable,
            Key: userKey
        }));

        try {
            if (existingUser.Item) {
                // Update existing user with new connectionId and mark as authenticated
                console.log('authenticateMessage: Updating existing user with new connectionId');
                
                await dynamoDB.send(new UpdateCommand({
                    TableName: userMetadataTable,
                    Key: userKey,
                    UpdateExpression: 'SET connectionId = :connectionId, lastConnected = :now, email = :email, pending_auth = :pendingAuth',
                    ExpressionAttributeValues: {
                        ':connectionId': connectionId,
                        ':now': new Date().toISOString(),
                        ':email': decodedToken.email,
                        ':pendingAuth': false
                    }
                }));
            } else {
                // Create new user with pending_auth = false (they're now authenticated)
                console.log('authenticateMessage: Creating new user');
                
                const newUser = {
                    ...userKey,
                    connectionId: connectionId,
                    userId: userId,
                    email: decodedToken.email,
                    createdAt: new Date().toISOString(),
                    lastConnected: new Date().toISOString(),
                    ready: false,
                    questionIndex: 0,
                    pending_auth: false
                };
                
                await dynamoDB.send(new PutCommand({
                    TableName: userMetadataTable,
                    Item: newUser
                }));
            }

            console.log('authenticateMessage: Authentication successful for user:', userId);

            // Return success response
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Authentication successful',
                    userId: userId,
                    connectionId: connectionId,
                    status: 'authenticated'
                })
            };

        } catch (error) {
            console.error('authenticateMessage: Error during authentication process:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: 'Authentication process failed',
                    message: error.message
                })
            };
        }

    } catch (error) {
        console.error('authenticateMessage: Error in handler logic:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error.message
            })
        };
    }
};

// Export the handler
module.exports.handler = handlerLogic;
