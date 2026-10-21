/**
 * Unit tests for the startConversation lambda (AWS SDK v3, fully mocked).
 *
 * Covers the connection-based auth wrapper, the matchmaking path (queueing,
 * claiming a match exactly once, create-once locking) and the direct path
 * (client-supplied otherUserId with existence / already-in-conversation guards).
 *
 * The lambda replies over the WebSocket and returns HTTP 200 for handled
 * outcomes, so most assertions are on the PostToConnection payloads and the
 * DynamoDB commands it issues.
 */
process.env.MATCHMAKING_QUEUE_TABLE = process.env.MATCHMAKING_QUEUE_TABLE || 'test-matchmaking-queue';

const mockSend = jest.fn();
const mockPost = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn(() => ({}))
}));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    // Every DocumentClient the lambda builds (module-level and per-request) must
    // share one send, otherwise routing set up in tests never reaches the handler.
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
    GetCommand: jest.fn((params) => ({ commandType: 'Get', ...params })),
    PutCommand: jest.fn((params) => ({ commandType: 'Put', ...params })),
    UpdateCommand: jest.fn((params) => ({ commandType: 'Update', ...params })),
    QueryCommand: jest.fn((params) => ({ commandType: 'Query', ...params })),
    DeleteCommand: jest.fn((params) => ({ commandType: 'Delete', ...params })),
    ScanCommand: jest.fn((params) => ({ commandType: 'Scan', ...params }))
}));
jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
    ApiGatewayManagementApiClient: jest.fn(() => ({ send: mockPost })),
    PostToConnectionCommand: jest.fn((params) => ({ commandType: 'PostToConnection', ...params }))
}));

const { handler } = require('../index');

const ME = 'user-m';
const OTHER = 'user-a'; // sorts before ME, so chatIds must come out as "user-a#user-m"
const USERS = process.env.USER_METADATA_TABLE;
const QUEUE = process.env.MATCHMAKING_QUEUE_TABLE;
const CONVERSATIONS = process.env.CONVERSATIONS_TABLE;
const EXPECTED_CHAT_ID = [ME, OTHER].sort().join('#');

const makeEvent = (data, connectionId = 'conn-m') => ({
    requestContext: { connectionId, requestId: 'req-1' },
    body: JSON.stringify({ action: 'startConversation', data })
});

const conflict = () => {
    const error = new Error('The conditional request failed');
    error.name = 'ConditionalCheckFailedException';
    return error;
};

// Route DynamoDB traffic by command type, table and key so each test declares its world.
function seedDynamo({
    authUser = { PK: `USER#${ME}`, userId: ME, email: 'm@example.test', connectionId: 'conn-m' },
    users = {},
    queue = {},
    candidates = [],
    claimConflict = false,
    createConflict = false
} = {}) {
    const usersById = { [ME]: { PK: `USER#${ME}`, userId: ME, connectionId: 'conn-m' }, ...users };
    mockSend.mockImplementation(async (cmd) => {
        switch (cmd.commandType) {
            case 'Scan':
                // The auth wrapper scans by connectionId; findMatch scans the queue.
                if ((cmd.FilterExpression || '').includes('connectionId')) return { Items: authUser ? [authUser] : [] };
                return { Items: candidates };
            case 'Get': {
                const id = cmd.Key.PK.replace('USER#', '');
                if (cmd.TableName === QUEUE) return { Item: queue[id] };
                if (cmd.TableName === USERS) return { Item: usersById[id] };
                return { Item: undefined };
            }
            case 'Delete':
                if (cmd.ConditionExpression && claimConflict) throw conflict();
                return {};
            case 'Put':
                if (cmd.TableName === CONVERSATIONS && createConflict) throw conflict();
                return {};
            default:
                return {};
        }
    });
}

const sentCommands = () => mockSend.mock.calls.map(([cmd]) => cmd);
const ofType = (type) => sentCommands().filter((c) => c.commandType === type);
const posts = () => mockPost.mock.calls.map(([cmd]) => ({ to: cmd.ConnectionId, payload: JSON.parse(cmd.Data) }));
const errorPosted = () => posts().find((p) => p.payload.action === 'error')?.payload.data.error;

describe('startConversation lambda', () => {
    beforeAll(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterAll(() => {
        console.log.mockRestore();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockPost.mockResolvedValue({});
        seedDynamo();
    });

    describe('connection-based authentication', () => {
        test('returns 401 when no user is registered for the connection', async () => {
            seedDynamo({ authUser: null });

            const response = await handler(makeEvent({}));

            expect(response.statusCode).toBe(401);
            expect(JSON.parse(response.body).data.error).toMatch(/not authenticated/i);
            expect(ofType('Put')).toHaveLength(0);
        });

        test('returns 500 when the event has no connectionId', async () => {
            const response = await handler({ requestContext: {}, body: JSON.stringify({ data: {} }) });

            expect(response.statusCode).toBe(500);
        });
    });

    describe('direct conversation (client-supplied otherUserId)', () => {
        test('rejects starting a conversation with yourself', async () => {
            const response = await handler(makeEvent({ otherUserId: ME }));

            expect(response.statusCode).toBe(200);
            expect(errorPosted()).toBe('Cannot start conversation with yourself');
            expect(ofType('Put')).toHaveLength(0);
        });

        test('rejects an otherUserId that does not exist', async () => {
            const response = await handler(makeEvent({ otherUserId: OTHER }));

            expect(response.statusCode).toBe(200);
            expect(errorPosted()).toBe('User not found');
            expect(ofType('Put')).toHaveLength(0);
        });

        test('rejects when either user is already in a conversation', async () => {
            seedDynamo({ users: { [OTHER]: { PK: `USER#${OTHER}`, userId: OTHER, chatId: 'someone#else' } } });

            const response = await handler(makeEvent({ otherUserId: OTHER }));

            expect(response.statusCode).toBe(200);
            expect(errorPosted()).toBe('User already in a conversation');
            expect(ofType('Put')).toHaveLength(0);
        });

        test('creates the conversation once, with a sorted chatId, and links both users', async () => {
            seedDynamo({ users: { [OTHER]: { PK: `USER#${OTHER}`, userId: OTHER } } });

            const response = await handler(makeEvent({ otherUserId: OTHER }));

            expect(response.statusCode).toBe(200);

            const [put] = ofType('Put');
            expect(put.TableName).toBe(CONVERSATIONS);
            expect(put.ConditionExpression).toBe('attribute_not_exists(PK)');
            expect(put.Item).toMatchObject({
                PK: `CHAT#${EXPECTED_CHAT_ID}`,
                chatId: EXPECTED_CHAT_ID,
                userAId: OTHER,
                userBId: ME,
                participants: [OTHER, ME],
                createdBy: ME
            });

            const updates = ofType('Update');
            expect(updates.map((u) => u.Key.PK).sort()).toEqual([`USER#${OTHER}`, `USER#${ME}`].sort());
            for (const update of updates) {
                expect(update.ExpressionAttributeValues[':chatId']).toBe(EXPECTED_CHAT_ID);
            }

            const started = posts().find((p) => p.payload.action === 'conversationStarted');
            expect(started.to).toBe('conn-m');
            expect(started.payload.data).toMatchObject({ chatId: EXPECTED_CHAT_ID, participants: [OTHER, ME] });
        });

        test('does not link users when the conversation already exists (create lock lost)', async () => {
            seedDynamo({ users: { [OTHER]: { PK: `USER#${OTHER}`, userId: OTHER } }, createConflict: true });

            const response = await handler(makeEvent({ otherUserId: OTHER }));

            expect(response.statusCode).toBe(200);
            expect(errorPosted()).toBe('User already in a conversation');
            expect(ofType('Update')).toHaveLength(0);
        });
    });

    describe('matchmaking (no otherUserId)', () => {
        test('rejects a user who is already in a conversation', async () => {
            seedDynamo({ users: { [ME]: { PK: `USER#${ME}`, userId: ME, chatId: 'existing#chat' } } });

            const response = await handler(makeEvent({}));

            expect(response.statusCode).toBe(200);
            expect(errorPosted()).toBe('User already in a conversation');
            expect(ofType('Put')).toHaveLength(0);
        });

        test('queues the user when nobody is waiting', async () => {
            const response = await handler(makeEvent({}));

            expect(response.statusCode).toBe(200);
            const [queueEntry] = ofType('Put');
            expect(queueEntry.TableName).toBe(QUEUE);
            expect(queueEntry.Item).toMatchObject({ PK: `USER#${ME}`, userId: ME, status: 'waiting' });

            const readyUpdate = ofType('Update').find((u) => u.Key.PK === `USER#${ME}`);
            expect(readyUpdate.ExpressionAttributeValues[':ready']).toBe(true);

            const started = posts().find((p) => p.payload.action === 'conversationStarted');
            expect(started.payload.data).toMatchObject({ queued: true, message: 'Added to matchmaking queue' });
        });

        test('acknowledges a user who is already waiting without re-queueing them', async () => {
            seedDynamo({ queue: { [ME]: { PK: `USER#${ME}`, userId: ME, status: 'waiting' } } });

            const response = await handler(makeEvent({}));

            expect(response.statusCode).toBe(200);
            expect(ofType('Put')).toHaveLength(0);
            const started = posts().find((p) => p.payload.action === 'conversationStarted');
            expect(started.payload.data).toMatchObject({ queued: true, message: 'Still waiting in matchmaking queue' });
        });

        test('matches a waiting user: claims their queue entry, creates once, links and notifies both', async () => {
            seedDynamo({
                candidates: [{ PK: `USER#${OTHER}`, userId: OTHER, status: 'waiting' }],
                users: { [OTHER]: { PK: `USER#${OTHER}`, userId: OTHER, ready: true, connectionId: 'conn-a' } }
            });

            const response = await handler(makeEvent({}));

            expect(response.statusCode).toBe(200);

            // The matched user's queue entry is claimed exactly once (conditional delete)...
            const claim = ofType('Delete').find((d) => d.Key.PK === `USER#${OTHER}`);
            expect(claim.ConditionExpression).toBe('attribute_exists(PK)');
            // ...the conversation is created with a create-once lock...
            const [put] = ofType('Put').filter((p) => p.TableName === CONVERSATIONS);
            expect(put.ConditionExpression).toBe('attribute_not_exists(PK)');
            expect(put.Item).toMatchObject({ chatId: EXPECTED_CHAT_ID, participants: [OTHER, ME] });
            // ...both users are linked and the matcher leaves the queue.
            expect(ofType('Update').map((u) => u.Key.PK).sort()).toEqual([`USER#${OTHER}`, `USER#${ME}`].sort());
            expect(ofType('Delete').some((d) => d.Key.PK === `USER#${ME}`)).toBe(true);

            const notified = posts().filter((p) => p.payload.action === 'conversationStarted' && p.payload.data.matched);
            expect(notified.map((p) => p.to)).toEqual(expect.arrayContaining(['conn-a', 'conn-m']));
            for (const n of notified) {
                expect(n.payload.data.chatId).toBe(EXPECTED_CHAT_ID);
            }
        });

        test('backs off when another request already claimed the matched user', async () => {
            seedDynamo({
                candidates: [{ PK: `USER#${OTHER}`, userId: OTHER, status: 'waiting' }],
                users: { [OTHER]: { PK: `USER#${OTHER}`, userId: OTHER, ready: true } },
                claimConflict: true
            });

            const response = await handler(makeEvent({}));

            expect(response.statusCode).toBe(200);
            expect(ofType('Put').filter((p) => p.TableName === CONVERSATIONS)).toHaveLength(0);
            expect(ofType('Update')).toHaveLength(0);
        });

        test('backs off when the other matched request already created the conversation', async () => {
            seedDynamo({
                candidates: [{ PK: `USER#${OTHER}`, userId: OTHER, status: 'waiting' }],
                users: { [OTHER]: { PK: `USER#${OTHER}`, userId: OTHER, ready: true } },
                createConflict: true
            });

            const response = await handler(makeEvent({}));

            expect(response.statusCode).toBe(200);
            expect(ofType('Update')).toHaveLength(0);
        });

        test('cleans up a stale queue entry whose user is no longer ready, then queues the caller', async () => {
            seedDynamo({
                candidates: [{ PK: `USER#${OTHER}`, userId: OTHER, status: 'waiting' }],
                users: { [OTHER]: { PK: `USER#${OTHER}`, userId: OTHER, ready: false } }
            });

            const response = await handler(makeEvent({}));

            expect(response.statusCode).toBe(200);
            const cleanup = ofType('Delete').find((d) => d.Key.PK === `USER#${OTHER}`);
            expect(cleanup).toBeDefined();
            expect(cleanup.ConditionExpression).toBeUndefined();
            expect(ofType('Put').some((p) => p.TableName === QUEUE && p.Item.PK === `USER#${ME}`)).toBe(true);
        });
    });
});
