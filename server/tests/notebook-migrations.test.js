'use strict';

const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    listLegacyDefaultNotes,
    migrateLegacyDefaultCollections
} = require('../notebook-migrations');

test('legacy default collection migration is backed up, verified, and idempotent', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'notebook-migration-'));
    t.after(() => fs.remove(root));
    const usersFolder = path.join(root, 'users');
    const backupRoot = path.join(root, '_backups');
    const notePath = path.join(usersFolder, 'user_test', 'notebooks', 'default', 'notes', 'note_1.json');
    const original = { id: 'note_1', name: 'Legacy', content: 'Private text', collection: 'default' };
    await fs.ensureDir(path.dirname(notePath));
    await fs.writeJson(notePath, original);

    assert.equal((await listLegacyDefaultNotes(usersFolder)).length, 1);
    const result = await migrateLegacyDefaultCollections({
        usersFolder,
        backupRoot,
        now: new Date('2026-08-30T12:00:00.000Z')
    });

    assert.equal(result.migrated.length, 1);
    assert.equal((await fs.readJson(notePath)).collection, '');
    assert.deepEqual(
        await fs.readJson(path.join(result.backupFolder, 'users', 'user_test', 'notebooks', 'default', 'notes', 'note_1.json')),
        original
    );
    assert.equal((await listLegacyDefaultNotes(usersFolder)).length, 0);
    const secondRun = await migrateLegacyDefaultCollections({ usersFolder, backupRoot });
    assert.equal(secondRun.alreadyCurrent, true);
    assert.equal(secondRun.backupFolder, null);
});
