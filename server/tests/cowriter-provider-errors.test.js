'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createProviderHttpError,
    safeErrorDetails,
    toPublicError
} = require('../cowriter-provider-errors');

test('provider HTTP errors expose useful categories without upstream response bodies', () => {
    const rawUpstreamBody = 'invalid key sk-secret-value customer@example.com';
    const error = createProviderHttpError('openai', 401);
    error.upstreamBody = rawUpstreamBody;

    const publicError = toPublicError(error, 'Provider request failed');

    assert.equal(publicError.statusCode, 401);
    assert.equal(publicError.code, 'PROVIDER_AUTH_ERROR');
    assert.equal(publicError.message.includes(rawUpstreamBody), false);
    assert.equal(JSON.stringify(safeErrorDetails(error)).includes(rawUpstreamBody), false);
});

test('billing, rate-limit, and availability failures keep stable public status codes', () => {
    assert.equal(createProviderHttpError('openrouter', 402).statusCode, 402);
    assert.equal(createProviderHttpError('anthropic', 429).statusCode, 429);
    assert.equal(createProviderHttpError('google', 503).statusCode, 502);
});

test('NanoGPT auth errors explain that catalog loading does not validate the key', () => {
    const error = createProviderHttpError('nanogpt', 403);

    assert.equal(error.statusCode, 403);
    assert.match(error.message, /model list can load without validating the key/i);
});

test('unexpected errors become a generic response', () => {
    const publicError = toPublicError(new Error('C:\\private\\path and secret material'), 'Request failed');

    assert.deepEqual(publicError, {
        statusCode: 500,
        message: 'Request failed',
        code: 'INTERNAL_ERROR'
    });
});
