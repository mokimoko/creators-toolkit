'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    LIMITS,
    validateChatData,
    validateChatRequest,
    validateCustomPrompt
} = require('../cowriter-schemas');

test('accepts representative CoWriter chat request and saved chat payloads', () => {
    const messages = [{ id: 'msg_123', type: 'user', content: 'Help with this scene.', timestamp: Date.now() }];
    assert.doesNotThrow(() => validateChatRequest({
        message: 'Continue it.',
        chatHistory: messages,
        settings: { provider: 'google', model: 'gemini-test', worldContext: 'A quiet town.' }
    }));
    assert.doesNotThrow(() => validateChatData({
        id: 'chat_123',
        name: 'Draft',
        folder: 'Stories',
        messages,
        settings: { provider: 'google', model: 'gemini-test' }
    }));
});

test('rejects oversized text and invalid message shapes before persistence/provider calls', () => {
    assert.throws(() => validateChatRequest({
        message: 'x'.repeat(LIMITS.MESSAGE + 1),
        chatHistory: [],
        settings: { provider: 'google', model: 'gemini-test' }
    }), /too long/);
    assert.throws(() => validateChatData({
        id: 'chat_123',
        name: 'Draft',
        messages: [{ type: 'script', content: 'unexpected role' }]
    }), /invalid type/);
});

test('allows an in-memory guest key but rejects keys from account chat payloads', () => {
    const request = {
        userContext: { isGuest: true },
        message: 'Hello',
        chatHistory: [],
        settings: { provider: 'google', model: 'gemini-test', apiKey: 'session-only-key' }
    };

    assert.doesNotThrow(() => validateChatRequest(request));
    assert.throws(() => validateChatRequest({
        ...request,
        userContext: { isGuest: false, userId: 'user_1' }
    }), /API keys are not allowed/);
});

test('validates custom prompt identifiers, types, and content', () => {
    assert.doesNotThrow(() => validateCustomPrompt({
        id: 'prompt_123',
        type: 'styles',
        name: 'Direct',
        content: 'Use direct prose.'
    }));
    assert.throws(() => validateCustomPrompt({
        id: '../prompt',
        type: 'unknown',
        name: 'Unsafe',
        content: 'Nope'
    }), /opaque identifier/);
});
