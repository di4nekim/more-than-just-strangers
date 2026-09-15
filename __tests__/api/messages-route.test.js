/**
 * @jest-environment node
 *
 * Real-handler tests for GET/POST /api/chat/[chatId]/messages.
 *
 * Unlike the older API suites, this imports and invokes the actual route
 * handler; only the auth helper and DynamoDB are mocked at their boundaries.
 * It locks in the IDOR fix (participant check) and the limit clamp.
 */
const mockSend = jest.fn();
const mockValidateToken = jest.fn();

jest.mock('@/lib/auth', () => ({
  validateToken: mockValidateToken,
  handleAuthError: (error) => ({ error: error.message, status: error.status || 401 }),
}));
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
  GetCommand: jest.fn((params) => ({ commandType: 'Get', ...params })),
  QueryCommand: jest.fn((params) => ({ commandType: 'Query', ...params })),
}));

const { GET, POST } = require('@/app/api/chat/[chatId]/messages/route');

const ME = 'user-a';
const OTHER = 'user-b';
const CHAT_ID = `${ME}#${OTHER}`;

const get = (query = '', chatId = CHAT_ID) =>
  GET(new Request(`http://localhost/api/chat/${encodeURIComponent(chatId)}/messages${query}`), {
    params: Promise.resolve({ chatId }),
  });

function seedDynamo({
  conversation = { PK: `CHAT#${CHAT_ID}`, userAId: ME, userBId: OTHER },
  items = [],
  lastEvaluatedKey = undefined,
} = {}) {
  mockSend.mockImplementation(async (cmd) => {
    if (cmd.commandType === 'Get') return { Item: conversation };
    if (cmd.commandType === 'Query') return { Items: items, LastEvaluatedKey: lastEvaluatedKey };
    return {};
  });
}

// The most recent Query (a test may issue more than one request).
const issuedQuery = () => mockSend.mock.calls.map(([cmd]) => cmd).filter((c) => c.commandType === 'Query').pop();

describe('GET /api/chat/[chatId]/messages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateToken.mockResolvedValue({ user: { uid: ME } });
    seedDynamo();
  });

  test('returns 401 when the token is invalid', async () => {
    mockValidateToken.mockRejectedValue(Object.assign(new Error('Invalid token'), { status: 401 }));

    const response = await get();

    expect(response.status).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('returns 404 when the conversation does not exist', async () => {
    seedDynamo({ conversation: null }); // undefined would select the default; null means "no item"

    const response = await get();

    expect(response.status).toBe(404);
    expect(issuedQuery()).toBeUndefined();
  });

  test('returns 403 for an authenticated user who is not a participant (IDOR guard)', async () => {
    mockValidateToken.mockResolvedValue({ user: { uid: 'someone-else' } });

    const response = await get();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(issuedQuery()).toBeUndefined();
  });

  test('returns the conversation history for a participant', async () => {
    seedDynamo({
      items: [
        { messageId: 'm2', content: 'second', senderId: OTHER, sentAt: '2026-01-01T00:01:00.000Z', queued: false },
        { messageId: 'm1', content: 'first', senderId: ME, sentAt: '2026-01-01T00:00:00.000Z', queued: true },
      ],
    });

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      messages: [
        { id: 'm2', content: 'second', senderId: OTHER, timestamp: '2026-01-01T00:01:00.000Z', delivered: true },
        { id: 'm1', content: 'first', senderId: ME, timestamp: '2026-01-01T00:00:00.000Z', delivered: false },
      ],
      hasMore: false,
      nextCursor: null,
    });
    expect(issuedQuery()).toMatchObject({
      KeyConditionExpression: 'PK = :chatId',
      ExpressionAttributeValues: { ':chatId': `CHAT#${CHAT_ID}` },
      ScanIndexForward: false,
      Limit: 50,
    });
  });

  test('paginates with an encoded cursor', async () => {
    const lastKey = { PK: `CHAT#${CHAT_ID}`, SK: 'MSG#m1' };
    seedDynamo({ items: [], lastEvaluatedKey: lastKey });

    const first = await (await get()).json();
    expect(first.hasMore).toBe(true);
    expect(JSON.parse(decodeURIComponent(first.nextCursor))).toEqual(lastKey);

    await get(`?before=${first.nextCursor}`);
    expect(issuedQuery().ExclusiveStartKey).toEqual(lastKey);
  });

  test('ignores a malformed cursor instead of failing', async () => {
    const response = await get('?before=not-a-cursor');

    expect(response.status).toBe(200);
    expect(issuedQuery().ExclusiveStartKey).toBeUndefined();
  });

  test.each([
    ['honours a custom limit', '?limit=10', 10],
    ['defaults a non-numeric limit to 50', '?limit=abc', 50],
    ['clamps an oversized limit to 100', '?limit=100000', 100],
    ['clamps a zero limit up to 1', '?limit=0', 1],
  ])('%s', async (_name, query, expected) => {
    await get(query);

    expect(issuedQuery().Limit).toBe(expected);
  });
});

describe('POST /api/chat/[chatId]/messages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateToken.mockResolvedValue({ user: { uid: ME } });
  });

  test('rejects an empty message with 400', async () => {
    const response = await POST(
      new Request(`http://localhost/api/chat/${CHAT_ID}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: '' }),
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(response.status).toBe(400);
  });

  test('directs message sending to the WebSocket with 405', async () => {
    const response = await POST(
      new Request(`http://localhost/api/chat/${CHAT_ID}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: 'hello' }),
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(response.status).toBe(405);
    expect((await response.json()).error).toMatch(/WebSocket/);
  });
});
