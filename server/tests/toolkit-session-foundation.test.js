const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const {
    createProjectRouteBoundary,
    createToolkitSession,
    getOwnedUserContext,
    revokeToolkitSession
} = require('../toolkit-session');
const { createRememberedSessionStore } = require('../remembered-session');
const { createApp, normalizePort } = require('../server');

function createResponse() {
    return {
        statusCode: 200,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };
}

test('server app construction is side-effect free and validates ports', () => {
    const app = createApp({ isLocal: false, port: 19000 });
    assert.equal(app.locals.toolkit.port, 19000);
    assert.equal(app.locals.toolkit.runtimeState.status, 'starting');
    assert.throws(() => normalizePort('not-a-port'), /Invalid PORT/);
});

test('project boundary derives the canonical signed-in context', () => {
    const token = createToolkitSession({ userId: 'user_a', username: 'Alice' });
    const req = {
        method: 'POST',
        path: '/projects/load',
        body: { userContext: { userId: 'user_a', username: 'Stale Name', isGuest: false } },
        query: {},
        headers: { 'x-toolkit-session': token }
    };
    const res = createResponse();
    let continued = false;

    createProjectRouteBoundary()(req, res, () => { continued = true; });

    assert.equal(continued, true);
    assert.deepEqual(req.body.userContext, {
        isGuest: false,
        userId: 'user_a',
        username: 'Alice'
    });
    revokeToolkitSession(token);
});

test('project boundary rejects a different user identity', () => {
    const token = createToolkitSession({ userId: 'user_a', username: 'Alice' });
    const req = {
        method: 'POST',
        path: '/roleplay/projects',
        body: { userContext: { userId: 'user_b', username: 'Bob', isGuest: false } },
        query: {},
        headers: { 'x-toolkit-session': token }
    };
    const res = createResponse();

    createProjectRouteBoundary()(req, res, () => assert.fail('request should not continue'));

    assert.equal(res.statusCode, 403);
    revokeToolkitSession(token);
});

test('multipart ownership derives guest storage identity after parsing', () => {
    const token = createToolkitSession({ isGuest: true });
    const req = {
        headers: { 'x-toolkit-session': token }
    };

    assert.deepEqual(getOwnedUserContext(req, { isGuest: true }), {
        isGuest: true,
        username: 'Guest'
    });
    assert.throws(
        () => getOwnedUserContext(req, { userId: 'user_a', username: 'Alice' }),
        error => error.statusCode === 403
    );
    revokeToolkitSession(token);
});

test('remembered sessions persist only a token hash', async t => {
    const sessionsFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-session-test-'));
    t.after(() => fs.remove(sessionsFolder));
    const store = createRememberedSessionStore({ sessionsFolder });

    const token = await store.createUserSession('user_a', 'Alice');
    const stored = await fs.readJson(path.join(sessionsFolder, 'user_a.json'));

    assert.equal(typeof stored.tokenHash, 'string');
    assert.equal(stored.token, undefined);
    assert.equal(JSON.stringify(stored).includes(token), false);
    assert.equal((await store.validateSessionToken(token)).userId, 'user_a');
});
