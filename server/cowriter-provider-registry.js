'use strict';

const fs = require('fs-extra');
const path = require('path');
const { CoWriterInputError, isProviderConfig, normalizeProviderId } = require('./cowriter-security');

const DEFAULT_REGISTRY_PATH = path.join(__dirname, '..', 'main', 'cowriter', 'providers.json');

async function loadProviderRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
    const raw = await fs.readJson(registryPath);
    const candidateProviders = raw.providers || raw;
    const providers = Object.fromEntries(
        Object.entries(candidateProviders).filter(([, value]) => isProviderConfig(value))
    );

    if (Object.keys(providers).length === 0) {
        throw new CoWriterInputError('No enabled CoWriter providers are configured');
    }

    return {
        providers,
        defaults: raw.defaults || raw.meta?.providerSettings || {},
        ui: raw.ui || raw.meta?.uiSettings || {}
    };
}

async function getProviderConfig(providerId, registryPath) {
    const registry = await loadProviderRegistry(registryPath);
    const id = normalizeProviderId(providerId, registry.providers);
    return { id, config: registry.providers[id], registry };
}

function publicProviderList(registry) {
    return Object.entries(registry.providers).map(([id, provider]) => ({
        id,
        name: provider.name,
        description: provider.description || '',
        keyRequired: provider.keyRequired !== false,
        keyPlaceholder: provider.keyPlaceholder || '',
        keyHelpUrl: provider.keyHelpUrl || '',
        keyHelpText: provider.keyHelpText || '',
        capabilities: provider.capabilities || {},
        modes: provider.modes || null
    }));
}

module.exports = {
    DEFAULT_REGISTRY_PATH,
    getProviderConfig,
    loadProviderRegistry,
    publicProviderList
};
