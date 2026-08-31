'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const APP_ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(APP_ROOT, relativePath), 'utf8');
}

test('editor opens on the preview-first workflow with clear actions', () => {
    const index = read('index.html');

    assert.ok(index.indexOf('id="preview-tab"') < index.indexOf('id="html-tab"'));
    assert.match(index, /class="tab active" id="preview-tab"/);
    assert.match(index, /id="convert-btn"[^>]*>[\s\S]*Generate preview/);
    assert.match(index, /id="save-project-btn"[^>]*disabled>[\s\S]*Save project/);
    assert.match(index, /id="export-html-btn"[^>]*disabled>[\s\S]*Export HTML/);
    assert.match(index, /id="download-fallback-btn"[\s\S]*Download instead/);
    assert.match(index, /id="copy-btn"[^>]*disabled>[\s\S]*Copy HTML/);
    assert.match(index, /id="preview-frame" title="Generated roleplay preview"/);
    assert.match(index, /id="status-container"[^>]*aria-live="polite"/);
});

test('desktop sidebar and narrow section picker expose the same ten sections', () => {
    const index = read('index.html');
    const sidebarItems = index.match(/class="sidebar-item(?: active)?"/g) || [];
    const pickerOptions = index.match(/<option value="(?:story-info|characters|banner|media|soundtrack|navigation|text-input|glossary|comments|generate)">/g) || [];

    assert.equal(sidebarItems.length, 10);
    assert.equal(pickerOptions.length, 10);
    assert.match(index, /id="mobile-section-picker"/);
    assert.match(read('sidebar.js'), /mobilePicker\?\.addEventListener\('change'/);
});

test('editor refresh defines focus, reduced-motion, and compact responsive contracts', () => {
    const refresh = read('css/editor-refresh.css');

    assert.match(refresh, /:focus-visible/);
    assert.match(refresh, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(refresh, /@media \(max-width: 720px\)/);
    assert.match(refresh, /\.content-sidebar\s*\{[\s\S]*width: 216px/);
    assert.match(refresh, /\.content-sidebar\.collapsed\s*\{[\s\S]*width: 48px/);
    assert.match(refresh, /\.mobile-section-nav\s*\{[\s\S]*display: none/);
    assert.match(refresh, /\.btn-main-action\.is-generating::before/);
});

test('Create exposes a painted and accessible generation state', () => {
    const previewExport = read('modules/preview-export.js');
    const saveExport = read('modules/save-export.js');

    assert.match(previewExport, /classList\.add\('is-generating'\)/);
    assert.match(previewExport, /setAttribute\('aria-busy', 'true'\)/);
    assert.match(previewExport, /requestAnimationFrame/);
    assert.match(previewExport, /classList\.remove\('is-generating'\)/);
    assert.match(previewExport, /setGenerationInProgress\(true\)/);
    assert.match(previewExport, /setGenerationInProgress\(false\)/);
    assert.match(saveExport, /generationInProgress \|\| !generatedDocumentReady/);
});

test('Precision Brass supplies the selected font and control surfaces', () => {
    const index = read('index.html');
    const refresh = read('css/editor-refresh.css');

    assert.match(index, /family=Instrument\+Sans/);
    assert.match(refresh, /--button-font-family:\s*"Instrument Sans"/);
    assert.match(refresh, /--button-surface:\s*#22241f/);
    assert.match(refresh, /box-shadow:\s*inset 0 1px rgba\(255, 255, 255, 0\.24\)/);
});

test('editor sources avoid inline style attributes and broad transitions', () => {
    const markupSources = ['index.html', 'converter.js', 'main.js'];
    markupSources.forEach(file => assert.doesNotMatch(read(file), /style="/i, file));

    const editorStyles = [
        'css/main.css',
        'css/components.css',
        'css/content.css',
        'css/layout.css',
        'css/editor-refresh.css',
        'about/rp-archiver-about.css',
        'user/auth-ui.css',
        'rp-project-styles.css',
        'read-through/archiver-read-through.css'
    ];
    editorStyles.forEach(file => assert.doesNotMatch(read(file), /transition:\s*all\b/i, file));
});

test('top navigation controls keep the dark editor treatment', () => {
    const main = read('css/main.css');
    const homeHover = main.match(/\.nav-home-btn:hover\s*\{([^}]*)\}/)?.[1] || '';
    const userMenuItem = main.match(/\.user-context-menu \.context-menu-item\s*\{([^}]*)\}/)?.[1] || '';

    assert.match(homeHover, /border-color:\s*var\(--border-secondary\)/);
    assert.doesNotMatch(homeHover, /border:\s*none/);
    assert.match(userMenuItem, /appearance:\s*none/);
    assert.match(userMenuItem, /background:\s*transparent/);
    assert.match(userMenuItem, /border:\s*0/);
    assert.match(userMenuItem, /width:\s*100%/);
});

test('organized imports preserve their storage folder for media checks', () => {
    const loader = read('rp-project-loader.js');
    const imports = read('import-export.js');
    const structuredBinding = read('modules/form-binding.js');
    const legacyImport = read('modules/legacy-import.js');

    assert.match(loader, /storageUniverse:\s*result\.universe\s*\|\|\s*universe/);
    assert.match(imports, /applyStructuredProject\(structuredProject, doc, importContext\)/);
    assert.match(imports, /importHTML\(htmlContent, importContext\)/);
    assert.match(structuredBinding, /importContext\.storageUniverse\s*\|\|\s*story\.universe/);
    assert.match(legacyImport, /importContext\.storageUniverse[\s\S]*document\.getElementById\('universe'\)\.value/);
});

test('file buttons route through the shared picker with a click fallback', () => {
    const main = read('main.js');
    const index = read('index.html');

    assert.match(main, /window\.ToolkitFilePicker\.open\(fileInput\)/);
    assert.match(main, /fileInput\.click\(\)/);
    assert.equal((main.match(/openFilePicker\(/g) || []).length, 6);
    assert.match(index, /\.\.\/utils\/file-picker\.js/);
});
