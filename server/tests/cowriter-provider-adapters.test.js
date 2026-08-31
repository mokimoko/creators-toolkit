'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createAdapter } = require('../cowriter-provider-adapters');

function jsonResponse(value, status = 200) {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

test('NanoGPT subscription mode uses subscription endpoints and excludes reasoning', async () => {
    const calls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        if (String(url).includes('/models')) {
            return jsonResponse({ data: [{ id: 'subscription-model', context_length: 32000 }] });
        }
        return jsonResponse({ choices: [{ message: { content: 'ok' } }], usage: { total_tokens: 4 } });
    };

    try {
        const adapter = createAdapter('nanogpt', {
            baseUrl: 'https://nano-gpt.com',
            modelsEndpoint: '/api/v1/models?detailed=true',
            chatEndpoint: '/api/v1/chat/completions'
        });
        const models = await adapter.listModels({ apiKey: 'key', mode: 'subscription' });
        const result = await adapter.send({
            apiKey: 'key',
            model: 'subscription-model',
            mode: 'subscription',
            prompt: { system: 'System', messages: [{ role: 'user', content: 'Hi' }] },
            generation: { maxOutputTokens: 100, temperature: 0.7, topP: 0.9 }
        });

        assert.equal(models[0].value, 'subscription-model');
        assert.equal(result.text, 'ok');
        assert.match(calls[0].url, /\/api\/subscription\/v1\/models$/);
        assert.match(calls[1].url, /\/api\/subscription\/v1\/chat\/completions$/);
        assert.deepEqual(JSON.parse(calls[1].options.body).reasoning, { exclude: true });
    } finally {
        global.fetch = originalFetch;
    }
});

test('NanoGPT paid browsing never changes subscription chat into paid chat', async () => {
    const originalFetch = global.fetch;
    let requestedUrl = '';
    global.fetch = async url => {
        requestedUrl = String(url);
        return jsonResponse({ data: [] });
    };
    try {
        const adapter = createAdapter('nanogpt', { baseUrl: 'https://nano-gpt.com' });
        await adapter.listModels({ apiKey: 'key', mode: 'paid' });
        assert.match(requestedUrl, /\/api\/paid\/v1\/models$/);
    } finally {
        global.fetch = originalFetch;
    }
});

test('Google adapter preserves system and conversation roles', async () => {
    const originalFetch = global.fetch;
    let requestBody;
    global.fetch = async (url, options) => {
        requestBody = JSON.parse(options.body);
        return jsonResponse({ candidates: [{ content: { parts: [{ text: 'answer' }] } }] });
    };
    try {
        const adapter = createAdapter('google', {
            baseUrl: 'https://example.test',
            chatEndpoint: '/models/{model}:generateContent'
        });
        await adapter.send({
            apiKey: 'key',
            model: 'gemini',
            prompt: {
                system: 'Writing instructions',
                messages: [
                    { role: 'user', content: 'First' },
                    { role: 'assistant', content: 'Reply' },
                    { role: 'user', content: 'Current' }
                ]
            },
            generation: { maxOutputTokens: 100, temperature: 0.7, topP: 0.9, topK: 40 }
        });
        assert.equal(requestBody.systemInstruction.parts[0].text, 'Writing instructions');
        assert.deepEqual(requestBody.contents.map(item => item.role), ['user', 'model', 'user']);
    } finally {
        global.fetch = originalFetch;
    }
});

test('Google and Anthropic model discovery follow provider pagination', async () => {
    const originalFetch = global.fetch;
    const urls = [];
    global.fetch = async url => {
        const value = String(url);
        urls.push(value);
        if (value.includes('google.test')) {
            return value.includes('pageToken=next')
                ? jsonResponse({ models: [{ name: 'models/gemini-b', displayName: 'Gemini B', supportedGenerationMethods: ['generateContent'] }] })
                : jsonResponse({ models: [{ name: 'models/gemini-a', displayName: 'Gemini A', supportedGenerationMethods: ['generateContent'] }], nextPageToken: 'next' });
        }
        return value.includes('after_id=claude-a')
            ? jsonResponse({ data: [{ id: 'claude-b' }], has_more: false })
            : jsonResponse({ data: [{ id: 'claude-a' }], has_more: true, last_id: 'claude-a' });
    };
    try {
        const google = createAdapter('google', { baseUrl: 'https://google.test', modelsEndpoint: '/models' });
        const anthropic = createAdapter('anthropic', { baseUrl: 'https://anthropic.test', modelsEndpoint: '/models' });
        assert.deepEqual((await google.listModels({ apiKey: 'key' })).map(model => model.value), ['gemini-a', 'gemini-b']);
        assert.deepEqual((await anthropic.listModels({ apiKey: 'key' })).map(model => model.value), ['claude-a', 'claude-b']);
        assert.equal(urls.length, 4);
    } finally {
        global.fetch = originalFetch;
    }
});
