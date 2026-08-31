'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    planDelete,
    planRename,
    remapKeySet,
    slugifyCollectionName
} = require('../../main/notebook/collection-model');

const collections = [
    { key: '', name: 'Uncategorized', notes: [], parent: null, level: 0 },
    { key: 'world', name: 'World', notes: ['n1'], parent: null, level: 1 },
    { key: 'world/places', name: 'Places', notes: ['n2'], parent: 'world', level: 2 },
    { key: 'world/places/cities', name: 'Cities', notes: ['n3'], parent: 'world/places', level: 3 },
    { key: 'characters', name: 'Characters', notes: [], parent: null, level: 1 }
];
const notes = [
    { id: 'n1', collection: 'world' },
    { id: 'n2', collection: 'world/places' },
    { id: 'n3', collection: 'world/places/cities' }
];

test('collection names produce stable safe path segments', () => {
    assert.equal(slugifyCollectionName('  World / Lore  '), 'world-lore');
    assert.throws(() => slugifyCollectionName('///'), /usable character/);
});

test('renaming a parent remaps descendants, parents, notes, and collapsed keys', () => {
    const plan = planRename(collections, notes, 'world', 'Setting Guide', '#123456');
    const cities = plan.collections.find(item => item.name === 'Cities');

    assert.equal(plan.newRootKey, 'setting-guide');
    assert.equal(cities.key, 'setting-guide/places/cities');
    assert.equal(cities.parent, 'setting-guide/places');
    assert.deepEqual(plan.assignments, [
        { noteId: 'n1', collection: 'setting-guide' },
        { noteId: 'n2', collection: 'setting-guide/places' },
        { noteId: 'n3', collection: 'setting-guide/places/cities' }
    ]);
    assert.deepEqual(
        [...remapKeySet(new Set(['world', 'world/places']), plan.keyMap)],
        ['setting-guide', 'setting-guide/places']
    );
});

test('renaming rejects a sibling collision', () => {
    assert.throws(
        () => planRename(collections, notes, 'world', 'Characters', '#123456'),
        /already exists/
    );
});

test('deleting a parent removes its full subtree and uncategorizes every note', () => {
    const plan = planDelete(collections, notes, 'world');

    assert.deepEqual([...plan.affectedKeys], ['world', 'world/places', 'world/places/cities']);
    assert.deepEqual(plan.assignments, [
        { noteId: 'n1', collection: '' },
        { noteId: 'n2', collection: '' },
        { noteId: 'n3', collection: '' }
    ]);
    assert.deepEqual(plan.collections.map(item => item.key), ['', 'characters']);
});
