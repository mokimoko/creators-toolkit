'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectData = require('../modules/project-data.js');
const APP_ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(APP_ROOT, relativePath), 'utf8');
}

function representativeProject() {
    return {
        schemaVersion: 1,
        generatorVersion: 'test',
        story: {
            title: 'Project - Alpha </script>',
            subtitle: 'A synthetic story',
            description: 'Preserve <strong>source</strong> & symbols.',
            universe: 'Universe - Beta',
            pairing: 'A+B/李雷',
            updated: 'August 28, 2026',
            status: 'Ongoing'
        },
        characters: [
            { id: 'character-1', name: 'A+B', color: '#123456' },
            { id: 'character-2', name: '李雷', color: '#abcdef' }
        ],
        parts: [
            {
                id: 'part-1',
                title: 'Arrival',
                entries: [{ type: 'character', character: 'A+B', paragraphs: ['First **line**.'] }]
            },
            {
                id: 'part-2',
                title: 'Aftermath',
                entries: [{ type: 'character', character: '李雷', paragraphs: ['Raw <em>HTML</em>.'] }]
            }
        ],
        editor: {
            sourceText: 'A+B: First **line**.\n\n&&&PART&&&\n\n李雷: Raw <em>HTML</em>.',
            singleStory: false,
            usePartMarkers: true,
            noCharacters: false
        },
        media: {
            background: 'images/background.webp',
            banner: 'images/banner.png',
            storyImages: ['images/one.png', 'images/two.png']
        },
        soundtrack: [
            { type: 'heading', title: 'Act I' },
            { type: 'track', name: 'Theme', url: 'https://example.com/theme' }
        ],
        navigation: [{ label: 'Home', url: '../index.html' }],
        glossary: [{ id: 'glossary-1', term: 'Archive', definition: 'A record.' }],
        glossaryOptions: { firstOnly: true, showTooltips: true, showSection: false },
        comments: [
            { type: 'heading', title: 'Notes' },
            { type: 'comment', text: 'comment: Preserve this exactly.' }
        ],
        readThrough: {
            enabled: true,
            documentId: 'rp_test_identity',
            hostedUrl: 'https://example.netlify.app/story.html',
            endpoint: '/api/read-through/comments',
            cachedThreads: [{ id: 'thread-1', body: 'Keep me', targets: [{ anchor: 'rp-block-00001' }] }]
        },
        appearance: {
            template: 'generated-7.css',
            backgroundOpacity: 42,
            backgroundBlur: 7,
            banner: {
                size: 'large',
                showTitle: false,
                showSubtitle: true,
                titleFontSize: 40,
                titleColor: '#fedcba',
                subtitleColor: '#c0ffee'
            }
        }
    };
}

test('schema v2 defaults validate and normalize', () => {
    const result = projectData.validateProject(projectData.createDefaultProject());
    assert.equal(result.valid, true);
    assert.equal(result.project.schemaVersion, projectData.CURRENT_SCHEMA_VERSION);
    assert.deepEqual(result.errors, []);
});

test('embedded project data round-trips every compatibility field', () => {
    const project = projectData.normalizeProject(representativeProject());
    const html = projectData.injectProjectData('<!doctype html><html><head><title>Fixture</title></head><body></body></html>', project);

    assert.match(html, /name="rp-archiver-schema" content="2"/);
    assert.match(html, /id="rp-archiver-project-data"/);
    assert.doesNotMatch(html, /Project - Alpha <\/script>/);
    assert.deepEqual(projectData.extractProjectData(html), project);
});

test('embedding is idempotent and replaces stale payloads', () => {
    const first = projectData.injectProjectData('<html><head></head><body></body></html>', representativeProject());
    const changed = representativeProject();
    changed.story.title = 'Replacement';
    const second = projectData.injectProjectData(first, changed);

    assert.equal((second.match(/id="rp-archiver-project-data"/g) || []).length, 1);
    assert.equal((second.match(/name="rp-archiver-schema"/g) || []).length, 1);
    assert.equal(projectData.extractProjectData(second).story.title, 'Replacement');
});

test('schema v0 data migrates one step without changing the input', () => {
    const legacy = { schemaVersion: 0, sourceText: 'Narrator: Legacy source', story: { title: 'Legacy' } };
    const migrated = projectData.normalizeProject(legacy);

    assert.equal(migrated.schemaVersion, 2);
    assert.equal(migrated.editor.sourceText, 'Narrator: Legacy source');
    assert.equal(migrated.parts[0].sourceText, 'Narrator: Legacy source');
    assert.equal(legacy.schemaVersion, 0);
    assert.equal(legacy.sourceText, 'Narrator: Legacy source');
});

test('unsupported future and malformed payloads fail explicitly', () => {
    assert.throws(() => projectData.normalizeProject({ schemaVersion: 3 }), /newer than supported/);
    assert.throws(
        () => projectData.extractProjectData('<script type="application/json" id="rp-archiver-project-data">{oops}</script>'),
        /Invalid RP project data/
    );
});

test('schema v1 migrates marker-delimited source into exact structured part sources', () => {
    const migrated = projectData.normalizeProject(representativeProject());

    assert.equal(migrated.schemaVersion, 2);
    assert.equal(migrated.editor.usePartMarkers, false);
    assert.equal(migrated.parts[0].id, 'part-1');
    assert.equal(migrated.parts[0].sourceText, 'A+B: First **line**.');
    assert.equal(migrated.parts[1].sourceText, '李雷: Raw <em>HTML</em>.');
});

test('legacy source splitting preserves empty parts at every boundary', () => {
    const marker = projectData.LEGACY_PART_MARKER;
    const parts = projectData.splitLegacySourceText(`${marker}\nA: one\n${marker}\n${marker}`);

    assert.deepEqual(parts, ['', 'A: one', '', '']);
    const models = projectData.partsFromLegacySource(`${marker}\nA: one\n${marker}\n${marker}`, ['Opening']);
    assert.deepEqual(models.map(part => part.title), ['Opening', 'Part 2', 'Part 3', 'Part 4']);
    assert.equal(projectData.sourceTextFromParts(models), `\n\n${marker}\n\nA: one\n\n${marker}\n\n\n\n${marker}\n\n`);

    const extraTitles = projectData.partsFromLegacySource('A: one', ['One', 'Two', 'Three']);
    assert.deepEqual(extraTitles.map(part => part.sourceText), ['A: one', '', '']);
});

test('plain-text serialization can omit compatibility markers without dropping empty parts', () => {
    const parts = [
        { id: 'part-a', title: 'A', sourceText: 'Narrator: First' },
        { id: 'part-b', title: 'B', sourceText: '' },
        { id: 'part-c', title: 'C', sourceText: 'Narrator: Third' }
    ];

    assert.equal(
        projectData.sourceTextFromParts(parts, { includeMarkers: false }),
        'Narrator: First\n\n\n\nNarrator: Third'
    );
});

test('browser integration keeps model, binding, renderer, and import responsibilities separate', () => {
    const index = read('index.html');
    const model = read('modules/project-data.js');
    const binding = read('modules/form-binding.js');
    const generator = read('html-generator.js');
    const importer = read('import-export.js');
    const readThrough = read('read-through/archiver-read-through.js');

    const modelIndex = index.indexOf('<script src="modules/project-data.js"></script>');
    assert.ok(modelIndex > index.indexOf('<script src="form-handlers.js"></script>'));
    assert.ok(modelIndex < index.indexOf('<script src="html-generator.js"></script>'));
    assert.doesNotMatch(model, /function\s+fromForm|character-info|soundtrack-container/);
    assert.match(binding, /function\s+collectProject/);
    assert.match(binding, /function\s+applyStructuredProject/);
    assert.match(generator, /get\('formBinding'\)\.collectProject/);
    assert.match(generator, /projectData\.injectProjectData/);
    assert.match(importer, /projectData\.extractProjectData/);
    assert.match(importer, /sourceFormat:\s*'structured'/);
    assert.match(importer, /sourceFormat:\s*'legacy-v0'/);
    assert.match(readThrough, /importFromProject\(event\.detail\.project\.readThrough\)/);
});
