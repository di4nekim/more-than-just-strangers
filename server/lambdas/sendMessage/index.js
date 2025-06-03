const AWS = require('aws-sdk');

module.exports.handler = async (event) => {
    try{
        console.log('Received event:', JSON.stringify(event));

         // config document client for local dev via DynamoDB Local + Docker
        const isLocal = !!process.env.DYNAMODB_ENDPOINT;
        const dynamodb = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
            accessKeyId: isLocal ? "fake" : undefined,
            secretAccessKey: isLocal ? "fake" : undefined,
        });
        const apiGateway = new AWS.ApiGatewayManagementApi({
            endpoint: process.env.WEBSOCKET_API_URL 
              ? process.env.WEBSOCKET_API_URL.replace("wss://", "").replace("/prod", "")
              : "localhost:3001"
          });

        const connectionId = event.requestContext.connectionId;
          
        // parse event body
        let body;
        try {
            body = JSON.parse(event.body);
            console.log('Parsed body:', body);
        } catch {
            return { statusCode: 400, body: 'Invalid request body' };
        }
        
        const { action, data } = body;
        if (!action || !data) {
            return { statusCode: 400, body: 'Missing action or data' };
        }

        // handle initial connection message
        if (action === 'connect') {
            const { userId } = data;
            if (!userId) {
                return { statusCode: 400, body: 'Missing userId in connect message' };
            }

            // first check if user exists in metadata table
            const getUserParams = {
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${userId}` }
            };

            let isNewUser = false;
            try {
                const userResult = await dynamodb.get(getUserParams).promise();
                isNewUser = !userResult.Item;
            } catch (error) {
                console.error('Error checking user existence:', error);
                return { statusCode: 500, body: 'Error checking user status' };
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
                    const conversationsResult = await dynamodb.query(conversationsParams).promise();
                    if (conversationsResult.Items && conversationsResult.Items.length > 0) {
                        // Extract chatId from PK (CHAT#{chatId})
                        activeChatId = conversationsResult.Items[0].PK.replace('CHAT#', '');
                    }
                } catch (error) {
                    console.error('Error finding active chat:', error);
                    return { statusCode: 500, body: 'Error finding active chat session' };
                }
            }

            // update user metadata
            const updateUserParams = {
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
                await dynamodb.update(updateUserParams).promise();

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
                        const queuedMessages = await dynamodb.query(queuedMessagesParams).promise();
                        
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
                    body: JSON.stringify({ 
                        message: 'Connection stored',
                        chatId: activeChatId,
                        isNewUser: isNewUser
                    })
                };
            } catch (error) {
                console.error('Error updating user metadata:', error);
                return { statusCode: 500, body: 'Error updating user metadata' };
            }
        }
        else if (action === 'sendMessage') {
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
                    body: JSON.stringify({
                        error: 'Invalid or missing fields',
                        invalidFields: errors
                    })
                };
            }

            console.log('Sender ID:', senderId, 'Message ID:', messageId, 'Chat ID:', chatId, 'Sent At:', sentAt, 'Content:', content);
    
            // validate sender connection
            const getParams = {
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${senderId}` }
            };

            let senderMetadata;
            try {
                senderMetadata = await dynamodb.get(getParams).promise();
                console.log('Sender metadata found:', senderMetadata);
            } catch (error) {
                console.error('DynamoDB get error:', error);
                return { statusCode: 500, body: 'Error retrieving sender metadata' };
            }
        
            if (!senderMetadata.Item) {
                return { statusCode: 403, body: 'Sender not found' };
            }

            // Verify sender's connection matches
            if (senderMetadata.Item.connectionId !== connectionId) {
                return { statusCode: 403, body: 'Sender connection does not match' };
            }

            // Get conversation to verify participants
            const conversationParams = {
                TableName: process.env.CONVERSATIONS_TABLE,
                Key: { PK: `CHAT#${chatId}` }
            };

            let conversation;
            try {
                conversation = await dynamodb.get(conversationParams).promise();
                if (!conversation.Item) {
                    return { statusCode: 404, body: 'Conversation not found' };
                }
            } catch (error) {
                console.error('Error getting conversation:', error);
                return { statusCode: 500, body: 'Error verifying conversation' };
            }

            // determine receiver ID from conversation
            const receiverId = conversation.Item.userAId === senderId ? conversation.Item.userBId : conversation.Item.userAId;
            if (!receiverId) {
                return { statusCode: 400, body: 'Invalid conversation participants' };
            }
        
            // Store message in DynamoDB
            const messageParams = {
                TableName: process.env.MESSAGES_TABLE,
                Item: {
                    PK: `CHAT#${chatId}`,
                    SK: `TS#${sentAt}`,
                    chatId,
                    messageId,
                    senderId,
                    content,
                    sentAt,
                    queued: true 
                }
            };

            try {
                await dynamodb.put(messageParams).promise();

                // update conversation's lastMessage and lastUpdated
                const updateConversationParams = {
                    TableName: process.env.CONVERSATIONS_TABLE,
                    Key: { PK: `CHAT#${chatId}` },
                    UpdateExpression: 'SET lastMessage = :lastMessage, lastUpdated = :lastUpdated',
                    ExpressionAttributeValues: {
                        ':lastMessage': content,
                        ':lastUpdated': sentAt
                    }
                };
                await dynamodb.update(updateConversationParams).promise();
            } catch (error) {
                console.error('Error storing message:', error);
                return { statusCode: 500, body: 'Error storing message' };
            }

            // get receiver's metadata
            const receiverParams = {
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${receiverId}` }
            };

            let receiverMetadata;
            try {
                receiverMetadata = await dynamodb.get(receiverParams).promise();
            } catch (error) {
                console.error('Error getting receiver metadata:', error);
                return { statusCode: 500, body: 'Error getting receiver metadata' };
            }

            // verify both users have matching chatId (i.e. are currently in the same chat)
            if (!receiverMetadata.Item || !receiverMetadata.Item.chatId || !senderMetadata.Item.chatId) {
                return { statusCode: 403, body: 'Both users must be in the same chat to send messages' };
            }

            if (receiverMetadata.Item.chatId !== chatId || senderMetadata.Item.chatId !== chatId) {
                return { statusCode: 403, body: 'Users must be in the same chat to send messages' };
            }

            if (!receiverMetadata.Item.connectionId) {
                // receiver is offline, message will be delivered when they connect
                return { statusCode: 200, body: 'Message stored, receiver offline' };
            }

            // send message to receiver
            const messagePayload = {
                action: 'message',
                data: {
                    chatId: chatId,
                    messageId: messageId,
                    senderId: senderId,
                    content: content,
                    timestamp: sentAt
                }
            };

            try {
                await apiGateway.postToConnection({
                    ConnectionId: receiverMetadata.Item.connectionId,
                    Data: JSON.stringify(messagePayload)
                }).promise();

                // update message status to delivered (i.e. queued = false)
                const updateMessageParams = {
                    TableName: process.env.MESSAGES_TABLE,
                    Key: { 
                        PK: `CHAT#${chatId}`,
                        SK: `TS#${sentAt}`
                    },
                    UpdateExpression: 'SET queued = :queued',
                    ExpressionAttributeValues: {
                        ':queued': false
                    }
                };
                await dynamodb.update(updateMessageParams).promise();

            } catch (error) {
                console.error('Error sending message to receiver:', error);
                return { statusCode: 500, body: 'Error sending message to receiver' };
            }

            return { statusCode: 200, body: 'Message sent successfully' };
        }
    } catch (error) {
        console.error('Error in sendMessage:', error);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
};

console.log('Message processed successfully');

