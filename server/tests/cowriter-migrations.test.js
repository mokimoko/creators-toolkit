'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
    SCHEMA_VERSION,
    migrateChatData,
    migrateSettingsData
} = require('../cowriter-migrations');
const { queueJsonWrite } = require('../cowriter-storage');

test('legacy chat/settings migrate in memory with a version and no persisted secret fields', () => {
    const chat = migrateChatData({ messages: [], settings: { provider: 'google', apiKey: 'secret' } });
    const settings = migrateSettingsData({ provider: 'google', model: 'model', apiKey: 'secret', hasApiKey: true });

    assert.equal(chat.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(chat.settings, { provider: 'google' });
    assert.equal(settings.schemaVersion, SCHEMA_VERSION);
    assert.equal('apiKey' in settings, false);
    assert.equal('hasApiKey' in settings, false);
});

test('newer schema versions are rejected instead of overwritten', () => {
    assert.throws(() => migrateChatData({ schemaVersion: SCHEMA_VERSION + 1, messages: [] }), /newer CoWriter version/);
});

test('queued atomic writes preserve request order', async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cowriter-storage-'));
    const filePath = path.join(folder, 'active-chat.json');
    try {
        await Promise.all([
            queueJsonWrite(filePath, { revision: 1 }),
            queueJsonWrite(filePath, { revision: 2 })
        ]);
        assert.deepEqual(await fs.readJson(filePath), { revision: 2 });
    } finally {
        await fs.remove(folder);
    }
});
