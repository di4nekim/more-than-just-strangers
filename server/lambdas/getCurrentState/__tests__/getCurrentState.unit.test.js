/**
 * Unit tests for the getCurrentState lambda (AWS SDK v3, fully mocked).
 *
 * The lambda answers over the WebSocket (returning HTTP 200 on the way out);
 * only request-validation failures come back as error responses. Replaces the
 * old local-DynamoDB integration test, which the v3 client could never reach
 * and whose assertions predated the auth wrapper and socket replies.
 */
const mockSend = jest.fn();
const mockPost = jest.fn();
const mockAuthenticate = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn(() => ({}))
}));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
    GetCommand: jest.fn((params) => ({ commandType: 'Get', ...params }))
}));
jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
    ApiGatewayManagementApiClient: jest.fn(() => ({ send: mockPost })),
    PostToConnectionCommand: jest.fn((params) => ({ commandType: 'PostToConnection', ...params }))
}));
jest.mock('../../shared/auth', () => ({
    authenticateWebSocketEvent: mockAuthenticate
}));

const { handler } = require('../index');

const USER = 'user-a';
const CONNECTION = 'conn-a';

const makeEvent = (body) => ({
    requestContext: { connectionId: CONNECTION, requestId: 'req-1' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
});
const stateEvent = (userId = USER) => makeEvent({ action: 'getCurrentState', data: { userId } });

function seedDynamo({ user } = {}) {
    mockSend.mockImplementation(async (cmd) => {
        if (cmd.commandType === 'Get') return { Item: user };
        return {};
    });
}

const replies = () => mockPost.mock.calls.map(([cmd]) => ({ to: cmd.ConnectionId, payload: JSON.parse(cmd.Data) }));
const parseBody = (response) => JSON.parse(response.body);

describe('getCurrentState lambda', () => {
    beforeAll(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterAll(() => {
        console.log.mockRestore();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthenticate.mockResolvedValue({ userId: USER, email: 'a@example.test' });
        mockPost.mockResolvedValue({});
        seedDynamo({ user: undefined });
    });

    describe('authentication and validation', () => {
        test('replies with an auth error over the socket when the token is missing', async () => {
            mockAuthenticate.mockRejectedValue(new Error('FIREBASE_TOKEN_MISSING'));

            const response = await handler(stateEvent());

            expect(response.statusCode).toBe(200); // keeps the socket open
            expect(replies()[0]).toEqual({
                to: CONNECTION,
                payload: { action: 'error', data: { error: expect.stringMatching(/Authentication required/) } }
            });
            expect(mockSend).not.toHaveBeenCalled();
        });

        test('returns 400 for a non-JSON body', async () => {
            const response = await handler(makeEvent('not json'));

            expect(response.statusCode).toBe(400);
            expect(parseBody(response).error).toBe('Invalid JSON in request body');
        });

        test('returns 400 when data.userId is missing', async () => {
            const response = await handler(makeEvent({ action: 'getCurrentState', data: {} }));

            expect(response.statusCode).toBe(400);
            expect(parseBody(response).error).toBe('Missing userId in request');
        });

        test('returns 403 when asking for another user\'s state', async () => {
            const response = await handler(stateEvent('someone-else'));

            expect(response.statusCode).toBe(403);
            expect(parseBody(response).error).toMatch(/own state/);
            expect(mockSend).not.toHaveBeenCalled();
        });
    });

    describe('returning state', () => {
        test('sends a default state for a user with no metadata yet', async () => {
            const response = await handler(stateEvent());

            expect(response.statusCode).toBe(200);
            const [reply] = replies();
            expect(reply.to).toBe(CONNECTION);
            expect(reply.payload.action).toBe('currentState');
            expect(reply.payload.data).toMatchObject({
                userId: USER,
                connectionId: CONNECTION,
                chatId: null,
                ready: false,
                questionIndex: 0
            });
        });

        test('sends the stored state for a known user', async () => {
            seedDynamo({
                user: {
                    PK: `USER#${USER}`,
                    connectionId: 'conn-stored',
                    chatId: 'user-a#user-b',
                    ready: true,
                    questionIndex: 4,
                    lastSeen: '2026-01-01T00:00:00.000Z',
                    createdAt: '2025-12-01T00:00:00.000Z'
                }
            });

            const response = await handler(stateEvent());

            expect(response.statusCode).toBe(200);
            const [reply] = replies();
            expect(reply.payload.action).toBe('currentState');
            expect(reply.payload.data).toEqual({
                userId: USER,
                connectionId: 'conn-stored',
                chatId: 'user-a#user-b',
                ready: true,
                questionIndex: 4,
                lastSeen: '2026-01-01T00:00:00.000Z',
                createdAt: '2025-12-01T00:00:00.000Z'
            });
            const get = mockSend.mock.calls[0][0];
            expect(get).toMatchObject({ TableName: process.env.USER_METADATA_TABLE, Key: { PK: `USER#${USER}` } });
        });
    });

    describe('error handling', () => {
        test('replies with an error when the metadata lookup fails', async () => {
            mockSend.mockRejectedValue(new Error('DynamoDB unavailable'));

            const response = await handler(stateEvent());

            expect(response.statusCode).toBe(200);
            expect(replies()[0].payload).toEqual({ action: 'error', data: { error: 'Error retrieving user metadata' } });
        });
    });
});
