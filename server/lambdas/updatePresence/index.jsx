import { DynamoDB } from 'aws-sdk';
import { ApiGatewayManagementApi } from 'aws-sdk';

// Configure DynamoDB client for local development
const isLocal = !!process.env.DYNAMODB_ENDPOINT;
const dynamoDB = new DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
  accessKeyId: isLocal ? "fake" : undefined,
  secretAccessKey: isLocal ? "fake" : undefined
});

const api = new ApiGatewayManagementApi({
  endpoint: process.env.WEBSOCKET_API_URL
});

export const handler = async (event) => {
  try {
    const connectionId = event.requestContext.connectionId;
    const body = JSON.parse(event.body || '{}');
    const payload = body.data;

    if (!payload.chatId || !payload.status) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing required fields' })
      };
    }

    // Get the conversation to find both participants
    const conversation = await dynamoDB.get({
      TableName: process.env.CONVERSATIONS_TABLE,
      Key: { PK: `CHAT#${payload.chatId}` }
    }).promise();

    if (!conversation.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Conversation not found' })
      };
    }

    // Get both participants' metadata to validate the connection
    const [userAMetadata, userBMetadata] = await Promise.all([
      dynamoDB.get({
        TableName: process.env.USER_METADATA_TABLE,
        Key: { PK: `USER#${conversation.Item.userAId}` }
      }).promise(),
      dynamoDB.get({
        TableName: process.env.USER_METADATA_TABLE,
        Key: { PK: `USER#${conversation.Item.userBId}` }
      }).promise()
    ]);

    let senderId;
    if (userAMetadata.Item?.connectionId === connectionId) {
      senderId = conversation.Item.userAId;
    } else if (userBMetadata.Item?.connectionId === connectionId) {
      senderId = conversation.Item.userBId;
    }

    if (!senderId) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'Unauthorized' })
      };
    }

    // Update sender's presence in UserMetadata table
    await dynamoDB.update({
      TableName: process.env.USER_METADATA_TABLE,
      Key: { PK: `USER#${senderId}` },
      UpdateExpression: 'SET presenceStatus = :status, lastSeen = :lastSeen',
      ExpressionAttributeValues: {
        ':status': payload.status,
        ':lastSeen': payload.lastSeen || new Date().toISOString()
      }
    }).promise();

    const otherUserMetadata =
      conversation.Item.userAId === senderId ? userBMetadata : userAMetadata;

    if (otherUserMetadata.Item?.connectionId) {
      try {
        await api.postToConnection({
          ConnectionId: otherUserMetadata.Item.connectionId,
          Data: JSON.stringify({
            action: 'presenceStatus',
            data: {
              status: payload.status,
              lastSeen: payload.lastSeen
            }
          })
        }).promise();
      } catch (error) {
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
  } catch (error) {
    console.error('Error updating presence:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};
