const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, DeleteCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
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

// Configure AWS SDK v3 client
const dynamoDbClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});
const dynamoDB = DynamoDBDocumentClient.from(dynamoDbClient);

// Configure API Gateway Management API for WebSocket responses
const websocketApiUrl = process.env.WEBSOCKET_API_URL;
if (!websocketApiUrl) {
    throw new Error('WEBSOCKET_API_URL environment variable is required');
}
const apiGateway = new ApiGatewayManagementApiClient({
    endpoint: websocketApiUrl
});

// Chat ID validation and generation functions
const validateUserId = (userId) => {
    if (!userId || typeof userId !== 'string') {
        return { isValid: false, error: 'User ID must be a non-empty string' };
    }
    
    if (userId.trim().length === 0) {
        return { isValid: false, error: 'User ID cannot be empty or whitespace' };
    }
    
    if (userId.length > 50) {
        return { isValid: false, error: 'User ID is too long (max 50 characters)' };
    }
    
    return { isValid: true };
};

const generateChatId = (userId1, userId2) => {
    // Ensure consistent chat ID generation by sorting user IDs
    const participants = [userId1, userId2].sort();
    return `${participants[0]}#${participants[1]}`;
};

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

// Main handler logic
const handlerLogic = async (event) => {
    console.log('startConversation: Function started');
    console.log('startConversation: Event received:', JSON.stringify(event, null, 2));
    
    // Log environment variables for debugging
    console.log('Environment variables:');
    console.log('   MATCHMAKING_QUEUE_TABLE:', process.env.MATCHMAKING_QUEUE_TABLE);
    console.log('   USER_METADATA_TABLE:', process.env.USER_METADATA_TABLE);
    console.log('   CONVERSATIONS_TABLE:', process.env.CONVERSATIONS_TABLE);
    console.log('   AWS_REGION:', process.env.AWS_REGION);
    
    // Get authenticated user info
    const { userId } = event.userInfo;
    console.log('startConversation: Authenticated user:', userId);
    
    // Validate authenticated user ID
    const userValidation = validateUserId(userId);
    if (!userValidation.isValid) {
        console.error('startConversation: Invalid authenticated user ID:', userValidation.error);
        return {
            statusCode: 400,
            body: JSON.stringify({
                action: 'error',
                data: { error: `Invalid authenticated user ID: ${userValidation.error}` }
            })
        };
    }
    
    try {
        const body = JSON.parse(event.body);
        const { otherUserId } = body.data || {};

        // If no otherUserId provided, this is a matchmaking request
        if (!otherUserId) {
            console.log('startConversation: Matchmaking request from user:', userId);
            
            // Check if user is already in a conversation
            const userMetadata = await dynamoDB.send(new GetCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${userId}` }
            }));

            if (userMetadata.Item?.chatId) {
                console.log('startConversation: User already in conversation:', userMetadata.Item.chatId);
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        action: 'error',
                        data: { error: 'User already in a conversation' }
                    })
                };
            }

            // Check if user is already in matchmaking queue
            const existingQueueEntry = await dynamoDB.send(new GetCommand({
                TableName: process.env.MATCHMAKING_QUEUE_TABLE || 'MatchmakingQueue-Dev',
                Key: { PK: `USER#${userId}` }
            }));

            if (existingQueueEntry.Item) {
                console.log('startConversation: User already in matchmaking queue');
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        action: 'conversationStarted',
                        data: {
                            queued: true,
                            message: 'Already in matchmaking queue'
                        }
                    })
                };
            }

            // Add user to matchmaking queue
            console.log('startConversation: Adding user to matchmaking queue...');
            const queueItem = {
                PK: `USER#${userId}`,
                userId: userId,
                joinedAt: new Date().toISOString(),
                status: 'waiting'
            };
            console.log('startConversation: Queue item to add:', JSON.stringify(queueItem, null, 2));
            
            await dynamoDB.send(new PutCommand({
                TableName: process.env.MATCHMAKING_QUEUE_TABLE || 'MatchmakingQueue-Dev',
                Item: queueItem
            }));

            // Update user metadata to show they're ready (preserve connectionId)
            await dynamoDB.send(new UpdateCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${userId}` },
                UpdateExpression: 'SET ready = :ready, questionIndex = :questionIndex, lastSeen = :lastSeen',
                ExpressionAttributeValues: {
                    ':ready': true,
                    ':questionIndex': 1,
                    ':lastSeen': new Date().toISOString()
                }
            }));

            console.log('startConversation: User added to matchmaking queue successfully');

            // Small delay to ensure metadata is fully committed
            await new Promise(resolve => setTimeout(resolve, 100));

            // Try to find a match immediately
            const match = await findMatch(userId);
            
            if (match) {
                // Create conversation with matched user
                const chatParticipants = [userId, match.userId].sort();
                const chatId = generateChatId(userId, match.userId);
                const timestamp = new Date().toISOString();

                console.log('startConversation: Creating matchmaking conversation:', chatId);

                // Validate generated chat ID
                const chatIdValidation = validateChatId(chatId);
                if (!chatIdValidation.isValid) {
                    console.error('startConversation: Generated invalid chat ID:', chatIdValidation.error);
                    throw new Error(`Generated invalid chat ID: ${chatIdValidation.error}`);
                }

                // Create new conversation record
                const conversationParams = {
                    TableName: process.env.CONVERSATIONS_TABLE,
                    Item: {
                        PK: `CHAT#${chatId}`,
                        chatId,
                        userAId: chatParticipants[0],
                        userBId: chatParticipants[1],
                        participants: [chatParticipants[0], chatParticipants[1]],
                        lastMessage: null,
                        lastUpdated: timestamp,
                        endedBy: null,
                        endReason: null,
                        createdAt: timestamp,
                        createdBy: userId,
                        // GSI1 attributes for user lookups
                        GSI1_PK: `USER#${chatParticipants[0]}`,
                        GSI1_SK: `CHAT#${chatId}`,
                        // GSI2 attributes for the other user
                        GSI2_PK: `USER#${chatParticipants[1]}`,
                        GSI2_SK: `CHAT#${chatId}`
                    }
                };

                await dynamoDB.send(new PutCommand(conversationParams));

                // Update both users' metadata (preserve connectionId and other fields)
                await Promise.all([
                    dynamoDB.send(new UpdateCommand({
                        TableName: process.env.USER_METADATA_TABLE,
                        Key: { PK: `USER#${userId}` },
                        UpdateExpression: 'SET chatId = :chatId, ready = :ready, questionIndex = :questionIndex, lastSeen = :lastSeen',
                        ExpressionAttributeValues: {
                            ':chatId': chatId,
                            ':ready': false,
                            ':questionIndex': 1,
                            ':lastSeen': new Date().toISOString()
                        }
                    })),
                    dynamoDB.send(new UpdateCommand({
                        TableName: process.env.USER_METADATA_TABLE,
                        Key: { PK: `USER#${match.userId}` },
                        UpdateExpression: 'SET chatId = :chatId, ready = :ready, questionIndex = :questionIndex, lastSeen = :lastSeen',
                        ExpressionAttributeValues: {
                            ':chatId': chatId,
                            ':ready': false,
                            ':questionIndex': 1,
                            ':lastSeen': new Date().toISOString()
                        }
                    }))
                ]);

                // Remove both users from queue
                await Promise.all([
                    dynamoDB.send(new DeleteCommand({
                        TableName: process.env.MATCHMAKING_QUEUE_TABLE || 'MatchmakingQueue-Dev',
                        Key: { PK: `USER#${userId}` }
                    })),
                    dynamoDB.send(new DeleteCommand({
                        TableName: process.env.MATCHMAKING_QUEUE_TABLE || 'MatchmakingQueue-Dev',
                        Key: { PK: `USER#${match.userId}` }
                    }))
                ]);

                // Notify both users about the match
                await notifyMatch(userId, match.userId, chatId, chatParticipants, timestamp);

                console.log('startConversation: Matchmaking conversation created successfully');

                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        action: 'conversationStarted',
                        data: {
                            chatId,
                            participants: chatParticipants,
                            createdAt: timestamp,
                            createdBy: userId,
                            matched: true
                        }
                    })
                };
            } else {
                // No match found, user stays in queue
                console.log('startConversation: No match found, user added to queue');
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        action: 'conversationStarted',
                        data: {
                            queued: true,
                            message: 'Added to matchmaking queue'
                        }
                    })
                };
            }
        }

        // Use authenticated userId and provided otherUserId
        // Validate otherUserId
        const otherUserValidation = validateUserId(otherUserId);
        if (!otherUserValidation.isValid) {
            console.error('startConversation: Invalid other user ID:', otherUserValidation.error);
            return {
                statusCode: 400,
                body: JSON.stringify({
                    action: 'error',
                    data: { error: `Invalid other user ID: ${otherUserValidation.error}` }
                })
            };
        }

        // Check if users are the same
        if (userId === otherUserId) {
            console.error('startConversation: User cannot start conversation with themselves');
            return {
                statusCode: 400,
                body: JSON.stringify({
                    action: 'error',
                    data: { error: 'User cannot start conversation with themselves' }
                })
            };
        }

        const chatParticipants = [userId, otherUserId].sort();
        const chatId = generateChatId(userId, otherUserId);
        const timestamp = new Date().toISOString();

        console.log('startConversation: Creating conversation:', chatId);

        // Validate generated chat ID
        const chatIdValidation = validateChatId(chatId);
        if (!chatIdValidation.isValid) {
            console.error('startConversation: Generated invalid chat ID:', chatIdValidation.error);
            throw new Error(`Generated invalid chat ID: ${chatIdValidation.error}`);
        }

        // Check if conversation already exists
        const existingConversation = await dynamoDB.send(new QueryCommand({
            TableName: process.env.CONVERSATIONS_TABLE,
            KeyConditionExpression: 'PK = :pk',
            ExpressionAttributeValues: {
                ':pk': `CHAT#${chatId}`
            }
        }));

        if (existingConversation.Items.length > 0) {
            console.log('startConversation: Conversation already exists:', chatId);
            return {
                statusCode: 409,
                body: JSON.stringify({
                    action: 'error',
                    data: { 
                        error: 'Conversation already exists',
                        chatId: chatId
                    }
                })
            };
        }

        // Create new conversation record with both Array and GSI support
        const conversationParams = {
            TableName: process.env.CONVERSATIONS_TABLE,
            Item: {
                PK: `CHAT#${chatId}`,
                chatId,
                userAId: chatParticipants[0],
                userBId: chatParticipants[1],
                participants: [chatParticipants[0], chatParticipants[1]], // Array format
                lastMessage: null,
                lastUpdated: timestamp,
                endedBy: null,
                endReason: null,
                createdAt: timestamp,
                createdBy: userId,
                // GSI1 attributes for user lookups
                GSI1_PK: `USER#${chatParticipants[0]}`,
                GSI1_SK: `CHAT#${chatId}`,
                // GSI2 attributes for the other user
                GSI2_PK: `USER#${chatParticipants[1]}`,
                GSI2_SK: `CHAT#${chatId}`
            }
        };

        await dynamoDB.send(new PutCommand(conversationParams));

        // Update both users' metadata for direct conversation creation (preserve connectionId and other fields)
        await Promise.all([
            dynamoDB.send(new UpdateCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${chatParticipants[0]}` },
                UpdateExpression: 'SET chatId = :chatId, questionIndex = :questionIndex, lastSeen = :lastSeen',
                ExpressionAttributeValues: {
                    ':chatId': chatId,
                    ':questionIndex': 1,
                    ':lastSeen': new Date().toISOString()
                }
            })),
            dynamoDB.send(new UpdateCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${chatParticipants[1]}` },
                UpdateExpression: 'SET chatId = :chatId, questionIndex = :questionIndex, lastSeen = :lastSeen',
                ExpressionAttributeValues: {
                    ':chatId': chatId,
                    ':questionIndex': 1,
                    ':lastSeen': new Date().toISOString()
                }
            }))
        ]);

        console.log('startConversation: Conversation created successfully');

        return {
            statusCode: 200,
            body: JSON.stringify({
                action: 'conversationStarted',
                data: {
                    chatId,
                    participants: [chatParticipants[0], chatParticipants[1]],
                    createdAt: timestamp,
                    createdBy: userId
                }
            })
        };

    } catch (error) {
        console.error('startConversation: Error starting conversation:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                action: 'error',
                data: { error: 'Internal server error' }
            })
        };
    }
};

// Helper function to find a match for a user
async function findMatch(userId) {
    try {
        console.log('findMatch: Looking for match for user:', userId);
        
        const tableName = process.env.MATCHMAKING_QUEUE_TABLE || 'MatchmakingQueue-Dev';
        console.log('findMatch: Using table:', tableName);
        
        // First, let's check what's actually in the queue
        console.log('findMatch: Scanning entire queue to see what\'s there...');
        const fullScan = await dynamoDB.send(new ScanCommand({
            TableName: tableName,
            Limit: 10
        }));
        
        console.log('findMatch: Full queue scan found:', fullScan.Items?.length || 0, 'items');
        
        if (fullScan.Items) {
            fullScan.Items.forEach((item, index) => {
                console.log(`findMatch: Queue item ${index + 1}:`, JSON.stringify(item, null, 2));
            });
        }
        
        // Look for another user in the queue (excluding the current user)
        const otherUsers = fullScan.Items?.filter(item => 
            item.userId !== userId && item.status === 'waiting'
        ) || [];
        
        console.log('findMatch: Found other users in queue:', otherUsers.length);
        if (otherUsers.length > 0) {
            otherUsers.forEach((user, index) => {
                console.log(`findMatch: Other user ${index + 1}:`, JSON.stringify(user, null, 2));
            });
        }
        
        if (otherUsers.length > 0) {
            // Pick the first available user
            const match = otherUsers[0];
            console.log('findMatch: Selected match:', JSON.stringify(match, null, 2));
            
            // Verify the selected user still exists in the queue and has valid metadata
            try {
                const matchMetadata = await dynamoDB.send(new GetCommand({
                    TableName: process.env.USER_METADATA_TABLE,
                    Key: { PK: `USER#${match.userId}` }
                }));
                console.log('findMatch: Match user metadata:', JSON.stringify(matchMetadata.Item, null, 2));
                
                if (!matchMetadata.Item?.connectionId) {
                    console.error('findMatch: Selected match has no connection ID, skipping');
                    return null;
                }
            } catch (error) {
                console.error('findMatch: Error verifying match metadata:', error);
                return null;
            }
            
            return match;
        }
        
        console.log('findMatch: No match found');
        return null;
        
    } catch (error) {
        console.error('findMatch: Error finding match:', error);
        return null;
    }
}

// Helper function to notify both users about a match
async function notifyMatch(userId1, userId2, chatId, participants, timestamp) {
    try {
        console.log('notifyMatch: Notifying users about match:', { userId1, userId2, chatId });
        
        // Get connection IDs for both users
        const user1Metadata = await dynamoDB.send(new GetCommand({
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${userId1}` }
        }));
        
        const user2Metadata = await dynamoDB.send(new GetCommand({
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${userId2}` }
        }));
        
        const connectionId1 = user1Metadata.Item?.connectionId;
        const connectionId2 = user2Metadata.Item?.connectionId;
        
        console.log('notifyMatch: User 1 metadata:', JSON.stringify(user1Metadata.Item, null, 2));
        console.log('notifyMatch: User 2 metadata:', JSON.stringify(user2Metadata.Item, null, 2));
        console.log('notifyMatch: Connection ID 1:', connectionId1);
        console.log('notifyMatch: Connection ID 2:', connectionId2);
        
        // Notify first user
        if (connectionId1) {
            try {
                await apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: connectionId1,
                    Data: JSON.stringify({
                        action: 'conversationStarted',
                        data: {
                            chatId,
                            participants,
                            createdAt: timestamp,
                            matched: true
                        }
                    })
                }));
                console.log('notifyMatch: Notified user 1 successfully');
            } catch (error) {
                console.error('notifyMatch: Failed to notify user 1:', error);
            }
        } else {
            console.error('notifyMatch: No connection ID for user 1:', userId1);
        }
        
        // Notify second user
        if (connectionId2) {
            try {
                await apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: connectionId2,
                    Data: JSON.stringify({
                        action: 'conversationStarted',
                        data: {
                            chatId,
                            participants,
                            createdAt: timestamp,
                            matched: true
                        }
                    })
                }));
                console.log('notifyMatch: Notified user 2 successfully');
            } catch (error) {
                console.error('notifyMatch: Failed to notify user 2:', error);
            }
        } else {
            console.error('notifyMatch: No connection ID for user 2:', userId2);
        }
        
    } catch (error) {
        console.error('notifyMatch: Error notifying users:', error);
    }
}

// Wrap the handler with authentication middleware
module.exports.handler = async (event, context) => {
    try {
        const userInfo = await authenticateWebSocketEvent(event);
        // Add user info to event for handler to use
        event.userInfo = userInfo;
        return await handlerLogic(event, context);
    } catch (error) {
        console.error('Authentication failed:', error.message);
        
        const connectionId = event.requestContext?.connectionId;
        
        if (connectionId) {
            try {
                await apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: JSON.stringify({
                        action: 'error',
                        data: { 
                            error: error.message === 'JWT_TOKEN_MISSING' 
                                ? 'Authentication required. JWT token missing.' 
                                : 'Invalid or expired JWT token'
                        }
                    })
                }));
            } catch (sendError) {
                console.error('Error sending auth error response:', sendError);
            }
        }
        
        return { statusCode: 200 }; // Return 200 for WebSocket to maintain connection
    }
};
