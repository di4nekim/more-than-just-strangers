/**
 * Unit tests for the syncConversation lambda (AWS SDK v3, fully mocked).
 *
 * Locks in the authentication wrapper and participant check that were added
 * after the audit: previously any connected client could read any
 * conversation's metadata by chatId.
 */
const mockSend = jest.fn();
const mockPost = jest.fn();
const mockAuthenticate = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn(() => ({}))
}));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
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

const ME = 'user-a';
const OTHER = 'user-b';
const CHAT_ID = `${ME}#${OTHER}`;
const CONNECTION = 'conn-a';

const makeEvent = (data) => ({
    requestContext: { connectionId: CONNECTION, requestId: 'req-1' },
    body: JSON.stringify({ action: 'syncConversation', data })
});

const conversationItem = (overrides = {}) => ({
    PK: `CHAT#${CHAT_ID}`,
    chatId: CHAT_ID,
    userAId: ME,
    userBId: OTHER,
    participants: [ME, OTHER],
    lastMessage: { content: 'hi', sentAt: '2026-01-01T00:00:00.000Z' },
    lastUpdated: '2026-01-01T00:00:00.000Z',
    endedBy: null,
    endReason: null,
    createdAt: '2025-12-31T00:00:00.000Z',
    ...overrides
});

function seedDynamo({ conversation = conversationItem(), queryError = null } = {}) {
    mockSend.mockImplementation(async (cmd) => {
        if (cmd.commandType === 'Query') {
            if (queryError) throw queryError;
            return { Items: conversation ? [conversation] : [] };
        }
        return {};
    });
}

const replies = () => mockPost.mock.calls.map(([cmd]) => ({ to: cmd.ConnectionId, payload: JSON.parse(cmd.Data) }));
const parseBody = (response) => JSON.parse(response.body);

describe('syncConversation lambda', () => {
    beforeAll(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterAll(() => {
        console.log.mockRestore();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthenticate.mockResolvedValue({ userId: ME, email: 'a@example.test' });
        mockPost.mockResolvedValue({});
        seedDynamo();
    });

    describe('authentication wrapper', () => {
        test('returns 401 when the Firebase token is missing', async () => {
            mockAuthenticate.mockRejectedValue(new Error('FIREBASE_TOKEN_MISSING'));

            const response = await handler(makeEvent({ chatId: CHAT_ID }));

            expect(response.statusCode).toBe(401);
            expect(mockSend).not.toHaveBeenCalled();
            expect(mockPost).not.toHaveBeenCalled();
        });

        test('returns 401 when the Firebase token is invalid', async () => {
            mockAuthenticate.mockRejectedValue(new Error('FIREBASE_TOKEN_INVALID'));

            const response = await handler(makeEvent({ chatId: CHAT_ID }));

            expect(response.statusCode).toBe(401);
        });
    });

    describe('validation and authorization', () => {
        test('replies with an error when chatId is missing', async () => {
            const response = await handler(makeEvent({}));

            expect(response.statusCode).toBe(200);
            expect(replies()[0]).toEqual({ to: CONNECTION, payload: { action: 'error', data: { error: 'Missing chatId' } } });
            expect(mockSend).not.toHaveBeenCalled();
        });

        test('returns 404 when the conversation does not exist', async () => {
            seedDynamo({ conversation: null });

            const response = await handler(makeEvent({ chatId: CHAT_ID }));

            expect(response.statusCode).toBe(404);
            expect(parseBody(response).data.error).toBe('Conversation not found');
            expect(mockPost).not.toHaveBeenCalled();
        });

        test('returns 403 and sends nothing when the caller is not a participant', async () => {
            seedDynamo({ conversation: conversationItem({ userAId: 'x', userBId: 'y', participants: ['x', 'y'] }) });

            const response = await handler(makeEvent({ chatId: CHAT_ID }));

            expect(response.statusCode).toBe(403);
            expect(parseBody(response).data.error).toMatch(/not a participant/);
            expect(mockPost).not.toHaveBeenCalled();
        });
    });

    describe('syncing', () => {
        test('sends the conversation metadata to the requesting participant', async () => {
            const response = await handler(makeEvent({ chatId: CHAT_ID }));

            expect(response.statusCode).toBe(200);
            expect(parseBody(response).action).toBe('conversationSync');

            const query = mockSend.mock.calls[0][0];
            expect(query).toMatchObject({
                TableName: process.env.CONVERSATIONS_TABLE,
                ExpressionAttributeValues: { ':pk': `CHAT#${CHAT_ID}` }
            });

            const [reply] = replies();
            expect(reply.to).toBe(CONNECTION);
            expect(reply.payload.action).toBe('conversationSync');
            expect(reply.payload.data).toMatchObject({
                chatId: CHAT_ID,
                participants: [ME, OTHER],
                lastMessage: { content: 'hi' },
                endedBy: null,
                createdAt: '2025-12-31T00:00:00.000Z'
            });
        });

        test('replies with an error (and keeps the socket) when the lookup fails', async () => {
            seedDynamo({ queryError: new Error('DynamoDB unavailable') });

            const response = await handler(makeEvent({ chatId: CHAT_ID }));

            expect(response.statusCode).toBe(200);
            const [reply] = replies();
            expect(reply.payload.action).toBe('error');
            expect(reply.payload.data.error).toBe('Internal server error');
        });
    });
});
