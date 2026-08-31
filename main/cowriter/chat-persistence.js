(function initializeCoWriterChatPersistence(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.CoWriterChatPersistence = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createCoWriterChatPersistence() {
    'use strict';

    const SCHEMA_VERSION = 1;

    const STRING_SETTINGS = [
        'provider',
        'model',
        'tone',
        'style',
        'templateId',
        'worldContextId',
        'nanoGptMode'
    ];

    const BOOLEAN_SETTINGS = [
        'openRouterFreeOnly'
    ];

    function projectPersistedChatSettings(settings) {
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            return {};
        }

        const projected = {};

        for (const key of STRING_SETTINGS) {
            if (typeof settings[key] === 'string') {
                projected[key] = settings[key];
            }
        }

        for (const key of BOOLEAN_SETTINGS) {
            if (typeof settings[key] === 'boolean') {
                projected[key] = settings[key];
            }
        }

        return projected;
    }

    function projectChatForPersistence(chatData) {
        if (!chatData || typeof chatData !== 'object' || Array.isArray(chatData)) {
            throw new TypeError('Chat data must be an object');
        }

        return {
            ...chatData,
            schemaVersion: SCHEMA_VERSION,
            settings: projectPersistedChatSettings(chatData.settings)
        };
    }

    return Object.freeze({
        projectChatForPersistence,
        projectPersistedChatSettings,
        SCHEMA_VERSION
    });
}));
