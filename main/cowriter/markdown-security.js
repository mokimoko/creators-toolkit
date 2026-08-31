(function initializeCoWriterMarkdownSecurity(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.CoWriterMarkdownSecurity = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createCoWriterMarkdownSecurity() {
    'use strict';

    const configuredPurifiers = new WeakSet();
    const allowedTags = [
        'p', 'br', 'strong', 'em', 'code', 'pre',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'a', 'hr', 'del',
        'table', 'thead', 'tbody', 'tr', 'th', 'td'
    ];

    function isSafeLink(href) {
        if (typeof href !== 'string') {
            return false;
        }

        const normalizedHref = href.trim();
        if (!normalizedHref || /[\u0000-\u001F\u007F]/.test(normalizedHref)) {
            return false;
        }

        if (normalizedHref.startsWith('//')) {
            return false;
        }

        const schemeMatch = normalizedHref.match(/^([a-z][a-z0-9+.-]*):/i);
        if (!schemeMatch) {
            return true;
        }

        return ['http', 'https', 'mailto'].includes(schemeMatch[1].toLowerCase());
    }

    function configurePurifier(purifier) {
        if (configuredPurifiers.has(purifier)) {
            return;
        }

        purifier.addHook('afterSanitizeAttributes', node => {
            if (node.tagName !== 'A') {
                return;
            }

            const href = node.getAttribute('href');
            if (href && !isSafeLink(href)) {
                node.removeAttribute('href');
            }

            const safeHref = node.getAttribute('href');
            if (safeHref && /^https?:\/\//i.test(safeHref)) {
                node.setAttribute('rel', 'noopener noreferrer');
            } else {
                node.removeAttribute('rel');
            }

            node.removeAttribute('target');
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
            ALLOWED_ATTR: ['href', 'title'],
            ALLOW_ARIA_ATTR: false,
            ALLOW_DATA_ATTR: false,
            FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form'],
            FORBID_ATTR: ['style', 'class', 'id', 'src', 'srcset', 'target'],
            KEEP_CONTENT: true,
            RETURN_TRUSTED_TYPE: false
        });
    }

    return Object.freeze({
        isSafeLink,
        sanitizeHtml
    });
}));
