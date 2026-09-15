/**
 * Unit tests for the endConversation lambda (AWS SDK v3, fully mocked).
 *
 * Covers the exported auth wrapper (template.yaml expects index.handler),
 * participant authorization, and the state-clearing that lets ended users be
 * matched again. Replaces the old aws-sdk-mock (SDK v2) suite, which could not
 * intercept the v3 clients this lambda uses.
 */
const mockSend = jest.fn();
const mockPostToConnection = jest.fn();
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
    ApiGatewayManagementApiClient: jest.fn(() => ({ send: mockPostToConnection })),
    PostToConnectionCommand: jest.fn((params) => ({ commandType: 'PostToConnection', ...params }))
}));
jest.mock('../../shared/auth', () => ({
    authenticateWebSocketEvent: mockAuthenticate
}));

const { handler } = require('../index');

const USER_A = 'user-a';
const USER_B = 'user-b';
const CHAT_ID = `${USER_A}#${USER_B}`;

const makeEvent = (body) => ({
    requestContext: { connectionId: 'conn-a', requestId: 'req-1' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
});

const conversationItem = (overrides = {}) => ({
    PK: `CHAT#${CHAT_ID}`,
    chatId: CHAT_ID,
    userAId: USER_A,
    userBId: USER_B,
    participants: [USER_A, USER_B],
    ...overrides
});

// Route DynamoDB reads by command type + table so each test declares its world.
function seedDynamo({ conversation, otherUser } = {}) {
    mockSend.mockImplementation(async (cmd) => {
        if (cmd.commandType === 'Get' && cmd.TableName === process.env.CONVERSATIONS_TABLE) {
            return { Item: conversation };
        }
        if (cmd.commandType === 'Get' && cmd.TableName === process.env.USER_METADATA_TABLE) {
            return { Item: otherUser };
        }
        return {};
    });
}

const sentCommands = () => mockSend.mock.calls.map(([cmd]) => cmd);
const parseBody = (response) => JSON.parse(response.body);

describe('endConversation lambda', () => {
    beforeAll(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterAll(() => {
        console.log.mockRestore();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthenticate.mockResolvedValue({ userId: USER_A, email: 'a@example.test' });
        mockPostToConnection.mockResolvedValue({});
        seedDynamo({ conversation: conversationItem(), otherUser: { PK: `USER#${USER_B}`, connectionId: 'conn-b' } });
    });

    test('exports a handler function (template.yaml points at index.handler)', () => {
        expect(typeof handler).toBe('function');
    });

    describe('authentication wrapper', () => {
        test('returns 401 when the Firebase token is missing', async () => {
            mockAuthenticate.mockRejectedValue(new Error('FIREBASE_TOKEN_MISSING'));

            const response = await handler(makeEvent({ action: 'endConversation', chatId: CHAT_ID }));

            expect(response.statusCode).toBe(401);
            expect(parseBody(response).error).toMatch(/Authentication required/);
            expect(mockSend).not.toHaveBeenCalled();
        });

        test('returns 401 when the Firebase token is invalid', async () => {
            mockAuthenticate.mockRejectedValue(new Error('FIREBASE_TOKEN_INVALID'));

            const response = await handler(makeEvent({ action: 'endConversation', chatId: CHAT_ID }));

            expect(response.statusCode).toBe(401);
            expect(parseBody(response).error).toMatch(/Invalid or expired/);
        });

        test('returns 500 on an unexpected authentication failure', async () => {
            mockAuthenticate.mockRejectedValue(new Error('boom'));

            const response = await handler(makeEvent({ action: 'endConversation', chatId: CHAT_ID }));

            expect(response.statusCode).toBe(500);
        });
    });

    describe('request validation', () => {
        test('returns 400 for a non-JSON body', async () => {
            const response = await handler(makeEvent('not json'));

            expect(response.statusCode).toBe(400);
            expect(parseBody(response).error).toMatch(/Invalid JSON/);
        });

        test('returns 400 when chatId is missing', async () => {
            const response = await handler(makeEvent({ action: 'endConversation' }));

            expect(response.statusCode).toBe(400);
            expect(parseBody(response).data.error).toBe('Missing chatId');
        });
    });

    describe('authorization', () => {
        test('returns 404 when the conversation does not exist', async () => {
            seedDynamo({ conversation: undefined });

            const response = await handler(makeEvent({ action: 'endConversation', chatId: CHAT_ID }));

            expect(response.statusCode).toBe(404);
            expect(parseBody(response).data.error).toBe('Conversation not found');
        });

        test('returns 403 when the caller is not a participant', async () => {
            seedDynamo({ conversation: conversationItem({ userAId: 'someone-else', userBId: 'another' }) });

            const response = await handler(makeEvent({ action: 'endConversation', chatId: CHAT_ID }));

            expect(response.statusCode).toBe(403);
            expect(parseBody(response).data.error).toMatch(/not participant/);
            // Nothing may be written when authorization fails.
            expect(sentCommands().filter((c) => c.commandType === 'Update')).toHaveLength(0);
        });
    });

    describe('ending a conversation', () => {
        test('marks the conversation ended with the caller as endedBy', async () => {
            const response = await handler(makeEvent({ action: 'endConversation', chatId: CHAT_ID, reason: 'done' }));

            expect(response.statusCode).toBe(200);
            const conversationUpdate = sentCommands().find(
                (c) => c.commandType === 'Update' && c.TableName === process.env.CONVERSATIONS_TABLE
            );
            expect(conversationUpdate).toBeDefined();
            expect(conversationUpdate.Key).toEqual({ PK: `CHAT#${CHAT_ID}` });
            expect(conversationUpdate.UpdateExpression).toMatch(/endedBy/);
            expect(conversationUpdate.ExpressionAttributeValues[':endedBy']).toBe(USER_A);
            expect(conversationUpdate.ExpressionAttributeValues[':endReason']).toBe('done');
        });

        test('clears both participants\' conversation state so they can be rematched', async () => {
            await handler(makeEvent({ action: 'endConversation', chatId: CHAT_ID }));

            const userUpdates = sentCommands().filter(
                (c) => c.commandType === 'Update' && c.TableName === process.env.USER_METADATA_TABLE
            );
            expect(userUpdates.map((c) => c.Key.PK).sort()).toEqual([`USER#${USER_A}`, `USER#${USER_B}`]);
            for (const update of userUpdates) {
                expect(update.UpdateExpression).toMatch(/REMOVE chatId/);
                expect(update.UpdateExpression).toMatch(/questionIndex/);
                expect(update.ExpressionAttributeValues[':notReady']).toBe(false);
            }
        });

        test('notifies the other participant when they are connected', async () => {
            const response = await handler(makeEvent({ action: 'endConversation', chatId: CHAT_ID }));

            expect(mockPostToConnection).toHaveBeenCalledTimes(1);
            const [notification] = mockPostToConnection.mock.calls[0];
            expect(notification.ConnectionId).toBe('conn-b');
            const payload = JSON.parse(notification.Data);
            expect(payload.action).toBe('conversationEnded');
            expect(payload.data).toMatchObject({ chatId: CHAT_ID, endedBy: USER_A });

            const body = parseBody(response);
            expect(body.action).toBe('conversationEnded');
            expect(body.data).toMatchObject({ chatId: CHAT_ID, endedBy: USER_A });
        });

        test('skips the notification when the other participant is offline', async () => {
            seedDynamo({ conversation: conversationItem(), otherUser: { PK: `USER#${USER_B}` } });

            const response = await handler(makeEvent({ action: 'endConversation', chatId: CHAT_ID }));

            expect(response.statusCode).toBe(200);
            expect(mockPostToConnection).not.toHaveBeenCalled();
        });

        test('still succeeds when notifying the other participant fails', async () => {
            mockPostToConnection.mockRejectedValue(new Error('GoneException'));

            const response = await handler(makeEvent({ action: 'endConversation', chatId: CHAT_ID }));

            expect(response.statusCode).toBe(200);
        });

        test('returns 500 when DynamoDB fails', async () => {
            mockSend.mockRejectedValue(new Error('DynamoDB unavailable'));

            const response = await handler(makeEvent({ action: 'endConversation', chatId: CHAT_ID }));

            expect(response.statusCode).toBe(500);
            expect(parseBody(response).data.error).toBe('Internal server error');
        });
    });
});
