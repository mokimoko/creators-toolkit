(function defineRPSecurity(root, factory) {
    'use strict';

    const api = factory(root);
    if (root?.RPArchiver) root.RPArchiver.define('security', api);
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRPSecurity(root) {
    'use strict';

    const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
    const BLOCKED_RAW_TAGS = new Set([
        'script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form',
        'input', 'button', 'textarea', 'select', 'option', 'svg', 'math'
    ]);

    function text(value) {
        return value == null ? '' : String(value);
    }

    function escapeHTML(value) {
        return text(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    const escapeAttribute = escapeHTML;

    function escapeRegExp(value) {
        return text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function hashText(value) {
        let hash = 2166136261;
        for (const character of text(value).normalize('NFKC')) {
            hash ^= character.codePointAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function safeIdentifier(value, fallback = '') {
        const cleaned = text(value).trim().replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return cleaned || fallback;
    }

    function createStableId(prefix, existingId = '') {
        const existing = safeIdentifier(existingId);
        if (existing) return existing;
        const uuid = root?.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        return `${safeIdentifier(prefix, 'item')}-${safeIdentifier(uuid, hashText(uuid))}`;
    }

    function characterClass(character) {
        const id = safeIdentifier(character?.id);
        if (id) return `rp-character-${id}`;
        const name = text(character?.name ?? character);
        const readable = safeIdentifier(name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), 'unicode');
        return `rp-character-${readable}-${hashText(name.toLocaleLowerCase())}`;
    }

    function safeURL(value, options = {}) {
        const candidate = text(value).trim();
        if (!candidate || /[\u0000-\u001f\u007f]/.test(candidate)) return '';
        if (candidate.startsWith('#')) return options.allowHash === false ? '' : candidate;
        try {
            const parsed = new URL(candidate, 'https://rp-archiver.invalid/base/');
            if (!SAFE_PROTOCOLS.has(parsed.protocol)) return '';
            if (options.relativeOnly && parsed.origin !== 'https://rp-archiver.invalid') return '';
            return candidate;
        } catch {
            return '';
        }
    }

    function safeMediaURL(value) {
        const candidate = safeURL(value, { allowHash: false });
        if (!candidate) return '';
        const parsed = new URL(candidate, 'https://rp-archiver.invalid/base/');
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? candidate : '';
    }

    function sanitizeRawHTML(value) {
        const source = text(value);
        if (!root?.document) return escapeHTML(source);
        const template = root.document.createElement('template');
        template.innerHTML = source;

        Array.from(template.content.querySelectorAll('*')).forEach(element => {
            const tagName = element.tagName.toLowerCase();
            if (BLOCKED_RAW_TAGS.has(tagName)) {
                element.replaceWith(root.document.createTextNode(element.textContent || ''));
                return;
            }
            Array.from(element.attributes).forEach(attribute => {
                const name = attribute.name.toLowerCase();
                if (name.startsWith('on') || name === 'srcdoc' || name === 'style' || name === 'formaction' || name === 'xlink:href') {
                    element.removeAttribute(attribute.name);
                    return;
                }
                if ((name === 'href' || name === 'src') && !safeURL(attribute.value)) {
                    element.removeAttribute(attribute.name);
                }
            });
        });
        return template.innerHTML;
    }

    async function copyText(value) {
        const content = text(value);
        if (root?.navigator?.clipboard?.writeText) {
            await root.navigator.clipboard.writeText(content);
            return true;
        }
        if (!root?.document) return false;
        const textarea = root.document.createElement('textarea');
        textarea.value = content;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        root.document.body.appendChild(textarea);
        textarea.select();
        const copied = root.document.execCommand?.('copy') === true;
        textarea.remove();
        return copied;
    }

    return {
        escapeHTML,
        escapeAttribute,
        escapeRegExp,
        safeIdentifier,
        createStableId,
        characterClass,
        safeURL,
        safeMediaURL,
        sanitizeRawHTML,
        copyText
    };
});
