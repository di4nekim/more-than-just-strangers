/**
 * Lambda function to handle new WebSocket connections.
 * Validates Firebase ID tokens and stores the connection ID in DynamoDB.
 * 
 * @param {Object} event - The event object containing the WebSocket connection details
 * @returns {Object} Response object with status code and body
 */

// AWS SDK imports
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

// Shared utility imports
const { authenticateWebSocketEvent } = require("../shared/auth");
const { 
    createErrorResponse, 
    createSuccessResponse, 
    extractAction, 
    extractRequestId,
    handleDynamoDBError
} = require("../shared/errorHandler");

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const handlerLogic = async (event) => {
    console.log('Lambda triggered with event:', JSON.stringify(event, null, 2));
    
    const { userId, email } = event.userInfo;
    console.log('Firebase token validated successfully for user:', userId);
    
    try {
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
        const userMetadataTableName = process.env.USER_METADATA_TABLE;
        console.log(`New WebSocket connection established: ${connectionId} for user: ${userId}`);

        const dynamoDbClient = new DynamoDBClient({
            region: AWS_REGION
        });
        const dynamoDbDocumentClient = DynamoDBDocumentClient.from(dynamoDbClient);

        const userPrimaryKey = { PK: `USER#${userId}` };
        console.log('Checking for user with key:', userPrimaryKey);
        
        const existingUserResult = await dynamoDbDocumentClient.send(new GetCommand({
            TableName: userMetadataTableName,
            Key: userPrimaryKey
        }));
        
        if (!existingUserResult.Item) {
            try {
                const newUserRecord = {
                    ...userPrimaryKey,
                    connectionId,
                    userId,
                    email,
                    createdAt: new Date().toISOString(),
                    lastConnected: new Date().toISOString()
                };
                console.log('Creating new user:', newUserRecord);
                
                await dynamoDbDocumentClient.send(new PutCommand({
                    TableName: userMetadataTableName,
                    Item: newUserRecord
                }));
                
                const action = extractAction(event);
                const requestId = extractRequestId(event);
                return {
                    statusCode: 200,
                    body: JSON.stringify({ 
                        message: 'New user connection established', 
                        connectionId,
                        userId 
                    })
                };
            } catch (error) {
                console.error('Error creating user:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        error: 'Failed to create user',
                        message: error.message,
                        timestamp: new Date().toISOString()
                    })
                };
            }
        } else {
            try {
                console.log('Updating existing user:', userPrimaryKey);
                
                await dynamoDbDocumentClient.send(new UpdateCommand({
                    TableName: userMetadataTableName,
                    Key: userPrimaryKey,
                    UpdateExpression: 'SET connectionId = :connectionId, lastConnected = :now, email = :email',
                    ExpressionAttributeValues: {
                        ':connectionId': connectionId,
                        ':now': new Date().toISOString(),
                        ':email': email
                    }
                }));

                const action = extractAction(event);
                const requestId = extractRequestId(event);
                return {
                    statusCode: 200,
                    body: JSON.stringify({ 
                        message: 'User connection updated', 
                        connectionId,
                        userId 
                    })
                };
            } catch (error) {
                console.error('Error updating user:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        error: 'Failed to update user',
                        message: error.message,
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }
    } catch (error) {
        console.error('Error in handler logic:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};

module.exports.handler = async (event, context) => {
    try {
        const userInfo = await authenticateWebSocketEvent(event);
        event.userInfo = userInfo;
        
        const result = await handlerLogic(event);
        return result;
        
    } catch (error) {
        console.error('Authentication failed:', error);
        
        return {
            statusCode: 401,
            body: JSON.stringify({
                error: 'Authentication failed',
                message: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};