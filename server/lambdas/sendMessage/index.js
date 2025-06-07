/**
 * Lambda function to handle WebSocket message sending and user connections.
 * Supports two main actions:
 * 1. connect: Establishes a user's WebSocket connection and retrieves any queued messages
 * 2. sendMessage: Sends a message between users in a chat
 * 
 * @param {Object} event - The event object containing the WebSocket connection details and request body
 * @returns {Object} Response object with status code and body
 */
const AWS = require('aws-sdk');

module.exports.handler = async (event) => {
    // Instantiate apiGateway inside the handler for testability
    const apiGateway = new AWS.ApiGatewayManagementApi({
        endpoint: process.env.WEBSOCKET_API_URL 
          ? process.env.WEBSOCKET_API_URL.replace("wss://", "").replace("/prod", "")
          : "localhost:3001"
    });
    
    try {
        // config document client for local dev via DynamoDB Local + Docker
        const isLocal = !!process.env.DYNAMODB_ENDPOINT;
        const dynamoDB = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
            accessKeyId: isLocal ? "fake" : undefined,
            secretAccessKey: isLocal ? "fake" : undefined,
        });

        // Handle both production and test environments
        const connectionId = event.requestContext?.connectionId || event.connectionId;
        
        if (!event.body) {
            return { 
                statusCode: 400, 
                body: JSON.stringify({ error: 'Missing request body' }) 
            };
        }

        let body;
        try {
            body = JSON.parse(event.body);
        } catch (error) {
            return { 
                statusCode: 400, 
                body: JSON.stringify({ error: 'Invalid request body' }) 
            };
        }

        if (!body || !body.action || !body.data) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing action or data' })
            };
        }

        const { action, data } = body;
        
        if (!action || !data) {
            return { statusCode: 400, body: 'Missing action or data' };
        }

        // Handle connect action
        if (action === 'connect') {
            const { userId } = data;
            if (!userId) {
                return { 
                    statusCode: 400, 
                    body: JSON.stringify({ error: 'Missing userId' }) 
                };
            }

            let isNewUser = false;
            try {
                const userResult = await dynamoDB.get({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${userId}` }
                }).promise();
                isNewUser = !userResult.Item;
            } catch (error) {
                console.error('Error checking user existence:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error checking user status' }) 
                };
            }
            
            // if user exists, get their active chat using GSI1
            let activeChatId = null;
            if (!isNewUser) {
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

                try {
                    const conversationsResult = await dynamoDB.query(conversationsParams).promise();
                    if (conversationsResult.Items && conversationsResult.Items.length > 0) {
                        activeChatId = conversationsResult.Items[0].PK.replace('CHAT#', '');
                    }
                } catch (error) {
                    console.error('Error finding active chat:', error);
                    return { 
                        statusCode: 500, 
                        body: JSON.stringify({ error: 'Error finding active chat session' }) 
                    };
                }
            }

            // Store user connection mapping
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

            try {
                await dynamoDB.update(params).promise();

                // if user has an active chat, check for queued messages
                if (activeChatId) {
                    const queuedMessagesParams = {
                        TableName: process.env.MESSAGES_TABLE,
                        KeyConditionExpression: 'PK = :chatKey',
                        FilterExpression: 'queued = :queued',
                        ExpressionAttributeValues: {
                            ':chatKey': `CHAT#${activeChatId}`,
                            ':queued': true
                        }
                    };

                    try {
                        const queuedMessages = await dynamoDB.query(queuedMessagesParams).promise();
                        
                        // send queued messages to the user
                        if (queuedMessages.Items && queuedMessages.Items.length > 0) {
                            for (const message of queuedMessages.Items) {
                                if (message.senderId !== userId) { // only send messages from other user
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

                                    await apiGateway.postToConnection({
                                        ConnectionId: connectionId,
                                        Data: JSON.stringify(messagePayload)
                                    }).promise();
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error retrieving queued messages:', error);
                    }
                }

                return { 
                    statusCode: 200, 
                    body: JSON.stringify({ message: 'Connection stored' })
                };
            } catch (error) {
                console.error('Error storing connection:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error storing connection' }) 
                };
            }
        }

        // Handle sendMessage action
        if (action === 'sendMessage') {
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
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Invalid or missing fields' })
                };
            }

            // verify sender's connection
            let senderMetadata;
            try {
                senderMetadata = await dynamoDB.get({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${senderId}` }
                }).promise();
            } catch (error) {
                console.error('DynamoDB get error:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error retrieving sender metadata' }) 
                };
            }

            if (!senderMetadata.Item) {
                return { 
                    statusCode: 403, 
                    body: JSON.stringify({ error: 'Sender not found' }) 
                };
            }

            if (senderMetadata.Item.connectionId !== connectionId) {
                return { 
                    statusCode: 403, 
                    body: JSON.stringify({ error: 'Sender connection does not match' }) 
                };
            }

            // get conversation to find receiver
            let conversation;
            try {
                const conversationResult = await dynamoDB.query({
                    TableName: process.env.CONVERSATIONS_TABLE,
                    KeyConditionExpression: 'PK = :pk',
                    ExpressionAttributeValues: {
                        ':pk': `CHAT#${chatId}`
                    }
                }).promise();
                conversation = conversationResult.Items[0];
            } catch (error) {
                console.error('Error getting conversation:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error retrieving conversation' }) 
                };
            }

            if (!conversation) {
                return { 
                    statusCode: 404, 
                    body: JSON.stringify({ error: 'Conversation not found' }) 
                };
            }

            // get receiver's metadata
            const receiverId = conversation.userAId === senderId ? conversation.userBId : conversation.userAId;
            let receiverMetadata;
            try {
                receiverMetadata = await dynamoDB.get({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${receiverId}` }
                }).promise();
            } catch (error) {
                console.error('Error getting receiver metadata:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error retrieving receiver metadata' }) 
                };
            }

            if (!receiverMetadata.Item) {
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

            try {
                await dynamoDB.put(messageParams).promise();

                // Update conversation with last message details
                await dynamoDB.update({
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
                }).promise();
            } catch (error) {
                console.error('Error storing message:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error storing message' }) 
                };
            }

            // if receiver is connected, send message immediately
            if (receiverMetadata.Item.connectionId) {
                try {
                    await apiGateway.postToConnection({
                        ConnectionId: receiverMetadata.Item.connectionId,
                        Data: JSON.stringify({
                            action: 'message',
                            data: {
                                chatId,
                                messageId,
                                senderId,
                                content,
                                timestamp: sentAt
                            }
                        })
                    }).promise();
                } catch (error) {
                    console.error('Error sending message to receiver:', error);
                    // If we can't send to the receiver, mark the message as queued
                    try {
                        await dynamoDB.update({
                            TableName: process.env.MESSAGES_TABLE,
                            Key: {
                                PK: `CHAT#${chatId}`,
                                SK: `MSG#${messageId}`
                            },
                            UpdateExpression: 'SET queued = :queued',
                            ExpressionAttributeValues: {
                                ':queued': true
                            }
                        }).promise();
                    } catch (updateError) {
                        console.error('Error updating message queued status:', updateError);
                    }
                }
            }

            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Message sent successfully' })
            };
        }

        // Handle typingStatus action
        if (action === 'typingStatus') {
            const { userId, chatId, isTyping } = data;

            // Validate required fields
            if (!userId || !chatId || typeof isTyping !== 'boolean') {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Invalid typing status data' })
                };
            }

            // Get conversation to find other participant
            let conversation;
            try {
                const conversationResult = await dynamoDB.query({
                    TableName: process.env.CONVERSATIONS_TABLE,
                    KeyConditionExpression: 'PK = :pk',
                    ExpressionAttributeValues: {
                        ':pk': `CHAT#${chatId}`
                    }
                }).promise();
                conversation = conversationResult.Items[0];
            } catch (error) {
                console.error('Error getting conversation:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Error retrieving conversation' })
                };
            }

            if (!conversation) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ error: 'Conversation not found' })
                };
            }

            // Find the other participant
            const otherUserId = conversation.participants.find(id => id !== userId);
            if (!otherUserId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Other participant not found' })
                };
            }

            // Get other user's connection status
            let otherUserMetadata;
            try {
                otherUserMetadata = await dynamoDB.get({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${otherUserId}` }
                }).promise();
            } catch (error) {
                console.error('Error getting other user metadata:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Error retrieving other user metadata' })
                };
            }

            // If other user is connected, send typing status
            if (otherUserMetadata.Item?.connectionId) {
                try {
                    await apiGateway.postToConnection({
                        ConnectionId: otherUserMetadata.Item.connectionId,
                        Data: JSON.stringify({
                            action: 'typingStatus',
                            data: {
                                userId,
                                isTyping
                            }
                        })
                    }).promise();
                } catch (error) {
                    console.error('Error sending typing status:', error);
                    // Continue execution even if notification fails
                }
            }

            return {
                statusCode: 200,
                body: JSON.stringify({
                    action: 'typingStatus',
                    data: { message: 'Typing status sent' }
                })
            };
        }

        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid action' })
        };
    } catch (error) {
        console.error('Error in sendMessage:', error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'Internal Server Error' }) 
        };
    }
};

console.log('Message processed successfully');



