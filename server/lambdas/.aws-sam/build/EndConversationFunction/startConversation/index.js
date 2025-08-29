const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, DeleteCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
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
    
    try {
        const body = JSON.parse(event.body);
        const { otherUserId } = body.data || {};

        // If no otherUserId provided, this is a matchmaking request
        if (!otherUserId) {
            console.log('startConversation: Matchmaking request from user:', userId);
            
            // Check if user is already in a conversation
            const userMetadata = await dynamoDB.send(new GetCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${userId}` },
                ConsistentRead: true // Use strong consistency
            }));

            if (userMetadata.Item?.chatId) {
                console.log('startConversation: User already in conversation:', userMetadata.Item.chatId);
                
                // Send error response back to the user via WebSocket
                const connectionId = event.requestContext.connectionId;
                const response = {
                    action: 'error',
                    data: { error: 'User already in a conversation' }
                };
                
                console.log('startConversation: Sending already-in-conversation error to connectionId:', connectionId);
                
                try {
                    await apiGateway.send(new PostToConnectionCommand({
                        ConnectionId: connectionId,
                        Data: JSON.stringify(response)
                    }));
                    console.log('startConversation: Already-in-conversation error sent successfully');
                } catch (error) {
                    console.error('startConversation: Error sending already-in-conversation error:', error);
                }
                
                return { statusCode: 200 };
            }

            // Check if user is already in matchmaking queue
            const existingQueueEntry = await dynamoDB.send(new GetCommand({
                TableName: process.env.MATCHMAKING_QUEUE_TABLE,
                Key: { PK: `USER#${userId}` },
                ConsistentRead: true // Use strong consistency
            }));

            // Always look for a match first (regardless of whether user is already in queue)
            console.log('startConversation: Looking for existing users in queue...');
            const match = await findMatch(userId);
            
            if (match) {
                // Create conversation with matched user
                const chatParticipants = [userId, match.userId].sort();
                const chatId = `${chatParticipants[0]}#${chatParticipants[1]}`;
                const timestamp = new Date().toISOString();

                console.log('startConversation: Creating matchmaking conversation:', chatId);

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

                // Update both users' metadata
                await Promise.all([
                    dynamoDB.send(new UpdateCommand({
                        TableName: process.env.USER_METADATA_TABLE,
                        Key: { PK: `USER#${userId}` },
                        UpdateExpression: 'SET chatId = :chatId, ready = :ready, questionIndex = :questionIndex',
                        ExpressionAttributeValues: {
                            ':chatId': chatId,
                            ':ready': false,
                            ':questionIndex': 1
                        }
                    })),
                    dynamoDB.send(new UpdateCommand({
                        TableName: process.env.USER_METADATA_TABLE,
                        Key: { PK: `USER#${match.userId}` },
                        UpdateExpression: 'SET chatId = :chatId, ready = :ready, questionIndex = :questionIndex',
                        ExpressionAttributeValues: {
                            ':chatId': chatId,
                            ':ready': false,
                            ':questionIndex': 1
                        }
                    }))
                ]);

                // Remove both users from queue
                await Promise.all([
                    dynamoDB.send(new DeleteCommand({
                        TableName: process.env.MATCHMAKING_QUEUE_TABLE,
                        Key: { PK: `USER#${userId}` }
                    })),
                    dynamoDB.send(new DeleteCommand({
                        TableName: process.env.MATCHMAKING_QUEUE_TABLE,
                        Key: { PK: `USER#${match.userId}` }
                    }))
                ]);

                // Notify both users about the match
                await notifyMatch(userId, match.userId, chatId, chatParticipants, timestamp);

                console.log('startConversation: Matchmaking conversation created successfully');

                // Send response back to the current user via WebSocket
                const connectionId = event.requestContext.connectionId;
                const response = {
                    action: 'conversationStarted',
                    data: {
                        chatId,
                        participants: chatParticipants,
                        createdAt: timestamp,
                        createdBy: userId,
                        matched: true
                    }
                };
                
                console.log('startConversation: Sending matched response to connectionId:', connectionId);
                
                try {
                    await apiGateway.send(new PostToConnectionCommand({
                        ConnectionId: connectionId,
                        Data: JSON.stringify(response)
                    }));
                    console.log('startConversation: Matched response sent successfully to current user');
                } catch (error) {
                    console.error('startConversation: Error sending matched response to current user:', error);
                }

                return { statusCode: 200 };
            } else {
                // No match found, ensure user is in queue
                if (existingQueueEntry.Item) {
                    console.log('startConversation: No match found, user already in queue');
                    
                    // Send response back to the user via WebSocket
                    const connectionId = event.requestContext.connectionId;
                    const response = {
                        action: 'conversationStarted',
                        data: {
                            queued: true,
                            message: 'Still waiting in matchmaking queue'
                        }
                    };
                    
                    console.log('startConversation: Sending still-queued response to connectionId:', connectionId);
                    
                    try {
                        await apiGateway.send(new PostToConnectionCommand({
                            ConnectionId: connectionId,
                            Data: JSON.stringify(response)
                        }));
                        console.log('startConversation: Still-queued response sent successfully');
                    } catch (error) {
                        console.error('startConversation: Error sending still-queued response:', error);
                    }
                    
                    return { statusCode: 200 };
                } else {
                    // No match found, add user to matchmaking queue
                    console.log('startConversation: No match found, adding user to queue...');
                    
                    const queueItem = {
                        PK: `USER#${userId}`,
                        userId: userId,
                        joinedAt: new Date().toISOString(),
                        status: 'waiting'
                    };
                    console.log('startConversation: Queue item to add:', JSON.stringify(queueItem, null, 2));
                    
                    await dynamoDB.send(new PutCommand({
                        TableName: process.env.MATCHMAKING_QUEUE_TABLE,
                        Item: queueItem
                    }));
                    console.log('startConversation: User added to matchmaking queue successfully');

                    // Update user metadata to indicate they're ready for matchmaking
                    await dynamoDB.send(new UpdateCommand({
                        TableName: process.env.USER_METADATA_TABLE,
                        Key: { PK: `USER#${userId}` },
                        UpdateExpression: 'SET ready = :ready, lastSeen = :lastSeen',
                        ExpressionAttributeValues: {
                            ':ready': true,
                            ':lastSeen': new Date().toISOString()
                        }
                    }));
                    
                    console.log('startConversation: User added to queue, waiting for match');
                    
                    // Send response back to the user via WebSocket
                    const response = {
                        action: 'conversationStarted',
                        data: {
                            queued: true,
                            message: 'Added to matchmaking queue'
                        }
                    };
                    
                    // Get user's connectionId from the request context
                    const connectionId = event.requestContext.connectionId;
                    console.log('startConversation: Sending queued response to connectionId:', connectionId);
                    
                    try {
                        await apiGateway.send(new PostToConnectionCommand({
                            ConnectionId: connectionId,
                            Data: JSON.stringify(response)
                        }));
                        console.log('startConversation: Queued response sent successfully');
                    } catch (error) {
                        console.error('startConversation: Error sending queued response:', error);
                        // Still return success since the user was added to queue
                    }
                    
                    return { statusCode: 200 };
                }
            }
        }

        // Direct conversation creation (existing logic)
        if (userId === otherUserId) {
            console.log('startConversation: User cannot start conversation with themselves');
            
            // Send error response back to the user via WebSocket
            const connectionId = event.requestContext.connectionId;
            const response = {
                action: 'error',
                data: { error: 'Cannot start conversation with yourself' }
            };
            
            console.log('startConversation: Sending self-conversation error to connectionId:', connectionId);
            
            try {
                await apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: JSON.stringify(response)
                }));
                console.log('startConversation: Self-conversation error sent successfully');
            } catch (error) {
                console.error('startConversation: Error sending self-conversation error:', error);
            }
            
            return { statusCode: 200 };
        }

        // Use authenticated userId and provided otherUserId
        const chatParticipants = [userId, otherUserId].sort();
        const chatId = `${chatParticipants[0]}#${chatParticipants[1]}`;
        const timestamp = new Date().toISOString();

        console.log('startConversation: Creating conversation:', chatId);

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

        // Update both users' metadata for direct conversation creation
        await Promise.all([
            dynamoDB.send(new UpdateCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${chatParticipants[0]}` },
                UpdateExpression: 'SET chatId = :chatId, questionIndex = :questionIndex',
                ExpressionAttributeValues: {
                    ':chatId': chatId,
                    ':questionIndex': 1
                }
            })),
            dynamoDB.send(new UpdateCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${chatParticipants[1]}` },
                UpdateExpression: 'SET chatId = :chatId, questionIndex = :questionIndex',
                ExpressionAttributeValues: {
                    ':chatId': chatId,
                    ':questionIndex': 1
                }
            }))
        ]);

        console.log('startConversation: Conversation created successfully');

        // Send response back to the user via WebSocket
        const connectionId = event.requestContext.connectionId;
        const response = {
            action: 'conversationStarted',
            data: {
                chatId,
                participants: [chatParticipants[0], chatParticipants[1]],
                createdAt: timestamp,
                createdBy: userId
            }
        };
        
        console.log('startConversation: Sending direct conversation response to connectionId:', connectionId);
        
        try {
            await apiGateway.send(new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify(response)
            }));
            console.log('startConversation: Direct conversation response sent successfully');
        } catch (error) {
            console.error('startConversation: Error sending direct conversation response:', error);
        }

        return { statusCode: 200 };

    } catch (error) {
        console.error('startConversation: Error starting conversation:', error);
        
        // Send error response back to the user via WebSocket
        try {
            const connectionId = event.requestContext?.connectionId;
            if (connectionId) {
                const response = {
                    action: 'error',
                    data: { error: 'Internal server error' }
                };
                
                console.log('startConversation: Sending internal error to connectionId:', connectionId);
                
                await apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: JSON.stringify(response)
                }));
                console.log('startConversation: Internal error sent successfully');
            }
        } catch (sendError) {
            console.error('startConversation: Error sending error response:', sendError);
        }
        
        return { statusCode: 200 };
    }
};

// Helper function to find a match for a user
async function findMatch(userId) {
    try {
        console.log('findMatch: Looking for match for user:', userId);
        
        const tableName = process.env.MATCHMAKING_QUEUE_TABLE;
        console.log('findMatch: Using table:', tableName);
        
        // First, let's check what's actually in the queue
        console.log('findMatch: Scanning entire queue to see what\'s there...');
        const fullScan = await dynamoDB.send(new ScanCommand({
            TableName: tableName,
            Limit: 10,
            ConsistentRead: true // Use strong consistency for debugging
        }));
        
        console.log('findMatch: Full queue scan found:', fullScan.Items?.length || 0, 'items');
        fullScan.Items?.forEach(item => {
            console.log(`   - PK: ${item.PK}, UserId: ${item.userId}, Status: ${item.status}, Joined: ${item.joinedAt}`);
        });
        
        // Also check USER_METADATA for each user in queue
        if (fullScan.Items && fullScan.Items.length > 0) {
            console.log('findMatch: Checking USER_METADATA for users in queue...');
            for (const queueUser of fullScan.Items) {
                try {
                    const userMeta = await dynamoDB.send(new GetCommand({
                        TableName: process.env.USER_METADATA_TABLE,
                        Key: { PK: `USER#${queueUser.userId}` },
                        ConsistentRead: true
                    }));
                    console.log(`   - User ${queueUser.userId}: ready=${userMeta.Item?.ready}, chatId=${userMeta.Item?.chatId}`);
                } catch (error) {
                    console.log(`   - User ${queueUser.userId}: Error fetching metadata:`, error.message);
                }
            }
        }
        
        // Now scan for other users in the matchmaking queue
        const queueScan = await dynamoDB.send(new ScanCommand({
            TableName: tableName,
            FilterExpression: 'userId <> :userId AND #status = :status',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':userId': userId,
                ':status': 'waiting'
            },
            Limit: 10 // Get more candidates to check their ready status
        }));
        
        console.log('findMatch: Match scan result:', queueScan.Items?.length || 0, 'items found');
        
        if (queueScan.Items && queueScan.Items.length > 0) {
            // Check each potential match to ensure they're still ready
            for (const potentialMatch of queueScan.Items) {
                console.log('findMatch: Checking potential match:', potentialMatch.userId);
                
                // Verify the user is still ready in USER_METADATA_TABLE
                try {
                    const userMetadata = await dynamoDB.send(new GetCommand({
                        TableName: process.env.USER_METADATA_TABLE,
                        Key: { PK: `USER#${potentialMatch.userId}` },
                        ConsistentRead: true // Use strong consistency to ensure we get the latest data
                    }));
                    
                    if (userMetadata.Item && userMetadata.Item.ready === true && !userMetadata.Item.chatId) {
                        console.log('findMatch: Found valid match:', potentialMatch.userId);
                        console.log('findMatch: Match details:', JSON.stringify(potentialMatch, null, 2));
                        console.log('findMatch: Match metadata:', JSON.stringify(userMetadata.Item, null, 2));
                        return potentialMatch;
                    } else {
                        console.log('findMatch: Potential match not ready or in conversation:', potentialMatch.userId, 
                                  'ready:', userMetadata.Item?.ready, 'chatId:', userMetadata.Item?.chatId);
                        // This user is in the queue but not actually ready - should be cleaned up
                        console.log('findMatch: Removing stale queue entry for user:', potentialMatch.userId);
                        try {
                            await dynamoDB.send(new DeleteCommand({
                                TableName: tableName,
                                Key: { PK: `USER#${potentialMatch.userId}` }
                            }));
                        } catch (cleanupError) {
                            console.warn('findMatch: Failed to cleanup stale queue entry:', cleanupError);
                        }
                    }
                } catch (error) {
                    console.warn('findMatch: Error checking user metadata for:', potentialMatch.userId, error);
                    continue;
                }
            }
            
            console.log('findMatch: No valid matches found after checking ready status');
            return null;
        } else {
            console.log('findMatch: No match found');
            return null;
        }
    } catch (error) {
        console.error('Error finding match:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return null;
    }
}

// Helper function to notify both users about a match
async function notifyMatch(userId1, userId2, chatId, participants, timestamp) {
    try {
        // Get connection IDs for both users
        const [user1Metadata, user2Metadata] = await Promise.all([
            dynamoDB.send(new GetCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${userId1}` }
            })),
            dynamoDB.send(new GetCommand({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${userId2}` }
            }))
        ]);

        const matchPayload = {
            action: 'conversationStarted',
            data: {
                chatId,
                participants,
                createdAt: timestamp,
                matched: true
            }
        };

        // Send notification to both users
        const notifications = [];
        
        if (user1Metadata.Item?.connectionId) {
            notifications.push(
                apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: user1Metadata.Item.connectionId,
                    Data: JSON.stringify(matchPayload)
                }))
            );
        }

        if (user2Metadata.Item?.connectionId) {
            notifications.push(
                apiGateway.send(new PostToConnectionCommand({
                    ConnectionId: user2Metadata.Item.connectionId,
                    Data: JSON.stringify(matchPayload)
                }))
            );
        }

        await Promise.all(notifications);
        console.log('Notified both users about match');
    } catch (error) {
        console.error('Error notifying users about match:', error);
    }
}

// Wrap the handler with authentication middleware
exports.handler = async (event, context) => {
    try {
        // For WebSocket messages, we should use connection-based authentication
        // The user was already authenticated during the onConnect event
        const connectionId = event.requestContext.connectionId;
        
        if (!connectionId) {
            throw new Error('Missing connectionId');
        }
        
        // Get user info from DynamoDB using the connectionId
        const dynamoClient = new DynamoDBClient({
            region: process.env.AWS_REGION || 'us-east-1'
        });
        const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
        
        // Find user by connectionId
        const scanParams = {
            TableName: process.env.USER_METADATA_TABLE,
            FilterExpression: 'connectionId = :connectionId',
            ExpressionAttributeValues: {
                ':connectionId': connectionId
            }
        };
        
        const userResult = await dynamoDB.send(new ScanCommand(scanParams));
        
        if (!userResult.Items || userResult.Items.length === 0) {
            throw new Error('User not found for connectionId');
        }
        
        const userItem = userResult.Items[0];
        const userInfo = {
            userId: userItem.userId,
            email: userItem.email,
            connectionId: connectionId
        };
        
        // Add user info to event for handler to use
        event.userInfo = userInfo;
        
        return await handlerLogic(event, context);
    } catch (error) {
        console.error('Authentication failed:', error.message);
        
        if (error.message === 'User not found for connectionId') {
            return {
                statusCode: 401,
                body: JSON.stringify({
                    action: 'error',
                    data: { error: 'User not authenticated. Please reconnect.' }
                })
            };
        } else {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    action: 'error',
                    data: { error: 'Internal Server Error' }
                })
            };
        }
    }
};
