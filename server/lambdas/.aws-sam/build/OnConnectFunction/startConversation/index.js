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
const apiGateway = new ApiGatewayManagementApiClient({
    endpoint: process.env.WEBSOCKET_API_URL 
      ? process.env.WEBSOCKET_API_URL
      : "https://82hp8bmge8.execute-api.us-east-1.amazonaws.com/Dev"
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

            // Look for a match
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

        // Direct conversation creation (existing logic)
        if (userId === otherUserId) {
            console.log('startConversation: User cannot start conversation with themselves');
            return {
                statusCode: 400,
                body: JSON.stringify({
                    action: 'error',
                    data: { error: 'Cannot start conversation with yourself' }
                })
            };
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
        fullScan.Items?.forEach(item => {
            console.log(`   - PK: ${item.PK}, UserId: ${item.userId}, Status: ${item.status}, Joined: ${item.joinedAt}`);
        });
        
        // Now scan for other users in the matchmaking queue
        const queueScan = await dynamoDB.send(new ScanCommand({
            TableName: tableName,
            FilterExpression: 'userId <> :userId AND status = :status',
            ExpressionAttributeValues: {
                ':userId': userId,
                ':status': 'waiting'
            },
            Limit: 1
        }));
        
        console.log('findMatch: Match scan result:', queueScan.Items?.length || 0, 'items found');
        
        if (queueScan.Items && queueScan.Items.length > 0) {
            const match = queueScan.Items[0];
            console.log('findMatch: Found match:', match.userId);
            console.log('findMatch: Match details:', JSON.stringify(match, null, 2));
            return match;
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
