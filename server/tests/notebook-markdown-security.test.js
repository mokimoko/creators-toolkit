'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const {
    sanitizeHtml
} = require('../../main/notebook/markdown-security');

function createPurifier() {
    const window = new JSDOM('').window;
    return createDOMPurify(window);
}

test('Notebook Markdown sanitizer blocks executable HTML and preserves supported formatting', () => {
    const dirtyHtml = [
        '<script>alert(1)</script>',
        '<p onclick="alert(2)">Safe text</p>',
        '<a href="javascript:alert(3)" target="_blank">bad link</a>',
        '<svg><a onload="alert(4)"></a></svg>',
        '<math><mtext><img src=x onerror=alert(5)></mtext></math>',
        '<img src="https://tracking.example/pixel" alt="tracker">',
        '<a href="https://example.com/page">safe external link</a>',
        '<a href="#" class="note-link broken" data-note-name="Missing Note">Missing Note</a>',
        '<mark>highlight</mark><u>underline</u>',
        '<div class="snippet-highlight">snippet<span class="snippet-tag">tag</span></div>',
        '<div class="unsafe-class">ordinary content</div>',
        '<table><tbody><tr><td>cell</td></tr></tbody></table>'
    ].join('');

    const cleanHtml = sanitizeHtml(dirtyHtml, createPurifier());

    assert.doesNotMatch(cleanHtml, /<script|onclick|javascript:|target=|<svg|<math|<img|onerror|onload/i);
    assert.match(cleanHtml, /href="https:\/\/example\.com\/page" rel="noopener noreferrer"/);
    assert.match(cleanHtml, /class="note-link broken" data-note-name="Missing Note"/);
    assert.match(cleanHtml, /<mark>highlight<\/mark><u>underline<\/u>/);
    assert.match(cleanHtml, /<div class="snippet-highlight">snippet<span class="snippet-tag">tag<\/span><\/div>/);
    assert.doesNotMatch(cleanHtml, /unsafe-class/);
    assert.match(cleanHtml, /<table><tbody><tr><td>cell<\/td><\/tr><\/tbody><\/table>/);
});
