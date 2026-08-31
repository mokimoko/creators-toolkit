const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createCoWriterRouteBoundary,
    createCoWriterSession,
    getCoWriterSession,
    revokeCoWriterSession
} = require('../cowriter-session');
const {
    createLocalHostBoundary,
    isAllowedLocalHost,
    isAllowedLocalOrigin
} = require('../local-api-boundary');

function runMiddleware(middleware, request) {
    const result = { nextCalled: false, statusCode: 200, payload: null };
    const response = {
        status(statusCode) {
            result.statusCode = statusCode;
            return this;
        },
        json(payload) {
            result.payload = payload;
            return this;
        }
    };
    middleware(request, response, () => {
        result.nextCalled = true;
    });
    return result;
}

function request({ method = 'POST', path = '/cowriter/settings', token, body, query, host = 'localhost:9000', origin }) {
    const headers = {
        host,
        ...(token ? { 'x-cowriter-session': token } : {}),
        ...(origin ? { origin } : {})
    };
    return {
        method,
        path,
        body: body || {},
        query: query || {},
        headers,
        get(name) {
            return headers[name.toLowerCase()] || null;
        }
    };
}

test('local HTTP boundary accepts only the loopback app hosts and origins', () => {
    assert.equal(isAllowedLocalHost('localhost:9000', 9000), true);
    assert.equal(isAllowedLocalHost('127.0.0.1:9000', 9000), true);
    assert.equal(isAllowedLocalHost('evil.example:9000', 9000), false);
    assert.equal(isAllowedLocalOrigin('http://localhost:9000', 9000), true);
    assert.equal(isAllowedLocalOrigin('https://evil.example', 9000), false);

    const boundary = createLocalHostBoundary(9000);
    assert.equal(runMiddleware(boundary, request({})).nextCalled, true);
    assert.equal(runMiddleware(boundary, request({ host: 'evil.example:9000' })).statusCode, 403);
    assert.equal(runMiddleware(boundary, request({ origin: 'https://evil.example' })).statusCode, 403);
});

test('CoWriter session boundary requires a live token owned by the requested context', () => {
    const boundary = createCoWriterRouteBoundary();
    const token = createCoWriterSession({ userId: 'user_alice', username: 'Alice', isGuest: false });

    assert.equal(runMiddleware(boundary, request({ body: { userContext: { userId: 'user_alice', isGuest: false } } })).statusCode, 401);
    assert.equal(runMiddleware(boundary, request({ token, body: { userContext: { userId: 'user_bob', isGuest: false } } })).statusCode, 403);
    assert.equal(runMiddleware(boundary, request({ token, body: { userContext: { userId: 'user_alice', isGuest: false } } })).nextCalled, true);

    revokeCoWriterSession(token);
    assert.equal(getCoWriterSession(token), null);
});

test('guest sessions cannot cross into user storage and expired sessions fail closed', () => {
    const boundary = createCoWriterRouteBoundary();
    const guestToken = createCoWriterSession({ isGuest: true });
    const expiredToken = createCoWriterSession({ userId: 'user_alice' }, { ttlMs: -1 });

    assert.equal(runMiddleware(boundary, request({ token: guestToken, body: { userContext: { isGuest: true } } })).nextCalled, true);
    assert.equal(runMiddleware(boundary, request({ token: guestToken, body: { userContext: { userId: 'user_alice', isGuest: false } } })).statusCode, 403);
    assert.equal(runMiddleware(boundary, request({ token: expiredToken, body: { userContext: { userId: 'user_alice' } } })).statusCode, 401);
});

test('public metadata stays readable while debug routes are disabled by default', () => {
    const boundary = createCoWriterRouteBoundary();
    assert.equal(runMiddleware(boundary, request({ method: 'GET', path: '/llm/providers' })).nextCalled, true);
    assert.equal(runMiddleware(boundary, request({ path: '/debug/cowriter/prompt' })).statusCode, 404);
});
