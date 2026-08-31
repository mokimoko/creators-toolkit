'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

function loadLegacyImport() {
    let legacyImport;
    global.window = {
        RPArchiver: {
            get(name) {
                if (name === 'mediaAssets') return {};
                throw new Error(`Unexpected dependency: ${name}`);
            },
            define(name, value) {
                if (name === 'legacyImport') legacyImport = value;
            }
        }
    };
    const modulePath = path.resolve(__dirname, '..', 'modules', 'legacy-import.js');
    delete require.cache[modulePath];
    require(modulePath);
    delete global.window;
    return legacyImport;
}

function character(name, classes, style = '') {
    return {
        textContent: `${name}:`,
        classList: ['character-name', ...classes],
        getAttribute(attribute) {
            return attribute === 'style' ? style : '';
        }
    };
}

test('legacy colors follow imported character classes instead of current generated IDs', () => {
    const legacyImport = loadLegacyImport();
    const elements = [
        character('Ji Anshi', ['ji-anshi']),
        character('Qiu Zixin', ['Qiu_Zixin']),
        character('Ye Mingzhu', ['ye-mingzhu'], 'color: #abc;')
    ];
    const doc = { querySelectorAll: selector => selector === '.character-name' ? elements : [] };
    const style = {
        textContent: `
            .ji-anshi { font-weight: bold; color: #b88489; }
            .story-entry .Qiu_Zixin, .unused { color: #5A5667 !important; text-decoration: none; }
            .ye-mingzhu { color: #000000; }
        `
    };

    assert.deepEqual(legacyImport.extractLegacyCharacters(doc, style), [
        { name: 'Ji Anshi', color: '#b88489' },
        { name: 'Qiu Zixin', color: '#5a5667' },
        { name: 'Ye Mingzhu', color: '#aabbcc' }
    ]);
});
