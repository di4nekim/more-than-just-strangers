/**
 * Unit tests for the updatePresence lambda (AWS SDK v3, fully mocked).
 *
 * Locks in the response fix from the audit (a real numeric 200 with a shaped
 * body) alongside validation, participant authorization and the presence
 * notification to the other participant.
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
    UpdateCommand: jest.fn((params) => ({ commandType: 'Update', ...params }))
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

const makeEvent = (data) => ({
    requestContext: { connectionId: 'conn-a', requestId: 'req-1' },
    body: JSON.stringify({ action: 'updatePresence', data })
});
const presenceEvent = (status = 'online', chatId = CHAT_ID) => makeEvent({ chatId, status });

function seedDynamo({
    conversation = { PK: `CHAT#${CHAT_ID}`, userAId: ME, userBId: OTHER },
    other = { PK: `USER#${OTHER}`, connectionId: 'conn-b' },
    updateError = null
} = {}) {
    mockSend.mockImplementation(async (cmd) => {
        if (cmd.commandType === 'Get') {
            if (cmd.Key.PK === `CHAT#${CHAT_ID}`) return { Item: conversation };
            if (cmd.Key.PK === `USER#${OTHER}`) return { Item: other };
            return { Item: undefined };
        }
        if (cmd.commandType === 'Update') {
            if (updateError) throw updateError;
            return {};
        }
        return {};
    });
}

const sentCommands = () => mockSend.mock.calls.map(([cmd]) => cmd);
const posts = () => mockPost.mock.calls.map(([cmd]) => ({ to: cmd.ConnectionId, payload: JSON.parse(cmd.Data) }));
const parseBody = (response) => JSON.parse(response.body);

describe('updatePresence lambda', () => {
    // console.warn/error are already stubbed per test by jest.setup; only log needs silencing.
    let logSpy;
    beforeAll(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterAll(() => {
        logSpy.mockRestore();
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

            const response = await handler(presenceEvent());

            expect(response.statusCode).toBe(401);
            expect(mockSend).not.toHaveBeenCalled();
        });

        test('returns 400 when chatId or status is missing', async () => {
            const response = await handler(makeEvent({ chatId: CHAT_ID }));

            expect(response.statusCode).toBe(400);
            expect(parseBody(response).error).toMatch(/chatId and status/);
        });

        test('returns 400 for a status outside online/offline/away', async () => {
            const response = await handler(presenceEvent('invisible'));

            expect(response.statusCode).toBe(400);
            expect(parseBody(response).error).toMatch(/Invalid status/);
            expect(mockSend).not.toHaveBeenCalled();
        });
    });

    describe('authorization', () => {
        test('returns 404 when the conversation does not exist', async () => {
            seedDynamo({ conversation: null }); // undefined would select the default; null means "no item"

            const response = await handler(presenceEvent());

            expect(response.statusCode).toBe(404);
            expect(parseBody(response).error).toBe('Conversation not found');
        });

        test('returns 403 when the caller is not a participant', async () => {
            seedDynamo({ conversation: { PK: `CHAT#${CHAT_ID}`, userAId: 'x', userBId: 'y' } });

            const response = await handler(presenceEvent());

            expect(response.statusCode).toBe(403);
            expect(sentCommands().filter((c) => c.commandType === 'Update')).toHaveLength(0);
            expect(mockPost).not.toHaveBeenCalled();
        });
    });

    describe('updating presence', () => {
        test('stores the status and returns a real 200 with a shaped body', async () => {
            const response = await handler(presenceEvent('away'));

            expect(response.statusCode).toBe(200);
            const body = parseBody(response);
            expect(body.success).toBe(true);
            expect(body.action).toBe('updatePresence');
            expect(body.data).toMatchObject({ userId: ME, status: 'away' });
            expect(typeof body.data.timestamp).toBe('string');

            const [update] = sentCommands().filter((c) => c.commandType === 'Update');
            expect(update).toMatchObject({
                TableName: process.env.USER_METADATA_TABLE,
                Key: { PK: `USER#${ME}` },
                ExpressionAttributeValues: expect.objectContaining({ ':presence': 'away' })
            });
        });

        test('notifies the other participant when they are connected', async () => {
            await handler(presenceEvent('online'));

            const [notification] = posts();
            expect(notification.to).toBe('conn-b');
            expect(notification.payload.action).toBe('presenceUpdated');
            expect(notification.payload.data).toMatchObject({ userId: ME, status: 'online' });
        });

        test('skips the notification when the other participant is offline', async () => {
            seedDynamo({ other: { PK: `USER#${OTHER}` } });

            const response = await handler(presenceEvent('online'));

            expect(response.statusCode).toBe(200);
            expect(mockPost).not.toHaveBeenCalled();
        });

        test('still succeeds when the other participant\'s connection is stale', async () => {
            const gone = new Error('Gone');
            gone.name = 'GoneException';
            mockPost.mockRejectedValue(gone);

            const response = await handler(presenceEvent('online'));

            expect(response.statusCode).toBe(200);
        });

        test('returns 500 when the presence write fails', async () => {
            seedDynamo({ updateError: new Error('DynamoDB unavailable') });

            const response = await handler(presenceEvent('online'));

            expect(response.statusCode).toBe(500);
            expect(parseBody(response).error).toBe('Internal server error');
            expect(mockPost).not.toHaveBeenCalled();
        });
    });
});
