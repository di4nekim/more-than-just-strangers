/**
 * Lambda function to handle setting a user's ready status and advancing the conversation
 * when both users are ready.
 * 
 * @param {Object} event - The event object containing the WebSocket connection details and request body
 * @returns {Object} Response object with status code and body
 */
const AWS = require('aws-sdk');
const apiGateway = new AWS.ApiGatewayManagementApi({
    endpoint: process.env.WEBSOCKET_API_URL 
      ? process.env.WEBSOCKET_API_URL.replace("wss://", "").replace("/prod", "")
      : "localhost:3001"
});

module.exports.handler = async (event) => {
    try {
        // Configure DynamoDB DocumentClient for AWS
        const dynamoDB = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'us-east-1'
        });

        // Handle both production and test environments
        const connectionId = event.requestContext?.connectionId || event.connectionId;
        
        if (!event.body) {
            return { statusCode: 400, body: 'Missing request body' };
        }

        let body;
        try {
            body = JSON.parse(event.body);
        } catch (error) {
            return { statusCode: 400, body: 'Invalid request body' };
        }

        if (!body.action || !body.data) {
            return { statusCode: 400, body: 'Missing action or data' };
        }

        const { userId, chatId } = body.data;

        if (!userId || !chatId) {
            return { statusCode: 400, body: 'Missing required fields' };
        }

        // get user metadata to validate connection
        const userParams = {
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${userId}` }
        };

        let userMetadata;
        try {
            userMetadata = await dynamoDB.get(userParams).promise();
            if (!userMetadata.Item) {
                return { statusCode: 404, body: 'User not found' };
            }
        } catch (error) {
            console.error('Error getting user metadata:', error);
            return { statusCode: 500, body: 'Error retrieving user metadata' };
        }

        // verify user's connection matches
        if (userMetadata.Item.connectionId !== connectionId) {
            return { statusCode: 403, body: 'User connection does not match' };
        }

        // update user's ready status
        const updateParams = {
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${userId}` },
            UpdateExpression: 'SET isReady = :ready',
            ExpressionAttributeValues: {
                ':ready': true
            }
        };

        try {
            await dynamoDB.update(updateParams).promise();
        } catch (error) {
            console.error('Error updating ready status:', error);
            return { statusCode: 500, body: 'Error updating ready status' };
        }

        // get conversation to check other user's ready status
        const conversationParams = {
            TableName: process.env.CONVERSATIONS_TABLE,
            Key: { PK: `CHAT#${chatId}` }
        };

        let conversation;
        try {
            conversation = await dynamoDB.get(conversationParams).promise();
            if (!conversation.Item) {
                return { statusCode: 404, body: 'Conversation not found' };
            }
        } catch (error) {
            console.error('Error getting conversation:', error);
            return { statusCode: 500, body: 'Error checking conversation' };
        }

        // get other user's ID from conversation
        const otherUserId = conversation.Item.userAId === userId ? conversation.Item.userBId : conversation.Item.userAId;

        // Get other user's metadata to check ready status
        const otherUserParams = {
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${otherUserId}` }
        };

        let otherUserMetadata;
        try {
            otherUserMetadata = await dynamoDB.get(otherUserParams).promise();
            if (!otherUserMetadata.Item) {
                return { statusCode: 404, body: 'Other user not found' };
            }
        } catch (error) {
            console.error('Error getting other user metadata:', error);
            return { statusCode: 500, body: 'Error checking other user status' };
        }

        // check if both users are ready
        const bothReady = otherUserMetadata.Item.isReady === true;
        if (bothReady) {
            // increment question index for both users
            const updateUserAParams = {
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${conversation.Item.userAId}` },
                UpdateExpression: 'SET questionIndex = if_not_exists(questionIndex, :zero) + :one',
                ExpressionAttributeValues: {
                    ':zero': 0,
                    ':one': 1
                },
                ReturnValues: 'UPDATED_NEW'
            };

            const updateUserBParams = {
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${conversation.Item.userBId}` },
                UpdateExpression: 'SET questionIndex = if_not_exists(questionIndex, :zero) + :one',
                ExpressionAttributeValues: {
                    ':zero': 0,
                    ':one': 1
                },
                ReturnValues: 'UPDATED_NEW'
            };

            let newQuestionIndex;
            try {
                const [userAResult, userBResult] = await Promise.all([
                    dynamoDB.update(updateUserAParams).promise(),
                    dynamoDB.update(updateUserBParams).promise()
                ]);
                newQuestionIndex = userAResult.Attributes.questionIndex;
            } catch (error) {
                console.error('Error updating question indices:', error);
                return { statusCode: 500, body: 'Error updating question indices' };
            }

            // prepare message payload
            const messagePayload = {
                action: 'advanceQuestion',
                questionIndex: newQuestionIndex
            };

            // send WebSocket message to both users if they're connected
            const sendPromises = [conversation.Item.userAId, conversation.Item.userBId]
                .map(async (userId) => {
                    const userMetadata = await dynamoDB.get({
                        TableName: process.env.USER_METADATA_TABLE,
                        Key: { PK: `USER#${userId}` }
                    }).promise();

                    if (userMetadata.Item && userMetadata.Item.connectionId) {
                        try {
                            await apiGateway.postToConnection({
                                ConnectionId: userMetadata.Item.connectionId,
                                Data: JSON.stringify(messagePayload)
                            }).promise();
                        } catch (error) {
                            console.error(`Error sending message to user ${userId}:`, error);
                        }
                    }
                });

            try {
                await Promise.all(sendPromises);
            } catch (error) {
                console.error('Error broadcasting question index:', error);
                return { statusCode: 500, body: 'Error broadcasting question index' };
            }
        }

        return { statusCode: 200, body: 'Ready status, question index updated successfully' };
    } catch (error) {
        console.error('Error in setReady:', error);
        return { statusCode: 500, body: 'Internal Server Error' };
    }
};
