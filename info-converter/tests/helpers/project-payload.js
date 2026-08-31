'use strict';

function safeJsonForHtml(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003C')
        .replace(/>/g, '\\u003E')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function embedEditableProject(project) {
    return `<script type="application/json" id="lore-codex-project-data">${safeJsonForHtml(project)}</script>`;
}

function extractJsonScript(html) {
    const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    let match;
    while ((match = scriptPattern.exec(html))) {
        const attributes = match[1];
        if (!/\bid\s*=\s*["']lore-codex-project-data["']/i.test(attributes)) continue;
        if (!/\btype\s*=\s*["']application\/json["']/i.test(attributes)) continue;
        return JSON.parse(match[2].trim());
    }
    return null;
}

function findJsonObjectAfterAssignment(source, identifier) {
    const identifierPattern = new RegExp(`\\b${identifier}\\b\\s*=`, 'g');
    let assignment;

    while ((assignment = identifierPattern.exec(source))) {
        let start = assignment.index + assignment[0].length;
        while (/\s/.test(source[start] || '')) start += 1;
        if (source[start] !== '{') continue;

        let depth = 0;
        let quote = '';
        let escaped = false;
        for (let index = start; index < source.length; index += 1) {
            const character = source[index];
            if (quote) {
                if (escaped) {
                    escaped = false;
                } else if (character === '\\') {
                    escaped = true;
                } else if (character === quote) {
                    quote = '';
                }
                continue;
            }

            if (character === '"' || character === "'") {
                quote = character;
            } else if (character === '{') {
                depth += 1;
            } else if (character === '}') {
                depth -= 1;
                if (depth === 0) return source.slice(start, index + 1);
            }
        }
    }

    return null;
}

function extractProjectPayload(html) {
    const modern = extractJsonScript(html);
    if (modern) return { format: 'schema-json', data: modern };

    const legacyJson = findJsonObjectAfterAssignment(html, 'fullInfoData');
    if (legacyJson) return { format: 'legacy-fullInfoData', data: JSON.parse(legacyJson) };

    if (/<html\b/i.test(html) && /(?:id=["']overview["']|class=["'][^"']*character-card|class=["'][^"']*world-item)/i.test(html)) {
        return { format: 'legacy-dom', data: null };
    }

    return { format: 'unknown', data: null };
}

module.exports = {
    embedEditableProject,
    extractProjectPayload,
    findJsonObjectAfterAssignment,
    safeJsonForHtml
};
