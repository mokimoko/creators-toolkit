'use strict';

const { createAdapter } = require('./cowriter-provider-adapters');
const { getProviderConfig } = require('./cowriter-provider-registry');

async function listProviderModels(providerId, options) {
    const { id, config } = await getProviderConfig(providerId);
    return createAdapter(id, config).listModels(options);
}

async function sendProviderChat(providerId, options) {
    const { id, config } = await getProviderConfig(providerId);
    return createAdapter(id, config).send(options);
}

module.exports = {
    listProviderModels,
    sendProviderChat
};
