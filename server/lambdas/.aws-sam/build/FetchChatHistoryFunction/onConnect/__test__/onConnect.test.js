const { handler } = require('../index');
const jwt = require('jsonwebtoken');

// Mock the JWT module
jest.mock('jsonwebtoken');

// Mock Firebase Admin SDK
const mockVerifyIdToken = jest.fn();
jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: mockVerifyIdToken
  }))
}));

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => [])
}));

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockReturnValue({
      send: jest.fn()
    })
  },
  GetCommand: jest.fn().mockImplementation((params) => ({ commandType: 'GetCommand', ...params })),
  PutCommand: jest.fn().mockImplementation((params) => ({ commandType: 'PutCommand', ...params })),
  UpdateCommand: jest.fn().mockImplementation((params) => ({ commandType: 'UpdateCommand', ...params }))
}));

describe('onConnect Lambda with Firebase Authentication', () => {
  const mockConnectionId = 'test-connection-id-123';
  const mockUserId = 'user-123-456';
  const mockUserEmail = 'test@example.com';
  const mockToken = 'mock-firebase-token';
  
  let mockDynamoSend;
  let mockDynamoGet;
  let mockDynamoPut;
  let mockDynamoUpdate;
  
  beforeEach(() => {
    // Set up environment variables
    process.env.USER_METADATA_TABLE = 'test-user-metadata-table';
    process.env.AWS_REGION = 'us-east-1';
    
    // Get the mocked send function
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const client = DynamoDBDocumentClient.from();
    mockDynamoSend = client.send;
    
    // Clear all mocks
    jest.clearAllMocks();
  });
  
  const mockDecodedToken = {
    uid: mockUserId,
    email: mockUserEmail,
    aud: 'test-project',
    iss: 'https://securetoken.google.com/test-project'
  };

  const mockEventWithToken = {
    requestContext: {
      connectionId: mockConnectionId
    },
    queryStringParameters: {
      token: mockToken
    }
  };

  const mockEventWithAuthHeader = {
    requestContext: {
      connectionId: mockConnectionId
    },
    headers: {
      Authorization: `Bearer ${mockToken}`
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock send function to route to appropriate handlers
    mockDynamoSend.mockImplementation((command) => {
      if (command.commandType === 'GetCommand') {
        return mockDynamoGet();
      } else if (command.commandType === 'PutCommand') {
        return mockDynamoPut();
      } else if (command.commandType === 'UpdateCommand') {
        return mockDynamoUpdate();
      }
    });

    // Mock successful Firebase token verification by default
    mockVerifyIdToken.mockResolvedValue(mockDecodedToken);
  });

  describe('Firebase Token Validation', () => {
    test('successfully connects with valid Firebase token in query parameters', async () => {
      // Mock user doesn't exist, will create new user
      mockDynamoGet.mockResolvedValue({ Item: null });
      mockDynamoPut.mockResolvedValue({});

      const response = await handler(mockEventWithToken);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('New user connection established');
      expect(body.userId).toBe(mockUserId);
      expect(body.connectionId).toBe(mockConnectionId);
      
      // Verify Firebase token was validated
      expect(mockVerifyIdToken).toHaveBeenCalledWith(mockToken);
    });

    test('successfully connects with valid Firebase token in Authorization header', async () => {
      // Mock user doesn't exist, will create new user
      mockDynamoGet.mockResolvedValue({ Item: null });
      mockDynamoPut.mockResolvedValue({});

      const response = await handler(mockEventWithAuthHeader);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('New user connection established');
      expect(body.userId).toBe(mockUserId);
      expect(body.connectionId).toBe(mockConnectionId);
      
      // Verify Firebase token was validated
      expect(mockVerifyIdToken).toHaveBeenCalledWith(mockToken);
    });

    test('returns 401 for invalid Firebase token', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const response = await handler(mockEventWithToken);
      
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('Invalid token');
    });

    test('returns 401 for missing token', async () => {
      const mockEventNoToken = {
        requestContext: {
          connectionId: mockConnectionId
        }
      };

      const response = await handler(mockEventNoToken);
      
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('No token provided');
    });

    test('returns 401 for expired Firebase token', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Token expired'));

      const response = await handler(mockEventWithToken);
      
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('Token expired');
    });
  });

  describe('User Management', () => {
    test('creates new user when user does not exist', async () => {
      mockDynamoGet.mockResolvedValue({ Item: null });
      mockDynamoPut.mockResolvedValue({});

      const response = await handler(mockEventWithToken);
      
      expect(response.statusCode).toBe(200);
      expect(mockDynamoPut).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: expect.any(String),
            Item: expect.objectContaining({
              userId: mockUserId,
              connectionId: mockConnectionId,
              email: mockUserEmail
            })
          })
        })
      );
    });

    test('updates existing user connection', async () => {
      const existingUser = {
        userId: mockUserId,
        email: mockUserEmail,
        lastSeen: '2024-01-01T00:00:00.000Z'
      };
      
      mockDynamoGet.mockResolvedValue({ Item: existingUser });
      mockDynamoUpdate.mockResolvedValue({});

      const response = await handler(mockEventWithToken);
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('User reconnected');
      expect(body.userId).toBe(mockUserId);
      expect(body.connectionId).toBe(mockConnectionId);
      
      expect(mockDynamoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: expect.any(String),
            Key: { userId: mockUserId },
            UpdateExpression: expect.stringContaining('connectionId'),
            ExpressionAttributeValues: expect.objectContaining({
              ':connectionId': mockConnectionId
            })
          })
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('handles DynamoDB errors gracefully', async () => {
      mockDynamoGet.mockRejectedValue(new Error('DynamoDB error'));

      const response = await handler(mockEventWithToken);
      
      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });

    test('handles Firebase service errors', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Firebase service unavailable'));

      const response = await handler(mockEventWithToken);
      
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('Firebase service unavailable');
    });
  });
}); 