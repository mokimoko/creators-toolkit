'use strict';

(function initializeLoreGenerationSecurity(globalScope) {
    function toText(value) {
        return value === null || value === undefined ? '' : String(value);
    }

    function escapeText(value) {
        return toText(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escapeAttribute(value) {
        return escapeText(value)
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeUrl(value, options = {}) {
        const candidate = toText(value).trim();
        if (!candidate || /[\u0000-\u001f\u007f<>"'`]/.test(candidate)) return null;
        if (candidate.startsWith('//')) return null;

        if (options.allowDataImage
            && /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(candidate)) {
            return candidate.replace(/\s+/g, '');
        }

        if (candidate.startsWith('#') || /^(?:https?:|mailto:|tel:)/i.test(candidate)) return candidate;
        if (/^[a-z][a-z0-9+.-]*:/i.test(candidate) || candidate.startsWith('/')) return null;

        const pathOnly = candidate.split(/[?#]/, 1)[0].replace(/\\/g, '/');
        const segments = pathOnly.split('/');
        if (segments.some(segment => segment === '..')) return null;
        return candidate;
    }

    function escapeUrl(value, options = {}) {
        const normalized = normalizeUrl(value, options);
        const fallback = options.fallback === undefined ? '' : options.fallback;
        return escapeAttribute(normalized === null ? fallback : normalized);
    }

    function sanitizeCssColor(value, fallback = '') {
        const candidate = toText(value).trim();
        if (/^#[0-9a-f]{3,8}$/i.test(candidate)) return candidate;
        if (/^(?:rgb|hsl)a?\([0-9.,%+\-\s]+\)$/i.test(candidate)) return candidate;
        if (/^[a-z][a-z0-9-]*$/i.test(candidate) && !/^(?:expression|url|var)$/i.test(candidate)) return candidate;
        return fallback;
    }

    function serializeJsonForHtml(value) {
        return JSON.stringify(value)
            .replace(/</g, '\\u003C')
            .replace(/>/g, '\\u003E')
            .replace(/&/g, '\\u0026')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
    }

    function renderInlineMarkdown(value) {
        let rendered = escapeText(value);
        rendered = rendered.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        rendered = rendered.replace(/__(.*?)__/g, '<strong>$1</strong>');
        rendered = rendered.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        rendered = rendered.replace(/_([^_]+)_/g, '<em>$1</em>');
        rendered = rendered.replace(/\+\+(.*?)\+\+/g, '<u>$1</u>');
        rendered = rendered.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/gi, '<u>$1</u>');
        rendered = rendered.replace(
            /&lt;spoiler&gt;(.*?)&lt;\/spoiler&gt;/g,
            '<span class="spoiler" data-lore-action="toggle-spoiler">$1</span>'
        );
        rendered = rendered.replace(/~~(.*?)~~/g, '<del>$1</del>');
        return rendered;
    }

    function renderMarkdown(value) {
        const source = toText(value);
        const linkPattern = /\[([^\]\r\n]+)\]\(([^)\r\n]*)\)/g;
        let rendered = '';
        let lastIndex = 0;
        let match;

        while ((match = linkPattern.exec(source)) !== null) {
            rendered += renderInlineMarkdown(source.slice(lastIndex, match.index));

            const href = normalizeUrl(match[2].trim());
            if (href === null) {
                rendered += renderInlineMarkdown(match[0]);
            } else {
                const label = renderInlineMarkdown(match[1]);
                rendered += `<a href="${escapeAttribute(href)}">${label}</a>`;
            }

            lastIndex = linkPattern.lastIndex;
        }

        rendered += renderInlineMarkdown(source.slice(lastIndex));
        return rendered.replace(/\r?\n/g, '<br>');
    }

    function renderMarkdownBlocks(value) {
        const lines = toText(value).replace(/\r\n?/g, '\n').split('\n');
        const blocks = [];
        let index = 0;

        while (index < lines.length) {
            const line = lines[index];
            if (!line.trim()) {
                index += 1;
                continue;
            }

            const heading = line.match(/^(#{1,6})\s+(.+)$/);
            if (heading) {
                const level = heading[1].length;
                blocks.push(`<h${level} class="overview-markdown-heading">${renderMarkdown(heading[2].trim())}</h${level}>`);
                index += 1;
                continue;
            }

            const unorderedItem = line.match(/^\s*[-+*]\s+(.+)$/);
            const orderedItem = line.match(/^\s*\d+[.)]\s+(.+)$/);
            if (unorderedItem || orderedItem) {
                const ordered = Boolean(orderedItem);
                const tag = ordered ? 'ol' : 'ul';
                const items = [];

                while (index < lines.length) {
                    const item = ordered
                        ? lines[index].match(/^\s*\d+[.)]\s+(.+)$/)
                        : lines[index].match(/^\s*[-+*]\s+(.+)$/);
                    if (!item) break;
                    items.push(`<li>${renderMarkdown(item[1].trim())}</li>`);
                    index += 1;
                }

                blocks.push(`<${tag}>${items.join('')}</${tag}>`);
                continue;
            }

            const paragraphLines = [];
            while (index < lines.length && lines[index].trim()) {
                if (paragraphLines.length > 0 && /^(?:#{1,6}\s+|\s*[-+*]\s+|\s*\d+[.)]\s+)/.test(lines[index])) {
                    break;
                }
                paragraphLines.push(lines[index]);
                index += 1;
            }
            const isLinkList = paragraphLines.every(paragraphLine =>
                /^(?:\s*\[[^\]\r\n]+\]\([^)\r\n]+\)\s*)+$/.test(paragraphLine)
            );
            const className = isLinkList ? ' class="overview-markdown-link-list"' : '';
            blocks.push(`<p${className}>${renderMarkdown(paragraphLines.join('\n'))}</p>`);
        }

        return blocks.join('\n');
    }

    // Raw HTML is deliberately a separate, opt-in authoring context.
    function renderTrustedHtml(value, options = {}) {
        if (options.trusted !== true) throw new Error('Trusted HTML rendering requires an explicit trusted flag');
        return toText(value);
    }

    const api = {
        escapeAttribute,
        escapeText,
        escapeUrl,
        normalizeUrl,
        renderMarkdown,
        renderMarkdownBlocks,
        renderTrustedHtml,
        sanitizeCssColor,
        serializeJsonForHtml
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (globalScope) globalScope.LoreGenerationSecurity = api;
})(typeof window !== 'undefined' ? window : globalThis);
