/**
 * Lambda function to handle WebSocket message sending and user connections.
 * Supports two main actions:
 * 1. connect: Establishes a user's WebSocket connection and retrieves any queued messages
 * 2. sendMessage: Sends a message between users in a chat
 * 
 * @param {Object} event - The event object containing the WebSocket connection details and request body
 * @returns {Object} Response object with status code and body
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");
const { authenticateWebSocketEvent } = require("../shared/auth");
const { 
    createErrorResponse, 
    createSuccessResponse, 
    extractAction, 
    extractRequestId,
    handleDynamoDBError,
    handleApiGatewayError,
    handleValidationError
} = require("../shared/errorHandler");

// Main handler function with authentication
const handlerLogic = async (event) => {
    console.log('=== HANDLER LOGIC STARTING ===');
    console.log('Lambda invoked');
    console.log('Event received:', JSON.stringify(event, null, 2));
    
    // Declare variables that will be used throughout the function
    let userId, email, dynamoDB, apiGateway, connectionId;
    
    try {
        // Debug: Check if userInfo exists (should be added by auth middleware)
        if (!event.userInfo) {
            console.error('CRITICAL: userInfo missing from event - authentication middleware may have failed');
            throw new Error('Authentication middleware did not set userInfo');
        }
        
        // Get authenticated user info from the event (added by auth middleware)
        ({ userId, email } = event.userInfo);
        console.log('Authenticated user:', userId, email);
        
        // Debug: Check environment variables
        console.log('=== ENVIRONMENT VARIABLES CHECK ===');
        console.log('USER_METADATA_TABLE:', process.env.USER_METADATA_TABLE);
        console.log('CONVERSATIONS_TABLE:', process.env.CONVERSATIONS_TABLE);
        console.log('MESSAGES_TABLE:', process.env.MESSAGES_TABLE);
        console.log('WEBSOCKET_API_URL:', process.env.WEBSOCKET_API_URL);
        console.log('AWS_REGION:', process.env.AWS_REGION);
        
        // Validate required environment variables
        const requiredEnvVars = ['USER_METADATA_TABLE', 'CONVERSATIONS_TABLE', 'MESSAGES_TABLE'];
        const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingEnvVars.length > 0) {
            console.error('CRITICAL: Missing required environment variables:', missingEnvVars);
            throw new Error(`Missing environment variables: ${missingEnvVars.join(', ')}`);
        }
        
        // Configure DynamoDB client for AWS SDK v3
        console.log('=== INITIALIZING AWS CLIENTS ===');
        
        try {
            dynamoDB = DynamoDBDocumentClient.from(new DynamoDBClient({
                region: process.env.AWS_REGION || 'us-east-1'
            }));
            console.log('✓ DynamoDB client created successfully');
        } catch (error) {
            console.error('CRITICAL: Failed to create DynamoDB client:', error);
            throw new Error(`DynamoDB client creation failed: ${error.message}`);
        }
        
        // Configure API Gateway Management API for WebSocket responses
        try {
            apiGateway = new ApiGatewayManagementApiClient({
                endpoint: process.env.WEBSOCKET_API_URL 
                  ? process.env.WEBSOCKET_API_URL
                  : "https://82hp8bmge8.execute-api.us-east-1.amazonaws.com/Dev"
            });
            console.log('✓ API Gateway client created successfully');
            console.log('API Gateway endpoint configured:', process.env.WEBSOCKET_API_URL || "https://82hp8bmge8.execute-api.us-east-1.amazonaws.com/Dev");
        } catch (error) {
            console.error('CRITICAL: Failed to create API Gateway client:', error);
            throw new Error(`API Gateway client creation failed: ${error.message}`);
        }

        // Handle both production and test environments
        connectionId = event.requestContext?.connectionId || event.connectionId;
        console.log('Connection ID extracted:', connectionId);
        
    } catch (error) {
        console.error('=== INITIALIZATION ERROR ===');
        console.error('Error during initialization:', error.message);
        console.error('Stack trace:', error.stack);
        
        // Return a proper error response
        const action = extractAction(event);
        const requestId = extractRequestId(event);
        return createErrorResponse(500, `Initialization failed: ${error.message}`, action, {
            operation: 'lambda_initialization',
            errorType: error.name || 'InitializationError',
            errorMessage: error.message
        }, requestId);
    }

    try {
        console.log('=== STARTING MAIN LOGIC ===');
        console.log('DynamoDB configured for region:', process.env.AWS_REGION || 'us-east-1');
        
        if (!event.body) {
            console.log('Missing request body');
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
            console.log('Request body parsed successfully:', JSON.stringify(body, null, 2));
        } catch (error) {
            console.log('Failed to parse request body:', error.message);
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(400, 'Invalid request body', action, {
                operation: 'request_parsing',
                errorMessage: error.message
            }, requestId);
        }

        if (!body || !body.action || !body.data) {
            console.log('Missing action or data in request body');
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(400, 'Missing action or data', action, {
                operation: 'request_validation',
                requiredFields: ['action', 'data'],
                providedFields: Object.keys(body || {})
            }, requestId);
        }

        const { action, data } = body;
        console.log('Action identified:', action);
        console.log('Data payload:', JSON.stringify(data, null, 2));
        
        if (!action || !data) {
            console.log('Empty action or data values');
            const requestId = extractRequestId(event);
            return createErrorResponse(400, 'Empty action or data values', action, {
                operation: 'request_validation',
                requiredFields: ['action', 'data']
            }, requestId);
        }

        // Handle connect action
        if (action === 'connect') {
            console.log('Processing CONNECT action for authenticated user:', userId);

            let isNewUser = false;
            console.log('Checking if user exists in database...');
            try {
                const userResult = await dynamoDB.send(new GetCommand({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${userId}` }
                }));
                console.log('User lookup result:', JSON.stringify(userResult, null, 2));
                isNewUser = !userResult.Item;
                console.log('Is new user:', isNewUser);
            } catch (error) {
                console.error('Error checking user existence:', error);
                return handleDynamoDBError(error, action, {
                    operation: 'user_lookup',
                    resource: 'user_metadata',
                    tableName: process.env.USER_METADATA_TABLE,
                    userId
                });
            }
            
            // if user exists, get their active chat using GSI1
            let activeChatId = null;
            if (!isNewUser) {
                console.log('Looking for active chat for existing user...');
                const conversationsParams = {
                    TableName: process.env.CONVERSATIONS_TABLE,
                    IndexName: 'GSI1',
                    KeyConditionExpression: 'GSI1_PK = :userKey',
                    ExpressionAttributeValues: {
                        ':userKey': `USER#${userId}`
                    },
                    ScanIndexForward: false, // most recent first
                    Limit: 1
                };

                console.log('Conversations query params:', JSON.stringify(conversationsParams, null, 2));

                try {
                    const conversationsResult = await dynamoDB.send(new QueryCommand(conversationsParams));
                    console.log('Conversations query result:', JSON.stringify(conversationsResult, null, 2));
                    if (conversationsResult.Items && conversationsResult.Items.length > 0) {
                        activeChatId = conversationsResult.Items[0].PK.replace('CHAT#', '');
                        console.log('Active chat ID found:', activeChatId);
                    } else {
                        console.log('No active chat found for user');
                    }
                } catch (error) {
                    console.error('Error finding active chat:', error);
                    return handleDynamoDBError(error, action, {
                        operation: 'active_chat_lookup',
                        resource: 'conversations',
                        tableName: process.env.CONVERSATIONS_TABLE,
                        userId
                    });
                }
            } else {
                console.log('Skipping chat lookup for new user');
            }

            // Store user connection mapping
            console.log('Storing user connection mapping...');
            const params = {
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${userId}` },
                UpdateExpression: 'SET connectionId = :connectionId, chatId = :chatId, lastSeen = :lastSeen, email = :email',
                ExpressionAttributeValues: {
                    ':connectionId': connectionId,
                    ':chatId': activeChatId,
                    ':lastSeen': new Date().toISOString(),
                    ':email': email
                }
            };

            console.log('User update params:', JSON.stringify(params, null, 2));

            try {
                await dynamoDB.send(new UpdateCommand(params));
                console.log('User connection mapping stored successfully');

                // if user has an active chat, check for queued messages
                if (activeChatId) {
                    console.log('Checking for queued messages in chat:', activeChatId);
                    const queuedMessagesParams = {
                        TableName: process.env.MESSAGES_TABLE,
                        KeyConditionExpression: 'PK = :chatKey',
                        FilterExpression: 'queued = :queued',
                        ExpressionAttributeValues: {
                            ':chatKey': `CHAT#${activeChatId}`,
                            ':queued': true
                        }
                    };

                    console.log('Queued messages query params:', JSON.stringify(queuedMessagesParams, null, 2));

                    try {
                        const queuedMessages = await dynamoDB.send(new QueryCommand(queuedMessagesParams));
                        console.log('Queued messages result:', JSON.stringify(queuedMessages, null, 2));
                        
                        // send queued messages to the user
                        if (queuedMessages.Items && queuedMessages.Items.length > 0) {
                            console.log(`Found ${queuedMessages.Items.length} queued messages, sending to user...`);
                            for (const message of queuedMessages.Items) {
                                if (message.senderId !== userId) { // only send messages from other user
                                    console.log('Sending queued message:', message.messageId, 'from sender:', message.senderId);
                                    const messagePayload = {
                                        action: 'message',
                                        data: {
                                            chatId: activeChatId,
                                            messageId: message.messageId,
                                            senderId: message.senderId,
                                            content: message.content,
                                            timestamp: message.sentAt
                                        }
                                    };

                                    console.log('Message payload:', JSON.stringify(messagePayload, null, 2));

                                    await apiGateway.send(new PostToConnectionCommand({
                                        ConnectionId: connectionId,
                                        Data: JSON.stringify(messagePayload)
                                    }));
                                    console.log('Queued message sent successfully');
                                } else {
                                    console.log('Skipping message from same user:', message.messageId);
                                }
                            }
                        } else {
                            console.log('No queued messages found');
                        }
                    } catch (error) {
                        console.error('Error retrieving queued messages:', error);
                        // Don't fail the entire operation for queued message retrieval
                    }
                } else {
                    console.log('No active chat, skipping queued message check');
                }

                console.log('Connect action completed successfully');
                const requestId = extractRequestId(event);
                return createSuccessResponse(200, { message: 'Connection stored', userId }, action, requestId);
            } catch (error) {
                console.error('Error storing connection:', error);
                return handleDynamoDBError(error, action, {
                    operation: 'connection_storage',
                    resource: 'user_metadata',
                    tableName: process.env.USER_METADATA_TABLE,
                    userId
                });
            }
        }

        // Handle sendMessage action
        if (action === 'sendMessage') {
            console.log('Processing sendMessage action for authenticated user:', userId);
            console.log('Message data:', JSON.stringify(data, null, 2));
            
            // Use authenticated userId instead of data.senderId
            const { chatId, sentAt, content, messageId } = data;

            // validate required fields and their formats
            const validations = {
                chatId: (val) => val && typeof val === 'string',
                content: (val) => val && typeof val === 'string' && val.trim().length > 0,
                messageId: (val) => val && typeof val === 'string' && val.trim().length > 0,
                sentAt: (val) => !isNaN(new Date(val).getTime())
            };
            
            const errors = Object.entries(validations)
                .filter(([key, validator]) => !validator(data[key]))
                .map(([key]) => key);
                
            if (errors.length > 0) {
                console.log('Validation errors:', errors);
                const requestId = extractRequestId(event);
                return handleValidationError(errors, action, {
                    operation: 'message_validation',
                    requiredFields: Object.keys(validations),
                    providedFields: Object.keys(data || {}),
                    fieldErrors: errors
                });
            }

            console.log('Validation passed. Retrieving sender metadata...');
            // verify sender's connection
            let senderMetadata;
            try {
                senderMetadata = await dynamoDB.send(new GetCommand({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${userId}` }
                }));
                console.log('Sender metadata retrieved:', senderMetadata.Item ? 'Found' : 'Not found');
            } catch (error) {
                console.error('DynamoDB get error:', error);
                return handleDynamoDBError(error, action, {
                    operation: 'sender_metadata_retrieval',
                    resource: 'user_metadata',
                    tableName: process.env.USER_METADATA_TABLE,
                    userId
                });
            }

            if (!senderMetadata.Item) {
                console.log('Sender not found in database');
                const requestId = extractRequestId(event);
                return createErrorResponse(403, 'Sender not found', action, {
                    operation: 'sender_verification',
                    userId,
                    tableName: process.env.USER_METADATA_TABLE
                }, requestId);
            }

            // Update the sender's connection ID in case it changed (e.g., reconnection)
            if (senderMetadata.Item.connectionId !== connectionId) {
                console.log('Updating sender connection ID. Old:', senderMetadata.Item.connectionId, 'New:', connectionId);
                try {
                    await dynamoDB.send(new UpdateCommand({
                        TableName: process.env.USER_METADATA_TABLE,
                        Key: { PK: `USER#${userId}` },
                        UpdateExpression: 'SET connectionId = :connectionId, lastSeen = :lastSeen',
                        ExpressionAttributeValues: {
                            ':connectionId': connectionId,
                            ':lastSeen': new Date().toISOString()
                        }
                    }));
                    console.log('Sender connection ID updated successfully');
                } catch (error) {
                    console.error('Error updating sender connection ID:', error);
                    // Don't fail the message send for this
                }
            }

            console.log('Getting conversation...');
            // get conversation to find receiver
            let conversation;
            try {
                console.log('Querying conversation with chatId:', chatId);
                console.log('Query params:', {
                    TableName: process.env.CONVERSATIONS_TABLE,
                    KeyConditionExpression: 'PK = :pk',
                    ExpressionAttributeValues: {
                        ':pk': `CHAT#${chatId}`
                    }
                });
                
                const conversationResult = await dynamoDB.send(new QueryCommand({
                    TableName: process.env.CONVERSATIONS_TABLE,
                    KeyConditionExpression: 'PK = :pk',
                    ExpressionAttributeValues: {
                        ':pk': `CHAT#${chatId}`
                    }
                }));
                
                console.log('Raw conversation query result:', JSON.stringify(conversationResult, null, 2));
                console.log('Items count:', conversationResult.Items?.length || 0);
                
                if (conversationResult.Items && conversationResult.Items.length > 0) {
                    conversation = conversationResult.Items[0];
                    console.log('Selected conversation (first item):', JSON.stringify(conversation, null, 2));
                } else {
                    console.log('No conversation items found in query result');
                    console.log('This could mean:');
                    console.log('  1. The conversation doesn\'t exist in the table');
                    console.log('  2. The chatId format is incorrect');
                    console.log('  3. The table name is wrong');
                    console.log('Environment variables:');
                    console.log('  - CONVERSATIONS_TABLE:', process.env.CONVERSATIONS_TABLE);
                    console.log('ChatId details:');
                    console.log('  - chatId:', chatId);
                    console.log('  - chatId type:', typeof chatId);
                    console.log('  - chatId length:', chatId ? chatId.length : 'null');
                    console.log('  - PK being queried:', `CHAT#${chatId}`);
                    
                    const requestId = extractRequestId(event);
                    return createErrorResponse(404, 'Conversation not found', action, {
                        operation: 'conversation_lookup',
                        chatId: chatId,
                        tableName: process.env.CONVERSATIONS_TABLE,
                        queriedKey: `CHAT#${chatId}`
                    }, requestId);
                }
            } catch (error) {
                console.error('Error getting conversation:', error);
                console.error('Error details:', {
                    chatId: chatId,
                    tableName: process.env.CONVERSATIONS_TABLE,
                    errorMessage: error.message,
                    errorCode: error.code,
                    errorName: error.name
                });
                return handleDynamoDBError(error, action, {
                    operation: 'conversation_retrieval',
                    resource: 'conversations',
                    tableName: process.env.CONVERSATIONS_TABLE,
                    chatId
                });
            }

            if (!conversation) {
                console.log('Conversation not found for chatId:', chatId);
                console.log('This could mean:');
                console.log('  1. The conversation doesn\'t exist in the table');
                console.log('  2. The chatId format is incorrect');
                console.log('  3. The table name is wrong');
                console.log('Environment variables:');
                console.log('  - CONVERSATIONS_TABLE:', process.env.CONVERSATIONS_TABLE);
                const requestId = extractRequestId(event);
                return createErrorResponse(404, 'Conversation not found', action, {
                    operation: 'conversation_verification',
                    chatId: chatId,
                    tableName: process.env.CONVERSATIONS_TABLE
                }, requestId);
            }

            // get receiver's metadata - determine receiver from participants (Array or Set)
            let receiverId;
            console.log('Looking up receiver from participants...');
            console.log('  - conversation.participants:', conversation.participants);
            console.log('  - Is Array:', Array.isArray(conversation.participants));
            console.log('  - Is Set:', conversation.participants instanceof Set);
            console.log('  - Current userId:', userId);
            
            if (conversation.participants) {
                if (Array.isArray(conversation.participants)) {
                    // Handle Array format
                    receiverId = conversation.participants.find(id => id !== userId);
                    console.log('Receiver ID determined from Array:', receiverId);
                } else if (conversation.participants instanceof Set) {
                    // Handle Set format (DynamoDB String Set)
                    receiverId = [...conversation.participants].find(id => id !== userId);
                    console.log('Receiver ID determined from Set:', receiverId);
                } else {
                    console.log('Participants is neither Array nor Set:', typeof conversation.participants);
                    console.log('Participants value:', conversation.participants);
                    const requestId = extractRequestId(event);
                    return createErrorResponse(500, 'Invalid participants format', action, {
                        operation: 'participant_parsing',
                        participantsType: typeof conversation.participants,
                        participantsValue: conversation.participants,
                        chatId: chatId
                    }, requestId);
                }
                console.log('Receiver ID determined:', receiverId);
            } else {
                console.log('No participants found in conversation');
                console.log('Conversation object:', JSON.stringify(conversation, null, 2));
                const requestId = extractRequestId(event);
                return createErrorResponse(500, 'Missing participants in conversation', action, {
                    operation: 'participant_verification',
                    chatId: chatId,
                    conversationKeys: Object.keys(conversation || {})
                }, requestId);
            }

            if (!receiverId) {
                console.log('Could not determine receiver ID from participants');
                console.log('Participants:', conversation.participants);
                console.log('Current userId:', userId);
                const requestId = extractRequestId(event);
                return createErrorResponse(500, 'Could not determine receiver', action, {
                    operation: 'receiver_identification',
                    participants: conversation.participants,
                    currentUserId: userId,
                    chatId: chatId
                }, requestId);
            }

            let receiverMetadata;
            try {
                console.log('Looking up receiver metadata for userId:', receiverId);
                receiverMetadata = await dynamoDB.send(new GetCommand({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${receiverId}` }
                }));
                console.log('Receiver metadata retrieved:', receiverMetadata.Item ? 'Found' : 'Not found');
            } catch (error) {
                console.error('Error getting receiver metadata:', error);
                console.error('Error details:', {
                    receiverId: receiverId,
                    tableName: process.env.USER_METADATA_TABLE,
                    errorMessage: error.message,
                    errorCode: error.code,
                    errorName: error.name
                });
                return handleDynamoDBError(error, action, {
                    operation: 'receiver_metadata_retrieval',
                    resource: 'user_metadata',
                    tableName: process.env.USER_METADATA_TABLE,
                    receiverId
                });
            }

            if (!receiverMetadata.Item) {
                console.log('Receiver not found in database');
                console.log('Receiver details:', {
                    receiverId: receiverId,
                    tableName: process.env.USER_METADATA_TABLE,
                    queriedKey: `USER#${receiverId}`
                });
                const requestId = extractRequestId(event);
                return createErrorResponse(404, 'Receiver not found', action, {
                    operation: 'receiver_verification',
                    receiverId: receiverId,
                    tableName: process.env.USER_METADATA_TABLE,
                    queriedKey: `USER#${receiverId}`
                }, requestId);
            }

            // store message in DynamoDB
            const messageParams = {
                TableName: process.env.MESSAGES_TABLE,
                Item: {
                    PK: `CHAT#${chatId}`,
                    SK: `MSG#${messageId}`,
                    messageId,
                    chatId,
                    senderId: userId,
                    content,
                    sentAt,
                    queued: !receiverMetadata.Item.connectionId
                }
            };

            console.log('Storing message in DynamoDB with params:', JSON.stringify(messageParams, null, 2));
            try {
                await dynamoDB.send(new PutCommand(messageParams));
                console.log('Message stored successfully in DynamoDB');

                // Update conversation with last message details
                console.log('Updating conversation with last message details...');
                await dynamoDB.send(new UpdateCommand({
                    TableName: process.env.CONVERSATIONS_TABLE,
                    Key: {
                        PK: `CHAT#${chatId}`
                    },
                    UpdateExpression: 'SET lastUpdated = :lastUpdated, lastMessage = :lastMessage',
                    ExpressionAttributeValues: {
                        ':lastUpdated': sentAt,
                        ':lastMessage': {
                            content,
                            sentAt
                        }
                    }
                }));
                console.log('Conversation updated successfully');
            } catch (error) {
                console.error('Error storing message:', error);
                console.error('Error details:', {
                    messageId: messageId,
                    chatId: chatId,
                    messagesTable: process.env.MESSAGES_TABLE,
                    conversationsTable: process.env.CONVERSATIONS_TABLE,
                    errorMessage: error.message,
                    errorCode: error.code,
                    errorName: error.name
                });
                return handleDynamoDBError(error, action, {
                    operation: 'message_storage',
                    resource: 'messages',
                    tableName: process.env.MESSAGES_TABLE,
                    messageId,
                    chatId
                });
            }

            // if receiver is connected, send message immediately
            if (receiverMetadata.Item.connectionId) {
                console.log('Receiver is connected, sending message immediately...');
                console.log('Receiver connection details:', {
                    connectionId: receiverMetadata.Item.connectionId,
                    lastConnected: receiverMetadata.Item.lastConnected,
                    lastSeen: receiverMetadata.Item.lastSeen
                });
                
                try {
                    const messagePayload = {
                        action: 'message',
                        data: {
                            chatId,
                            messageId,
                            senderId: userId,
                            content,
                            timestamp: sentAt
                        }
                    };
                    console.log('Message payload to receiver:', JSON.stringify(messagePayload, null, 2));
                    
                    await apiGateway.send(new PostToConnectionCommand({
                        ConnectionId: receiverMetadata.Item.connectionId,
                        Data: JSON.stringify(messagePayload)
                    }));
                    console.log('Message sent to receiver successfully');
                    
                    // Mark message as delivered (not queued)
                    console.log('Updating message delivery status...');
                    try {
                        await dynamoDB.send(new UpdateCommand({
                            TableName: process.env.MESSAGES_TABLE,
                            Key: {
                                PK: `CHAT#${chatId}`,
                                SK: `MSG#${messageId}`
                            },
                            UpdateExpression: 'SET queued = :queued, deliveredAt = :deliveredAt',
                            ExpressionAttributeValues: {
                                ':queued': false,
                                ':deliveredAt': new Date().toISOString()
                            }
                        }));
                        console.log('Message marked as delivered');
                    } catch (updateError) {
                        console.error('Error updating message delivery status:', updateError);
                    }
                    
                } catch (error) {
                    console.error('Error sending message to receiver:', error);
                    console.error('API Gateway error details:', {
                        receiverConnectionId: receiverMetadata.Item.connectionId,
                        messageId: messageId,
                        chatId: chatId,
                        errorMessage: error.message,
                        errorCode: error.code,
                        errorName: error.name
                    });
                    
                    // Check if this is a stale connection ID (common error codes for disconnected clients)
                    if (error.code === 'GoneException' || error.statusCode === 410) {
                        console.log('Receiver connection is stale, clearing connection ID...');
                        try {
                            await dynamoDB.send(new UpdateCommand({
                                TableName: process.env.USER_METADATA_TABLE,
                                Key: { PK: `USER#${receiverId}` },
                                UpdateExpression: 'REMOVE connectionId',
                                ConditionExpression: 'connectionId = :staleConnectionId',
                                ExpressionAttributeValues: {
                                    ':staleConnectionId': receiverMetadata.Item.connectionId
                                }
                            }));
                            console.log('Stale connection ID cleared from user metadata');
                        } catch (clearError) {
                            console.error('Error clearing stale connection ID:', clearError);
                        }
                    }
                    
                    // If we can't send to the receiver, mark the message as queued
                    console.log('Marking message as queued due to delivery failure...');
                    try {
                        await dynamoDB.send(new UpdateCommand({
                            TableName: process.env.MESSAGES_TABLE,
                            Key: {
                                PK: `CHAT#${chatId}`,
                                SK: `MSG#${messageId}`
                            },
                            UpdateExpression: 'SET queued = :queued, deliveryError = :error',
                            ExpressionAttributeValues: {
                                ':queued': true,
                                ':error': {
                                    code: error.code || 'UNKNOWN',
                                    message: error.message || 'Unknown error',
                                    timestamp: new Date().toISOString()
                                }
                            }
                        }));
                        console.log('Message marked as queued with error details');
                    } catch (updateError) {
                        console.error('Error updating message queued status:', updateError);
                    }
                }
            } else {
                console.log('Receiver not connected, message will remain queued');
                console.log('Receiver metadata:', {
                    userId: receiverId,
                    hasConnectionId: !!receiverMetadata.Item.connectionId,
                    lastConnected: receiverMetadata.Item.lastConnected,
                    lastSeen: receiverMetadata.Item.lastSeen
                });
            }

            console.log('About to send confirmation to sender...');
            console.log('connectionId =', connectionId);
            console.log('messageId =', messageId);
            console.log('chatId =', chatId);
            console.log('userId =', userId);
            console.log('content =', content);
            console.log('sentAt =', sentAt);
            
            // Send confirmation back to sender
            console.log('Sending confirmation back to sender...');
            try {
                const confirmationPayload = {
                    action: 'messageConfirmed',
                    chatId,
                    messageId,
                    senderId: userId,
                    content,
                    timestamp: sentAt
                };
                console.log('Confirmation payload to sender:', JSON.stringify(confirmationPayload, null, 2));
                
                await apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: JSON.stringify(confirmationPayload)
                }));
                console.log('Confirmation sent to sender successfully');
            } catch (error) {
                console.error('Error sending confirmation to sender:', error);
                console.error('Confirmation error details:', {
                    senderConnectionId: connectionId,
                    messageId: messageId,
                    chatId: chatId,
                    errorMessage: error.message,
                    errorCode: error.code,
                    errorName: error.name
                });
                // Don't fail the entire operation if confirmation fails
                // But log it for debugging purposes
            }

            console.log('Send message action completed successfully');
            const requestId = extractRequestId(event);
            return createSuccessResponse(200, { message: 'Message sent successfully' }, action, requestId);
        }

        // Handle typingStatus action (DEPRECATED)
        if (action === 'typingStatus') {
            console.log('DEPRECATED: typingStatus action received - functionality has been temporarily disabled');
            console.log('Processing DEPRECATED TYPING_STATUS action for authenticated user:', userId);
            
            // Basic validation to maintain API compatibility
            const { chatId, isTyping } = data;
            if (!chatId || typeof isTyping !== 'boolean') {
                console.log('Invalid typing status data provided (deprecated handler)');
                const requestId = extractRequestId(event);
                return handleValidationError(['chatId', 'isTyping'], action, {
                    operation: 'typing_status_validation_deprecated',
                    requiredFields: ['chatId', 'isTyping'],
                    providedFields: Object.keys(data || {}),
                    fieldErrors: ['chatId', 'isTyping'],
                    note: 'Typing status functionality is deprecated'
                });
            }

            console.log('Typing status action completed (deprecated - no operation performed)');
            const requestId = extractRequestId(event);
            
            // Return success to maintain API compatibility but note deprecation
            return createSuccessResponse(200, { 
                message: 'Typing status received (deprecated)', 
                deprecated: true,
                note: 'Typing status functionality has been temporarily disabled and will be reimplemented in a future update'
            }, action, requestId);
        }

        console.log('Unknown action received:', action);
        const requestId = extractRequestId(event);
        return createErrorResponse(400, 'Invalid action', action, {
            operation: 'action_validation',
            providedAction: action,
            supportedActions: ['connect', 'sendMessage', 'typingStatus']
        }, requestId);
    } catch (error) {
        console.error('Fatal error in sendMessage lambda:', error);
        console.error('Error stack:', error.stack);
        const requestId = extractRequestId(event);
        return createErrorResponse(500, 'Internal Server Error', extractAction(event), {
            operation: 'lambda_execution',
            errorType: error.name || 'UnknownError',
            errorMessage: error.message || 'An unexpected error occurred'
        }, requestId);
    }
};

console.log('SendMessage Lambda function loaded successfully');

// Wrap the handler with authentication middleware
module.exports.handler = async (event, context) => {
    try {
        const userInfo = await authenticateWebSocketEvent(event);
        // Add user info to event for handler to use
        event.userInfo = userInfo;
        return await handlerLogic(event, context);
    } catch (error) {
        console.error('Authentication failed:', error.message);
        
        if (error.message === 'JWT_TOKEN_MISSING') {
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(401, 'Authentication required. JWT token missing.', action, {
                operation: 'authentication',
                authType: 'jwt'
            }, requestId);
        } else if (error.message === 'JWT_TOKEN_INVALID') {
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(401, 'Invalid or expired JWT token', action, {
                operation: 'authentication',
                authType: 'jwt'
            }, requestId);
        } else {
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            return createErrorResponse(500, 'Internal Server Error', action, {
                operation: 'authentication',
                errorMessage: error.message
            }, requestId);
        }
    }
};



