'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const {
    sanitizeHtml
} = require('../../main/cowriter/markdown-security');

function createPurifier() {
    const window = new JSDOM('').window;
    return createDOMPurify(window);
}

test('CoWriter Markdown sanitizer removes executable and privacy-sensitive HTML', () => {
    const purifier = createPurifier();
    const dirtyHtml = [
        '<script>alert(1)</script>',
        '<p onclick="alert(2)">Safe text</p>',
        '<a href="javascript:alert(3)" target="_blank">bad link</a>',
        '<a href="jAvAsCrIpT&#58;alert(4)">encoded link</a>',
        '<svg><a onload="alert(5)"></a></svg>',
        '<math><mtext><img src=x onerror=alert(6)></mtext></math>',
        '<img src="https://tracking.example/pixel" alt="tracker">',
        '<a href="https://example.com/page">safe external link</a>',
        '<strong>Formatting survives</strong>'
    ].join('');

    const cleanHtml = sanitizeHtml(dirtyHtml, purifier);

    assert.doesNotMatch(cleanHtml, /<script|onclick|javascript:|target=|<svg|<math|<img|onerror|onload/i);
    assert.match(cleanHtml, /<p>Safe text<\/p>/);
    assert.match(cleanHtml, /href="https:\/\/example\.com\/page" rel="noopener noreferrer"/);
    assert.match(cleanHtml, /<strong>Formatting survives<\/strong>/);
});
