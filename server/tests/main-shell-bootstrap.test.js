const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('main shell has one explicit bootstrap owner', () => {
    const html = read('main/index.html');
    const bootstrap = read('main/app/bootstrap.js');

    assert.equal((html.match(/app\/bootstrap\.js/g) || []).length, 1);
    assert.match(bootstrap, /await authManager\.whenReady\(\)/);
    assert.equal((bootstrap.match(/new modules\.MainPageManager/g) || []).length, 1);
    assert.equal((bootstrap.match(/new modules\.MySitesManager/g) || []).length, 1);
    assert.doesNotMatch(html, /cowriter\/session-client\.js|switchToTab\(/);
});

test('manager modules export constructors without self-starting', () => {
    const files = [
        ['main/main.js', 'MainPageManager'],
        ['main/my-sites.js', 'MySitesManager'],
        ['main/settings.js', 'SettingsManager'],
        ['main/notebook/notebook.js', 'NotebookManager'],
        ['main/notebook/notebook-themes.js', 'NotebookThemeManager'],
        ['main/notebook/notebook-workspace-manager.js', 'NotebookWorkspaceManager'],
        ['main/cowriter/cowriter.js', 'CoWriterManager'],
        ['main/about/about.js', 'AboutManager']
    ];

    for (const [file, constructorName] of files) {
        const source = read(file);
        assert.match(source, new RegExp(`window\\.ToolkitModules\\.${constructorName} = ${constructorName}`), file);
        assert.doesNotMatch(source, /DOMContentLoaded/, file);
    }
});

test('tabs and navigation have one stateful path without timing fallbacks', () => {
    const tabs = read('main/app/tabs.js');
    const navigation = read('main/app/navigation.js');
    const mySites = read('main/my-sites.js');
    const main = read('main/main.js');

    assert.match(tabs, /this\.activeTab === tabName/);
    assert.doesNotMatch(mySites, /switchToTab|MutationObserver|2000/);
    assert.match(navigation, /requestAnimationFrame/);
    assert.doesNotMatch(navigation, /setTimeout/);
    assert.doesNotMatch(main, /http:\/\/localhost:9000|showServerStartInstructions/);
});

test('shell compatibility surface is deliberate and auth changes are event based', () => {
    const bootstrap = read('main/app/bootstrap.js');
    const auth = read('main/user/auth.js');

    assert.match(bootstrap, /COMPATIBILITY_GLOBALS/);
    assert.match(bootstrap, /addEventListener\('auth:changed'/);
    assert.doesNotMatch(auth, /updateUserDisplay\s*=/);
    assert.match(auth, /new CustomEvent\('auth:changed'/);
});
