'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const html = read('index.html');
const accessibility = read('modules/app/accessibility.js');
const editorShell = read('modules/app/editor-shell.js');
const entry = read('info-converter.js');
const feedback = read('modules/app/ui-feedback.js');
const refreshCss = read('css/editor-refresh.css');

assert.match(html, /class="main-tab-list"[^>]*role="tablist"[^>]*aria-label=/i, 'main navigation has a labelled tablist');
assert.match(html, /class="tabs"[^>]*role="tablist"[^>]*aria-label=/i, 'export views have a labelled tablist');
assert.equal((html.match(/class="main-tab(?: active)?"\s+data-tab=/g) || []).length, 5, 'five primary tabs remain present');

for (const tabName of ['project', 'content', 'appearance', 'pages', 'generate']) {
    assert.match(html, new RegExp(`id="${tabName}-content"`), `${tabName} tab panel remains addressable`);
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'editor markup has no duplicate IDs');

for (const match of html.matchAll(/<input\b([^>]*\btype="(?:color|file|range)"[^>]*)>/gi)) {
    assert.match(match[1], /\b(?:id|aria-label|aria-labelledby)="/i, `specialized input needs a stable naming hook: ${match[0]}`);
}

for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const attributes = match[1];
    const visibleText = match[2].replace(/<[^>]+>/g, '').replace(/&times;|&#215;/gi, '').trim();
    if (visibleText) continue;
    assert.match(
        attributes,
        /\b(?:id|title|aria-label|aria-labelledby)="|\bclass="[^"]*(?:close|modal-close|text-editor-close)/i,
        `icon-only button needs a stable name hook: ${match[0].slice(0, 160)}`
    );
}

assert.match(accessibility, /aria-selected/, 'tab state is exposed');
assert.match(accessibility, /ArrowLeft.*ArrowRight|ArrowRight.*ArrowLeft/s, 'arrow-key tab navigation is implemented');
assert.match(accessibility, /aria-modal/, 'dialog modality is exposed');
assert.match(accessibility, /FOCUSABLE_SELECTOR/, 'dialog focus trapping uses a bounded focusable set');
assert.match(accessibility, /_loreReturnFocus/, 'dialog opener focus is retained and restored');
assert.match(accessibility, /aria-describedby/, 'local helper and error descriptions are connected');
assert.match(accessibility, /\['color', 'file', 'range'\]/, 'range, color, and file naming is covered');
assert.match(accessibility, /aria-level/, 'legacy heading levels are normalized');
assert.match(accessibility, /syncContentNavigation/, 'content categories use synchronized keyboard semantics');
assert.match(entry, /createAccessibilityController/, 'the accessibility controller is composed by the app entry');
assert.match(editorShell, /initializeAccessibility\(\)/, 'accessibility behavior initializes with the editor shell');
assert.match(editorShell, /aria-expanded/, 'collapsible controls expose their expanded state');

assert.match(feedback, /type === 'error' \? 'alert' : 'status'/, 'errors and routine status use distinct announcement urgency');
assert.match(html, /id="toast-container"[^>]*aria-live="polite"/i, 'notification container is a live region before scripts run');
assert.match(refreshCss, /:focus-visible/, 'the editor has a visible focus treatment');
assert.match(refreshCss, /prefers-reduced-motion:\s*reduce/, 'the editor honors reduced-motion preference');

console.log('Lore Codex accessibility static checks passed.');
