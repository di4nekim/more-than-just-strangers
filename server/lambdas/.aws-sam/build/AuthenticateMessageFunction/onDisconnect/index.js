/**
 * Lambda function to handle WebSocket disconnections.
 * Removes the connection ID from DynamoDB and updates user metadata.
 * 
 * @param {Object} event - The event object containing the WebSocket connection details and request body
 * @returns {Object} Response object with status code and body
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { 
    createErrorResponse, 
    createSuccessResponse, 
    extractAction, 
    extractRequestId,
    handleDynamoDBError
} = require("../shared/errorHandler");

module.exports.handler = async (event) => {
    try {
        // Configure DynamoDB DocumentClient for AWS SDK v3
        const client = new DynamoDBClient({
            region: process.env.AWS_REGION || 'us-east-1'
        });
        const dynamoDB = DynamoDBDocumentClient.from(client);

        // handle both production and test environments
        const connectionId = event.requestContext?.connectionId || event.connectionId;
        
        if (!event.body) {
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(400, 'Missing request body', action, {
                operation: 'request_validation',
                requiredField: 'body'
            }, requestId);
        }

        let body;
        try {
            body = JSON.parse(event.body);
        } catch (error) {
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(400, 'Invalid request body', action, {
                operation: 'request_parsing',
                errorMessage: error.message
            }, requestId);
        }

        if (!body.data || !body.data.userId) {
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(400, 'Missing userId in request body', action, {
                operation: 'request_validation',
                requiredFields: ['data.userId'],
                providedFields: Object.keys(body || {})
            }, requestId);
        }

        const { userId } = body.data;

        if (!connectionId) {
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(400, 'Missing connectionId', action, {
                operation: 'connection_validation',
                requiredField: 'connectionId'
            }, requestId);
        }

        // Check if user exists
        try {
            const userMetadata = await dynamoDB.send(new GetCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${userId}` }
            }));

            if (userMetadata.Item) {
                // update user metadata to remove connection
                try {
                    await dynamoDB.send(new UpdateCommand({
                        TableName: process.env.USER_METADATA_TABLE,
                        Key: { PK: `USER#${userId}` },
                        UpdateExpression: 'REMOVE connectionId SET lastSeen = :timestamp',
                        ExpressionAttributeValues: {
                            ':timestamp': new Date().toISOString()
                        }
                    }));
                } catch (error) {
                    console.error('Error updating user metadata:', error);
                    return handleDynamoDBError(error, extractAction(event), {
                        operation: 'user_metadata_update',
                        resource: 'user_metadata',
                        tableName: process.env.USER_METADATA_TABLE,
                        userId
                    });
                }
            } else {
                const action = extractAction(event);
                const requestId = extractRequestId(event);
                return createErrorResponse(404, 'User not found', action, {
                    operation: 'user_verification',
                    userId,
                    tableName: process.env.USER_METADATA_TABLE
                }, requestId);
            }
        } catch (error) {
            console.error('Error checking user existence:', error);
            return handleDynamoDBError(error, extractAction(event), {
                operation: 'user_lookup',
                resource: 'user_metadata',
                tableName: process.env.USER_METADATA_TABLE,
                userId
            });
        }

        const action = extractAction(event);
        const requestId = extractRequestId(event);
        return createSuccessResponse(200, { message: 'Disconnected successfully' }, action, requestId);
    } catch (error) {
        console.error('Error in onDisconnect:', error);
        const action = extractAction(event);
        const requestId = extractRequestId(event);
        return createErrorResponse(500, 'Internal Server Error', action, {
            operation: 'disconnection_handling',
            errorType: error.name || 'UnknownError',
            errorMessage: error.message || 'An unexpected error occurred'
        }, requestId);
    }
};
