const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");


const { 
    createErrorResponse, 
    createSuccessResponse, 
    extractAction, 
    extractRequestId,
    handleDynamoDBError,
    handleApiGatewayError,
    handleValidationError
} = require("../shared/errorHandler");

// Configure DynamoDB client for AWS SDK v3
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});
const dynamoDB = DynamoDBDocumentClient.from(client);

console.log('Environment variables:');
console.log('AWS_REGION:', process.env.AWS_REGION || 'us-east-1');
console.log('WEBSOCKET_API_URL:', process.env.WEBSOCKET_API_URL);
console.log('CONVERSATIONS_TABLE:', process.env.CONVERSATIONS_TABLE);

// Validate WebSocket API URL
if (!process.env.WEBSOCKET_API_URL) {
    console.error('WEBSOCKET_API_URL environment variable is not set!');
} else if (process.env.WEBSOCKET_API_URL.startsWith('wss://')) {
    console.error('WEBSOCKET_API_URL should be an HTTPS endpoint, not WSS!');
    console.error('Expected format: https://{api-id}.execute-api.{region}.amazonaws.com/{stage}');
} else if (!process.env.WEBSOCKET_API_URL.startsWith('https://')) {
    console.error('WEBSOCKET_API_URL should start with https://');
    console.error('Expected format: https://{api-id}.execute-api.{region}.amazonaws.com/{stage}');
} else {
    console.log('WEBSOCKET_API_URL appears to be correctly formatted');
}

const apiGateway = new ApiGatewayManagementApiClient({
    endpoint: process.env.WEBSOCKET_API_URL
});

// Chat ID validation and normalization functions
const validateChatId = (chatId) => {
    if (!chatId || typeof chatId !== 'string') {
        return { isValid: false, error: 'Chat ID must be a non-empty string' };
    }
    
    if (chatId.trim().length === 0) {
        return { isValid: false, error: 'Chat ID cannot be empty or whitespace' };
    }
    
    if (chatId.length > 100) {
        return { isValid: false, error: 'Chat ID is too long (max 100 characters)' };
    }
    
    // Check if chat ID follows the expected format: userId1#userId2
    const parts = chatId.split('#');
    if (parts.length !== 2) {
        return { isValid: false, error: 'Chat ID should follow format: userId1#userId2' };
    }
    
    if (parts[0].trim().length === 0 || parts[1].trim().length === 0) {
        return { isValid: false, error: 'Chat ID parts cannot be empty' };
    }
    
    return { isValid: true };
};

const normalizeChatId = (chatId) => {
    if (!chatId) return chatId;
    
    let normalized = chatId;
    
    // Remove trailing hash if present
    if (normalized.includes('#')) {
        normalized = normalized.split('#')[0];
    }
    
    // Remove trailing encoded hash if present
    if (normalized.includes('%23')) {
        normalized = normalized.split('%23')[0];
    }
    
    return normalized;
};

// Helper function to decode URL-encoded chat IDs
const decodeChatId = (chatId) => {
    try {
        // First try to decode the entire string
        const decoded = decodeURIComponent(chatId);
        console.log(`Decoded chatId: ${chatId} -> ${decoded}`);
        return decoded;
    } catch (error) {
        console.log(`Failed to decode chatId: ${chatId}, using as-is`);
        return chatId;
    }
};

// Helper function to try multiple chat ID formats
const tryChatIdFormats = (chatId) => {
    const formats = [];
    
    // Original encoded format
    formats.push(chatId);
    
    // Decoded format
    try {
        const decoded = decodeURIComponent(chatId);
        if (decoded !== chatId) {
            formats.push(decoded);
        }
    } catch (error) {
        console.log(`Could not decode chatId: ${chatId}`);
    }
    
    // Remove any trailing hash if present
    if (chatId.includes('#')) {
        const withoutHash = chatId.split('#')[0];
        formats.push(withoutHash);
    }
    
    // Remove any trailing encoded hash if present
    if (chatId.includes('%23')) {
        const withoutEncodedHash = chatId.split('%23')[0];
        formats.push(withoutEncodedHash);
    }
    
    console.log(`Trying chat ID formats:`, formats);
    return formats;
};

exports.handler = async (event) => {
    console.log('Starting syncConversation handler');
    const startTime = Date.now();
    
    try {
        console.log('Event:', JSON.stringify(event, null, 2));
        
        const body = JSON.parse(event.body);
        console.log('Parsed request body:', JSON.stringify(body, null, 2));
        
        const { chatId } = body.data;
        const connectionId = event.requestContext.connectionId;
        
        console.log(`Processing sync request - ChatId: ${chatId}, ConnectionId: ${connectionId}`);

        if (!chatId) {
            console.log('Missing chatId in request');
            console.log('Sending error response for missing chatId');
            
            // Check if we have a valid API Gateway client before using it
            if (!process.env.WEBSOCKET_API_URL) {
                console.error('Cannot send WebSocket response - WEBSOCKET_API_URL not configured');
                const action = extractAction(event);
        const requestId = extractRequestId(event);
        return createErrorResponse(500, 'WebSocket endpoint not configured', action, {
            operation: 'lambda_execution'
        }, requestId);;
            }
            
            await apiGateway.send(new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                    action: 'error',
                    data: { error: 'Missing chatId' }
                })
            }));
            console.log('Error response sent successfully');
            return { statusCode: 200 };
        }

        // Validate chat ID format
        const validation = validateChatId(chatId);
        if (!validation.isValid) {
            console.log(`Invalid chat ID format: ${validation.error}`);
            
            // Send validation error to client
            try {
                await apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: JSON.stringify({
                        action: 'error',
                        data: { 
                            error: 'Invalid chat ID format',
                            details: validation.error,
                            chatId: chatId
                        }
                    })
                }));
            } catch (sendError) {
                console.error('Failed to send validation error response:', sendError);
            }
            
            return {
                statusCode: 400,
                body: JSON.stringify({
                    action: 'error',
                    data: { 
                        error: 'Invalid chat ID format',
                        details: validation.error,
                        chatId: chatId
                    }
                })
            };
        }

        // Try multiple chat ID formats to find the conversation
        const chatIdFormats = tryChatIdFormats(chatId);
        let conversation = null;
        let foundChatId = null;
        
        for (const format of chatIdFormats) {
            console.log(`Trying to find conversation with chatId format: ${format}`);
            
            const params = {
                TableName: process.env.CONVERSATIONS_TABLE,
                KeyConditionExpression: 'PK = :pk',
                ExpressionAttributeValues: {
                    ':pk': `CHAT#${format}`
                }
            };

            console.log('DynamoDB query params:', JSON.stringify(params, null, 2));
            const result = await dynamoDB.send(new QueryCommand(params));
            console.log(`DynamoDB query completed for format ${format}. Items found: ${result.Items.length}`);
            
            if (result.Items.length > 0) {
                conversation = result.Items[0];
                foundChatId = format;
                console.log(`Conversation found with format: ${format}`);
                break;
            }
        }

        if (!conversation) {
            console.log(`Conversation not found for any chatId format. Tried: ${chatIdFormats.join(', ')}`);
            console.log('Sending 404 error response');
            
            // Log this as a potential data inconsistency issue
            console.error(`DATA INCONSISTENCY DETECTED: Chat ID ${chatId} exists in user metadata but not in conversations table`);
            console.error('This suggests an orphaned chat ID that needs cleanup');
            
            // Send a more informative error response
            try {
                await apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: JSON.stringify({
                        action: 'error',
                        data: { 
                            error: 'Conversation not found',
                            details: 'This chat ID exists in user metadata but not in conversations table. This suggests a data inconsistency that needs cleanup.',
                            attemptedFormats: chatIdFormats,
                            originalChatId: chatId,
                            requiresCleanup: true
                        }
                    })
                }));
            } catch (sendError) {
                console.error('Failed to send error response to WebSocket:', sendError);
            }
            
            return {
                statusCode: 404,
                body: JSON.stringify({
                    action: 'error',
                    data: { 
                        error: 'Conversation not found',
                        details: 'Data inconsistency detected - orphaned chat ID',
                        attemptedFormats: chatIdFormats,
                        originalChatId: chatId,
                        requiresCleanup: true
                    }
                })
            };
        }

        console.log(`Conversation found with chatId: ${foundChatId}`);
        console.log('Conversation data:', JSON.stringify(conversation, null, 2));
        console.log(`Sending conversation sync data to connection: ${connectionId}`);

        // Check if we have a valid API Gateway client before using it
        if (!process.env.WEBSOCKET_API_URL) {
            console.error('Cannot send WebSocket response - WEBSOCKET_API_URL not configured');
            const action = extractAction(event);
        const requestId = extractRequestId(event);
        return createErrorResponse(500, 'WebSocket endpoint not configured', action, {
            operation: 'lambda_execution'
        }, requestId);;
        }

        // Send conversation metadata to the requesting user
        const syncData = {
            action: 'conversationSync',
            data: {
                chatId: foundChatId, // Use the found chat ID format
                participants: conversation.participants,
                lastMessage: conversation.lastMessage,
                lastUpdated: conversation.lastUpdated,
                endedBy: conversation.endedBy,
                endReason: conversation.endReason,
                createdAt: conversation.createdAt
            }
        };
        
        console.log('Sync data to send:', JSON.stringify(syncData, null, 2));
        console.log('Using API Gateway endpoint:', process.env.WEBSOCKET_API_URL);
        
        await apiGateway.send(new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: JSON.stringify(syncData)
        }));

        console.log('Conversation sync data sent successfully');
        const executionTime = Date.now() - startTime;
        console.log(`syncConversation completed successfully in ${executionTime}ms`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                action: 'conversationSync',
                data: { message: 'Conversation synchronized' }
            })
        };

    } catch (error) {
        const executionTime = Date.now() - startTime;
        console.error(`Error in syncConversation after ${executionTime}ms:`, error);
        console.error('Error stack:', error.stack);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            code: error.code,
            statusCode: error.statusCode
        });
        
        // Log additional context for WebSocket errors
        if (error.code === 'UnknownEndpoint' || error.code === 'NetworkingError') {
            console.error('WebSocket endpoint configuration issue detected');
            console.error('Current WEBSOCKET_API_URL:', process.env.WEBSOCKET_API_URL);
            console.error('Expected format: https://{api-id}.execute-api.{region}.amazonaws.com/{stage}');
        }
        
        try {
            console.log('Attempting to send error response to WebSocket connection');
            const connectionId = event.requestContext?.connectionId;
            const chatId = event.body ? JSON.parse(event.body).data?.chatId : null;
            
            console.log(`Sending error to ConnectionId: ${connectionId}, ChatId: ${chatId}`);
            
            // Only attempt WebSocket response if endpoint is configured
            if (process.env.WEBSOCKET_API_URL && !process.env.WEBSOCKET_API_URL.startsWith('wss://')) {
                await apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: JSON.stringify({
                        action: 'error',
                        data: { 
                            error: 'Internal server error', 
                            details: error.message,
                            chatId: chatId
                        }
                    })
                }));
                console.log('Error response sent successfully to WebSocket');
            } else {
                console.log('Skipping WebSocket error response due to endpoint configuration issues');
            }
        } catch (sendError) {
            console.error('Failed to send error response to WebSocket:', sendError);
            console.error('Send error stack:', sendError.stack);
        }
        
        console.log('Returning 200 status code');
        return { statusCode: 200 };
    }
}; 