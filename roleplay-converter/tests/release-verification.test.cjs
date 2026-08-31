'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const APP_ROOT = path.resolve(__dirname, '..');
const TOOLKIT_ROOT = path.resolve(APP_ROOT, '..');
const projectsRouter = require(path.join(TOOLKIT_ROOT, 'server', 'projects.js'));
const read = relativePath => fs.readFileSync(path.join(TOOLKIT_ROOT, relativePath), 'utf8');

test('release artifacts cover migration, rollback, browser fixtures, and server smoke', () => {
    const migration = read('roleplay-converter/MODERNIZATION-MIGRATION.md');
    const browserHarness = read('roleplay-converter/tests/release-browser-smoke.html');
    const serverSmoke = read('roleplay-converter/tests/release-server-smoke.cjs');

    assert.match(migration, /Legacy projects are migrated in memory/i);
    assert.match(migration, /Rollback/i);
    assert.match(browserHarness, /fixture-manifest\.json/);
    assert.match(browserHarness, /legacy-v0/);
    assert.match(browserHarness, /shortStory[\s\S]*longStory/);
    assert.match(serverSmoke, /first-save[\s\S]*reload[\s\S]*resave/i);
});

test('client project data and server assets share title normalization', () => {
    const formBinding = read('roleplay-converter/modules/form-binding.js');
    const renderer = read('roleplay-converter/html-generator.js');
    const serverAssets = read('server/roleplay-assets.js');
    for (const source of [formBinding, renderer, serverAssets]) {
        assert.match(source, /replace\(\/\\s\+\/g, '-'/);
    }
});

test('Lore Codex site preparation installs the Netlify read-through kit idempotently', async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-archiver-release-'));
    try {
        fs.writeFileSync(path.join(temporaryRoot, 'package.json'), JSON.stringify({
            name: 'synthetic-lore-codex-site', dependencies: { existing: '^1.0.0' }
        }), 'utf8');
        fs.writeFileSync(path.join(temporaryRoot, '.gitignore'), 'dist/\n', 'utf8');

        const first = await projectsRouter.installNetlifyReadThroughKit(temporaryRoot);
        const second = await projectsRouter.installNetlifyReadThroughKit(temporaryRoot);
        const packageData = JSON.parse(fs.readFileSync(path.join(temporaryRoot, 'package.json'), 'utf8'));
        const ignoreLines = fs.readFileSync(path.join(temporaryRoot, '.gitignore'), 'utf8').trim().split(/\r?\n/);

        assert.deepEqual(first, second);
        assert.equal(fs.existsSync(path.join(temporaryRoot, 'netlify', 'functions', 'read-through-comments.mjs')), true);
        assert.equal(fs.existsSync(path.join(temporaryRoot, 'READ-THROUGH-DEPLOYMENT.md')), true);
        assert.equal(packageData.dependencies.existing, '^1.0.0');
        assert.equal(packageData.dependencies['@netlify/blobs'], '^11.0.1');
        assert.equal(ignoreLines.filter(line => line === '.netlify/').length, 1);
        assert.equal(ignoreLines.filter(line => line === 'node_modules/').length, 1);
    } finally {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
});

test('Netlify Function kit and existing-file upgrader retain their deployment contracts', () => {
    const netlifyFunction = read('roleplay-converter/hosting/netlify-comments/netlify/functions/read-through-comments.mjs');
    const packageData = JSON.parse(read('roleplay-converter/hosting/netlify-comments/package.json'));
    const upgrader = read('roleplay-converter/hosting/enable-existing-read-through.js');

    assert.match(netlifyFunction, /path:\s*['"]\/api\/read-through\/comments['"]/);
    assert.match(netlifyFunction, /getStore\(STORE_NAME\)/);
    assert.equal(packageData.dependencies['@netlify/blobs'], '^11.0.1');
    assert.match(upgrader, /data-rp-anchor="rp-block-/);
    assert.match(upgrader, /alreadyEnabled/);
});
