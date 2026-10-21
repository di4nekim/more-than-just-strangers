/**
 * Shared logging redaction utilities for lambda functions.
 *
 * Lambda handlers log the incoming event (and sometimes the parsed body) to
 * CloudWatch for debugging. Those payloads carry Firebase ID tokens
 * (queryStringParameters.token, body.token, body.data.token, the
 * Authorization header), which must never be written in cleartext.
 *
 * Every export here is defensive: redaction must never throw and must never
 * take down a handler. On any internal failure a safe placeholder is returned
 * instead of the original value.
 */

const REDACTED = '[REDACTED]';
const REDACTED_EVENT = '[REDACTED_EVENT]';
const REDACTED_BODY = '[REDACTED_BODY]';

// Maximum object depth walked while redacting. Guards against pathological or
// deeply nested payloads.
const MAX_DEPTH = 12;

// Keys whose values are treated as secrets, compared case-insensitively with
// separators removed (so `id_token`, `idToken` and `ID-TOKEN` all match).
const SECRET_KEYS = new Set([
    'token',
    'idtoken',
    'accesstoken',
    'refreshtoken',
    'authtoken',
    'authorization',
    'bearertoken'
]);

// "token":"…" / "idToken": "…" style values inside an arbitrary string.
const JSON_SECRET_PATTERN =
    /("(?:id[_-]?token|access[_-]?token|refresh[_-]?token|auth[_-]?token|bearer[_-]?token|authorization|token)"\s*:\s*)(?:"(?:[^"\\]|\\.)*"|null|true|false|-?\d+(?:\.\d+)?)/gi;

// token=… style values inside a query string or URL.
const QUERY_SECRET_PATTERN =
    /\b((?:id[_-]?token|access[_-]?token|refresh[_-]?token|auth[_-]?token|authorization|token)=)[^&\s"'#]+/gi;

// Bare `Bearer <jwt>` occurrences.
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;

/**
 * Normalize a key for secret matching.
 * @param {string} key
 * @returns {string} lowercased key with separators stripped
 */
const normalizeKey = (key) => String(key).replace(/[\s_-]/g, '').toLowerCase();

/**
 * Whether a given object key holds a secret value.
 * @param {string} key
 * @returns {boolean}
 */
const isSecretKey = (key) => SECRET_KEYS.has(normalizeKey(key));

/**
 * Mask secret-looking substrings inside an arbitrary string.
 * Used for non-JSON bodies and free-form strings (URLs, query strings).
 * @param {*} value - Value to redact (non-strings are returned untouched)
 * @returns {*} Redacted string, or a placeholder if redaction failed
 */
const redactString = (value) => {
    try {
        if (typeof value !== 'string') {
            return value;
        }
        return value
            .replace(JSON_SECRET_PATTERN, `$1"${REDACTED}"`)
            .replace(QUERY_SECRET_PATTERN, `$1${REDACTED}`)
            .replace(BEARER_PATTERN, `Bearer ${REDACTED}`);
    } catch (error) {
        return REDACTED;
    }
};

/**
 * Recursively copy a value, replacing secret-keyed fields with a placeholder.
 * Returns a new structure; the input is never mutated.
 * @param {*} value
 * @param {number} depth
 * @param {WeakSet} seen - cycle guard
 * @returns {*} Redacted deep copy
 */
const redactValue = (value, depth, seen) => {
    if (value === null || typeof value !== 'object') {
        return value;
    }

    if (depth >= MAX_DEPTH) {
        return '[TRUNCATED]';
    }

    if (seen.has(value)) {
        return '[CIRCULAR]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
        return value.map((item) => redactValue(item, depth + 1, seen));
    }

    // Non-plain objects (Date, Buffer, class instances) are copied by reference
    // rather than walked, so their internals are not reshaped by logging.
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        return value;
    }

    const copy = {};
    for (const key of Object.keys(value)) {
        if (isSecretKey(key)) {
            copy[key] = REDACTED;
        } else {
            copy[key] = redactValue(value[key], depth + 1, seen);
        }
    }
    return copy;
};

/**
 * Redact a parsed request body for logging.
 * @param {*} parsedBody - Already-parsed request body (object, array or string)
 * @returns {*} Deep copy with token-bearing fields replaced by '[REDACTED]'
 */
const redactBody = (parsedBody) => {
    try {
        if (typeof parsedBody === 'string') {
            return redactString(parsedBody);
        }
        return redactValue(parsedBody, 0, new WeakSet());
    } catch (error) {
        return REDACTED_BODY;
    }
};

/**
 * Redact a raw lambda/API Gateway event for logging.
 *
 * Replaces, on a deep copy:
 *  - queryStringParameters.token (and other secret-named query params)
 *  - headers.Authorization / headers.authorization
 *  - token / idToken / accessToken at the body root or under body.data
 *
 * `event.body` is usually a JSON string; it is parsed, redacted and
 * re-stringified. A body that is not valid JSON is masked with a regex.
 *
 * @param {Object} event - The raw event object
 * @returns {*} Redacted deep copy safe to log, or a placeholder on failure
 */
const redactEvent = (event) => {
    try {
        if (event === null || typeof event !== 'object') {
            return redactString(event);
        }

        const redacted = redactValue(event, 0, new WeakSet());

        // `body` arrives as a JSON string on API Gateway events; redactValue
        // cannot see inside it, so handle it explicitly here.
        if (typeof event.body === 'string') {
            let parsed = null;
            let parsedOk = false;
            try {
                parsed = JSON.parse(event.body);
                parsedOk = parsed !== null && typeof parsed === 'object';
            } catch (parseError) {
                parsedOk = false;
            }

            if (parsedOk) {
                try {
                    redacted.body = JSON.stringify(redactBody(parsed));
                } catch (stringifyError) {
                    redacted.body = REDACTED_BODY;
                }
            } else {
                redacted.body = redactString(event.body);
            }
        }

        return redacted;
    } catch (error) {
        return REDACTED_EVENT;
    }
};

module.exports = {
    redactEvent,
    redactBody,
    redactString,
    REDACTED
};
