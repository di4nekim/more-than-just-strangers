const AWS = require('aws-sdk');

exports.handler = async (event, context) => {
    try {
        console.log('Event:', JSON.stringify(event, null, 2));
        
        // Initialize DynamoDB client
        const isLocal = !!process.env.DYNAMODB_ENDPOINT;
        const dynamoDB = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
            accessKeyId: isLocal ? "fake" : undefined,
            secretAccessKey: isLocal ? "fake" : undefined,
        });

        // Extract parameters from the event
        const {chatId, limit, lastEvaluatedKey} = JSON.parse(event.body);

        if (!chatId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Missing chatId parameter'
                })
            };
        }

        // Query messages for the chat
        const params = {
            TableName: process.env.MESSAGES_TABLE,
            KeyConditionExpression: 'PK = :chatId',
            ExpressionAttributeValues: {
                ':chatId': `CHAT#${chatId}`
            },
            ScanIndexForward: false, // false = descending order (newest first)
            Limit: limit
        };

        // Add ExclusiveStartKey if provided
        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await dynamoDB.query(params).promise();
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                messages: result.Items,
                lastEvaluatedKey: result.LastEvaluatedKey 
                    ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey))
                    : null,
                hasMore: !!result.LastEvaluatedKey
            })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal server error',
                error: error.message
            })
        };
    }
}; 