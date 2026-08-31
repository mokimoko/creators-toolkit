'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const APP_ROOT = path.resolve(__dirname, '..');
const core = require('../read-through/shared-comments-core.js');

function read(relativePath) {
    return fs.readFileSync(path.join(APP_ROOT, relativePath), 'utf8');
}

test('read-through storage and anchor identities remain stable', () => {
    assert.equal(core.PROFILE_KEY, 'rp-read-through-profile-v1');
    assert.equal(core.CACHE_PREFIX, 'rp-read-through-cache-v1:');
    assert.equal(core.QUEUE_PREFIX, 'rp-read-through-queue-v1:');
    assert.equal(core.SEEN_PREFIX, 'rp-read-through-seen-v1:');
    assert.equal(core.BLOCK_SELECTOR, '.rp-container p, .rp-container .html-content');
    assert.equal(core.stableAnchorId(0), 'rp-block-00001');
    assert.equal(core.stableAnchorId(99999), 'rp-block-100000');
});

test('read-through primitives preserve cached-data and profile fallbacks', () => {
    const fallback = [];
    assert.deepEqual(core.parseJson('[{"id":"thread-1"}]', fallback), [{ id: 'thread-1' }]);
    assert.equal(core.parseJson('{broken', fallback), fallback);
    assert.equal(core.normalizeColor('#ABCDEF'), '#abcdef');
    assert.equal(core.normalizeColor('red'), '#b66a3c');
});

test('export asset assembly places core before the interaction runtime', () => {
    const editor = read('read-through/archiver-read-through.js');
    const runtime = read('read-through/shared-comments.js');
    assert.match(editor, /shared-comments-core\.js/);
    assert.match(editor, /`\$\{core\}\\n\$\{runtime\}`/);
    assert.match(runtime, /window\.RPReadThroughCore/);
    assert.match(runtime, /stableAnchorId\(index\)/);
    assert.match(runtime, /function readStorage\(key\)/);
    assert.match(runtime, /Sandboxed previews intentionally have no same-origin storage access/);
    assert.doesNotMatch(runtime, /(?<!window\.)localStorage\.(?:getItem|setItem|removeItem)/);
});

test('sandboxed previews can initialize when localStorage access is forbidden', () => {
    const sandbox = {
        console,
        crypto: { randomUUID: () => 'test-id' },
        document: {
            querySelector: () => null,
            readyState: 'complete',
            title: 'Sandboxed preview'
        },
        setTimeout,
        clearTimeout
    };
    sandbox.window = sandbox;
    Object.defineProperty(sandbox, 'localStorage', {
        get() { throw new Error('sandboxed without allow-same-origin'); }
    });

    assert.doesNotThrow(() => vm.runInNewContext(
        `${read('read-through/shared-comments-core.js')}\n${read('read-through/shared-comments.js')}`,
        sandbox
    ));
});
