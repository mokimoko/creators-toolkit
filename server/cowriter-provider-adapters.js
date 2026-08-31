'use strict';

const { createProviderResponseError } = require('./cowriter-provider-errors');
const { fetchProviderJson } = require('./cowriter-provider-fetch');

function textFromParts(parts) {
    return Array.isArray(parts)
        ? parts.map(part => part?.text).filter(Boolean).join('\n')
        : '';
}

function normalizeUsage(usage = {}) {
    return {
        inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount ?? null,
        outputTokens: usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount ?? null,
        totalTokens: usage.total_tokens ?? usage.totalTokenCount ?? null
    };
}

function createGoogleAdapter(config) {
    return {
        id: 'google',
        capabilities: { systemMessages: true, modelDiscovery: true },

        async listModels({ apiKey, signal }) {
            const models = [];
            let pageToken = '';
            do {
                const url = new URL(`${config.baseUrl}${config.modelsEndpoint}`);
                url.searchParams.set('pageSize', '1000');
                if (pageToken) url.searchParams.set('pageToken', pageToken);

                const data = await fetchProviderJson('google', url, {
                    headers: { 'x-goog-api-key': apiKey },
                    signal
                });
                for (const model of data.models || []) {
                    if (!(model.supportedGenerationMethods || []).includes('generateContent')) continue;
                    models.push({
                        value: model.name.split('/').pop(),
                        label: model.displayName || model.name.split('/').pop(),
                        description: model.description || '',
                        contextLength: model.inputTokenLimit || null,
                        maxOutputTokens: model.outputTokenLimit || null,
                        capabilities: { text: true }
                    });
                }
                pageToken = data.nextPageToken || '';
            } while (pageToken);
            return models;
        },

        async send({ apiKey, model, prompt, generation, signal }) {
            const endpoint = config.chatEndpoint.replace('{model}', encodeURIComponent(model));
            const body = {
                contents: prompt.messages.map(message => ({
                    role: message.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: message.content }]
                })),
                generationConfig: {
                    temperature: generation.temperature,
                    maxOutputTokens: generation.maxOutputTokens,
                    topP: generation.topP,
                    topK: generation.topK
                }
            };
            if (prompt.system) {
                body.systemInstruction = { parts: [{ text: prompt.system }] };
            }

            const data = await fetchProviderJson('google', `${config.baseUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify(body),
                signal
            });
            const text = textFromParts(data.candidates?.[0]?.content?.parts);
            if (!text) throw createProviderResponseError('google');
            return { text, usage: normalizeUsage(data.usageMetadata) };
        }
    };
}

function createAnthropicAdapter(config) {
    return {
        id: 'anthropic',
        capabilities: { systemMessages: true, modelDiscovery: true },

        async listModels({ apiKey, signal }) {
            const models = [];
            let afterId = '';
            do {
                const url = new URL(`${config.baseUrl}${config.modelsEndpoint || '/v1/models'}`);
                url.searchParams.set('limit', '100');
                if (afterId) url.searchParams.set('after_id', afterId);
                const data = await fetchProviderJson('anthropic', url, {
                    headers: {
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    signal
                });
                for (const model of data.data || []) {
                    models.push({
                        value: model.id,
                        label: model.display_name || model.id,
                        description: model.description || '',
                        contextLength: model.context_window || model.input_token_limit || null,
                        maxOutputTokens: model.max_output_tokens || null,
                        capabilities: { text: true }
                    });
                }
                afterId = data.has_more ? (data.last_id || '') : '';
            } while (afterId);
            return models;
        },

        async send({ apiKey, model, prompt, generation, signal }) {
            const data = await fetchProviderJson('anthropic', `${config.baseUrl}${config.chatEndpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model,
                    system: prompt.system || undefined,
                    messages: prompt.messages,
                    max_tokens: generation.maxOutputTokens,
                    temperature: generation.temperature,
                    top_p: generation.topP
                }),
                signal
            });
            const text = textFromParts(data.content);
            if (!text) throw createProviderResponseError('anthropic');
            return { text, usage: normalizeUsage(data.usage) };
        }
    };
}

function isLikelyOpenAIChatModel(id) {
    if (typeof id !== 'string') return false;
    const excluded = /(audio|realtime|transcrib|whisper|tts|image|dall-e|embedding|moderation|instruct)/i;
    return !excluded.test(id) && /^(gpt-|chatgpt-|o[134](?:-|$))/i.test(id);
}

function normalizeOpenRouterModel(model) {
    const promptPrice = Number(model.pricing?.prompt);
    const completionPrice = Number(model.pricing?.completion);
    return {
        value: model.id,
        label: model.name || model.id,
        description: model.description || '',
        contextLength: model.context_length || null,
        maxOutputTokens: model.top_provider?.max_completion_tokens || null,
        pricing: model.pricing || null,
        isFree: Number.isFinite(promptPrice) && Number.isFinite(completionPrice)
            ? promptPrice === 0 && completionPrice === 0
            : model.id.endsWith(':free'),
        capabilities: {
            text: true,
            modalities: model.architecture?.output_modalities || [],
            supportedParameters: model.supported_parameters || []
        }
    };
}

function normalizeNanoModel(model) {
    const id = model.id || model.model || model.name;
    return {
        value: id,
        label: model.name || model.display_name || id,
        description: model.description || '',
        contextLength: model.context_length || model.context_window || null,
        maxOutputTokens: model.max_output_tokens || model.max_completion_tokens || null,
        pricing: model.pricing || null,
        capabilities: model.capabilities || { text: true }
    };
}

function createOpenAICompatibleAdapter(id, config, options = {}) {
    const normalizeModel = options.normalizeModel || (model => ({
        value: model.id,
        label: model.name || model.id,
        description: model.description || '',
        contextLength: model.context_length || null,
        maxOutputTokens: model.max_output_tokens || null,
        capabilities: { text: true }
    }));

    return {
        id,
        capabilities: { systemMessages: true, modelDiscovery: true },

        async listModels({ apiKey, mode = 'account', signal }) {
            const endpoint = options.modelsEndpoint?.(mode) || config.modelsEndpoint;
            const data = await fetchProviderJson(id, `${config.baseUrl}${endpoint}`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal
            });
            const rawModels = Array.isArray(data) ? data : (data.data || data.models || []);
            return rawModels
                .filter(model => model?.id || model?.model || model?.name)
                .filter(options.modelFilter || (() => true))
                .map(normalizeModel)
                .filter(model => model.value);
        },

        async send({ apiKey, model, prompt, generation, mode = 'account', signal }) {
            const endpoint = options.chatEndpoint?.(mode) || config.chatEndpoint;
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                ...(options.headers || {})
            };
            const body = {
                model,
                messages: [
                    ...(prompt.system ? [{ role: 'system', content: prompt.system }] : []),
                    ...prompt.messages
                ],
                max_tokens: generation.maxOutputTokens,
                temperature: generation.temperature,
                top_p: generation.topP,
                ...(options.extraBody?.(mode) || {})
            };
            const data = await fetchProviderJson(id, `${config.baseUrl}${endpoint}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal
            });
            const text = data.choices?.[0]?.message?.content;
            if (typeof text !== 'string' || !text) throw createProviderResponseError(id);
            return { text, usage: normalizeUsage(data.usage) };
        }
    };
}

function createAdapter(id, config) {
    if (id === 'google') return createGoogleAdapter(config);
    if (id === 'anthropic') return createAnthropicAdapter(config);
    if (id === 'openai') {
        return createOpenAICompatibleAdapter(id, config, { modelFilter: model => isLikelyOpenAIChatModel(model.id) });
    }
    if (id === 'openrouter') {
        return createOpenAICompatibleAdapter(id, config, {
            normalizeModel: normalizeOpenRouterModel,
            modelFilter: model => model.id && !/moderation/i.test(model.id),
            headers: { 'X-Title': 'Creator\'s Toolkit CoWriter' }
        });
    }
    if (id === 'nanogpt') {
        return createOpenAICompatibleAdapter(id, config, {
            normalizeModel: normalizeNanoModel,
            modelsEndpoint: mode => ({
                account: '/api/v1/models?detailed=true',
                subscription: '/api/subscription/v1/models',
                paid: '/api/paid/v1/models'
            })[mode] || '/api/v1/models?detailed=true',
            chatEndpoint: mode => mode === 'subscription'
                ? '/api/subscription/v1/chat/completions'
                : '/api/v1/chat/completions',
            extraBody: () => ({ reasoning: { exclude: true } })
        });
    }
    throw new Error(`No CoWriter adapter is registered for ${id}`);
}

module.exports = {
    createAdapter,
    isLikelyOpenAIChatModel,
    normalizeNanoModel,
    normalizeOpenRouterModel,
    normalizeUsage
};
