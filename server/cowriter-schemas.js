'use strict';

const { CoWriterInputError, normalizeOpaqueId } = require('./cowriter-security');

const LIMITS = Object.freeze({
    API_KEY: 4096,
    CHAT_MESSAGES: 2000,
    CONTENT: 500000,
    MESSAGE: 100000,
    MODEL: 256,
    NAME: 200,
    SETTINGS_TEXT: 500000
});

function inputError(message) {
    throw new CoWriterInputError(message);
}

function assertObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        inputError(`${label} must be an object`);
    }
    return value;
}

function assertString(value, label, { required = false, max = LIMITS.CONTENT } = {}) {
    if (value === undefined || value === null) {
        if (required) inputError(`${label} is required`);
        return;
    }
    if (typeof value !== 'string') inputError(`${label} must be text`);
    if (required && !value.trim()) inputError(`${label} is required`);
    if (value.length > max) inputError(`${label} is too long`);
}

function assertOptionalTimestamp(value, label) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        inputError(`${label} must be a valid timestamp`);
    }
}

function validateMessage(message, index) {
    assertObject(message, `Message ${index + 1}`);
    if (!['user', 'ai', 'assistant'].includes(message.type)) {
        inputError(`Message ${index + 1} has an invalid type`);
    }
    assertString(message.content, `Message ${index + 1} content`, { required: true, max: LIMITS.CONTENT });
    if (message.id !== undefined) normalizeOpaqueId(message.id, `Message ${index + 1} identifier`);
    assertOptionalTimestamp(message.timestamp, `Message ${index + 1} timestamp`);
}

function validateMessages(messages, { required = true } = {}) {
    if (messages === undefined && !required) return;
    if (!Array.isArray(messages)) inputError('Messages must be an array');
    if (messages.length > LIMITS.CHAT_MESSAGES) inputError('Chat contains too many messages');
    messages.forEach(validateMessage);
}

function validateSettings(settings, { allowApiKey = false, requireConnection = false } = {}) {
    assertObject(settings, 'Settings');
    assertString(settings.provider, 'Provider', { required: requireConnection, max: 128 });
    assertString(settings.model, 'Model', { required: requireConnection, max: LIMITS.MODEL });
    for (const field of ['tone', 'style', 'templateId', 'worldContextId']) {
        assertString(settings[field], field, { max: 128 });
    }
    if (settings.nanoGptMode !== undefined && !['account', 'subscription', 'paid'].includes(settings.nanoGptMode)) {
        inputError('nanoGptMode must be account, subscription, or paid');
    }
    for (const field of ['worldContext', 'activeMainPrompt']) {
        assertString(settings[field], field, { max: LIMITS.SETTINGS_TEXT });
    }
    if (settings.openRouterFreeOnly !== undefined && typeof settings.openRouterFreeOnly !== 'boolean') {
        inputError('openRouterFreeOnly must be true or false');
    }
    if (settings.apiKey !== undefined) {
        if (!allowApiKey) inputError('API keys are not allowed in this payload');
        assertString(settings.apiKey, 'API key', { max: LIMITS.API_KEY });
    }
}

function validateChatRequest(body) {
    assertObject(body, 'Request body');
    assertString(body.message, 'Message', { required: true, max: LIMITS.MESSAGE });
    validateMessages(body.chatHistory || [], { required: true });
    validateSettings(body.settings, {
        allowApiKey: body.userContext?.isGuest === true,
        requireConnection: true
    });
}

function validateChatData(chatData, { requireIdentity = true } = {}) {
    assertObject(chatData, 'Chat data');
    if (requireIdentity) {
        normalizeOpaqueId(chatData.id, 'Chat identifier');
        assertString(chatData.name, 'Chat name', { required: true, max: LIMITS.NAME });
    } else {
        if (chatData.id !== undefined) normalizeOpaqueId(chatData.id, 'Chat identifier');
        assertString(chatData.name, 'Chat name', { max: LIMITS.NAME });
    }
    assertString(chatData.folder, 'Chat folder', { max: LIMITS.NAME });
    validateMessages(chatData.messages || [], { required: true });
    if (chatData.settings !== undefined) validateSettings(chatData.settings);
    assertOptionalTimestamp(chatData.created, 'Chat created timestamp');
    assertOptionalTimestamp(chatData.lastModified, 'Chat modified timestamp');
}

function validateWorldContext(worldContext) {
    assertObject(worldContext, 'World context');
    normalizeOpaqueId(worldContext.id, 'World context identifier');
    assertString(worldContext.name, 'World context name', { required: true, max: LIMITS.NAME });
    assertString(worldContext.content, 'World context content', { required: true, max: LIMITS.CONTENT });
    assertOptionalTimestamp(worldContext.created, 'World context created timestamp');
    assertOptionalTimestamp(worldContext.lastModified, 'World context modified timestamp');
}

function validateCustomPrompt(promptData) {
    assertObject(promptData, 'Prompt data');
    normalizeOpaqueId(promptData.id, 'Prompt identifier');
    assertString(promptData.name, 'Prompt name', { required: true, max: LIMITS.NAME });
    assertString(promptData.content, 'Prompt content', { required: true, max: LIMITS.CONTENT });
    assertString(promptData.description, 'Prompt description', { max: 2000 });
    const validTypes = ['main', 'tones', 'styles', 'templates', 'quickPrompts'];
    if (!validTypes.includes(promptData.type)) inputError('Invalid prompt type');
    assertOptionalTimestamp(promptData.created, 'Prompt created timestamp');
    assertOptionalTimestamp(promptData.lastModified, 'Prompt modified timestamp');
}

module.exports = {
    LIMITS,
    validateChatData,
    validateChatRequest,
    validateCustomPrompt,
    validateSettings,
    validateWorldContext
};
