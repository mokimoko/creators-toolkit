'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    FIXTURE_ROOT,
    PROJECT_ROOT,
    extractTemplateId,
    inspectHtml,
    scanFiles,
    scanFixtures,
    structureSignature
} = require('./compatibility-audit.cjs');

test('all six synthetic legacy structures match their manifest', () => {
    const { results } = scanFixtures();
    assert.equal(results.length, 6);

    for (const fixture of results) {
        for (const [field, expectedValue] of Object.entries(fixture.expected)) {
            assert.equal(fixture.actual[field], expectedValue, `${fixture.file}: ${field}`);
        }
    }

    assert.equal(new Set(results.map(result => structureSignature(result.actual))).size, 6);
});

test('the scanner recognizes future structured project data', () => {
    const html = '<div id="part-abc_123-content"></div>' +
        '<script type="application/json" id="rp-archiver-project-data">{"schemaVersion":2}</script>';
    const result = inspectHtml(html);
    assert.equal(result.hasStructuredProjectData, true);
    assert.equal(result.hasPartContainers, true);
});

test('fixture scans are aggregate and do not require user project data', () => {
    const fixtureFiles = fs.readdirSync(FIXTURE_ROOT)
        .filter(name => name.endsWith('.html'))
        .map(name => path.join(FIXTURE_ROOT, name));
    const result = scanFiles(fixtureFiles);
    assert.equal(result.files, 6);
    assert.equal(result.structuredProjectFiles, 0);
    assert.equal(result.variants.length, 6);
});

test('all catalogued CSS templates exist and contain substantial styles', () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'template-catalog.json'), 'utf8'));
    const templateRoot = path.join(PROJECT_ROOT, 'roleplay-converter', 'templates');
    assert.equal(catalog.templates.length, 18);
    assert.equal(new Set(catalog.templates).size, 18);

    for (const template of catalog.templates) {
        assert.match(template, /^generated(?:-\d+)?\.css$/);
        const templatePath = path.join(templateRoot, template);
        assert.equal(fs.existsSync(templatePath), true, `${template} exists`);
        assert.ok(fs.statSync(templatePath).size > 1000, `${template} is not unexpectedly empty`);
    }
});

test('content edge cases remain represented by synthetic data', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'edge-case-manifest.json'), 'utf8'));
    const source = fs.readFileSync(path.join(FIXTURE_ROOT, manifest.fixture), 'utf8');

    assert.equal(manifest.covers.length, 7);
    assert.match(source, /<title>Project - Alpha - Universe - Beta<\/title>/);
    assert.match(source, /A\+B:/);
    assert.match(source, /Dr\. \[X\]:/);
    assert.match(source, /李雷:/);
    assert.match(source, /Raw <em>HTML<\/em> survives/);
    assert.match(source, /class="rp-footnote-ref"/);
    assert.match(source, /class="glossary-link"/);
    assert.match(source, /intentionally-missing-(?:background|story-image)/);
});

test('all 18 template metadata variants have import fixtures', () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'template-catalog.json'), 'utf8'));
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'template-import-cases.json'), 'utf8'));

    assert.equal(fixture.cases.length, 18);
    assert.deepEqual(
        fixture.cases.map(item => item.template).sort(),
        [...catalog.templates].sort()
    );

    for (const item of fixture.cases) {
        assert.equal(extractTemplateId(item.html), item.template);
    }
});
