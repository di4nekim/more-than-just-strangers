/**
 * Unit tests for the sendMessage lambda (AWS SDK v3, fully mocked).
 *
 * Covers the auth wrapper, participant authorization (a sender may only post
 * into a conversation they belong to), the duplicate-messageId guard, and the
 * store -> deliver -> confirm happy path. Replaces the old aws-sdk (v2) mocked
 * suite, whose mocks could never intercept the v3 clients this lambda uses.
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

const SENDER = 'user-a';
const RECEIVER = 'user-b';
const CHAT_ID = `${SENDER}#${RECEIVER}`;
const MESSAGE = {
    chatId: CHAT_ID,
    messageId: 'msg-1',
    content: 'hello there',
    sentAt: '2026-01-01T00:00:00.000Z'
};

const makeEvent = (body) => ({
    requestContext: { connectionId: 'conn-a', requestId: 'req-1' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
});
const sendMessageEvent = (data = MESSAGE) => makeEvent({ action: 'sendMessage', data });

const conversationItem = (overrides = {}) => ({
    PK: `CHAT#${CHAT_ID}`,
    chatId: CHAT_ID,
    userAId: SENDER,
    userBId: RECEIVER,
    participants: [SENDER, RECEIVER],
    ...overrides
});

// Route DynamoDB traffic by command type (and key) so each test declares its world.
function seedDynamo({
    conversation = conversationItem(),
    sender = { PK: `USER#${SENDER}`, connectionId: 'conn-a' },
    receiver = { PK: `USER#${RECEIVER}`, connectionId: 'conn-b' },
    putError = null
} = {}) {
    mockSend.mockImplementation(async (cmd) => {
        if (cmd.commandType === 'Get') {
            if (cmd.Key.PK === `USER#${SENDER}`) return { Item: sender };
            if (cmd.Key.PK === `USER#${RECEIVER}`) return { Item: receiver };
            return { Item: undefined };
        }
        if (cmd.commandType === 'Query') return { Items: conversation ? [conversation] : [] };
        if (cmd.commandType === 'Put' && putError) throw putError;
        return {};
    });
}

const sentCommands = () => mockSend.mock.calls.map(([cmd]) => cmd);
const posts = () => mockPost.mock.calls.map(([cmd]) => ({ to: cmd.ConnectionId, payload: JSON.parse(cmd.Data) }));
const parseBody = (response) => JSON.parse(response.body);

describe('sendMessage lambda', () => {
    beforeAll(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterAll(() => {
        console.log.mockRestore();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthenticate.mockResolvedValue({ userId: SENDER, email: 'a@example.test' });
        mockPost.mockResolvedValue({});
        seedDynamo();
    });

    describe('authentication wrapper', () => {
        test('returns 401 when the Firebase token is missing', async () => {
            mockAuthenticate.mockRejectedValue(new Error('FIREBASE_TOKEN_MISSING'));

            const response = await handler(sendMessageEvent());

            expect(response.statusCode).toBe(401);
            expect(parseBody(response).error).toMatch(/Authentication required/);
            expect(mockSend).not.toHaveBeenCalled();
        });

        test('returns 401 when the Firebase token is invalid', async () => {
            mockAuthenticate.mockRejectedValue(new Error('FIREBASE_TOKEN_INVALID'));

            const response = await handler(sendMessageEvent());

            expect(response.statusCode).toBe(401);
        });
    });

    describe('request validation', () => {
        test('returns 400 when the body is missing', async () => {
            const response = await handler({ requestContext: { connectionId: 'conn-a' } });

            expect(response.statusCode).toBe(400);
            expect(parseBody(response).error).toBe('Missing request body');
        });

        test('returns 400 for an unknown action', async () => {
            const response = await handler(makeEvent({ action: 'teleport', data: { x: 1 } }));

            expect(response.statusCode).toBe(400);
            expect(parseBody(response).error).toBe('Invalid action');
        });

        test('rejects a message with no content', async () => {
            const response = await handler(sendMessageEvent({ ...MESSAGE, content: '   ' }));

            expect(response.statusCode).toBe(400);
            expect(sentCommands().filter((c) => c.commandType === 'Put')).toHaveLength(0);
        });
    });

    describe('authorization', () => {
        test('returns 403 when the sender is not a participant of the conversation', async () => {
            seedDynamo({
                conversation: conversationItem({ userAId: 'someone', userBId: 'else', participants: ['someone', 'else'] })
            });

            const response = await handler(sendMessageEvent());

            expect(response.statusCode).toBe(403);
            expect(parseBody(response).error).toMatch(/Not a participant/);
            // Nothing may be stored or delivered for an unauthorized sender.
            expect(sentCommands().filter((c) => c.commandType === 'Put')).toHaveLength(0);
            expect(mockPost).not.toHaveBeenCalled();
        });

        test('returns 403 when the sender has no metadata record', async () => {
            seedDynamo({ sender: null });

            const response = await handler(sendMessageEvent());

            expect(response.statusCode).toBe(403);
            expect(parseBody(response).error).toBe('Sender not found');
        });

        test('returns 404 when the conversation does not exist', async () => {
            seedDynamo({ conversation: null });

            const response = await handler(sendMessageEvent());

            expect(response.statusCode).toBe(404);
            expect(parseBody(response).error).toBe('Conversation not found');
        });

        test('returns 404 when the receiver has no metadata record', async () => {
            seedDynamo({ receiver: null });

            const response = await handler(sendMessageEvent());

            expect(response.statusCode).toBe(404);
            expect(parseBody(response).error).toBe('Receiver not found');
        });
    });

    describe('sending a message', () => {
        test('stores the message under the conversation, guarded against overwrite', async () => {
            const response = await handler(sendMessageEvent());

            expect(response.statusCode).toBe(200);
            expect(parseBody(response)).toMatchObject({ success: true, action: 'sendMessage' });

            const put = sentCommands().find((c) => c.commandType === 'Put');
            expect(put).toBeDefined();
            expect(put.TableName).toBe(process.env.MESSAGES_TABLE);
            expect(put.Item).toMatchObject({
                PK: `CHAT#${CHAT_ID}`,
                SK: `MSG#${MESSAGE.messageId}`,
                senderId: SENDER,
                content: MESSAGE.content,
                queued: false
            });
            expect(put.ConditionExpression).toMatch(/attribute_not_exists\(SK\)/);
        });

        test('delivers to the online receiver and confirms to the sender', async () => {
            await handler(sendMessageEvent());

            const delivered = posts().find((p) => p.to === 'conn-b');
            expect(delivered).toBeDefined();
            expect(delivered.payload.action).toBe('message');
            expect(delivered.payload.data).toMatchObject({
                chatId: CHAT_ID,
                messageId: MESSAGE.messageId,
                senderId: SENDER,
                content: MESSAGE.content
            });

            const confirmation = posts().find((p) => p.to === 'conn-a');
            expect(confirmation).toBeDefined();
            expect(confirmation.payload.action).toBe('messageConfirmed');
            expect(confirmation.payload.messageId).toBe(MESSAGE.messageId);
        });

        test('updates the conversation with the last message', async () => {
            await handler(sendMessageEvent());

            const conversationUpdate = sentCommands().find(
                (c) => c.commandType === 'Update' && c.TableName === process.env.CONVERSATIONS_TABLE
            );
            expect(conversationUpdate).toBeDefined();
            expect(conversationUpdate.Key).toEqual({ PK: `CHAT#${CHAT_ID}` });
            expect(conversationUpdate.ExpressionAttributeValues[':lastMessage']).toMatchObject({ content: MESSAGE.content });
        });

        test('queues the message instead of delivering when the receiver is offline', async () => {
            seedDynamo({ receiver: { PK: `USER#${RECEIVER}` } });

            const response = await handler(sendMessageEvent());

            expect(response.statusCode).toBe(200);
            const put = sentCommands().find((c) => c.commandType === 'Put');
            expect(put.Item.queued).toBe(true);
            expect(posts().some((p) => p.to === 'conn-b')).toBe(false);
            // The sender is still told the message was accepted.
            expect(posts().some((p) => p.to === 'conn-a' && p.payload.action === 'messageConfirmed')).toBe(true);
        });

        test('returns 409 instead of overwriting when the messageId already exists', async () => {
            const conflict = new Error('The conditional request failed');
            conflict.name = 'ConditionalCheckFailedException';
            conflict.code = 'ConditionalCheckFailedException';
            seedDynamo({ putError: conflict });

            const response = await handler(sendMessageEvent());

            expect(response.statusCode).toBe(409);
            expect(parseBody(response).error).toMatch(/Duplicate messageId/);
            expect(mockPost).not.toHaveBeenCalled();
        });
    });
});
