/**
 * Unit tests for the fetchChatHistory lambda (AWS SDK v3, fully mocked).
 *
 * The lambda replies over the WebSocket and always returns HTTP 200, so the
 * assertions are on the PostToConnection payloads and on the DynamoDB query it
 * issues (including the sanitised limit).
 */
const mockSend = jest.fn();
const mockPost = jest.fn();
const mockAuthenticate = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn(() => ({}))
}));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
    GetCommand: jest.fn((params) => ({ commandType: 'Get', ...params })),
    QueryCommand: jest.fn((params) => ({ commandType: 'Query', ...params }))
}));
jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
    ApiGatewayManagementApiClient: jest.fn(() => ({ send: mockPost })),
    PostToConnectionCommand: jest.fn((params) => ({ commandType: 'PostToConnection', ...params }))
}));
jest.mock('../../shared/auth', () => ({
    authenticateWebSocketEvent: mockAuthenticate
}));

const { handler } = require('../index');

const USER = 'test-user-123';
const CHAT = '123';
const CONNECTION = 'test-connection-id';

const makeEvent = (data) => ({
    requestContext: { connectionId: CONNECTION, requestId: 'req-1' },
    body: JSON.stringify({ action: 'fetchChatHistory', data })
});

// Route DynamoDB traffic: the access check reads the caller's metadata, then the
// message page is queried.
function seedDynamo({
    user = { PK: `USER#${USER}`, chatId: CHAT, connectionId: CONNECTION },
    query = { Items: [], LastEvaluatedKey: null },
    queryError = null
} = {}) {
    mockSend.mockImplementation(async (cmd) => {
        if (cmd.commandType === 'Get') return { Item: user };
        if (cmd.commandType === 'Query') {
            if (queryError) throw queryError;
            return query;
        }
        return {};
    });
}

const replies = () => mockPost.mock.calls.map(([cmd]) => ({ to: cmd.ConnectionId, payload: JSON.parse(cmd.Data) }));
const firstReply = () => replies()[0];
const issuedQuery = () => mockSend.mock.calls.map(([cmd]) => cmd).find((c) => c.commandType === 'Query');

describe('fetchChatHistory lambda', () => {
    beforeAll(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterAll(() => {
        console.log.mockRestore();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthenticate.mockResolvedValue({ userId: USER, email: 'test@example.com' });
        mockPost.mockResolvedValue({});
        seedDynamo();
    });

    describe('validation and access control', () => {
        test('replies with an error when chatId is missing', async () => {
            const response = await handler(makeEvent({}));

            expect(response.statusCode).toBe(200); // WebSocket replies always return 200
            expect(firstReply()).toEqual({
                to: CONNECTION,
                payload: { action: 'error', data: { action: 'fetchChatHistory', error: 'Missing chatId parameter' } }
            });
            expect(issuedQuery()).toBeUndefined();
        });

        test('replies with an error when the caller has no metadata record', async () => {
            seedDynamo({ user: null });

            await handler(makeEvent({ chatId: CHAT }));

            expect(firstReply().payload.data.error).toBe('User not found');
            expect(issuedQuery()).toBeUndefined();
        });

        test('denies access to a chat the caller is not part of', async () => {
            seedDynamo({ user: { PK: `USER#${USER}`, chatId: 'some-other-chat' } });

            await handler(makeEvent({ chatId: CHAT }));

            expect(firstReply().payload.data.error).toBe('Access denied to this chat');
            expect(issuedQuery()).toBeUndefined();
        });
    });

    describe('fetching history', () => {
        test('returns the page of messages for the caller\'s chat', async () => {
            const messages = [
                { PK: `CHAT#${CHAT}`, message: 'Hello' },
                { PK: `CHAT#${CHAT}`, message: 'World' }
            ];
            seedDynamo({ query: { Items: messages, LastEvaluatedKey: null } });

            const response = await handler(makeEvent({ chatId: CHAT }));

            expect(response.statusCode).toBe(200);
            const query = issuedQuery();
            expect(query).toMatchObject({
                TableName: process.env.MESSAGES_TABLE,
                KeyConditionExpression: 'PK = :chatId',
                ExpressionAttributeValues: { ':chatId': `CHAT#${CHAT}` },
                ScanIndexForward: false,
                Limit: 20
            });

            const reply = firstReply();
            expect(reply.to).toBe(CONNECTION);
            expect(reply.payload.action).toBe('chatHistory');
            expect(reply.payload.data).toEqual({ messages, lastEvaluatedKey: null, hasMore: false });
        });

        test('paginates: reports hasMore with an encoded cursor and resumes from a supplied cursor', async () => {
            const lastEvaluatedKey = { PK: `CHAT#${CHAT}`, SK: 'MSG#456' };
            seedDynamo({ query: { Items: [{ PK: `CHAT#${CHAT}`, message: 'Hello' }], LastEvaluatedKey: lastEvaluatedKey } });

            await handler(makeEvent({ chatId: CHAT, lastEvaluatedKey: encodeURIComponent(JSON.stringify(lastEvaluatedKey)) }));

            expect(issuedQuery().ExclusiveStartKey).toEqual(lastEvaluatedKey);
            const { data } = firstReply().payload;
            expect(data.hasMore).toBe(true);
            expect(JSON.parse(decodeURIComponent(data.lastEvaluatedKey))).toEqual(lastEvaluatedKey);
        });

        test('ignores a malformed cursor rather than failing', async () => {
            await handler(makeEvent({ chatId: CHAT, lastEvaluatedKey: 'not-a-cursor' }));

            expect(issuedQuery().ExclusiveStartKey).toBeUndefined();
            expect(firstReply().payload.action).toBe('chatHistory');
        });

        test.each([
            ['honours a custom limit', 10, 10],
            ['defaults a non-numeric limit to 20', 'abc', 20],
            ['clamps an oversized limit to 100', 500, 100],
            ['clamps a zero limit up to 1', 0, 1]
        ])('%s', async (_name, requested, expected) => {
            await handler(makeEvent({ chatId: CHAT, limit: requested }));

            expect(issuedQuery().Limit).toBe(expected);
        });
    });

    describe('error handling', () => {
        test('replies with an error when the message query fails', async () => {
            seedDynamo({ queryError: new Error('DynamoDB error') });

            const response = await handler(makeEvent({ chatId: CHAT }));

            expect(response.statusCode).toBe(200);
            expect(firstReply().payload.action).toBe('error');
            expect(firstReply().payload.data.error).toMatch(/error/i);
        });

        test('replies with an error when the access check itself fails', async () => {
            mockSend.mockRejectedValue(new Error('DynamoDB unavailable'));

            await handler(makeEvent({ chatId: CHAT }));

            expect(firstReply().payload.data.error).toBe('Failed to verify access');
        });
    });
});
