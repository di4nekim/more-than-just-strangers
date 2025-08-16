const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');
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
// Configure DynamoDB client for local development
const isLocal = !!process.env.DYNAMODB_ENDPOINT;
const dynamoDbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
  credentials: isLocal ? {
    accessKeyId: "fake",
    secretAccessKey: "fake"
  } : undefined
});
const dynamoDB = DynamoDBDocumentClient.from(dynamoDbClient);

const api = new ApiGatewayManagementApiClient({
  endpoint: process.env.WEBSOCKET_API_URL
});

// Main handler logic
const handlerLogic = async (event) => {
  console.log('updatePresence: Function started');
  console.log('updatePresence: Event received:', JSON.stringify(event, null, 2));
  
  // Get authenticated user info
  const { userId } = event.userInfo;
  console.log('updatePresence: Authenticated user:', userId);
  
  try {
    const connectionId = event.requestContext.connectionId;
    const body = JSON.parse(event.body || '{}');
    const payload = body.data || {};

    if (!payload.chatId || !payload.status) {
      console.log('updatePresence: Missing required fields:', { chatId: payload.chatId, status: payload.status });
      const action = extractAction(event);
      const requestId = extractRequestId(event);
      return createErrorResponse(400, 'Missing required fields: chatId and status', action, {
        operation: 'lambda_execution'
      }, requestId);
    }

    // Get conversation to verify user is a participant
    console.log('updatePresence: Getting conversation for chatId:', payload.chatId);
    const conversation = await dynamoDB.send(new GetCommand({
      TableName: process.env.CONVERSATIONS_TABLE,
      Key: { PK: `CHAT#${payload.chatId}` }
    }));

    if (!conversation.Item) {
      console.log('updatePresence: Conversation not found for chatId:', payload.chatId);
      const action = extractAction(event);
      const requestId = extractRequestId(event);
      return createErrorResponse(404, 'Conversation not found', action, {
        operation: 'lambda_execution'
      }, requestId);
    }

    // Verify the authenticated user is a participant in this conversation
    const isParticipant = conversation.Item.userAId === userId || conversation.Item.userBId === userId;
    if (!isParticipant) {
      console.log('updatePresence: User not authorized for this conversation:', userId);
      const action = extractAction(event);
      const requestId = extractRequestId(event);
      return createErrorResponse(403, 'Unauthorized - user not participant in this conversation', action, {
        operation: 'lambda_execution'
      }, requestId);
    }

    // Update user's presence status
    console.log('updatePresence: Updating presence for authenticated user:', userId, 'status:', payload.status);
    const timestamp = new Date().toISOString();
    await dynamoDB.send(new UpdateCommand({
      TableName: process.env.USER_METADATA_TABLE,
      Key: { PK: `USER#${userId}` },
      UpdateExpression: 'SET presence = :presence, lastSeen = :lastSeen',
      ExpressionAttributeValues: {
        ':presence': payload.status,
        ':lastSeen': timestamp
      }
    }));

    // Determine the other user in the conversation
    const otherUserId = conversation.Item.userAId === userId ? conversation.Item.userBId : conversation.Item.userAId;

    // Get other user's connection status
    const otherUserMetadata = await dynamoDB.send(new GetCommand({
      TableName: process.env.USER_METADATA_TABLE,
      Key: { PK: `USER#${otherUserId}` }
    }));

    // If other user is connected, notify them about the presence change
    if (otherUserMetadata.Item?.connectionId) {
      console.log('updatePresence: Sending presence update to other user');
      try {
        await api.send(new PostToConnectionCommand({
          ConnectionId: otherUserMetadata.Item.connectionId,
          Data: JSON.stringify({
            action: 'presenceUpdated',
            data: {
              userId,
              status: payload.status,
              timestamp
            }
          })
        }));
        console.log('updatePresence: Presence update sent successfully');
      } catch (error) {
        if (error.name === 'GoneException') {
          console.log('updatePresence: Connection stale, ignoring error');
          // Connection is stale, user probably disconnected
        } else {
          throw error;
        }
      }
    } else {
      console.log('updatePresence: Other user not connected, skipping WebSocket message');
    }

    const action = extractAction(event);
    const requestId = extractRequestId(event);
    return createSuccessResponse('Presence updated successfully', action, {
      userId,
      status: payload.status,
      timestamp
    }, requestId);
  } catch (error) {
    console.error('updatePresence: Error updating presence:', error);
    const action = extractAction(event);
    const requestId = extractRequestId(event);
    return createErrorResponse(500, 'Internal server error', action, {
      operation: 'lambda_execution',
      error: error.message
    }, requestId);
  }
};

// Wrap the handler with authentication middleware
exports.handler = async (event, context) => {
  try {
    const userInfo = await authenticateWebSocketEvent(event);
    // Add user info to event for handler to use
    event.userInfo = userInfo;
    return await handlerLogic(event, context);
  } catch (error) {
    console.error('Authentication failed:', error.message);
    
    if (error.message === 'JWT_TOKEN_MISSING') {
      const action = extractAction(event);
      const requestId = extractRequestId(event);
      return createErrorResponse(401, 'Authentication required. JWT token missing.', action, {
        operation: 'lambda_execution'
      }, requestId);
    } else if (error.message === 'JWT_TOKEN_INVALID') {
      const action = extractAction(event);
      const requestId = extractRequestId(event);
      return createErrorResponse(401, 'Invalid or expired JWT token', action, {
        operation: 'lambda_execution'
      }, requestId);
    } else {
      const action = extractAction(event);
      const requestId = extractRequestId(event);
      return createErrorResponse(500, 'Internal Server Error', action, {
        operation: 'lambda_execution'
      }, requestId);
    }
  }
}; 