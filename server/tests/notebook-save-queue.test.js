'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { NotebookSaveQueue } = require('../../main/notebook/note-save-queue');

test('Notebook save queue serializes writes and coalesces pending revisions', async () => {
    const persisted = [];
    let releaseFirst;
    const firstGate = new Promise(resolve => {
        releaseFirst = resolve;
    });

    const queue = new NotebookSaveQueue(async snapshot => {
        persisted.push(snapshot.content);
        if (snapshot.content === 'first') await firstGate;
        return { ...snapshot, saved: true };
    });

    const first = queue.save('user:notebook:note', 1, { content: 'first' });
    const second = queue.save('user:notebook:note', 2, { content: 'second' });
    const third = queue.save('user:notebook:note', 3, { content: 'third' });

    releaseFirst();
    const [firstResult, secondResult, thirdResult] = await Promise.all([first, second, third]);

    assert.deepEqual(persisted, ['first', 'third']);
    assert.equal(firstResult.revision, 1);
    assert.equal(secondResult.revision, 3);
    assert.equal(thirdResult.value.content, 'third');
});

