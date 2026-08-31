const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_ROOT = path.resolve(__dirname, '..');
const TOOLKIT_ROOT = path.resolve(APP_ROOT, '..');
const security = require(path.join(APP_ROOT, 'modules', 'security.js'));
const pathSecurity = require(path.join(TOOLKIT_ROOT, 'server', 'path-security.js'));
const read = file => fs.readFileSync(path.join(TOOLKIT_ROOT, file), 'utf8');

test('character parsing and CSS identity handle regex and Unicode names safely', () => {
    assert.equal(security.escapeRegExp('A [B]+?'), 'A \\[B\\]\\+\\?');
    assert.notEqual(security.characterClass({ id: 'one', name: 'A B' }), security.characterClass({ id: 'two', name: 'A-B' }));
    assert.match(security.characterClass({ name: '王 小明' }), /^rp-character-/);

    global.window = { RPArchiver: { get: () => security } };
    global.document = { querySelectorAll: () => [] };
    const parser = require(path.join(APP_ROOT, 'parser.js'));
    const parsed = parser.parseRoleplayText('A [B]+?: hello there', [{ id: 'character-special', name: 'A [B]+?' }], {
        usePartMarkers: false,
        noCharacters: false
    });
    assert.equal(parsed[0].characterId, 'character-special');
    assert.equal(parser.countWords('Time: ten sharp', []), 3);
    assert.equal(parser.countWords('A [B]+?: hello there', ['A [B]+?']), 2);
    assert.match(parser.parseMarkdown('<script>alert(1)</script>'), /&lt;script&gt;/);
    delete global.window;
    delete global.document;
});

test('URLs and filesystem paths stay in their intended contexts', () => {
    assert.equal(security.safeURL('javascript:alert(1)'), '');
    assert.equal(security.safeURL('../index.html'), '../index.html');
    assert.equal(pathSecurity.normalizeMediaPath('../secret.png'), null);
    assert.equal(pathSecurity.normalizeMediaPath('images/story.png'), 'images/story.png');
    assert.equal(pathSecurity.isPathInside(path.join(APP_ROOT, 'tests'), APP_ROOT), true);
    assert.equal(pathSecurity.isPathInside(path.resolve(APP_ROOT, '..'), APP_ROOT), false);
});

test('preview and authentication use the hardened paths', () => {
    const index = read('roleplay-converter/index.html');
    const preview = read('roleplay-converter/modules/preview-export.js');
    const auth = read('roleplay-converter/user/user-session.js');
    assert.match(index, /id="preview-frame"[^>]+sandbox="allow-scripts"/);
    assert.match(index, /id="allow-raw-html"/);
    assert.match(preview, /iframe\.srcdoc/);
    assert.doesNotMatch(preview, /document\.write|iframeDoc/);
    assert.doesNotMatch(auth, /writingTools_users|password\s*:\s*password|trying local fallback/);
});
