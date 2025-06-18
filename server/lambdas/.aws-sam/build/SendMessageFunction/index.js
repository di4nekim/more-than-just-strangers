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

module.exports.handler = async (event) => {
    console.log('🚀 SendMessage Lambda invoked');
    console.log('📥 Event received:', JSON.stringify(event, null, 2));
    
    // Configure DynamoDB client for AWS SDK v3
    const client = new DynamoDBClient({
        region: process.env.AWS_REGION || 'us-east-1'
    });
    const dynamoDB = DynamoDBDocumentClient.from(client);
    
    // Configure API Gateway Management API for WebSocket responses
    const apiGateway = new ApiGatewayManagementApiClient({
        endpoint: process.env.WEBSOCKET_API_URL 
          ? process.env.WEBSOCKET_API_URL
          : "https://82hp8bmge8.execute-api.us-east-1.amazonaws.com/Dev"
    });
    
    console.log('🔗 API Gateway endpoint configured:', process.env.WEBSOCKET_API_URL || "https://82hp8bmge8.execute-api.us-east-1.amazonaws.com/Dev");
    
    try {
        console.log('🗄️ DynamoDB configured for region:', process.env.AWS_REGION || 'us-east-1');

        // Handle both production and test environments
        const connectionId = event.requestContext?.connectionId || event.connectionId;
        console.log('🔌 Connection ID extracted:', connectionId);
        
        if (!event.body) {
            console.log('❌ Missing request body');
            return { 
                statusCode: 400, 
                body: JSON.stringify({ error: 'Missing request body' }) 
            };
        }

        let body;
        try {
            body = JSON.parse(event.body);
            console.log('📋 Request body parsed successfully:', JSON.stringify(body, null, 2));
        } catch (error) {
            console.log('❌ Failed to parse request body:', error.message);
            return { 
                statusCode: 400, 
                body: JSON.stringify({ error: 'Invalid request body' }) 
            };
        }

        if (!body || !body.action || !body.data) {
            console.log('❌ Missing action or data in request body');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing action or data' })
            };
        }

        const { action, data } = body;
        console.log('🎯 Action identified:', action);
        console.log('📊 Data payload:', JSON.stringify(data, null, 2));
        
        if (!action || !data) {
            console.log('❌ Empty action or data values');
            return { statusCode: 400, body: 'Missing action or data' };
        }

        // Handle connect action
        if (action === 'connect') {
            console.log('🔗 Processing CONNECT action');
            const { userId } = data;
            console.log('👤 User ID from request:', userId);
            
            if (!userId) {
                console.log('❌ Missing userId in connect request');
                return { 
                    statusCode: 400, 
                    body: JSON.stringify({ error: 'Missing userId' }) 
                };
            }

            let isNewUser = false;
            console.log('🔍 Checking if user exists in database...');
            try {
                const userResult = await dynamoDB.send(new GetCommand({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${userId}` }
                }));
                console.log('📋 User lookup result:', JSON.stringify(userResult, null, 2));
                isNewUser = !userResult.Item;
                console.log('🆕 Is new user:', isNewUser);
            } catch (error) {
                console.error('❌ Error checking user existence:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error checking user status' }) 
                };
            }
            
            // if user exists, get their active chat using GSI1
            let activeChatId = null;
            if (!isNewUser) {
                console.log('💬 Looking for active chat for existing user...');
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

                console.log('🔍 Conversations query params:', JSON.stringify(conversationsParams, null, 2));

                try {
                    const conversationsResult = await dynamoDB.send(new QueryCommand(conversationsParams));
                    console.log('📋 Conversations query result:', JSON.stringify(conversationsResult, null, 2));
                    if (conversationsResult.Items && conversationsResult.Items.length > 0) {
                        activeChatId = conversationsResult.Items[0].PK.replace('CHAT#', '');
                        console.log('💬 Active chat ID found:', activeChatId);
                    } else {
                        console.log('💬 No active chat found for user');
                    }
                } catch (error) {
                    console.error('❌ Error finding active chat:', error);
                    return { 
                        statusCode: 500, 
                        body: JSON.stringify({ error: 'Error finding active chat session' }) 
                    };
                }
            } else {
                console.log('🆕 Skipping chat lookup for new user');
            }

            // Store user connection mapping
            console.log('💾 Storing user connection mapping...');
            const params = {
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${userId}` },
                UpdateExpression: 'SET connectionId = :connectionId, chatId = :chatId, lastSeen = :lastSeen, ready = :ready',
                ExpressionAttributeValues: {
                    ':connectionId': connectionId,
                    ':chatId': activeChatId,
                    ':lastSeen': new Date().toISOString(),
                    ':ready': false
                }
            };

            console.log('💾 User update params:', JSON.stringify(params, null, 2));

            try {
                await dynamoDB.send(new UpdateCommand(params));
                console.log('✅ User connection mapping stored successfully');

                // if user has an active chat, check for queued messages
                if (activeChatId) {
                    console.log('📬 Checking for queued messages in chat:', activeChatId);
                    const queuedMessagesParams = {
                        TableName: process.env.MESSAGES_TABLE,
                        KeyConditionExpression: 'PK = :chatKey',
                        FilterExpression: 'queued = :queued',
                        ExpressionAttributeValues: {
                            ':chatKey': `CHAT#${activeChatId}`,
                            ':queued': true
                        }
                    };

                    console.log('📬 Queued messages query params:', JSON.stringify(queuedMessagesParams, null, 2));

                    try {
                        const queuedMessages = await dynamoDB.send(new QueryCommand(queuedMessagesParams));
                        console.log('📬 Queued messages result:', JSON.stringify(queuedMessages, null, 2));
                        
                        // send queued messages to the user
                        if (queuedMessages.Items && queuedMessages.Items.length > 0) {
                            console.log(`📤 Found ${queuedMessages.Items.length} queued messages, sending to user...`);
                            for (const message of queuedMessages.Items) {
                                if (message.senderId !== userId) { // only send messages from other user
                                    console.log('📤 Sending queued message:', message.messageId, 'from sender:', message.senderId);
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

                                    console.log('📤 Message payload:', JSON.stringify(messagePayload, null, 2));

                                    await apiGateway.send(new PostToConnectionCommand({
                                        ConnectionId: connectionId,
                                        Data: JSON.stringify(messagePayload)
                                    }));
                                    console.log('✅ Queued message sent successfully');
                                } else {
                                    console.log('⏭️ Skipping message from same user:', message.messageId);
                                }
                            }
                        } else {
                            console.log('📪 No queued messages found');
                        }
                    } catch (error) {
                        console.error('❌ Error retrieving queued messages:', error);
                    }
                } else {
                    console.log('💬 No active chat, skipping queued message check');
                }

                console.log('✅ Connect action completed successfully');
                return { 
                    statusCode: 200, 
                    body: JSON.stringify({ message: 'Connection stored' })
                };
            } catch (error) {
                console.error('❌ Error storing connection:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error storing connection' }) 
                };
            }
        }

        // Handle sendMessage action
        if (action === 'sendMessage') {
            console.log('Processing sendMessage action with data:', JSON.stringify(data, null, 2));
            const { chatId, sentAt, content, messageId, senderId } = data;

            // validate required fields and their formats
            const validations = {
                chatId: (val) => val && typeof val === 'string',
                content: (val) => val && typeof val === 'string' && val.trim().length > 0,
                messageId: (val) => val && typeof val === 'string' && val.trim().length > 0,
                senderId: (val) => val && typeof val === 'string' && val.trim().length > 0,
                sentAt: (val) => !isNaN(new Date(val).getTime())
            };
            const errors = Object.entries(validations)
                .filter(([key, validator]) => !validator(data[key]))
                .map(([key]) => key);
            if (errors.length > 0) {
                console.log('Validation errors:', errors);
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Invalid or missing fields' })
                };
            }

            console.log('Validation passed. Retrieving sender metadata...');
            // verify sender's connection
            let senderMetadata;
            try {
                senderMetadata = await dynamoDB.send(new GetCommand({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${senderId}` }
                }));
                console.log('Sender metadata retrieved:', senderMetadata.Item ? 'Found' : 'Not found');
            } catch (error) {
                console.error('DynamoDB get error:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error retrieving sender metadata' }) 
                };
            }

            if (!senderMetadata.Item) {
                console.log('Sender not found in database');
                return { 
                    statusCode: 403, 
                    body: JSON.stringify({ error: 'Sender not found' }) 
                };
            }

            if (senderMetadata.Item.connectionId !== connectionId) {
                console.log('Sender connection mismatch. Expected:', senderMetadata.Item.connectionId, 'Got:', connectionId);
                return { 
                    statusCode: 403, 
                    body: JSON.stringify({ error: 'Sender connection does not match' }) 
                };
            }

            console.log('Getting conversation...');
            // get conversation to find receiver
            let conversation;
            try {
                console.log('🔍 Querying conversation with chatId:', chatId);
                console.log('🔍 Query params:', {
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
                
                console.log('🔍 Raw conversation query result:', JSON.stringify(conversationResult, null, 2));
                console.log('🔍 Items count:', conversationResult.Items?.length || 0);
                
                if (conversationResult.Items && conversationResult.Items.length > 0) {
                    conversation = conversationResult.Items[0];
                    console.log('🔍 Selected conversation (first item):', JSON.stringify(conversation, null, 2));
                } else {
                    console.log('❌ No conversation items found in query result');
                }
            } catch (error) {
                console.error('Error getting conversation:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error retrieving conversation' }) 
                };
            }

            if (!conversation) {
                console.log('❌ Conversation not found for chatId:', chatId);
                console.log('❌ This could mean:');
                console.log('  1. The conversation doesn\'t exist in the table');
                console.log('  2. The chatId format is incorrect');
                console.log('  3. The table name is wrong');
                console.log('❌ Environment variables:');
                console.log('  - CONVERSATIONS_TABLE:', process.env.CONVERSATIONS_TABLE);
                return { 
                    statusCode: 404, 
                    body: JSON.stringify({ error: 'Conversation not found' }) 
                };
            }

            // get receiver's metadata - determine receiver from participants (Array or Set)
            let receiverId;
            console.log('🔍 Looking up receiver from participants...');
            console.log('  - conversation.participants:', conversation.participants);
            console.log('  - Is Array:', Array.isArray(conversation.participants));
            console.log('  - Is Set:', conversation.participants instanceof Set);
            
            if (conversation.participants) {
                if (Array.isArray(conversation.participants)) {
                    // Handle Array format
                    receiverId = conversation.participants.find(id => id !== senderId);
                    console.log('✅ Receiver ID determined from Array:', receiverId);
                } else if (conversation.participants instanceof Set) {
                    // Handle Set format (DynamoDB String Set)
                    receiverId = [...conversation.participants].find(id => id !== senderId);
                    console.log('✅ Receiver ID determined from Set:', receiverId);
                } else {
                    console.log('❌ Participants is neither Array nor Set:', typeof conversation.participants);
                    return { 
                        statusCode: 500, 
                        body: JSON.stringify({ error: 'Invalid participants format' }) 
                    };
                }
                console.log('✅ Receiver ID determined:', receiverId);
            } else {
                console.log('❌ No participants found in conversation');
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Missing participants in conversation' }) 
                };
            }

            if (!receiverId) {
                console.log('❌ Could not determine receiver ID from participants');
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Could not determine receiver' }) 
                };
            }

            let receiverMetadata;
            try {
                receiverMetadata = await dynamoDB.send(new GetCommand({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${receiverId}` }
                }));
                console.log('Receiver metadata retrieved:', receiverMetadata.Item ? 'Found' : 'Not found');
            } catch (error) {
                console.error('Error getting receiver metadata:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error retrieving receiver metadata' }) 
                };
            }

            if (!receiverMetadata.Item) {
                console.log('Receiver not found in database');
                return { 
                    statusCode: 404, 
                    body: JSON.stringify({ error: 'Receiver not found' }) 
                };
            }

            // store message in DynamoDB
            const messageParams = {
                TableName: process.env.MESSAGES_TABLE,
                Item: {
                    PK: `CHAT#${chatId}`,
                    SK: `MSG#${messageId}`,
                    messageId,
                    chatId,
                    senderId,
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
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error storing message' }) 
                };
            }

            // if receiver is connected, send message immediately
            if (receiverMetadata.Item.connectionId) {
                console.log('📤 Receiver is connected, sending message immediately...');
                try {
                    const messagePayload = {
                        action: 'message',
                        data: {
                            chatId,
                            messageId,
                            senderId,
                            content,
                            timestamp: sentAt
                        }
                    };
                    console.log('📤 Message payload to receiver:', JSON.stringify(messagePayload, null, 2));
                    
                    await apiGateway.send(new PostToConnectionCommand({
                        ConnectionId: receiverMetadata.Item.connectionId,
                        Data: JSON.stringify(messagePayload)
                    }));
                    console.log('✅ Message sent to receiver successfully');
                } catch (error) {
                    console.error('❌ Error sending message to receiver:', error);
                    // If we can't send to the receiver, mark the message as queued
                    console.log('📬 Marking message as queued due to delivery failure...');
                    try {
                        await dynamoDB.send(new UpdateCommand({
                            TableName: process.env.MESSAGES_TABLE,
                            Key: {
                                PK: `CHAT#${chatId}`,
                                SK: `MSG#${messageId}`
                            },
                            UpdateExpression: 'SET queued = :queued',
                            ExpressionAttributeValues: {
                                ':queued': true
                            }
                        }));
                        console.log('✅ Message marked as queued');
                    } catch (updateError) {
                        console.error('❌ Error updating message queued status:', updateError);
                    }
                }
            } else {
                console.log('📬 Receiver not connected, message will remain queued');
            }

            console.log('✅ Send message action completed successfully');
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Message sent successfully' })
            };
        }

        // Handle typingStatus action
        if (action === 'typingStatus') {
            console.log('⌨️ Processing TYPING_STATUS action');
            const { userId, chatId, isTyping } = data;
            console.log('⌨️ Typing status details - User:', userId, 'Chat:', chatId, 'Is typing:', isTyping);

            // Validate required fields
            if (!userId || !chatId || typeof isTyping !== 'boolean') {
                console.log('❌ Invalid typing status data provided');
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Invalid typing status data' })
                };
            }

            // Get conversation to find other participant
            console.log('💬 Looking up conversation for typing status...');
            let conversation;
            try {
                const conversationResult = await dynamoDB.send(new QueryCommand({
                    TableName: process.env.CONVERSATIONS_TABLE,
                    KeyConditionExpression: 'PK = :pk',
                    ExpressionAttributeValues: {
                        ':pk': `CHAT#${chatId}`
                    }
                }));
                console.log('💬 Conversation result for typing:', JSON.stringify(conversationResult, null, 2));
                conversation = conversationResult.Items[0];
            } catch (error) {
                console.error('❌ Error getting conversation for typing:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Error retrieving conversation' })
                };
            }

            if (!conversation) {
                console.log('❌ Conversation not found for typing status');
                return {
                    statusCode: 404,
                    body: JSON.stringify({ error: 'Conversation not found' })
                };
            }

            // Find the other participant - handle both Array and Set formats
            let otherUserId;
            if (Array.isArray(conversation.participants)) {
                otherUserId = conversation.participants.find(id => id !== userId);
            } else if (conversation.participants instanceof Set) {
                otherUserId = [...conversation.participants].find(id => id !== userId);
            } else {
                console.log('❌ Invalid participants format in typing status');
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Invalid participants format' })
                };
            }
            console.log('👤 Other participant for typing status:', otherUserId);
            if (!otherUserId) {
                console.log('❌ Other participant not found in conversation');
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Other participant not found' })
                };
            }

            // Get other user's connection status
            console.log('🔍 Looking up other user connection for typing status...');
            let otherUserMetadata;
            try {
                otherUserMetadata = await dynamoDB.send(new GetCommand({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${otherUserId}` }
                }));
                console.log('👤 Other user metadata for typing:', JSON.stringify(otherUserMetadata, null, 2));
            } catch (error) {
                console.error('❌ Error getting other user metadata for typing:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Error retrieving other user metadata' })
                };
            }

            // If other user is connected, send typing status
            if (otherUserMetadata.Item?.connectionId) {
                console.log('📤 Other user connected, sending typing status...');
                try {
                    const typingPayload = {
                        action: 'typingStatus',
                        data: {
                            userId,
                            isTyping
                        }
                    };
                    console.log('⌨️ Typing status payload:', JSON.stringify(typingPayload, null, 2));
                    
                    await apiGateway.send(new PostToConnectionCommand({
                        ConnectionId: otherUserMetadata.Item.connectionId,
                        Data: JSON.stringify(typingPayload)
                    }));
                    console.log('✅ Typing status sent successfully');
                } catch (error) {
                    console.error('❌ Error sending typing status:', error);
                    // Continue execution even if notification fails
                }
            } else {
                console.log('🔌 Other user not connected, skipping typing status notification');
            }

            console.log('✅ Typing status action completed successfully');
            return {
                statusCode: 200,
                body: JSON.stringify({
                    action: 'typingStatus',
                    data: { message: 'Typing status sent' }
                })
            };
        }

        console.log('❌ Unknown action received:', action);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid action' })
        };
    } catch (error) {
        console.error('💥 Fatal error in sendMessage lambda:', error);
        console.error('💥 Error stack:', error.stack);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'Internal Server Error' }) 
        };
    }
};

console.log('✅ SendMessage Lambda function loaded successfully');



