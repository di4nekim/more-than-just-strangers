const AWS = require('aws-sdk');

module.exports.handler = async (event) => {
    // Instantiate apiGateway inside the handler for testability
    const apiGateway = new AWS.ApiGatewayManagementApi({
        endpoint: process.env.WEBSOCKET_API_URL 
          ? process.env.WEBSOCKET_API_URL.replace("wss://", "").replace("/prod", "")
          : "localhost:3001"
    });
    console.log('Handler called with event:', JSON.stringify(event, null, 2));
    
    try {
        // config document client for local dev via DynamoDB Local + Docker
        const isLocal = !!process.env.DYNAMODB_ENDPOINT;
        console.log('DynamoDB configuration:', {
            isLocal,
            region: process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.DYNAMODB_ENDPOINT || 'undefined'
        });

        const dynamoDB = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
            accessKeyId: isLocal ? "fake" : undefined,
            secretAccessKey: isLocal ? "fake" : undefined,
        });

        // Handle both production and test environments
        const connectionId = event.requestContext?.connectionId || event.connectionId;
        console.log('Connection ID:', connectionId);
        
        if (!event.body) {
            console.log('Missing request body');
            return { 
                statusCode: 400, 
                body: JSON.stringify({ error: 'Missing request body' }) 
            };
        }

        let body;
        try {
            body = JSON.parse(event.body);
            console.log('Parsed request body:', JSON.stringify(body, null, 2));
        } catch (error) {
            console.log('Error parsing request body:', error);
            return { 
                statusCode: 400, 
                body: JSON.stringify({ error: 'Invalid request body' }) 
            };
        }

        if (!body || !body.action || !body.data) {
            console.log('Missing action or data in request body');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing action or data' })
            };
        }

        // Handle connect action
        if (body.action === 'connect') {
            console.log('Processing connect action');
            const { userId } = body.data;
            if (!userId) {
                console.log('Missing userId in connect action');
                return { 
                    statusCode: 400, 
                    body: JSON.stringify({ error: 'Missing userId' }) 
                };
            }

            let isNewUser = false;
            try {
                console.log('Checking user existence for:', userId);
                const userResult = await dynamoDB.get({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${userId}` }
                }).promise();
                console.log('User check result:', JSON.stringify(userResult, null, 2));
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
                console.log('User exists, checking for active chat');
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
                    console.log('Querying conversations with params:', JSON.stringify(conversationsParams, null, 2));
                    const conversationsResult = await dynamoDB.query(conversationsParams).promise();
                    console.log('Conversations query result:', JSON.stringify(conversationsResult, null, 2));
                    if (conversationsResult.Items && conversationsResult.Items.length > 0) {
                        activeChatId = conversationsResult.Items[0].PK.replace('CHAT#', '');
                        console.log('Found active chat:', activeChatId);
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
        if (body.action === 'sendMessage') {
            const { chatId, sentAt, content, messageId, senderId } = body.data;

            // validate required fields and their formats
            const validations = {
                chatId: (val) => val && typeof val === 'string',
                content: (val) => val && typeof val === 'string' && val.trim().length > 0,
                messageId: (val) => val && typeof val === 'string' && val.trim().length > 0,
                senderId: (val) => val && typeof val === 'string' && val.trim().length > 0,
                sentAt: (val) => !isNaN(new Date(val).getTime())
            };
            const errors = Object.entries(validations)
                .filter(([key, validator]) => !validator(body.data[key]))
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
                console.log('Sender metadata found:', senderMetadata);
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
                console.log('Conversation query result:', conversationResult);
                
                if (!conversationResult.Items || conversationResult.Items.length === 0) {
                    return { 
                        statusCode: 404, 
                        body: JSON.stringify({ error: 'Conversation not found' }) 
                    };
                }
                conversation = { Item: conversationResult.Items[0] };
            } catch (error) {
                console.error('Error getting conversation:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error retrieving conversation' }) 
                };
            }

            // get receiver's metadata
            let receiverMetadata;
            try {
                const receiverId = conversation.Item.userAId === senderId ? conversation.Item.userBId : conversation.Item.userAId;
                receiverMetadata = await dynamoDB.get({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${receiverId}` }
                }).promise();
                console.log('Receiver metadata found:', receiverMetadata);
            } catch (error) {
                console.error('Error getting receiver metadata:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error retrieving receiver metadata' }) 
                };
            }

            // store message
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
                await dynamoDB.put(messageParams).promise();
            } catch (error) {
                console.error('Error storing message:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error storing message' }) 
                };
            }

            // update conversation's lastMessage + lastUpdated
            const updateConversationParams = {
                TableName: process.env.CONVERSATIONS_TABLE,
                Key: { PK: `CHAT#${chatId}` },
                UpdateExpression: 'SET lastMessage = :message, lastUpdated = :lastUpdated',
                ExpressionAttributeValues: {
                    ':message': {
                        content,
                        sentAt,
                        senderId,
                        messageId
                    },
                    ':lastUpdated': new Date().toISOString()
                }
            };

            try {
                await dynamoDB.update(updateConversationParams).promise();
            } catch (error) {
                console.error('Error updating conversation:', error);
                return { 
                    statusCode: 500, 
                    body: JSON.stringify({ error: 'Error updating conversation' }) 
                };
            }

            // if receiver is online, send message via WebSocket
            if (receiverMetadata.Item && receiverMetadata.Item.connectionId) {
                const messagePayload = {
                    action: 'newMessage',
                    data: {
                        chatId,
                        message: {
                            content,
                            sentAt,
                            senderId,
                            messageId
                        }
                    }
                };

                try {
                    await apiGateway.postToConnection({
                        ConnectionId: receiverMetadata.Item.connectionId,
                        Data: JSON.stringify(messagePayload)
                    }).promise();
                    return { 
                        statusCode: 200, 
                        body: JSON.stringify({ message: 'Message sent successfully' }) 
                    };
                } catch (error) {
                    console.error('Error sending message to receiver:', error);
                    return { 
                        statusCode: 500, 
                        body: JSON.stringify({ error: 'Error sending message to receiver' }) 
                    };
                }
            }

            return { 
                statusCode: 200, 
                body: JSON.stringify({ message: 'Message stored, receiver offline' }) 
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



