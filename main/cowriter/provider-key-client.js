(function initializeCoWriterProviderKeyClient(root) {
    'use strict';

    async function request(method, userContext, provider) {
        const response = await fetch('/api/cowriter/api-key', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userContext, provider })
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Provider key request failed');
        }

        return result;
    }

    root.CoWriterProviderKeyClient = Object.freeze({
        getStatus(userContext, provider) {
            return request('POST', userContext, provider);
        },
        remove(userContext, provider) {
            return request('DELETE', userContext, provider);
        }
    });
}(typeof globalThis !== 'undefined' ? globalThis : this));
