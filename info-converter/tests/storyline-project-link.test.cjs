'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('storyline project links store their normalized filename', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'forms', 'storyline-controller.js'), 'utf8');
    assert.match(source, /link:\s*processedLink/);
    assert.match(source, /isProjectLink,\s*\n/);
    assert.doesNotMatch(source, /link:\s*document\.getElementById\('story-link'\)\.value\.trim\(\)/);
});
