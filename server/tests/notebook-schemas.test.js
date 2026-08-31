'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    NOTE_CONTENT_MAX_BYTES,
    normalizeNoteDocument,
    normalizeNotebookSettings,
    normalizeSnippetDocument
} = require('../notebook-schemas');

test('Notebook note projection drops unknown fields and derives canonical values', () => {
    const note = normalizeNoteDocument({
        id: 'note_123',
        name: '  Chapter   Notes  ',
        content: 'one two\nthree',
        collection: 'drafts/chapter-one',
        tags: ['draft', 'draft'],
        created: 100,
        injected: '<script>alert(1)</script>'
    });

    assert.deepEqual(Object.keys(note), [
        'id', 'name', 'content', 'collection', 'created', 'lastModified', 'tags', 'wordCount'
    ]);
    assert.equal(note.name, 'Chapter Notes');
    assert.equal(note.wordCount, 3);
    assert.deepEqual(note.tags, ['draft']);
});

test('Notebook documents enforce content, tag, source, and session limits', () => {
    assert.throws(() => normalizeNoteDocument({
        id: 'note_large',
        name: 'Large',
        content: 'x'.repeat(NOTE_CONTENT_MAX_BYTES + 1)
    }), /limit/);
    assert.throws(() => normalizeSnippetDocument({
        id: 'snippet_1',
        title: 'Snippet',
        content: 'Text',
        sourceType: 'remote-script'
    }), /source type/);
    assert.throws(() => normalizeSnippetDocument({
        id: 'snippet_1',
        title: 'Snippet',
        content: 'Text',
        chatSessionId: 'bad\nreference'
    }), /session reference/);
});

test('Notebook settings are projected to their supported contract', () => {
    assert.deepEqual(normalizeNotebookSettings({
        collections: ['', 'drafts', 'drafts'],
        defaultCollection: 'drafts',
        autoSave: true,
        autoSaveInterval: 15000,
        wordWrap: false,
        previewMode: true,
        arbitrarySetting: 'ignored'
    }), {
        collections: ['', 'drafts'],
        defaultCollection: 'drafts',
        autoSave: true,
        autoSaveInterval: 15000,
        wordWrap: false,
        previewMode: true
    });
});
