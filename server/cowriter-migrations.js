'use strict';

const { CoWriterInputError } = require('./cowriter-security');
const { projectChatForPersistence } = require('../main/cowriter/chat-persistence');

const SCHEMA_VERSION = 1;

function assertSupportedVersion(value, label) {
    const version = value?.schemaVersion;
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
        throw new CoWriterInputError(`${label} has an invalid schema version`);
    }
    if (version > SCHEMA_VERSION) {
        throw new CoWriterInputError(`${label} was created by a newer CoWriter version`);
    }
}

function migrateChatData(value) {
    assertSupportedVersion(value, 'Chat data');
    return {
        ...projectChatForPersistence(value),
        schemaVersion: SCHEMA_VERSION
    };
}

function migrateSettingsData(value) {
    assertSupportedVersion(value, 'Settings');
    const migrated = {
        ...(value || {}),
        schemaVersion: SCHEMA_VERSION
    };
    delete migrated.apiKey;
    delete migrated.hasApiKey;
    return migrated;
}

function migrateWorldContext(value) {
    assertSupportedVersion(value, 'World context');
    return { ...value, schemaVersion: SCHEMA_VERSION };
}

function migrateCustomPrompt(value) {
    assertSupportedVersion(value, 'Custom prompt');
    return { ...value, schemaVersion: SCHEMA_VERSION };
}

module.exports = {
    SCHEMA_VERSION,
    migrateChatData,
    migrateCustomPrompt,
    migrateSettingsData,
    migrateWorldContext
};
