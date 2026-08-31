'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProviderCredential } = require('../cowriter-provider-credentials');

test('provider credentials trim wrappers but reject embedded prose', () => {
    const key = 'sk-example-token';
    assert.equal(normalizeProviderCredential('openai', `  Bearer ${key}  `), key);
    assert.equal(normalizeProviderCredential('openai', `"${key}"`), key);
    assert.throws(
        () => normalizeProviderCredential('openai', 'API key: sk-example-token'),
        /without labels, spaces, or surrounding text/
    );
});

test('NanoGPT credentials require the documented API-key shape', () => {
    const uuid = '12345678-1234-4123-8123-123456789abc';
    assert.equal(normalizeProviderCredential('nanogpt', `sk-nano-${uuid}`), `sk-nano-${uuid}`);
    assert.equal(normalizeProviderCredential('nanogpt', uuid), uuid);
    assert.throws(() => normalizeProviderCredential('nanogpt', 'not-a-nanogpt-key'), /sk-nano/);
});
