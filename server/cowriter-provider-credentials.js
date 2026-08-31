'use strict';

const { CoWriterInputError } = require('./cowriter-security');

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const NANOGPT_KEY_PATTERN = new RegExp(`^(?:sk-nano-)?${UUID_PATTERN}$`, 'i');

function normalizeProviderCredential(provider, credential) {
    if (typeof credential !== 'string') {
        throw new CoWriterInputError('API key must be text');
    }

    let normalized = credential.trim();
    normalized = normalized.replace(/^Bearer\s+/i, '').trim();

    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if ((first === '"' || first === "'") && last === first) {
        normalized = normalized.slice(1, -1).trim();
    }

    if (!normalized || /\s/.test(normalized)) {
        throw new CoWriterInputError('Paste only the API key value, without labels, spaces, or surrounding text');
    }

    if (provider === 'nanogpt' && !NANOGPT_KEY_PATTERN.test(normalized)) {
        throw new CoWriterInputError('NanoGPT keys should use sk-nano-<uuid> format (or a legacy plain UUID). Create or copy a key from the NanoGPT API dashboard');
    }

    return normalized;
}

module.exports = {
    NANOGPT_KEY_PATTERN,
    normalizeProviderCredential
};
