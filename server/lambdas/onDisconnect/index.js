/**
 * Lambda function to handle WebSocket disconnections.
 * Removes the connection ID from DynamoDB and updates user metadata.
 * 
 * @param {Object} event - The event object containing the WebSocket connection details and request body
 * @returns {Object} Response object with status code and body
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
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

        if (!connectionId) {
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(400, 'Missing connectionId', action, {
                operation: 'connection_validation',
                requiredField: 'connectionId'
            }, requestId);
        }

        // Determine which user to disconnect.
        // API Gateway $disconnect events carry NO body, so we primarily identify the
        // user by connectionId. If a body IS present with data.userId, we honor it.
        let userId = null;
        let userIdFromBody = false;

        if (event.body) {
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

            if (body && body.data && body.data.userId) {
                userId = body.data.userId;
                userIdFromBody = true;
            }
        }

        // No usable body -> look up the user by their connectionId.
        if (!userId) {
            try {
                // Preferred path: query the GSI on connectionId.
                const lookup = await dynamoDB.send(new QueryCommand({
                    TableName: process.env.USER_METADATA_TABLE,
                    IndexName: 'GSI_connectionId',
                    KeyConditionExpression: 'connectionId = :connectionId',
                    ExpressionAttributeValues: {
                        ':connectionId': connectionId
                    },
                    Limit: 1
                }));

                if (lookup.Items && lookup.Items.length > 0 && lookup.Items[0].PK) {
                    userId = lookup.Items[0].PK.replace('USER#', '');
                }
            } catch (error) {
                // Fall back to a filtered Scan if the GSI is unavailable in this environment.
                console.warn('onDisconnect: GSI_connectionId lookup failed, falling back to Scan:', error.message);
                try {
                    const scan = await dynamoDB.send(new ScanCommand({
                        TableName: process.env.USER_METADATA_TABLE,
                        FilterExpression: 'connectionId = :connectionId',
                        ExpressionAttributeValues: {
                            ':connectionId': connectionId
                        }
                    }));

                    if (scan.Items && scan.Items.length > 0 && scan.Items[0].PK) {
                        userId = scan.Items[0].PK.replace('USER#', '');
                    }
                } catch (scanError) {
                    console.error('Error looking up user by connectionId (scan fallback):', scanError);
                    return handleDynamoDBError(scanError, extractAction(event), {
                        operation: 'connection_lookup',
                        resource: 'user_metadata',
                        tableName: process.env.USER_METADATA_TABLE,
                        connectionId
                    });
                }
            }
        }

        // Nothing to clean up: the connection is not associated with any known user.
        if (!userId) {
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createSuccessResponse(200, {
                message: 'No matching connection to disconnect'
            }, action, requestId);
        }

        // Check if user exists
        try {
            const userMetadata = await dynamoDB.send(new GetCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${userId}` }
            }));

            if (userMetadata.Item) {
                // update user metadata to remove connection and mark presence disconnected
                try {
                    await dynamoDB.send(new UpdateCommand({
                        TableName: process.env.USER_METADATA_TABLE,
                        Key: { PK: `USER#${userId}` },
                        UpdateExpression: 'REMOVE connectionId SET lastSeen = :timestamp, presence = :presence',
                        ExpressionAttributeValues: {
                            ':timestamp': new Date().toISOString(),
                            ':presence': 'offline'
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
            } else if (userIdFromBody) {
                // Preserve original behavior for the body-driven path.
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
