'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const APP_ROOT = path.resolve(__dirname, '..');
const TOOLKIT_ROOT = path.resolve(APP_ROOT, '..');
const assets = require(path.join(TOOLKIT_ROOT, 'server', 'roleplay-assets.js'));
const readApp = relativePath => fs.readFileSync(path.join(APP_ROOT, relativePath), 'utf8');
const readToolkit = relativePath => fs.readFileSync(path.join(TOOLKIT_ROOT, relativePath), 'utf8');

test('save, browser export, and fallback download are explicit independent actions', () => {
    const index = readApp('index.html');
    const main = readApp('main.js');
    const saveExport = readApp('modules/save-export.js');

    assert.match(index, /id="save-project-btn"[^>]*disabled/);
    assert.match(index, /id="export-html-btn"[^>]*disabled/);
    assert.match(index, /id="update-lore-copy-btn"[^>]*hidden disabled/);
    assert.match(index, /id="save-fallback"[^>]*hidden/);
    assert.match(main, /saveExport'\)\.saveProject\(\)/);
    assert.match(main, /saveExport'\)\.exportHTML\(\)/);
    assert.match(main, /saveExport'\)\.downloadFallback\(\)/);
    assert.match(main, /saveExport'\)\.updateLoreCopies\(\)/);
    assert.match(saveExport, /function saveProject\(/);
    assert.match(saveExport, /function exportHTML\(/);
    assert.match(saveExport, /function downloadFallback\(/);
    assert.match(saveExport, /function updateLoreCopies\(/);
    assert.doesNotMatch(saveExport, /Falling back|setTimeout\(\(\) =>\s*\{?\s*(?:fallback|triggerBrowserDownload)/i);
});

test('successful generation is the only path that enables save/export actions', () => {
    const main = readApp('main.js');
    const preview = readApp('modules/preview-export.js');
    const saveExport = readApp('modules/save-export.js');

    assert.doesNotMatch(main, /convertToHTML\(\)[\s\S]{0,180}disabled\s*=\s*false/);
    assert.match(preview, /saveExport\.invalidate\(\)/);
    assert.match(preview, /saveExport\.markGenerated\(html\)/);
    assert.match(saveExport, /generatedDocumentReady\s*=\s*Boolean\(value\.trim\(\)\)/);
    assert.match(saveExport, /stateHTML !== outputHTML/);
});

test('an existing Lore destination controls button visibility while exact save state controls activation', () => {
    const saveExport = readApp('modules/save-export.js');
    const renderer = readApp('html-generator.js');
    assert.match(renderer, /getCleanTitle,\s*\n\s*render: generateHTML/);
    assert.match(saveExport, /RPArchiver\.get\('htmlRenderer'\)\.getCleanTitle\(\)/);
    assert.doesNotMatch(saveExport, /typeof getCleanTitle/);
    assert.match(saveExport, /loreButton\.hidden = loreTargets\.length === 0/);
    assert.match(saveExport, /loreTargets = Array\.isArray\(result\.targets\)/);
    assert.doesNotMatch(saveExport, /loreTargets = result\.sourceExists/);
    assert.match(saveExport, /!savedCurrentDocument \|\| updated/);
    assert.match(saveExport, /refreshLoreLinks\(\{ reportErrors: true \}\)/);
});

test('asset paths and filename collisions resolve deterministically', () => {
    const options = {
        cleanTitle: assets.cleanRoleplayTitle('A Story: Again'),
        existingBackgroundPath: 'images/existing-background.webp',
        existingBannerPath: null,
        existingStoryPaths: ['images/a-story-again-image-1.png'],
        backgroundFile: null,
        bannerFile: { originalname: 'Banner.JPG' },
        storyImages: [{ originalname: 'First.PNG' }, { originalname: 'Second.webp' }]
    };
    const first = assets.buildRoleplayAssetPlan(options).map(({ role, source, path: assetPath }) => ({ role, source, path: assetPath }));
    const second = assets.buildRoleplayAssetPlan(options).map(({ role, source, path: assetPath }) => ({ role, source, path: assetPath }));

    assert.deepEqual(first, second);
    assert.deepEqual(first.map(item => item.path), [
        'images/existing-background.webp',
        'images/a-story-again-banner.jpg',
        'images/a-story-again-image-1.png',
        'images/a-story-again-image-2.png',
        'images/a-story-again-image-3.webp'
    ]);
    assert.equal(assets.classifyAssetWrite(false), 'created');
    assert.equal(assets.classifyAssetWrite(true), 'replaced');
});

test('server rejects missing inputs and returns a stable save manifest without rewriting HTML', () => {
    const projects = readToolkit('server/projects.js');

    assert.match(projects, /The selected CSS template is not available/);
    assert.match(projects, /could not be found:/);
    assert.match(projects, /assetManifest\s*=\s*\{/);
    assert.match(projects, /schemaVersion:\s*1/);
    assert.match(projects, /HTML is the commit point: write it once/);
    const saveRoute = projects.slice(
        projects.indexOf("router.post('/roleplay/save'"),
        projects.indexOf("router.post('/roleplay/check-images'")
    );
    assert.doesNotMatch(saveRoute, /html\.replace|replace\([^)]*html/i);
});

test('save and export reuse one generated document so read-through identity cannot drift', () => {
    const saveExport = readApp('modules/save-export.js');
    const readThrough = readApp('modules/read-through-integration.js');

    assert.match(saveExport, /const stateHTML = root\.RPArchiver\.get\('state'\)\.get\(\)\.generatedHTML/);
    assert.equal((saveExport.match(/getExportDetails\(\)/g) || []).length, 5);
    assert.match(saveExport, /savedGeneratedDocument !== details\.html/);
    assert.match(saveExport, /\/api\/roleplay\/update-lore-copies/);
    assert.match(readThrough, /rp-read-through-document-id/);
    assert.match(readThrough, /rp-read-through-linked-url/);
    assert.match(readThrough, /rp-read-through-cache/);
});
