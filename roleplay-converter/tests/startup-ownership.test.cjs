'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const APP_ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(APP_ROOT, relativePath), 'utf8');
}

function count(source, pattern) {
    return (source.match(pattern) || []).length;
}

test('main owns the editor bootstrap and initializes components explicitly', () => {
    const main = read('main.js');
    assert.equal(count(main, /addEventListener\(['"]DOMContentLoaded['"]/g), 1);

    for (const initializer of [
        'initializeUserSystem',
        'initializeRPContextMenu',
        'initializeEventListeners',
        'initializeSidebar',
        'initializeFormHandlers'
    ]) {
        assert.match(main, new RegExp(`\\b${initializer}\\b`), `${initializer} is part of startup`);
    }

    for (const moduleName of [
        'about', 'generatedTemplate', 'notifications', 'previewExport',
        'projectLoader', 'readThroughEditor', 'themeManager'
    ]) {
        assert.match(main, new RegExp(`get\\(['"]${moduleName}['"]\\)`), `${moduleName} is part of startup`);
    }
});

test('generated document template and runtime are external editor resources', () => {
    const html = read('index.html');
    const loader = read('modules/generated-template.js');
    const template = read('generated-page/template.html');
    const runtime = read('generated-page/runtime.js');

    assert.doesNotMatch(html, /id="html-template"|template-container/);
    assert.match(template, /^<!DOCTYPE html>/);
    assert.match(template, /{{GENERATED_PAGE_RUNTIME}}/);
    assert.match(runtime, /function\s+initImageModal/);
    assert.doesNotMatch(runtime, /^\s*let\s+(?:currentImageIndex|galleryImages)/m);
    assert.match(loader, /generated-page\/template\.html/);
    assert.match(loader, /generated-page\/runtime\.js/);
});

test('core feature scripts register through the RPArchiver namespace', () => {
    const modules = {
        projectData: 'modules/project-data.js',
        formBinding: 'modules/form-binding.js',
        legacyImport: 'modules/legacy-import.js',
        htmlRenderer: 'html-generator.js',
        mediaAssets: 'modules/media-assets.js',
        previewExport: 'modules/preview-export.js',
        saveExport: 'modules/save-export.js',
        readThroughIntegration: 'modules/read-through-integration.js'
    };

    Object.entries(modules).forEach(([name, file]) => {
        assert.match(read(file), new RegExp(`define\\(['"]${name}['"]`), `${file} registers ${name}`);
    });
});

test('sidebar behaviors have one implementation', () => {
    const sources = ['main.js', 'sidebar.js'].map(read).join('\n');
    for (const functionName of ['initializeSidebar', 'toggleSidebar', 'switchToSection']) {
        assert.equal(
            count(sources, new RegExp(`function\\s+${functionName}\\s*\\(`, 'g')),
            1,
            `${functionName} has a single owner`
        );
    }
});

test('manual and project imports share the import controller', () => {
    const main = read('main.js');
    const loader = read('rp-project-loader.js');
    const importer = read('import-export.js');

    assert.doesNotMatch(main, /new\s+FileReader\s*\(/);
    assert.doesNotMatch(loader, /new\s+FileReader\s*\(/);
    assert.equal(count(importer, /new\s+FileReader\s*\(/g), 1);
    assert.match(main, /importRoleplayFile\s*\(/);
    assert.match(loader, /importRoleplayHTML\s*\(/);
});

test('the logger loads before application scripts', () => {
    const html = read('index.html');
    const loggerIndex = html.indexOf('<script src="modules/logger.js"></script>');
    const mainIndex = html.indexOf('<script src="main.js"></script>');
    assert.ok(loggerIndex >= 0, 'logger script exists');
    assert.ok(mainIndex > loggerIndex, 'logger loads before main');
});

test('routine import errors use in-app feedback instead of blocking alerts', () => {
    for (const sourceFile of ['main.js', 'form-handlers.js', 'rp-project-loader.js', 'import-export.js']) {
        assert.doesNotMatch(read(sourceFile), /\balert\s*\(/, `${sourceFile} contains no alert calls`);
    }
});
