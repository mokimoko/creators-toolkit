'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCanonicalPrompt } = require('../cowriter-prompt-builder');

test('canonical prompt preserves roles and includes the current request exactly once', async () => {
    const prompt = await buildCanonicalPrompt({
        message: 'Current request',
        chatHistory: [
            { type: 'user', content: 'Earlier request' },
            { type: 'ai', content: 'Earlier answer' }
        ],
        settings: { worldContext: 'Reference only' },
        defaultPrompts: { mainPrompt: 'Writing partner', tones: {}, styles: {}, templates: {} },
        loadCustomPrompt: async () => '',
        providerConfig: { apiLimits: { maxChatHistoryMessages: 20, maxChatHistoryTokens: 20000, estimatedTokensPerChar: 0.3 } }
    });

    assert.deepEqual(prompt.messages.map(item => item.role), ['user', 'assistant', 'user']);
    assert.equal(prompt.messages.filter(item => item.content === 'Current request').length, 1);
    assert.match(prompt.system, /Untrusted story\/world reference/);
});
