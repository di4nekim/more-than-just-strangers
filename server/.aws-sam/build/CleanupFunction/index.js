const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

// Configure DynamoDB client for AWS SDK v3
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});
const dynamoDB = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    console.log('Starting cleanup of orphaned chat IDs');
    const startTime = Date.now();
    
    try {
        // Log environment variables for debugging
        console.log('Environment variables:');
        console.log('   USER_METADATA_TABLE:', process.env.USER_METADATA_TABLE);
        console.log('   CONVERSATIONS_TABLE:', process.env.CONVERSATIONS_TABLE);
        console.log('   AWS_REGION:', process.env.AWS_REGION);
        
        if (!process.env.USER_METADATA_TABLE || !process.env.CONVERSATIONS_TABLE) {
            throw new Error('Missing required environment variables: USER_METADATA_TABLE, CONVERSATIONS_TABLE');
        }
        
        let totalUsersScanned = 0;
        let totalUsersWithChatIds = 0;
        let totalOrphanedChatIds = 0;
        let totalFixedUsers = 0;
        let errors = [];
        
        // Scan all users in UserMetadataV2 table
        console.log('Scanning UserMetadataV2 table for users with chat IDs...');
        
        let lastEvaluatedKey = null;
        do {
            const scanParams = {
                TableName: process.env.USER_METADATA_TABLE,
                FilterExpression: 'attribute_exists(chatId)',
                ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey })
            };
            
            const scanResult = await dynamoDB.send(new ScanCommand(scanParams));
            lastEvaluatedKey = scanResult.LastEvaluatedKey;
            
            if (scanResult.Items) {
                totalUsersScanned += scanResult.Items.length;
                console.log(`Scanned ${scanResult.Items.length} users with chat IDs`);
                
                // Process each user with a chat ID
                for (const user of scanResult.Items) {
                    totalUsersWithChatIds++;
                    const chatId = user.chatId;
                    const userId = user.PK.replace('USER#', '');
                    
                    console.log(`Checking user ${userId} with chat ID: ${chatId}`);
                    
                    try {
                        // Check if conversation exists in ConversationsV3 table
                        const conversationParams = {
                            TableName: process.env.CONVERSATIONS_TABLE,
                            KeyConditionExpression: 'PK = :pk',
                            ExpressionAttributeValues: {
                                ':pk': `CHAT#${chatId}`
                            }
                        };
                        
                        const conversationResult = await dynamoDB.send(new QueryCommand(conversationParams));
                        
                        if (conversationResult.Items.length === 0) {
                            // Chat ID is orphaned - conversation doesn't exist
                            console.log(`   ❌ ORPHANED: Chat ID ${chatId} for user ${userId} has no corresponding conversation`);
                            totalOrphanedChatIds++;
                            
                            // Clean up the orphaned chat ID
                            const updateParams = {
                                TableName: process.env.USER_METADATA_TABLE,
                                Key: { PK: `USER#${userId}` },
                                UpdateExpression: 'REMOVE chatId',
                                ReturnValues: 'ALL_NEW'
                            };
                            
                            await dynamoDB.send(new UpdateCommand(updateParams));
                            console.log(`   ✅ CLEANED: Removed orphaned chat ID ${chatId} from user ${userId}`);
                            totalFixedUsers++;
                            
                        } else {
                            console.log(`   ✅ VALID: Chat ID ${chatId} for user ${userId} has corresponding conversation`);
                        }
                        
                    } catch (error) {
                        console.error(`   ❌ ERROR: Failed to check chat ID ${chatId} for user ${userId}:`, error);
                        errors.push({
                            userId,
                            chatId,
                            error: error.message
                        });
                    }
                }
            }
            
        } while (lastEvaluatedKey);
        
        const executionTime = Date.now() - startTime;
        
        console.log('\n=== CLEANUP SUMMARY ===');
        console.log(`Total execution time: ${executionTime}ms`);
        console.log(`Total users scanned: ${totalUsersScanned}`);
        console.log(`Total users with chat IDs: ${totalUsersWithChatIds}`);
        console.log(`Total orphaned chat IDs found: ${totalOrphanedChatIds}`);
        console.log(`Total users fixed: ${totalFixedUsers}`);
        console.log(`Total errors: ${errors.length}`);
        
        if (errors.length > 0) {
            console.log('\n=== ERRORS ENCOUNTERED ===');
            errors.forEach((error, index) => {
                console.log(`${index + 1}. User: ${error.userId}, Chat ID: ${error.chatId}, Error: ${error.error}`);
            });
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Cleanup completed successfully',
                summary: {
                    totalUsersScanned,
                    totalUsersWithChatIds,
                    totalOrphanedChatIds,
                    totalFixedUsers,
                    totalErrors: errors.length,
                    executionTimeMs: executionTime
                },
                errors: errors.length > 0 ? errors : undefined
            })
        };
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        console.error(`Error in cleanup after ${executionTime}ms:`, error);
        console.error('Error stack:', error.stack);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Cleanup failed',
                message: error.message,
                executionTimeMs: executionTime
            })
        };
    }
};
