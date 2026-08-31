(function initializeNotebookMarkdownSecurity(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.NotebookMarkdownSecurity = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createNotebookMarkdownSecurity() {
    'use strict';

    const configuredPurifiers = new WeakSet();
    const allowedTags = [
        'p', 'br', 'strong', 'em', 'code', 'pre',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'a', 'hr', 'del',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'mark', 'u', 'input', 'div', 'span'
    ];

    function isSafeLink(href) {
        if (typeof href !== 'string') {
            return false;
        }

        const normalizedHref = href.trim();
        if (!normalizedHref || /[\u0000-\u001F\u007F]/.test(normalizedHref)) {
            return false;
        }

        if (normalizedHref.startsWith('#')) {
            return true;
        }

        const schemeMatch = normalizedHref.match(/^([a-z][a-z0-9+.-]*):/i);
        return Boolean(schemeMatch && ['http', 'https', 'mailto'].includes(schemeMatch[1].toLowerCase()));
    }

    function configurePurifier(purifier) {
        if (configuredPurifiers.has(purifier)) {
            return;
        }

        purifier.addHook('afterSanitizeAttributes', node => {
            if (node.tagName === 'A') {
                const classNames = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean);
                const noteName = node.getAttribute('data-note-name');
                const isNoteLink = node.getAttribute('href') === '#'
                    && typeof noteName === 'string'
                    && noteName.trim().length > 0
                    && classNames.includes('note-link')
                    && classNames.every(name => name === 'note-link' || name === 'broken');

                if (isNoteLink) {
                    node.setAttribute('class', classNames.includes('broken') ? 'note-link broken' : 'note-link');
                    node.setAttribute('data-note-name', noteName.trim());
                } else {
                    node.removeAttribute('class');
                    node.removeAttribute('data-note-name');

                    const href = node.getAttribute('href');
                    if (href && !isSafeLink(href)) {
                        node.removeAttribute('href');
                    }
                }

                const safeHref = node.getAttribute('href');
                if (safeHref && /^https?:\/\//i.test(safeHref)) {
                    node.setAttribute('rel', 'noopener noreferrer');
                } else {
                    node.removeAttribute('rel');
                }

                node.removeAttribute('target');
                return;
            }

            const className = node.getAttribute('class');
            const isSnippetWrapper = node.tagName === 'DIV' && className === 'snippet-highlight';
            const isSnippetTag = node.tagName === 'SPAN' && className === 'snippet-tag';
            if (!isSnippetWrapper && !isSnippetTag) {
                node.removeAttribute('class');
            }
            node.removeAttribute('data-note-name');

            if (node.tagName === 'INPUT' && node.getAttribute('type') === 'checkbox') {
                node.setAttribute('disabled', '');
                return;
            }

            node.removeAttribute('type');
            node.removeAttribute('checked');
            node.removeAttribute('disabled');
        });

        configuredPurifiers.add(purifier);
    }

    function sanitizeHtml(html, purifier) {
        if (!purifier || typeof purifier.sanitize !== 'function' || typeof purifier.addHook !== 'function') {
            throw new Error('DOMPurify is unavailable');
        }

        configurePurifier(purifier);

        return purifier.sanitize(String(html), {
            ALLOWED_TAGS: allowedTags,
            ALLOWED_ATTR: ['href', 'title', 'class', 'data-note-name', 'type', 'checked', 'disabled'],
            ALLOW_ARIA_ATTR: false,
            ALLOW_DATA_ATTR: false,
            FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'img', 'video', 'audio'],
            FORBID_ATTR: ['style', 'id', 'src', 'srcset', 'target'],
            KEEP_CONTENT: true,
            RETURN_TRUSTED_TYPE: false
        });
    }

    return Object.freeze({
        isSafeLink,
        sanitizeHtml
    });
}));
