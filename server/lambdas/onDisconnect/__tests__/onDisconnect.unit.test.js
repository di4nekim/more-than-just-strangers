/**
 * Unit tests for the onDisconnect lambda ($disconnect route, AWS SDK v3 mocked).
 *
 * API Gateway $disconnect events carry no body, so the handler must resolve the
 * user from the connectionId (GSI first, Scan fallback) and clear the connection.
 * A body with data.userId is still honoured for callers that send one.
 */
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn(() => ({}))
}));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
    GetCommand: jest.fn((params) => ({ commandType: 'Get', ...params })),
    UpdateCommand: jest.fn((params) => ({ commandType: 'Update', ...params })),
    QueryCommand: jest.fn((params) => ({ commandType: 'Query', ...params })),
    ScanCommand: jest.fn((params) => ({ commandType: 'Scan', ...params }))
}));

const { handler } = require('../index');

const USER = 'user-a';
const CONNECTION = 'conn-a';

const disconnectEvent = (extra = {}) => ({
    requestContext: { connectionId: CONNECTION, requestId: 'req-1' },
    ...extra
});

// Route DynamoDB traffic by command type so each test declares its world.
function seedDynamo({ gsiMatch = [], gsiError = null, scanMatch = [], user = { PK: `USER#${USER}`, connectionId: CONNECTION }, updateError = null } = {}) {
    mockSend.mockImplementation(async (cmd) => {
        switch (cmd.commandType) {
            case 'Query':
                if (gsiError) throw gsiError;
                return { Items: gsiMatch };
            case 'Scan':
                return { Items: scanMatch };
            case 'Get':
                return { Item: user };
            case 'Update':
                if (updateError) throw updateError;
                return {};
            default:
                return {};
        }
    });
}

const sentCommands = () => mockSend.mock.calls.map(([cmd]) => cmd);
const ofType = (type) => sentCommands().filter((c) => c.commandType === type);
const parseBody = (response) => JSON.parse(response.body);

describe('onDisconnect lambda', () => {
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
        seedDynamo({ gsiMatch: [{ PK: `USER#${USER}`, connectionId: CONNECTION }] });
    });

    describe('validation', () => {
        test('returns 400 when the event has no connectionId', async () => {
            const response = await handler({ requestContext: {} });

            expect(response.statusCode).toBe(400);
            expect(parseBody(response).error).toBe('Missing connectionId');
            expect(mockSend).not.toHaveBeenCalled();
        });

        test('returns 400 when a body is present but is not JSON', async () => {
            const response = await handler(disconnectEvent({ body: 'not json' }));

            expect(response.statusCode).toBe(400);
            expect(parseBody(response).error).toBe('Invalid request body');
        });
    });

    describe('body-less $disconnect (the real API Gateway shape)', () => {
        test('resolves the user through the connectionId index and clears the connection', async () => {
            const response = await handler(disconnectEvent());

            expect(response.statusCode).toBe(200);
            expect(parseBody(response).data.message).toBe('Disconnected successfully');

            const [lookup] = ofType('Query');
            expect(lookup).toMatchObject({
                TableName: process.env.USER_METADATA_TABLE,
                IndexName: 'GSI_connectionId',
                ExpressionAttributeValues: { ':connectionId': CONNECTION }
            });

            const [update] = ofType('Update');
            expect(update.Key).toEqual({ PK: `USER#${USER}` });
            expect(update.UpdateExpression).toMatch(/REMOVE connectionId/);
            expect(update.ExpressionAttributeValues[':presence']).toBe('offline');
            expect(ofType('Scan')).toHaveLength(0);
        });

        test('falls back to a filtered Scan when the index is unavailable', async () => {
            seedDynamo({
                gsiError: new Error('ValidationException: index not found'),
                scanMatch: [{ PK: `USER#${USER}`, connectionId: CONNECTION }]
            });

            const response = await handler(disconnectEvent());

            expect(response.statusCode).toBe(200);
            const [scan] = ofType('Scan');
            expect(scan.FilterExpression).toBe('connectionId = :connectionId');
            expect(ofType('Update')).toHaveLength(1);
        });

        test('acknowledges an unknown connection without writing anything', async () => {
            seedDynamo({ gsiMatch: [] });

            const response = await handler(disconnectEvent());

            expect(response.statusCode).toBe(200);
            expect(parseBody(response).data.message).toBe('No matching connection to disconnect');
            expect(ofType('Update')).toHaveLength(0);
        });
    });

    describe('body-driven disconnect (legacy callers)', () => {
        const withUser = (userId) => disconnectEvent({ body: JSON.stringify({ action: 'disconnect', data: { userId } }) });

        test('clears the connection for the user named in the body without a lookup', async () => {
            const response = await handler(withUser(USER));

            expect(response.statusCode).toBe(200);
            expect(ofType('Query')).toHaveLength(0);
            expect(ofType('Update')[0].Key).toEqual({ PK: `USER#${USER}` });
        });

        test('returns 404 when the named user does not exist', async () => {
            seedDynamo({ user: null }); // undefined would select the default; null means "no item"

            const response = await handler(withUser('ghost'));

            expect(response.statusCode).toBe(404);
            expect(parseBody(response).error).toBe('User not found');
            expect(ofType('Update')).toHaveLength(0);
        });
    });

    describe('error handling', () => {
        test('returns an error response when the metadata update fails', async () => {
            seedDynamo({ gsiMatch: [{ PK: `USER#${USER}` }], updateError: new Error('DynamoDB unavailable') });

            const response = await handler(disconnectEvent());

            expect(response.statusCode).toBeGreaterThanOrEqual(400);
            expect(parseBody(response).error).toBeDefined();
        });
    });
});
