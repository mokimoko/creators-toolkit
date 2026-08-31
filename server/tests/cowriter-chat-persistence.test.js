'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    projectChatForPersistence,
    projectPersistedChatSettings
} = require('../../main/cowriter/chat-persistence');

test('chat settings persist only provider and writing-preset selections', () => {
    const projected = projectPersistedChatSettings({
        provider: 'google',
        model: 'gemini-test',
        tone: 'warm',
        style: 'concise',
        templateId: 'brainstorm',
        worldContextId: 'world-1',
        openRouterFreeOnly: true,
        apiKey: 'fixture-secret-that-must-not-survive',
        hasApiKey: true,
        worldContext: 'Runtime-only expanded world text',
        userContext: { userId: 'user-1' }
    });

    assert.deepEqual(projected, {
        provider: 'google',
        model: 'gemini-test',
        tone: 'warm',
        style: 'concise',
        templateId: 'brainstorm',
        worldContextId: 'world-1',
        openRouterFreeOnly: true
    });
});

test('chat projection removes legacy connection state without changing messages', () => {
    const chat = {
        id: 'chat-1',
        messages: [{ type: 'user', content: 'Keep this message.' }],
        settings: {
            provider: 'openrouter',
            model: 'example/free',
            apiKey: 'legacy-key-material',
            hasApiKey: true
        }
    };

    const projected = projectChatForPersistence(chat);

    assert.deepEqual(projected.messages, chat.messages);
    assert.deepEqual(projected.settings, {
        provider: 'openrouter',
        model: 'example/free'
    });
    assert.equal(JSON.stringify(projected).includes('legacy-key-material'), false);
});
