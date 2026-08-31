'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const picker = require('../../main/utils/file-picker.js');
const APP_ROOT = path.resolve(__dirname, '..');
const TOOLKIT_ROOT = path.resolve(APP_ROOT, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(TOOLKIT_ROOT, relativePath), 'utf8');
}

test('shared picker converts broad image selection into explicit modern filters', () => {
    const types = picker.getPickerTypes('image/*');

    assert.equal(types.length, 1);
    assert.equal(types[0].description, 'Image files');
    assert.deepEqual(types[0].accept['image/jpeg'], ['.jpg', '.jpeg']);
    assert.deepEqual(types[0].accept['image/png'], ['.png']);
    assert.ok(Object.keys(types[0].accept).every(type => type !== 'image/*'));
});

test('shared picker preserves non-image import types', () => {
    const types = picker.getPickerTypes('.html,.htm,.json,.txt,.jsonl');

    assert.deepEqual(types.map(type => type.description), [
        'HTML files',
        'JSON files',
        'Text files'
    ]);
});

test('RP Archiver and Lore Codex opt their file controls into the shared picker', () => {
    const rpIndex = read('roleplay-converter/index.html');
    const loreIndex = read('info-converter/index.html');

    assert.match(rpIndex, /src="\.\.\/utils\/file-picker\.js"/);
    assert.match(loreIndex, /src="\.\.\/utils\/file-picker\.js"/);
    assert.equal((rpIndex.match(/data-toolkit-file-picker/g) || []).length, 5);
    assert.equal((loreIndex.match(/data-toolkit-file-picker/g) || []).length, 4);
    assert.doesNotMatch(rpIndex, /accept="image\/\*"/);
    assert.doesNotMatch(loreIndex, /id="import-image-file" accept="image\/\*"/);
});
