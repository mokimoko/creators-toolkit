(function initializeCoWriterProviderClient(root) {
    'use strict';

    async function request(url, options = {}) {
        const response = await fetch(url, options);
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) {
            const error = new Error(result.error || 'CoWriter provider request failed');
            error.code = result.code;
            error.status = response.status;
            throw error;
        }
        return result;
    }

    const client = {
        listProviders() {
            return request('/api/llm/providers');
        },

        listModels(userContext, provider, mode = 'account') {
            const query = new URLSearchParams({ userContext: JSON.stringify(userContext) });
            if (provider === 'nanogpt') query.set('mode', mode);
            return request(`/api/llm/models/${encodeURIComponent(provider)}?${query}`);
        },

        saveSettings(userContext, settings) {
            return request('/api/cowriter/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userContext, settings })
            });
        },

        testConnection(userContext, { provider, model, apiKey, nanoGptMode = 'account' }) {
            return request('/api/llm/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userContext,
                    provider,
                    model,
                    nanoGptMode,
                    ...(apiKey && { apiKey })
                })
            });
        }
    };

    root.CoWriterProviderClient = Object.freeze(client);
}(typeof globalThis !== 'undefined' ? globalThis : this));
