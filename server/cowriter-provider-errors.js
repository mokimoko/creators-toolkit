'use strict';

class CoWriterProviderError extends Error {
    constructor(message, { provider, statusCode = 502, upstreamStatus = null, code = 'PROVIDER_ERROR' } = {}) {
        super(message);
        this.name = 'CoWriterProviderError';
        this.provider = provider;
        this.statusCode = statusCode;
        this.upstreamStatus = upstreamStatus;
        this.code = code;
        this.safeForClient = true;
    }
}

function providerLabel(provider) {
    const labels = {
        google: 'Google',
        anthropic: 'Anthropic',
        openai: 'OpenAI',
        openrouter: 'OpenRouter',
        nanogpt: 'NanoGPT'
    };
    return labels[provider] || 'The AI provider';
}

function createProviderHttpError(provider, upstreamStatus) {
    const label = providerLabel(provider);
    const options = { provider, upstreamStatus };

    if (upstreamStatus === 401 || upstreamStatus === 403) {
        const message = provider === 'nanogpt'
            ? 'NanoGPT rejected the API key or account permissions. Its public model list can load without validating the key; replace the saved key and test again.'
            : `${label} rejected the saved API key or account permissions.`;
        return new CoWriterProviderError(message, {
            ...options,
            statusCode: upstreamStatus,
            code: 'PROVIDER_AUTH_ERROR'
        });
    }
    if (upstreamStatus === 402) {
        return new CoWriterProviderError(`${label} reports that payment, credits, or quota are required.`, {
            ...options,
            statusCode: 402,
            code: 'PROVIDER_BILLING_ERROR'
        });
    }
    if (upstreamStatus === 404) {
        return new CoWriterProviderError(`${label} could not find the selected model. Refresh or choose another model.`, {
            ...options,
            statusCode: 400,
            code: 'PROVIDER_MODEL_NOT_FOUND'
        });
    }
    if (upstreamStatus === 429) {
        return new CoWriterProviderError(`${label} rate limit reached. Wait briefly and try again.`, {
            ...options,
            statusCode: 429,
            code: 'PROVIDER_RATE_LIMIT'
        });
    }
    if (upstreamStatus === 400 || upstreamStatus === 422) {
        return new CoWriterProviderError(`${label} rejected the request. Check the selected model and settings.`, {
            ...options,
            statusCode: 400,
            code: 'PROVIDER_REQUEST_REJECTED'
        });
    }
    if (upstreamStatus >= 500) {
        return new CoWriterProviderError(`${label} is temporarily unavailable. Try again later.`, {
            ...options,
            statusCode: 502,
            code: 'PROVIDER_UNAVAILABLE'
        });
    }

    return new CoWriterProviderError(`${label} request failed.`, {
        ...options,
        code: 'PROVIDER_HTTP_ERROR'
    });
}

function createProviderResponseError(provider) {
    return new CoWriterProviderError(`${providerLabel(provider)} returned no usable response.`, {
        provider,
        code: 'PROVIDER_EMPTY_RESPONSE'
    });
}

function toPublicError(error, fallbackMessage, fallbackStatus = 500) {
    if (error && error.safeForClient === true) {
        return {
            statusCode: error.statusCode || fallbackStatus,
            message: error.message,
            code: error.code
        };
    }

    return {
        statusCode: fallbackStatus,
        message: fallbackMessage,
        code: 'INTERNAL_ERROR'
    };
}

function safeErrorDetails(error) {
    return {
        name: error?.name || 'Error',
        code: error?.code || 'INTERNAL_ERROR',
        provider: error?.provider,
        upstreamStatus: error?.upstreamStatus
    };
}

module.exports = {
    CoWriterProviderError,
    createProviderHttpError,
    createProviderResponseError,
    safeErrorDetails,
    toPublicError
};
