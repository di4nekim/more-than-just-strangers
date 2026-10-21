/**
 * Unit tests for the setReady lambda (AWS SDK v3, fully mocked).
 *
 * Covers validation, ready-state persistence, the readyStatusUpdated echo, and
 * the atomic both-ready question advance — including the concurrent-advance
 * guard that stops two near-simultaneous ready toggles from skipping a question.
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
    PutCommand: jest.fn((params) => ({ commandType: 'Put', ...params })),
    UpdateCommand: jest.fn((params) => ({ commandType: 'Update', ...params })),
    DeleteCommand: jest.fn((params) => ({ commandType: 'Delete', ...params })),
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
const QUESTION = 3;

const makeEvent = (body) => ({
    requestContext: { connectionId: 'conn-a', requestId: 'req-1' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
});
const readyEvent = (ready) => makeEvent({ action: 'setReady', data: { ready } });

// Route DynamoDB traffic by command type and key so each test declares its world.
function seedDynamo({
    me = { PK: `USER#${ME}`, connectionId: 'conn-a', chatId: CHAT_ID, questionIndex: QUESTION },
    other = { PK: `USER#${OTHER}`, connectionId: 'conn-b', ready: true, questionIndex: QUESTION },
    conversation = { PK: `CHAT#${CHAT_ID}`, userAId: ME, userBId: OTHER },
    advanceConflict = false
} = {}) {
    mockSend.mockImplementation(async (cmd) => {
        if (cmd.commandType === 'Get') {
            if (cmd.Key.PK === `USER#${ME}`) return { Item: me };
            if (cmd.Key.PK === `USER#${OTHER}`) return { Item: other };
            if (cmd.Key.PK === `CHAT#${CHAT_ID}`) return { Item: conversation };
            return { Item: undefined };
        }
        if (cmd.commandType === 'Update' && cmd.ConditionExpression && cmd.Key.PK === `USER#${ME}` && advanceConflict) {
            // Simulates the other invocation having already advanced this question.
            const conflict = new Error('The conditional request failed');
            conflict.name = 'ConditionalCheckFailedException';
            throw conflict;
        }
        return {};
    });
}

const sentCommands = () => mockSend.mock.calls.map(([cmd]) => cmd);
const advanceUpdates = () => sentCommands().filter((c) => c.commandType === 'Update' && c.ConditionExpression);
const posts = () => mockPost.mock.calls.map(([cmd]) => ({ to: cmd.ConnectionId, payload: JSON.parse(cmd.Data) }));
const parseBody = (response) => JSON.parse(response.body);

describe('setReady lambda', () => {
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

    describe('authentication and validation', () => {
        test('returns 401 when the Firebase token is missing', async () => {
            mockAuthenticate.mockRejectedValue(new Error('FIREBASE_TOKEN_MISSING'));

            const response = await handler(readyEvent(true));

            expect(response.statusCode).toBe(401);
            expect(mockSend).not.toHaveBeenCalled();
        });

        test('returns 400 for a non-JSON body', async () => {
            const response = await handler(makeEvent('not json'));

            expect(response.statusCode).toBe(400);
            expect(parseBody(response).error).toBe('Invalid JSON in request body');
        });

        test('returns 400 when ready is not a boolean', async () => {
            const response = await handler(makeEvent({ action: 'setReady', data: { ready: 'yes' } }));

            expect(response.statusCode).toBe(400);
            expect(parseBody(response).error).toMatch(/Must be a boolean/);
            expect(mockSend).not.toHaveBeenCalled();
        });
    });

    describe('persisting ready state', () => {
        test('creates a metadata record for a user that has none', async () => {
            seedDynamo({ me: null });

            const response = await handler(readyEvent(true));

            expect(response.statusCode).toBe(200);
            const put = sentCommands().find((c) => c.commandType === 'Put');
            expect(put).toBeDefined();
            expect(put.TableName).toBe(process.env.USER_METADATA_TABLE);
            expect(put.Item).toMatchObject({ PK: `USER#${ME}`, ready: true, questionIndex: 1 });
        });

        test('updates ready for an existing user and echoes readyStatusUpdated to them', async () => {
            seedDynamo({ me: { PK: `USER#${ME}`, connectionId: 'conn-a' } });

            const response = await handler(readyEvent(true));

            expect(response.statusCode).toBe(200);
            const update = sentCommands().find((c) => c.commandType === 'Update' && c.Key.PK === `USER#${ME}` && !c.ConditionExpression);
            expect(update).toBeDefined();
            expect(update.UpdateExpression).toMatch(/SET ready = :ready/);
            expect(update.ExpressionAttributeValues[':ready']).toBe(true);

            const echo = posts().find((p) => p.to === 'conn-a' && p.payload.action === 'readyStatusUpdated');
            expect(echo).toBeDefined();
            expect(echo.payload.data).toMatchObject({ userId: ME, ready: true });

            const body = parseBody(response);
            expect(body.success).toBe(true);
            expect(body.data.action).toBe('readyStatusUpdated');
            expect(body.data.data).toMatchObject({ userId: ME, ready: true });
        });

        test('removes the user from the matchmaking queue when they set ready to false', async () => {
            const response = await handler(readyEvent(false));

            expect(response.statusCode).toBe(200);
            const queueDelete = sentCommands().find((c) => c.commandType === 'Delete');
            expect(queueDelete).toBeDefined();
            expect(queueDelete.Key).toEqual({ PK: `USER#${ME}` });
            expect(advanceUpdates()).toHaveLength(0);
        });
    });

    describe('advancing the question', () => {
        test('waits when the other participant is not ready yet', async () => {
            seedDynamo({ other: { PK: `USER#${OTHER}`, connectionId: 'conn-b', ready: false } });

            const response = await handler(readyEvent(true));

            expect(response.statusCode).toBe(200);
            expect(advanceUpdates()).toHaveLength(0);
            expect(posts().filter((p) => p.payload.action === 'advanceQuestion')).toHaveLength(0);
        });

        test('advances both participants atomically and notifies them when both are ready', async () => {
            const response = await handler(readyEvent(true));

            expect(response.statusCode).toBe(200);

            const updates = advanceUpdates();
            expect(updates.map((u) => u.Key.PK).sort()).toEqual([`USER#${ME}`, `USER#${OTHER}`]);
            for (const update of updates) {
                expect(update.UpdateExpression).toMatch(/ADD questionIndex :one/);
                expect(update.ConditionExpression).toBe('questionIndex = :currentIndex');
                expect(update.ExpressionAttributeValues).toMatchObject({ ':one': 1, ':currentIndex': QUESTION, ':ready': false });
            }

            const advances = posts().filter((p) => p.payload.action === 'advanceQuestion');
            expect(advances.map((p) => p.to).sort()).toEqual(['conn-a', 'conn-b']);
            for (const advance of advances) {
                expect(advance.payload.data).toEqual({ questionIndex: QUESTION + 1, ready: false });
            }
        });

        test('does not double-advance when a concurrent toggle already moved the question', async () => {
            seedDynamo({ advanceConflict: true });

            const response = await handler(readyEvent(true));

            expect(response.statusCode).toBe(200);
            // The guarded update for the current user was attempted and rejected...
            expect(advanceUpdates().filter((u) => u.Key.PK === `USER#${ME}`)).toHaveLength(1);
            // ...so the other participant is not advanced again and nobody is re-notified.
            expect(advanceUpdates().filter((u) => u.Key.PK === `USER#${OTHER}`)).toHaveLength(0);
            expect(posts().filter((p) => p.payload.action === 'advanceQuestion')).toHaveLength(0);
        });
    });

    describe('error handling', () => {
        test('returns an error response when the user lookup fails', async () => {
            mockSend.mockRejectedValue(new Error('DynamoDB unavailable'));

            const response = await handler(readyEvent(true));

            expect(response.statusCode).toBeGreaterThanOrEqual(500);
            expect(mockPost).not.toHaveBeenCalled();
        });
    });
});
