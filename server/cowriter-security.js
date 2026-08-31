'use strict';

const {
    resolvePathInside
} = require('./path-security');

const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

class CoWriterInputError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CoWriterInputError';
        this.statusCode = 400;
    }
}

function normalizeOpaqueId(value, label = 'Identifier') {
    if (typeof value !== 'string' || !OPAQUE_ID_PATTERN.test(value)) {
        throw new CoWriterInputError(`${label} must be a valid opaque identifier`);
    }

    return value;
}

function isProviderConfig(value) {
    return Boolean(
        value
        && typeof value === 'object'
        && !Array.isArray(value)
        && typeof value.name === 'string'
        && typeof value.baseUrl === 'string'
        && value.enabled !== false
    );
}

function normalizeProviderId(value, registry) {
    const providerId = normalizeOpaqueId(value, 'Provider identifier');
    if (!registry || !Object.hasOwn(registry, providerId) || !isProviderConfig(registry[providerId])) {
        throw new CoWriterInputError('Provider is not enabled or registered');
    }

    return providerId;
}

function resolveOpaqueFile(folder, id, extension = '.json', label = 'Identifier', prefix = '') {
    const safeId = normalizeOpaqueId(id, label);
    return resolvePathInside(folder, `${prefix}${safeId}${extension}`);
}

module.exports = {
    CoWriterInputError,
    OPAQUE_ID_PATTERN,
    isProviderConfig,
    normalizeOpaqueId,
    normalizeProviderId,
    resolveOpaqueFile
};
