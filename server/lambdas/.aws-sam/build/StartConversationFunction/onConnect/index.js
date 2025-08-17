/**
 * Lambda function to handle new WebSocket connections.
 * Validates Firebase ID tokens and stores the connection ID in DynamoDB.
 * 
 * @param {Object} event - The event object containing the WebSocket connection details
 * @returns {Object} Response object with status code and body
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { authenticateWebSocketEvent } = require("../shared/auth");
const { 
    createErrorResponse, 
    createSuccessResponse, 
    extractAction, 
    extractRequestId,
    handleDynamoDBError
} = require("../shared/errorHandler");

// AWS Region configuration
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Main handler logic
const handlerLogic = async (event) => {
    console.log('Lambda triggered with event:', JSON.stringify(event, null, 2));
    
    // Get authenticated user info from the event (added by auth middleware)
    const { userId, email } = event.userInfo;
    console.log('Firebase token validated successfully for user:', userId);
    
    try {
        // Validate that we have a connectionId
        if (!event.requestContext || !event.requestContext.connectionId) {
            console.error('No connectionId found in event');
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(400, 'Missing connectionId in request', action, {
                operation: 'connection_validation',
                requiredField: 'connectionId'
            }, requestId);
        }

        const connectionId = event.requestContext.connectionId;
        const tableName = process.env.USER_METADATA_TABLE || 'UserMetadata';
        console.log(`New WebSocket connection established: ${connectionId} for user: ${userId}`);

        // Configure DynamoDB DocumentClient for AWS SDK v3
        const dynamoClient = new DynamoDBClient({
            region: AWS_REGION
        });
        const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);

        // Check if user exists
        const userKey = { PK: `USER#${userId}` };
        console.log('Checking for user with key:', userKey);
        
        const userExists = await dynamoDB.send(new GetCommand({
            TableName: tableName,
            Key: userKey
        }));
        
        if (!userExists.Item) {
            try {
                const newUser = {
                    ...userKey,
                    connectionId,
                    userId,
                    email: email,
                    createdAt: new Date().toISOString(),
                    lastConnected: new Date().toISOString()
                };
                console.log('Creating new user:', newUser);
                
                await dynamoDB.send(new PutCommand({
                    TableName: tableName,
                    Item: newUser
                }));
                
                const action = extractAction(event);
                const requestId = extractRequestId(event);
                return createSuccessResponse(200, { 
                    message: 'New user connection established', 
                    connectionId,
                    userId 
                }, action, requestId);
            } catch (error) {
                console.error('Error creating user:', error);
                return handleDynamoDBError(error, extractAction(event), {
                    operation: 'user_creation',
                    resource: 'user_metadata',
                    tableName: tableName,
                    userId
                });
            }
        } else {
            // Update existing user metadata with connectionId   
            try {
                console.log('Updating existing user:', userKey);
                
                await dynamoDB.send(new UpdateCommand({
                    TableName: tableName,
                    Key: userKey,
                    UpdateExpression: 'SET connectionId = :connectionId, lastConnected = :now, email = :email',
                    ExpressionAttributeValues: {
                        ':connectionId': connectionId,
                        ':now': new Date().toISOString(),
                        ':email': email
                    }
                }));

                const action = extractAction(event);
                const requestId = extractRequestId(event);
                return createSuccessResponse(200, { 
                    message: 'User connection updated', 
                    connectionId,
                    userId 
                }, action, requestId);
            } catch (error) {
                console.error('Error updating user:', error);
                return handleDynamoDBError(error, extractAction(event), {
                    operation: 'user_update',
                    resource: 'user_metadata',
                    tableName: tableName,
                    userId
                });
            }
        }
    } catch (error) {
        console.error('Error in handler logic:', error);
        const action = extractAction(event);
        const requestId = extractRequestId(event);
        return createErrorResponse(500, 'Internal Server Error', action, {
            operation: 'connection_handling',
            errorType: error.name || 'UnknownError',
            errorMessage: error.message || 'An unexpected error occurred'
        }, requestId);
    }
};

// Export the handler with authentication middleware
module.exports.handler = async (event, context) => {
    try {
        // Authenticate the WebSocket connection using Firebase token
        const userInfo = await authenticateWebSocketEvent(event);
        event.userInfo = userInfo;
        
        // Call the main handler logic
        const result = await handlerLogic(event);
        return result;
        
    } catch (error) {
        console.error('Authentication failed:', error);
        
        // For WebSocket connections, always return 200 but include error in body
        return {
            statusCode: 200,
            body: JSON.stringify({
                error: 'Authentication failed',
                message: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};