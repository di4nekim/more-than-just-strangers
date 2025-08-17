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

// Configure DynamoDB client
const dynamoDbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDB = DynamoDBDocumentClient.from(dynamoDbClient);

// Main handler logic
const handlerLogic = async (event) => {
  console.log('updatePresence: Function started');
  console.log('updatePresence: Event received:', JSON.stringify(event, null, 2));
  
  try {
    // Get authenticated user info
    const { userId } = event.userInfo;
    console.log('updatePresence: Authenticated user:', userId);
    
    const connectionId = event.requestContext.connectionId;
    const body = JSON.parse(event.body || '{}');
    const payload = body.data || {};

    console.log('updatePresence: Parsed payload:', payload);

    // Validate required fields
    if (!payload.chatId || !payload.status) {
      console.log('updatePresence: Missing required fields:', { chatId: payload.chatId, status: payload.status });
      const action = extractAction(event);
      const requestId = extractRequestId(event);
      return createErrorResponse(400, 'Missing required fields: chatId and status', action, {
        operation: 'lambda_execution'
      }, requestId);
    }

    // Validate status value
    const validStatuses = ['online', 'offline', 'away'];
    if (!validStatuses.includes(payload.status)) {
      console.log('updatePresence: Invalid status value:', payload.status);
      const action = extractAction(event);
      const requestId = extractRequestId(event);
      return createErrorResponse(400, 'Invalid status value. Must be one of: online, offline, away', action, {
        operation: 'lambda_execution'
      }, requestId);
    }

    // Get conversation to verify user is a participant
    console.log('updatePresence: Getting conversation for chatId:', payload.chatId);
    const conversationResponse = await dynamoDB.send(new GetCommand({
      TableName: process.env.CONVERSATIONS_TABLE,
      Key: { PK: `CHAT#${payload.chatId}` }
    }));

    if (!conversationResponse.Item) {
      console.log('updatePresence: Conversation not found for chatId:', payload.chatId);
      const action = extractAction(event);
      const requestId = extractRequestId(event);
      return createErrorResponse(404, 'Conversation not found', action, {
        operation: 'lambda_execution'
      }, requestId);
    }

    const conversation = conversationResponse.Item;
    console.log('updatePresence: Conversation found:', conversation);

    // Verify the authenticated user is a participant in this conversation
    const isParticipant = conversation.userAId === userId || conversation.userBId === userId;
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
    
    try {
      await dynamoDB.send(new UpdateCommand({
        TableName: process.env.USER_METADATA_TABLE,
        Key: { PK: `USER#${userId}` },
        UpdateExpression: 'SET presence = :presence, lastSeen = :lastSeen',
        ExpressionAttributeValues: {
          ':presence': payload.status,
          ':lastSeen': timestamp
        }
      }));
      console.log('updatePresence: Presence updated successfully in DynamoDB');
    } catch (updateError) {
      console.error('updatePresence: Failed to update presence in DynamoDB:', updateError);
      throw new Error(`Failed to update presence: ${updateError.message}`);
    }

    // Determine the other user in the conversation
    const otherUserId = conversation.userAId === userId ? conversation.userBId : conversation.userAId;
    console.log('updatePresence: Other user ID:', otherUserId);

    // Get other user's connection status
    let otherUserMetadata = null;
    try {
      const otherUserResponse = await dynamoDB.send(new GetCommand({
        TableName: process.env.USER_METADATA_TABLE,
        Key: { PK: `USER#${otherUserId}` }
      }));
      otherUserMetadata = otherUserResponse.Item;
      console.log('updatePresence: Other user metadata:', otherUserMetadata);
    } catch (getError) {
      console.warn('updatePresence: Failed to get other user metadata:', getError);
      // Continue execution even if we can't get other user metadata
    }

    // If other user is connected, notify them about the presence change
    if (otherUserMetadata?.connectionId) {
      console.log('updatePresence: Sending presence update to other user via WebSocket');
      try {
        const api = new ApiGatewayManagementApiClient({
          endpoint: process.env.WEBSOCKET_API_URL
        });

        await api.send(new PostToConnectionCommand({
          ConnectionId: otherUserMetadata.connectionId,
          Data: JSON.stringify({
            action: 'presenceUpdated',
            data: {
              userId,
              status: payload.status,
              timestamp
            }
          })
        }));
        console.log('updatePresence: Presence update sent successfully via WebSocket');
      } catch (wsError) {
        if (wsError.name === 'GoneException') {
          console.log('updatePresence: Connection stale, ignoring WebSocket error');
          // Connection is stale, user probably disconnected
        } else {
          console.warn('updatePresence: Failed to send WebSocket message:', wsError);
          // Don't fail the entire operation for WebSocket issues
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
    console.log('updatePresence: Starting authentication');
    const userInfo = await authenticateWebSocketEvent(event);
    console.log('updatePresence: Authentication successful for user:', userInfo.userId);
    
    // Add user info to event for handler to use
    event.userInfo = userInfo;
    return await handlerLogic(event, context);
  } catch (error) {
    console.error('updatePresence: Authentication failed:', error.message);
    
    if (error.message === 'FIREBASE_TOKEN_MISSING') {
      const action = extractAction(event);
      const requestId = extractRequestId(event);
      return createErrorResponse(401, 'Authentication required. Firebase ID token missing.', action, {
        operation: 'authentication'
      }, requestId);
    } else if (error.message === 'FIREBASE_TOKEN_INVALID') {
      const action = extractAction(event);
      const requestId = extractRequestId(event);
      return createErrorResponse(401, 'Invalid or expired Firebase ID token', action, {
        operation: 'authentication'
      }, requestId);
    } else {
      const action = extractAction(event);
      const requestId = extractRequestId(event);
      return createErrorResponse(500, 'Internal Server Error', action, {
        operation: 'authentication',
        error: error.message
      }, requestId);
    }
  }
}; 