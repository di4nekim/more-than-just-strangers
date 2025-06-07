"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const aws_sdk_1 = require("aws-sdk");
const aws_sdk_2 = require("aws-sdk");
const dynamoDB = new aws_sdk_1.DynamoDB.DocumentClient({
    endpoint: process.env.DYNAMODB_ENDPOINT
});
const api = new aws_sdk_2.ApiGatewayManagementApi({
    endpoint: process.env.WEBSOCKET_ENDPOINT
});
const handler = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const payload = body.data;
        if (!payload.userId || !payload.status) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Missing required fields' })
            };
        }
        // Update user's presence in UserMetadata table
        await dynamoDB.update({
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${payload.userId}` },
            UpdateExpression: 'SET presenceStatus = :status, lastSeen = :lastSeen',
            ExpressionAttributeValues: {
                ':status': payload.status,
                ':lastSeen': payload.lastSeen || new Date().toISOString()
            }
        }).promise();
        // Get the user's active conversation
        const userMetadata = await dynamoDB.get({
            TableName: process.env.USER_METADATA_TABLE,
            Key: { PK: `USER#${payload.userId}` }
        }).promise();
        const activeChatId = userMetadata.Item?.activeChatId;
        if (!activeChatId) {
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Presence updated successfully' })
            };
        }
        // Get the conversation details to find the other user
        const conversation = await dynamoDB.get({
            TableName: process.env.CONVERSATIONS_TABLE,
            Key: { PK: `CHAT#${activeChatId}` }
        }).promise();
        if (!conversation.Item) {
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Presence updated successfully' })
            };
        }
        // Find the other user's ID
        const otherUserId = conversation.Item.userAId === payload.userId
            ? conversation.Item.userBId
            : conversation.Item.userAId;
        // Get the other user's connection
        const otherUserConnection = await dynamoDB.query({
            TableName: process.env.CONNECTIONS_TABLE,
            IndexName: 'userIdIndex',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': otherUserId
            }
        }).promise();
        // Send presence update to the other user if they're connected
        if (otherUserConnection.Items && otherUserConnection.Items.length > 0) {
            try {
                await api.postToConnection({
                    ConnectionId: otherUserConnection.Items[0].connectionId,
                    Data: JSON.stringify({
                        action: 'presenceUpdate',
                        data: {
                            userId: payload.userId,
                            status: payload.status,
                            lastSeen: payload.lastSeen
                        }
                    })
                }).promise();
            }
            catch (error) {
                // If the connection is stale, we can ignore the error
                if (error.statusCode === 410) {
                    return {
                        statusCode: 200,
                        body: JSON.stringify({ message: 'Presence updated successfully' })
                    };
                }
                throw error;
            }
        }
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Presence updated successfully' })
        };
    }
    catch (error) {
        console.error('Error updating presence:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error' })
        };
    }
};
exports.handler = handler;
