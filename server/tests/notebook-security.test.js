'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    createCoWriterSession,
    createNotebookRouteBoundary,
    revokeCoWriterSession
} = require('../cowriter-session');
const {
    normalizeNotebookMetadata,
    resolveNotebookFolder,
    resolveNoteFile,
    resolveUserNotebooksFolder
} = require('../notebook-security');

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

function request({ token, userContext }) {
    const headers = token ? { 'x-cowriter-session': token } : {};
    return {
        method: 'POST',
        path: '/notebook/notes',
        body: { userContext },
        query: {},
        headers,
        get(name) {
            return headers[name.toLowerCase()] || null;
        }
    };
}

test('Notebook storage identifiers stay inside the signed-in user notebook root', () => {
    const usersFolder = path.resolve('synthetic-users');
    const userContext = { userId: 'user_alice', username: 'Alice', isGuest: false };
    const notebooksFolder = resolveUserNotebooksFolder(usersFolder, userContext);
    const notebookFolder = resolveNotebookFolder(usersFolder, userContext, 'world_notes');

    assert.equal(notebooksFolder, path.join(usersFolder, 'user_alice', 'notebooks'));
    assert.equal(notebookFolder, path.join(notebooksFolder, 'world_notes'));
    assert.equal(resolveNoteFile(path.join(notebookFolder, 'notes'), 'note_123'), path.join(notebookFolder, 'notes', 'note_123.json'));
    assert.throws(() => resolveNotebookFolder(usersFolder, userContext, '..'));
    assert.throws(() => resolveNoteFile(path.join(notebookFolder, 'notes'), '../other-user'));
    assert.throws(() => resolveUserNotebooksFolder(usersFolder, { isGuest: true }));
});

test('Notebook metadata is allowlisted before storage and rendering', () => {
    assert.deepEqual(normalizeNotebookMetadata({
        name: '  Story   Notes  ',
        description: 'Draft\nideas',
        icon: 'book-open',
        color: '#B1B695'
    }), {
        name: 'Story Notes',
        description: 'Draft ideas',
        icon: 'book-open',
        color: '#b1b695'
    });
    assert.throws(() => normalizeNotebookMetadata({
        name: '<img src=x onerror=alert(1)>',
        icon: 'book\" onclick=alert(1)',
        color: 'red'
    }));
});

test('Notebook routes require an owned signed-in Toolkit session', () => {
    const boundary = createNotebookRouteBoundary();
    const aliceToken = createCoWriterSession({ userId: 'user_alice', username: 'Alice', isGuest: false });
    const guestToken = createCoWriterSession({ isGuest: true });

    assert.equal(runMiddleware(boundary, request({ userContext: { userId: 'user_alice', isGuest: false } })).statusCode, 401);
    assert.equal(runMiddleware(boundary, request({ token: aliceToken, userContext: { userId: 'user_bob', isGuest: false } })).statusCode, 403);
    assert.equal(runMiddleware(boundary, request({ token: guestToken, userContext: { isGuest: true } })).statusCode, 403);
    const ownedRequest = request({ token: aliceToken, userContext: { userId: 'user_alice', username: 'Forged Name', isGuest: false } });
    assert.equal(runMiddleware(boundary, ownedRequest).nextCalled, true);
    assert.equal(ownedRequest.body.userContext.username, 'Alice');

    revokeCoWriterSession(aliceToken);
    revokeCoWriterSession(guestToken);
});
