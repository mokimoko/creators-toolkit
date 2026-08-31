const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const projectRoot = path.resolve(__dirname, '..', '..');

test('main shell buttons, tabs, menus, and dialogs expose native accessible semantics', async () => {
    const html = await fs.readFile(path.join(projectRoot, 'main', 'index.html'), 'utf8');
    const document = new JSDOM(html).window.document;

    document.querySelectorAll('button').forEach(button => {
        assert.ok(button.getAttribute('type'), `button missing type: ${button.id || button.className}`);
        const hasVisibleText = button.textContent.trim().length > 0;
        assert.ok(hasVisibleText || button.getAttribute('aria-label') || button.getAttribute('title'),
            `icon button missing name: ${button.id || button.className}`);
    });
    assert.equal(document.querySelectorAll('.main-tabs[role="tablist"] > [role="tab"]').length, 4);
    assert.ok(document.querySelector('.user-menu-trigger[aria-expanded]'));
    assert.equal(document.querySelectorAll('#user-context-menu [role="menuitem"]').length, 2);
    ['tags-modal', 'auth-modal', 'settings-modal', 'about-modal'].forEach(id => {
        const dialog = document.getElementById(id);
        assert.equal(dialog.getAttribute('role'), 'dialog');
        assert.equal(dialog.getAttribute('aria-modal'), 'true');
        assert.ok(dialog.getAttribute('aria-label') || dialog.getAttribute('aria-labelledby'));
    });
});

test('shell markup and runtime avoid inline executable and style components', async () => {
    const files = [
        'main/index.html', 'main/my-sites.js', 'main/user/auth.js', 'main/notebook/notebook.js',
        'main/notebook/notebook-themes.js', 'main/notebook/notebook-export.js',
        'main/notebook/note-linking.js', 'main/notebook/notebook-workspace-manager.js'
    ];
    const sources = await Promise.all(files.map(file => fs.readFile(path.join(projectRoot, file), 'utf8')));
    assert.doesNotMatch(sources[0], /\sstyle=/i);
    sources.forEach(source => {
        assert.doesNotMatch(source, /style\.cssText/);
        assert.doesNotMatch(source, /onclick=/i);
    });
});

test('shared shell layer defines focus, restrained motion, contrast, and narrow layouts', async () => {
    const css = await fs.readFile(path.join(projectRoot, 'main', 'shell-primitives.css'), 'utf8');
    assert.match(css, /:focus-visible/);
    assert.match(css, /transform:\s*none/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /@media \(max-width:\s*720px\)/);
    assert.match(css, /--shell-disabled:/);
    assert.match(css, /--text-tertiary:/);
});
