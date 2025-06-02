const AWS = require('aws-sdk');

module.exports.handler = async (event) => {
    console.log('Lambda triggered with event:', JSON.stringify(event));
    
    try {
         // config document client for local dev via DynamoDB Local + Docker
        const isLocal = !!process.env.DYNAMODB_ENDPOINT;
        const dynamoDB = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
            accessKeyId: isLocal ? "fake" : undefined,
            secretAccessKey: isLocal ? "fake" : undefined,
        });
        const connectionId = event.requestContext.connectionId;
        const userId = event.body.userId; // userID from body is temp; validate via Cognito later

        // TODO: authenticate user via Cognito

        // First check if user exists in metadata table
        const getUserParams = {
            TableName: process.env.USER_METADATA_TABLE,
            Key: { userId }
        };

        let isNewUser = false;
        try {
            const userResult = await dynamoDB.get(getUserParams).promise();
            isNewUser = !userResult.Item;
        } catch (error) {
            console.error('Error checking user existence:', error);
            return { statusCode: 500, body: 'Error checking user status' };
        }
        
        // if user exists, get their active chatId
        let activeChatId = null;
        if (!isNewUser) {
            const messagesParams = {
                TableName: process.env.MESSAGES_TABLE,
                IndexName: 'UserID-Timestamp-index',
                KeyConditionExpression: 'UserID = :userId',
                ExpressionAttributeValues: {
                    ':userId': userId
                },
                ScanIndexForward: false, // most recent first
                Limit: 1
            };

            try {
                const messagesResult = await dynamoDB.query(messagesParams).promise();
                if (messagesResult.Items && messagesResult.Items.length > 0) {
                    activeChatId = messagesResult.Items[0].ChatID;
                }
            } catch (error) {
                console.error('Error finding active chat:', error);
                return { statusCode: 500, body: 'Error finding active chat session' };
            }
        }

        // update user metadata (connectionId, chatId, timestamp, and ready status)
            // for new users: creates new entry with null chatId
            
        const updateParams = {
            TableName: process.env.USER_METADATA_TABLE,
            Key: {userId},
            UpdateExpression: 'SET connectionId = :connectionId, chatId = :chatId, timestamp = :timestamp, ready = :ready',
            ExpressionAttributeValues: {
                ':connectionId': connectionId,
                ':chatId': activeChatId,
                ':timestamp': new Date().toISOString(),
                ':ready': false
            },
            ConditionExpression: 'attribute_not_exists(connectionId)' 
        };

        try {
            await dynamoDB.update(updateParams).promise();
            return { 
                statusCode: 200, 
                body: JSON.stringify({ 
                    message: 'Connection stored',
                    chatId: activeChatId,
                    isNewUser: isNewUser
                })
            };
        } catch (err) {
            if (err.code === 'ConditionalCheckFailedException') {
                return { statusCode: 409, body: 'Connection already exists' };
            }
            // log and handle other errors
            return { statusCode: 500, body: 'Internal server error' };
        }

    } catch (error) {
        console.error('Error in onConnect:', error);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
};