'use strict';

const {
    CoWriterInputError,
    normalizeOpaqueId,
    resolveOpaqueFile
} = require('./cowriter-security');
const { resolvePathInside } = require('./path-security');

function normalizeNotebookId(value = 'default') {
    const notebookId = normalizeOpaqueId(value, 'Notebook identifier');
    if (notebookId.length > 50) {
        throw new CoWriterInputError('Notebook identifier must be 50 characters or fewer');
    }
    return notebookId;
}

function normalizeNoteId(value) {
    return normalizeOpaqueId(value, 'Note identifier');
}

function normalizeSnippetId(value) {
    return normalizeOpaqueId(value, 'Snippet identifier');
}

function normalizeNotebookMetadata(value, existing = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new CoWriterInputError('Notebook metadata is required');
    }

    const normalizeText = (input, fallback, label, maxLength, allowEmpty = false) => {
        const text = String(input ?? fallback ?? '')
            .replace(/[\u0000-\u001F\u007F]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if ((!text && !allowEmpty) || text.length > maxLength) {
            throw new CoWriterInputError(`${label} must be ${allowEmpty ? `at most ${maxLength}` : `between 1 and ${maxLength}`} characters`);
        }
        return text;
    };

    const name = normalizeText(value.name, existing.name, 'Notebook name', 100);
    const description = normalizeText(value.description, existing.description, 'Notebook description', 500, true);
    const icon = normalizeText(value.icon, existing.icon || 'book', 'Notebook icon', 40);
    if (!/^[A-Za-z0-9_-]+$/.test(icon)) {
        throw new CoWriterInputError('Notebook icon must be a supported icon name');
    }

    const color = String(value.color ?? existing.color ?? '#b1b695').trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
        throw new CoWriterInputError('Notebook color must be a six-digit hex color');
    }

    return { name, description, icon, color: color.toLowerCase() };
}

function resolveUserNotebooksFolder(usersFolder, userContext) {
    if (!userContext || userContext.isGuest === true) {
        throw new CoWriterInputError('Notebook requires a signed-in user');
    }

    const userId = normalizeOpaqueId(userContext.userId, 'User identifier');
    return resolvePathInside(usersFolder, userId, 'notebooks');
}

function resolveLegacyNotebookFolder(usersFolder, userContext) {
    if (!userContext || userContext.isGuest === true) {
        throw new CoWriterInputError('Notebook requires a signed-in user');
    }

    const userId = normalizeOpaqueId(userContext.userId, 'User identifier');
    return resolvePathInside(usersFolder, userId, 'notebook');
}

function resolveNotebookFolder(usersFolder, userContext, notebookId = 'default') {
    return resolvePathInside(
        resolveUserNotebooksFolder(usersFolder, userContext),
        normalizeNotebookId(notebookId)
    );
}

function resolveNotebookChild(folder, ...segments) {
    return resolvePathInside(folder, ...segments);
}

function resolveNoteFile(notesFolder, noteId) {
    return resolveOpaqueFile(notesFolder, normalizeNoteId(noteId), '.json', 'Note identifier');
}

function resolveSnippetFile(snippetsFolder, snippetId) {
    return resolveOpaqueFile(snippetsFolder, normalizeSnippetId(snippetId), '.json', 'Snippet identifier');
}

async function notebookBelongsToUser(fs, usersFolder, userContext, notebookId = 'default') {
    const safeNotebookId = normalizeNotebookId(notebookId);
    const notebooksFolder = resolveUserNotebooksFolder(usersFolder, userContext);
    const metadataPath = resolvePathInside(notebooksFolder, 'notebooks.json');

    if (!(await fs.pathExists(metadataPath))) {
        return safeNotebookId === 'default';
    }

    const metadata = await fs.readJson(metadataPath);
    return Array.isArray(metadata?.notebooks)
        && metadata.notebooks.some(notebook => notebook?.id === safeNotebookId);
}

module.exports = {
    normalizeNotebookId,
    normalizeNotebookMetadata,
    normalizeNoteId,
    normalizeSnippetId,
    notebookBelongsToUser,
    resolveLegacyNotebookFolder,
    resolveNotebookChild,
    resolveNotebookFolder,
    resolveNoteFile,
    resolveSnippetFile,
    resolveUserNotebooksFolder
};
