const AWS = require('aws-sdk');
const { handler } = require('../index');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockDynamoDB = {
    get: jest.fn().mockReturnThis(),
    put: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    query: jest.fn().mockReturnThis(),
    promise: jest.fn()
  };

  const mockApiGateway = {
    postToConnection: jest.fn().mockReturnThis(),
    promise: jest.fn()
  };

  return {
    DynamoDB: {
      DocumentClient: jest.fn(() => mockDynamoDB)
    },
    ApiGatewayManagementApi: jest.fn(() => mockApiGateway)
  };
});

describe('sendMessage Lambda', () => {
  let mockEvent;
  const mockConnectionId = 'test-connection-id';
  const mockUserId = 'test-user-id';
  const mockChatId = 'test-chat-id';
  const mockMessageId = 'test-message-id';
  const mockContent = 'Hello, world!';
  const mockSentAt = new Date().toISOString();

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mock event
    mockEvent = {
      requestContext: {
        connectionId: mockConnectionId
      },
      body: JSON.stringify({
        action: 'sendMessage',
        data: {
          chatId: mockChatId,
          sentAt: mockSentAt,
          content: mockContent,
          messageId: mockMessageId,
          senderId: mockUserId
        }
      })
    };

    // Setup environment variables
    process.env.USER_METADATA_TABLE = 'user-metadata-table';
    process.env.CONVERSATIONS_TABLE = 'conversations-table';
    process.env.MESSAGES_TABLE = 'messages-table';
    process.env.WEBSOCKET_API_URL = 'wss://test-api.execute-api.region.amazonaws.com/prod';
  });

  describe('Input Validation', () => {
    test('should return 400 for invalid JSON body', async () => {
      mockEvent.body = 'invalid-json';
      const response = await handler(mockEvent);
      expect(response.statusCode).toBe(400);
      expect(response.body).toBe('Invalid request body');
    });

    test('should return 400 for missing action or data', async () => {
      mockEvent.body = JSON.stringify({});
      const response = await handler(mockEvent);
      expect(response.statusCode).toBe(400);
      expect(response.body).toBe('Missing action or data');
    });

    test('should return 400 for invalid message data', async () => {
      mockEvent.body = JSON.stringify({
        action: 'sendMessage',
        data: {
          chatId: '', // Invalid empty chatId
          content: '', // Invalid empty content
          messageId: '', // Invalid empty messageId
          senderId: '', // Invalid empty senderId
          sentAt: 'invalid-date' // Invalid date
        }
      });
      const response = await handler(mockEvent);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('Invalid or missing fields');
    });
  });

  describe('Sender Validation', () => {
    test('should return 403 when sender not found', async () => {
      const dynamoDB = new AWS.DynamoDB.DocumentClient();
      dynamoDB.promise.mockResolvedValueOnce({ Item: null });

      const response = await handler(mockEvent);
      expect(response.statusCode).toBe(403);
      expect(response.body).toBe('Sender not found');
    });

    test('should return 403 when sender connection does not match', async () => {
      const dynamoDB = new AWS.DynamoDB.DocumentClient();
      dynamoDB.promise.mockResolvedValueOnce({
        Item: { connectionId: 'different-connection-id' }
      });

      const response = await handler(mockEvent);
      expect(response.statusCode).toBe(403);
      expect(response.body).toBe('Sender connection does not match');
    });
  });

  describe('Conversation Validation', () => {
    test('should return 404 when conversation not found', async () => {
      const dynamoDB = new AWS.DynamoDB.DocumentClient();
      dynamoDB.promise
        .mockResolvedValueOnce({ Item: { connectionId: mockConnectionId } }) // Sender exists
        .mockResolvedValueOnce({ Item: null }); // Conversation not found

      const response = await handler(mockEvent);
      expect(response.statusCode).toBe(404);
      expect(response.body).toBe('Conversation not found');
    });
  });

  describe('Message Sending', () => {
    test('should successfully store and send message when receiver is online', async () => {
      const dynamoDB = new AWS.DynamoDB.DocumentClient();
      const apiGateway = new AWS.ApiGatewayManagementApi();

      // Chain mocks in the exact order the lambda expects
      dynamoDB.promise
        .mockResolvedValueOnce({ Item: { connectionId: mockConnectionId } }) // get sender
        .mockResolvedValueOnce({ Item: { userAId: mockUserId, userBId: 'other-user-id' } }) // get conversation
        .mockResolvedValueOnce({}) // put message
        .mockResolvedValueOnce({}) // update conversation
        .mockResolvedValueOnce({ Item: { connectionId: 'receiver-connection-id' } }) // get receiver
        .mockResolvedValueOnce({}); // update message status
      apiGateway.promise.mockResolvedValueOnce({}); // post to connection

      const response = await handler(mockEvent);
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('Message sent successfully');
      expect(dynamoDB.put).toHaveBeenCalled();
      expect(apiGateway.postToConnection).toHaveBeenCalled();
    });

    test('should store message but not send when receiver is offline', async () => {
      const dynamoDB = new AWS.DynamoDB.DocumentClient();
      const apiGateway = new AWS.ApiGatewayManagementApi();

      // Chain mocks in the exact order the lambda expects
      dynamoDB.promise
        .mockResolvedValueOnce({ Item: { connectionId: mockConnectionId } }) // get sender
        .mockResolvedValueOnce({ Item: { userAId: mockUserId, userBId: 'other-user-id' } }) // get conversation
        .mockResolvedValueOnce({}) // put message
        .mockResolvedValueOnce({}) // update conversation
        .mockResolvedValueOnce({ Item: null }); // get receiver (offline)

      const response = await handler(mockEvent);
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('Message stored, receiver offline');
      expect(dynamoDB.put).toHaveBeenCalled();
      expect(apiGateway.postToConnection).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle DynamoDB errors gracefully', async () => {
      const dynamoDB = new AWS.DynamoDB.DocumentClient();
      const apiGateway = new AWS.ApiGatewayManagementApi();

      // Chain mocks in the exact order the lambda expects
      dynamoDB.promise
        .mockResolvedValueOnce({ Item: { connectionId: mockConnectionId } }) // get sender
        .mockResolvedValueOnce({ Item: { userAId: mockUserId, userBId: 'other-user-id' } }) // get conversation
        .mockRejectedValueOnce(new Error('DynamoDB error')); // throw error on put message

      const response = await handler(mockEvent);
      expect(response.statusCode).toBe(500);
      expect(response.body).toBe('Error storing message');
    });

    test('should handle API Gateway errors gracefully', async () => {
      const dynamoDB = new AWS.DynamoDB.DocumentClient();
      const apiGateway = new AWS.ApiGatewayManagementApi();

      // Chain mocks in the exact order the lambda expects
      dynamoDB.promise
        .mockResolvedValueOnce({ Item: { connectionId: mockConnectionId } }) // get sender
        .mockResolvedValueOnce({ Item: { userAId: mockUserId, userBId: 'other-user-id' } }) // get conversation
        .mockResolvedValueOnce({}) // put message
        .mockResolvedValueOnce({}) // update conversation
        .mockResolvedValueOnce({ Item: { connectionId: 'receiver-connection-id' } }); // get receiver
      apiGateway.promise.mockRejectedValueOnce(new Error('API Gateway error')); // throw error on post to connection

      const response = await handler(mockEvent);
      expect(response.statusCode).toBe(500);
      expect(response.body).toBe('Error sending message to receiver');
    });
  });
}); 