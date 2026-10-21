/**
 * Unit tests for the onConnect lambda ($connect route).
 *
 * Token verification is mocked at the shared firebase-config boundary — that is
 * what shared/auth.js actually calls — and DynamoDB at the SDK v3 command
 * boundary, so no Firebase Admin initialisation or network is involved.
 */
const mockVerifyIdToken = jest.fn();
const mockSend = jest.fn();

jest.mock('../../shared/firebase-config.js', () => ({
  verifyIdToken: mockVerifyIdToken,
  getUserByUid: jest.fn()
}));
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({}))
}));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
  GetCommand: jest.fn((params) => ({ commandType: 'Get', ...params })),
  PutCommand: jest.fn((params) => ({ commandType: 'Put', ...params })),
  UpdateCommand: jest.fn((params) => ({ commandType: 'Update', ...params }))
}));

const { handler } = require('../index');
const { PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const CONNECTION_ID = 'test-connection-id-123';
const USER_ID = 'user-123-456';
const EMAIL = 'test@example.com';
const TOKEN = 'mock-firebase-token';

const decodedToken = { uid: USER_ID, email: EMAIL, iat: 1700000000, exp: 1700003600 };

const eventWithQueryToken = {
  requestContext: { connectionId: CONNECTION_ID },
  queryStringParameters: { token: TOKEN }
};
const eventWithBodyToken = {
  requestContext: { connectionId: CONNECTION_ID },
  body: JSON.stringify({ token: TOKEN })
};
const eventWithoutToken = {
  requestContext: { connectionId: CONNECTION_ID }
};

// Route DynamoDB reads so each test declares whether the user already exists.
function seedDynamo({ existingUser = null } = {}) {
  mockSend.mockImplementation(async (cmd) => {
    if (cmd.commandType === 'Get') return { Item: existingUser };
    return {};
  });
}

const parseBody = (response) => JSON.parse(response.body);

describe('onConnect lambda', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(() => {
    console.log.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue(decodedToken);
    seedDynamo();
  });

  describe('authentication', () => {
    test('accepts a Firebase token passed as a query parameter', async () => {
      const response = await handler(eventWithQueryToken);

      expect(response.statusCode).toBe(200);
      expect(mockVerifyIdToken).toHaveBeenCalledWith(TOKEN, null);
    });

    test('accepts a Firebase token passed at the root of the body', async () => {
      const response = await handler(eventWithBodyToken);

      expect(response.statusCode).toBe(200);
      expect(mockVerifyIdToken).toHaveBeenCalledWith(TOKEN, null);
    });

    test('returns 401 when no token is supplied', async () => {
      const response = await handler(eventWithoutToken);

      expect(response.statusCode).toBe(401);
      expect(parseBody(response)).toMatchObject({
        error: 'Authentication failed',
        message: 'FIREBASE_TOKEN_MISSING'
      });
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    test('returns 401 when the token is invalid', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const response = await handler(eventWithQueryToken);

      expect(response.statusCode).toBe(401);
      expect(parseBody(response)).toMatchObject({
        error: 'Authentication failed',
        message: 'FIREBASE_TOKEN_INVALID'
      });
      expect(mockSend).not.toHaveBeenCalled();
    });

    test('returns 401 with the expired code when the token has expired', async () => {
      const expired = new Error('Token expired');
      expired.code = 'auth/id-token-expired';
      mockVerifyIdToken.mockRejectedValue(expired);

      const response = await handler(eventWithQueryToken);

      expect(response.statusCode).toBe(401);
      expect(parseBody(response).message).toBe('FIREBASE_TOKEN_EXPIRED');
    });
  });

  describe('request validation', () => {
    test('returns 400 when the event carries no connectionId', async () => {
      const response = await handler({ queryStringParameters: { token: TOKEN } });

      expect(response.statusCode).toBe(400);
      expect(parseBody(response).error).toMatch(/Missing connectionId/);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('user management', () => {
    test('creates a metadata record for a first-time user', async () => {
      const response = await handler(eventWithQueryToken);

      expect(response.statusCode).toBe(200);
      expect(parseBody(response)).toEqual({
        message: 'New user connection established',
        connectionId: CONNECTION_ID,
        userId: USER_ID
      });
      expect(PutCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: process.env.USER_METADATA_TABLE,
          Item: expect.objectContaining({
            PK: `USER#${USER_ID}`,
            userId: USER_ID,
            email: EMAIL,
            connectionId: CONNECTION_ID
          })
        })
      );
      expect(UpdateCommand).not.toHaveBeenCalled();
    });

    test('updates the connectionId for a returning user', async () => {
      seedDynamo({ existingUser: { PK: `USER#${USER_ID}`, userId: USER_ID, email: EMAIL, connectionId: 'stale' } });

      const response = await handler(eventWithQueryToken);

      expect(response.statusCode).toBe(200);
      expect(parseBody(response)).toEqual({
        message: 'User connection updated',
        connectionId: CONNECTION_ID,
        userId: USER_ID
      });
      expect(UpdateCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: process.env.USER_METADATA_TABLE,
          Key: { PK: `USER#${USER_ID}` },
          UpdateExpression: expect.stringContaining('connectionId'),
          ExpressionAttributeValues: expect.objectContaining({ ':connectionId': CONNECTION_ID })
        })
      );
      expect(PutCommand).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    test('returns 500 when the user lookup fails', async () => {
      mockSend.mockRejectedValue(new Error('DynamoDB error'));

      const response = await handler(eventWithQueryToken);

      expect(response.statusCode).toBe(500);
      expect(parseBody(response).error).toBe('Internal Server Error');
    });

    test('returns 500 when creating the user record fails', async () => {
      mockSend.mockImplementation(async (cmd) => {
        if (cmd.commandType === 'Get') return { Item: null };
        throw new Error('write failed');
      });

      const response = await handler(eventWithQueryToken);

      expect(response.statusCode).toBe(500);
      expect(parseBody(response).error).toBe('Failed to create user');
    });
  });
});
