'use strict';

const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { writeJsonAtomic } = require('../cowriter-storage');
const { applyCollectionMutationTransaction } = require('../notebook-collection-storage');

test('collection mutation rolls every document back when a write fails', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'notebook-collections-'));
    t.after(() => fs.remove(root));

    const collectionsPath = path.join(root, 'collections.json');
    const firstPath = path.join(root, 'note_1.json');
    const secondPath = path.join(root, 'note_2.json');
    const originalCollections = { collections: [{ key: 'old', name: 'Old' }], lastModified: 1 };
    const firstNote = { id: 'note_1', name: 'One', content: '', collection: 'old', created: 1, lastModified: 1, tags: [] };
    const secondNote = { id: 'note_2', name: 'Two', content: '', collection: 'old', created: 1, lastModified: 1, tags: [] };
    await Promise.all([
        fs.writeJson(collectionsPath, originalCollections),
        fs.writeJson(firstPath, firstNote),
        fs.writeJson(secondPath, secondNote)
    ]);

    let failed = false;
    const failOnceOnSecondNote = async (filePath, value) => {
        if (!failed && filePath === secondPath) {
            failed = true;
            throw new Error('synthetic disk failure');
        }
        return writeJsonAtomic(filePath, value);
    };

    await assert.rejects(() => applyCollectionMutationTransaction({
        fs,
        collectionsPath,
        collections: [{ key: 'new', name: 'New' }],
        noteAssignments: [
            { noteId: 'note_1', path: firstPath, collection: 'new' },
            { noteId: 'note_2', path: secondPath, collection: 'new' }
        ],
        timestamp: 2,
        writeJson: failOnceOnSecondNote
    }), /rolled back/);

    assert.deepEqual(await fs.readJson(collectionsPath), originalCollections);
    assert.deepEqual(await fs.readJson(firstPath), firstNote);
    assert.deepEqual(await fs.readJson(secondPath), secondNote);
});
