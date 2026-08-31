'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    buildNoteArchiveEntries,
    buildSnippetArchiveEntries,
    createAttachmentHeader,
    createNoteMarkdown,
    sanitizeFilename
} = require('../notebook-export-service');

test('Notebook export preserves hierarchy and produces safe deterministic names', () => {
    const collections = [
        { key: 'world', name: 'World', parent: null },
        { key: 'world/people', name: 'People', parent: 'world' }
    ];
    const notes = [
        { id: 'note_b', name: 'Same Name', collection: 'world/people', content: 'Second' },
        { id: 'note_a', name: 'Same Name', collection: 'world/people', content: 'First' }
    ];

    const entries = buildNoteArchiveEntries(notes, collections);

    assert.deepEqual(entries.map(entry => entry.name), [
        'World/People/Same-Name.md',
        'World/People/Same-Name-2.md'
    ]);
    assert.equal(sanitizeFilename('雪のノート'), '雪のノート');
    assert.match(createAttachmentHeader('雪のノート.md'), /filename="download\.md"; filename\*=UTF-8''/);
});

test('Notebook export safely encodes titles and retains untagged snippets', () => {
    const markdown = createNoteMarkdown({
        name: 'A "quote"\nInjected: yes',
        content: 'Body',
        created: '2026-08-30T12:00:00Z',
        lastModified: '2026-08-30T13:00:00Z'
    });
    const snippetEntries = buildSnippetArchiveEntries([
        { id: 'snippet_a', title: 'Loose', content: 'No tags', tags: [] },
        { id: 'snippet_b', title: 'One', content: 'First tag', tags: ['World?'] },
        { id: 'snippet_c', title: 'Two', content: 'Second tag', tags: ['World*'] }
    ]);

    assert.match(markdown, /title: "A \\"quote\\" Injected: yes"/);
    assert.doesNotMatch(markdown.split('---')[1], /\nInjected:/);
    assert.deepEqual(snippetEntries.map(entry => entry.name), [
        'Snippets/untagged-snippets.md',
        'Snippets/World-snippets.md',
        'Snippets/World-snippets-2.md'
    ]);
    assert.match(snippetEntries[0].content, /No tags/);
});
