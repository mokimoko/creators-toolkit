'use strict';

function normalizeDisplayName(value, fallback = 'Untitled') {
    const normalized = String(value ?? '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized || fallback;
}

function sanitizeFilename(value, fallback = 'untitled') {
    const sanitized = normalizeDisplayName(value, fallback)
        .normalize('NFKC')
        .replace(/[<>:"/\\|?*\u0000-\u001F\u007F]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.\s]+|[-.\s]+$/g, '')
        .slice(0, 120);
    return sanitized || fallback;
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function createNoteMarkdown(note) {
    const title = normalizeDisplayName(note?.name);
    const created = formatDate(note?.created);
    const modified = formatDate(note?.lastModified);
    const content = String(note?.content ?? '');

    return [
        '---',
        `title: ${JSON.stringify(title)}`,
        `created: ${JSON.stringify(created)}`,
        `modified: ${JSON.stringify(modified)}`,
        '---',
        '',
        `# ${title}`,
        '',
        content
    ].join('\n');
}

function createAttachmentHeader(filename) {
    const safeFilename = sanitizeFilename(filename, 'download');
    let asciiFallback = safeFilename
        .normalize('NFKD')
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/["\\]/g, '-');
    if (!asciiFallback || asciiFallback.startsWith('.')) {
        asciiFallback = `download${asciiFallback}`;
    }
    const encodedFilename = encodeURIComponent(safeFilename)
        .replace(/['()]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`;
}

function allocateUniqueName(baseName, usedNames) {
    let candidate = baseName;
    let suffix = 2;
    while (usedNames.has(candidate.toLocaleLowerCase('en-US'))) {
        candidate = `${baseName}-${suffix}`;
        suffix += 1;
    }
    usedNames.add(candidate.toLocaleLowerCase('en-US'));
    return candidate;
}

function buildCollectionPathMap(collections = []) {
    const byKey = new Map(
        collections
            .filter(collection => collection && typeof collection.key === 'string')
            .map(collection => [collection.key, collection])
    );
    const paths = new Map([['', 'Uncategorized']]);
    const siblingNames = new Map([['', new Set(['uncategorized'])]]);
    const resolving = new Set();

    function resolveCollectionPath(key) {
        if (!key || paths.has(key)) return paths.get(key) || 'Uncategorized';
        const collection = byKey.get(key);
        if (!collection || resolving.has(key)) return 'Uncategorized';

        resolving.add(key);
        const parentKey = typeof collection.parent === 'string' && collection.parent !== key
            ? collection.parent
            : '';
        const parentPath = parentKey ? resolveCollectionPath(parentKey) : '';
        const registryKey = parentPath.toLocaleLowerCase('en-US');
        if (!siblingNames.has(registryKey)) siblingNames.set(registryKey, new Set());
        const segment = allocateUniqueName(
            sanitizeFilename(collection.name || 'Uncategorized'),
            siblingNames.get(registryKey)
        );
        const fullPath = parentPath ? `${parentPath}/${segment}` : segment;
        paths.set(key, fullPath);
        resolving.delete(key);
        return fullPath;
    }

    [...byKey.keys()].sort((a, b) => a.localeCompare(b)).forEach(resolveCollectionPath);
    return paths;
}

function buildNoteArchiveEntries(notes = [], collections = []) {
    const collectionPaths = buildCollectionPathMap(collections);
    const usedPaths = new Set();

    return [...notes]
        .sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')))
        .map(note => {
            const folderPath = collectionPaths.get(note?.collection || '') || 'Uncategorized';
            const baseName = sanitizeFilename(note?.name);
            let candidate = `${folderPath}/${baseName}.md`;
            let suffix = 2;

            while (usedPaths.has(candidate.toLocaleLowerCase('en-US'))) {
                candidate = `${folderPath}/${baseName}-${suffix}.md`;
                suffix += 1;
            }
            usedPaths.add(candidate.toLocaleLowerCase('en-US'));

            return { name: candidate, content: createNoteMarkdown(note) };
        });
}

function buildSnippetArchiveEntries(snippets = []) {
    const snippetsByTag = new Map();

    for (const snippet of snippets) {
        const tags = Array.isArray(snippet?.tags) && snippet.tags.length > 0
            ? snippet.tags.filter(tag => typeof tag === 'string' && tag.trim())
            : ['untagged'];
        const effectiveTags = tags.length > 0 ? tags : ['untagged'];

        for (const tagValue of effectiveTags) {
            const tag = normalizeDisplayName(tagValue, 'untagged');
            if (!snippetsByTag.has(tag)) snippetsByTag.set(tag, []);
            snippetsByTag.get(tag).push(snippet);
        }
    }

    const usedNames = new Set();
    return [...snippetsByTag.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([tag, tagSnippets]) => {
            const baseName = allocateUniqueName(`${sanitizeFilename(tag)}-snippets`, usedNames);
            const sections = tagSnippets
                .sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')))
                .map(snippet => `## ${normalizeDisplayName(snippet?.title)}\n\n${String(snippet?.content ?? '')}`);
            return {
                name: `Snippets/${baseName}.md`,
                content: `# ${tag} Snippets\n\n${sections.join('\n\n---\n\n')}\n`
            };
        });
}

function createNotebookReadme(notebookName, noteCount, collectionCount, snippetCount) {
    const displayName = normalizeDisplayName(notebookName, 'Notebook');
    const date = new Date().toISOString().slice(0, 10);
    return `# ${displayName} Export

Exported on: ${date}

## Contents
- **Notes**: ${noteCount}
- **Collections**: ${collectionCount}
- **Snippets**: ${snippetCount}

## Structure
Notes are organized by their collection hierarchy. Snippets are grouped by tags in the Snippets folder, including an untagged file when needed.

This export is compatible with Obsidian, Logseq, and other markdown-based note-taking applications.
`;
}

module.exports = {
    buildCollectionPathMap,
    buildNoteArchiveEntries,
    buildSnippetArchiveEntries,
    createAttachmentHeader,
    createNoteMarkdown,
    createNotebookReadme,
    normalizeDisplayName,
    sanitizeFilename
};
