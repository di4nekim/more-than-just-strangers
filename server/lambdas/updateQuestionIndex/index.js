const AWS = require('aws-sdk');

module.exports.handler = async (event) => {
    try {
        // config document client for local dev via DynamoDB Local + Docker
        const isLocal = !!process.env.DYNAMODB_ENDPOINT;
        const dynamoDB = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
            accessKeyId: isLocal ? "fake" : undefined,
            secretAccessKey: isLocal ? "fake" : undefined,
        });

        if (!event.body) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing request body' })
            };
        }

        let body;
        try {
            body = JSON.parse(event.body);
        } catch (err) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid request body' })
            };
        }

        if (!body || !body.direction || !body.conversationId) {
            return {
                statusCode: 400,
                body: 'Missing required fields'
            };
        }

        if (body.direction !== 'next' && body.direction !== 'previous') {
            return {
                statusCode: 400,
                body: 'Invalid direction. Use "next" or "previous".'
            };
        }

        const conversation = await dynamoDB.get({
            TableName: process.env.CONVERSATIONS_TABLE,
            Key: { PK: `CONVERSATION#${body.conversationId}` }
        }).promise();

        if (!conversation.Item) {
            return {
                statusCode: 404,
                body: 'Conversation not found'
            };
        }

        const currentIndex = conversation.Item.questionIndex || 0;
        const newIndex = body.direction === 'next' ? currentIndex + 1 : currentIndex - 1;

        if (newIndex < 0) {
            return {
                statusCode: 400,
                body: 'Cannot go below index 0'
            };
        }

        try {
            await dynamoDB.update({
                TableName: process.env.CONVERSATIONS_TABLE,
                Key: { PK: `CONVERSATION#${body.conversationId}` },
                UpdateExpression: 'SET questionIndex = :newIndex',
                ExpressionAttributeValues: {
                    ':newIndex': newIndex
                }
            }).promise();

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Question index updated',
                    newIndex
                })
            };
        } catch (error) {
            console.error('Error updating question index:', error);
            return {
                statusCode: 500,
                body: 'Failed to update questionIndex'
            };
        }
    } catch (err) {
        console.error('Error updating questionIndex:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to update questionIndex' })
        };
    }
};
