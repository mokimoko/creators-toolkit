'use strict';

const {
    CoWriterProviderError,
    createProviderHttpError,
    createProviderResponseError
} = require('./cowriter-provider-errors');

function combineSignals(signals) {
    const usable = signals.filter(Boolean);
    if (usable.length === 0) return undefined;
    if (usable.length === 1) return usable[0];
    return AbortSignal.any(usable);
}

async function fetchProviderJson(provider, url, options = {}) {
    const { timeoutMs = 30000, signal, ...requestOptions } = options;
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort('timeout'), timeoutMs);

    try {
        const response = await fetch(url, {
            ...requestOptions,
            signal: combineSignals([signal, timeoutController.signal])
        });

        if (!response.ok) {
            throw createProviderHttpError(provider, response.status);
        }

        try {
            return await response.json();
        } catch {
            throw createProviderResponseError(provider);
        }
    } catch (error) {
        if (error instanceof CoWriterProviderError) throw error;
        if (timeoutController.signal.aborted) {
            throw new CoWriterProviderError('The AI provider took too long to respond.', {
                provider,
                statusCode: 504,
                code: 'PROVIDER_TIMEOUT'
            });
        }
        if (signal?.aborted) {
            throw new CoWriterProviderError('The AI request was cancelled.', {
                provider,
                statusCode: 499,
                code: 'PROVIDER_CANCELLED'
            });
        }
        throw new CoWriterProviderError('Could not reach the AI provider.', {
            provider,
            statusCode: 502,
            code: 'PROVIDER_NETWORK_ERROR'
        });
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = { fetchProviderJson };
