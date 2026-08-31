'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    isProviderConfig,
    normalizeOpaqueId,
    normalizeProviderId,
    resolveOpaqueFile
} = require('../cowriter-security');

const providers = {
    google: { name: 'Google', baseUrl: 'https://example.test' },
    disabled: { name: 'Disabled', baseUrl: 'https://example.test', enabled: false },
    meta: { defaults: {} }
};

test('CoWriter IDs reject traversal, separators, control characters, and excessive length', () => {
    assert.equal(normalizeOpaqueId('chat_123-abc', 'Chat identifier'), 'chat_123-abc');

    for (const invalidId of ['../escape', '..\\escape', 'folder/name', '.', '', 'bad\u0000id', 'a'.repeat(129)]) {
        assert.throws(() => normalizeOpaqueId(invalidId, 'Chat identifier'), /opaque identifier/);
    }

    const chatsFolder = path.resolve('fixture-users', 'user-1', 'cowriter', 'chats');
    assert.equal(
        resolveOpaqueFile(chatsFolder, 'chat_123', '.json', 'Chat identifier'),
        path.join(chatsFolder, 'chat_123.json')
    );
});

test('provider IDs must refer to enabled provider-shaped registry entries', () => {
    assert.equal(isProviderConfig(providers.google), true);
    assert.equal(isProviderConfig(providers.meta), false);
    assert.equal(normalizeProviderId('google', providers), 'google');
    assert.throws(() => normalizeProviderId('disabled', providers), /not enabled or registered/);
    assert.throws(() => normalizeProviderId('meta', providers), /not enabled or registered/);
    assert.throws(() => normalizeProviderId('../google', providers), /opaque identifier/);
});
