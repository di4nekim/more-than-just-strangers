/**
 * Unit tests for the shared log-redaction helpers.
 * Guards against Firebase ID tokens leaking into CloudWatch in cleartext.
 */
const { redactEvent, redactBody, redactString } = require('../logging');

const FAKE_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.ZmFrZS1wYXlsb2Fk.fake-signature';
const REDACTED = '[REDACTED]';

describe('redactEvent', () => {
    it('redacts a token supplied as a query string parameter', () => {
        const event = {
            queryStringParameters: { token: FAKE_TOKEN, chatId: 'chat-1' },
            requestContext: { connectionId: 'conn-1' }
        };

        const redacted = redactEvent(event);

        expect(redacted.queryStringParameters.token).toBe(REDACTED);
        expect(redacted.queryStringParameters.chatId).toBe('chat-1');
        expect(JSON.stringify(redacted)).not.toContain(FAKE_TOKEN);
    });

    it('redacts the Authorization header in either casing', () => {
        const upper = redactEvent({ headers: { Authorization: `Bearer ${FAKE_TOKEN}`, 'Content-Type': 'application/json' } });
        const lower = redactEvent({ headers: { authorization: `Bearer ${FAKE_TOKEN}` } });

        expect(upper.headers.Authorization).toBe(REDACTED);
        expect(upper.headers['Content-Type']).toBe('application/json');
        expect(lower.headers.authorization).toBe(REDACTED);
        expect(JSON.stringify(upper)).not.toContain(FAKE_TOKEN);
        expect(JSON.stringify(lower)).not.toContain(FAKE_TOKEN);
    });

    it('redacts a token at the root of a JSON string body and re-stringifies it', () => {
        const event = {
            body: JSON.stringify({ action: 'setReady', token: FAKE_TOKEN, data: { chatId: 'chat-1' } })
        };

        const redacted = redactEvent(event);

        expect(typeof redacted.body).toBe('string');
        const parsed = JSON.parse(redacted.body);
        expect(parsed.token).toBe(REDACTED);
        expect(parsed.action).toBe('setReady');
        expect(parsed.data.chatId).toBe('chat-1');
        expect(redacted.body).not.toContain(FAKE_TOKEN);
    });

    it('redacts body.data.token', () => {
        const event = {
            body: JSON.stringify({ action: 'sendMessage', data: { token: FAKE_TOKEN, chatId: 'chat-2', message: 'hello' } })
        };

        const parsed = JSON.parse(redactEvent(event).body);

        expect(parsed.data.token).toBe(REDACTED);
        expect(parsed.data.chatId).toBe('chat-2');
        expect(parsed.data.message).toBe('hello');
    });

    it('redacts idToken and accessToken fields as well', () => {
        const event = {
            body: JSON.stringify({ idToken: FAKE_TOKEN, data: { accessToken: FAKE_TOKEN, userId: 'user-1' } })
        };

        const parsed = JSON.parse(redactEvent(event).body);

        expect(parsed.idToken).toBe(REDACTED);
        expect(parsed.data.accessToken).toBe(REDACTED);
        expect(parsed.data.userId).toBe('user-1');
    });

    it('masks token values in a body that is not valid JSON', () => {
        const event = { body: `not json at all "token":"${FAKE_TOKEN}" trailing` };

        const redacted = redactEvent(event);

        expect(redacted.body).not.toContain(FAKE_TOKEN);
        expect(redacted.body).toContain(`"token":"${REDACTED}"`);
        expect(redacted.body).toContain('not json at all');
    });

    it('masks token values in a form-encoded body', () => {
        const redacted = redactEvent({ body: `chatId=chat-1&token=${FAKE_TOKEN}&status=online` });

        expect(redacted.body).not.toContain(FAKE_TOKEN);
        expect(redacted.body).toContain('chatId=chat-1');
        expect(redacted.body).toContain(`token=${REDACTED}`);
        expect(redacted.body).toContain('status=online');
    });

    it('preserves non-secret fields and does not mutate the original event', () => {
        const event = {
            requestContext: { connectionId: 'conn-9', routeKey: 'setReady' },
            queryStringParameters: { token: FAKE_TOKEN },
            headers: { Authorization: FAKE_TOKEN },
            body: JSON.stringify({ action: 'setReady', token: FAKE_TOKEN, data: { chatId: 'chat-3' } }),
            isBase64Encoded: false
        };

        const redacted = redactEvent(event);

        expect(redacted.requestContext).toEqual({ connectionId: 'conn-9', routeKey: 'setReady' });
        expect(redacted.isBase64Encoded).toBe(false);

        // Original object untouched
        expect(event.queryStringParameters.token).toBe(FAKE_TOKEN);
        expect(event.headers.Authorization).toBe(FAKE_TOKEN);
        expect(JSON.parse(event.body).token).toBe(FAKE_TOKEN);
    });

    it('never throws on malformed or unusual input', () => {
        expect(() => redactEvent(null)).not.toThrow();
        expect(() => redactEvent(undefined)).not.toThrow();
        expect(() => redactEvent('a string event')).not.toThrow();

        const circular = { queryStringParameters: { token: FAKE_TOKEN } };
        circular.self = circular;
        expect(() => redactEvent(circular)).not.toThrow();
        expect(redactEvent(circular).queryStringParameters.token).toBe(REDACTED);
    });
});

describe('redactBody', () => {
    it('redacts tokens at the root and under data while keeping other fields', () => {
        const body = { action: 'updatePresence', token: FAKE_TOKEN, data: { token: FAKE_TOKEN, status: 'online' } };

        const redacted = redactBody(body);

        expect(redacted.token).toBe(REDACTED);
        expect(redacted.data.token).toBe(REDACTED);
        expect(redacted.data.status).toBe('online');
        expect(redacted.action).toBe('updatePresence');
        // Original untouched
        expect(body.token).toBe(FAKE_TOKEN);
    });

    it('handles null, undefined and primitive bodies without throwing', () => {
        expect(redactBody(null)).toBeNull();
        expect(redactBody(undefined)).toBeUndefined();
        expect(redactBody(42)).toBe(42);
    });

    it('redacts tokens inside arrays', () => {
        const redacted = redactBody({ items: [{ token: FAKE_TOKEN, id: 1 }] });

        expect(redacted.items[0].token).toBe(REDACTED);
        expect(redacted.items[0].id).toBe(1);
    });
});

describe('redactString', () => {
    it('masks JSON-style token values', () => {
        const masked = redactString(`{"token":"${FAKE_TOKEN}","chatId":"chat-1"}`);

        expect(masked).not.toContain(FAKE_TOKEN);
        expect(masked).toContain('"chatId":"chat-1"');
    });

    it('masks token values in a URL query string', () => {
        const masked = redactString(`wss://example.com/dev?token=${FAKE_TOKEN}&userId=user-1`);

        expect(masked).not.toContain(FAKE_TOKEN);
        expect(masked).toContain('userId=user-1');
        expect(masked).toContain('wss://example.com/dev?');
    });

    it('masks bearer tokens', () => {
        const masked = redactString(`Authorization header was Bearer ${FAKE_TOKEN}`);

        expect(masked).not.toContain(FAKE_TOKEN);
        expect(masked).toContain(`Bearer ${REDACTED}`);
    });

    it('leaves strings without secrets untouched and passes non-strings through', () => {
        expect(redactString('nothing secret here')).toBe('nothing secret here');
        expect(redactString(undefined)).toBeUndefined();
        expect(redactString(null)).toBeNull();
    });
});
