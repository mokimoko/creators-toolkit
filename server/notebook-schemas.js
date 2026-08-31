'use strict';

const {
    normalizeNoteId,
    normalizeSnippetId
} = require('./notebook-security');

const NOTE_CONTENT_MAX_BYTES = 2 * 1024 * 1024;
const SNIPPET_CONTENT_MAX_BYTES = 512 * 1024;
const TAG_LIMIT = 50;
const TAG_MAX_LENGTH = 100;

class NotebookSchemaError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotebookSchemaError';
        this.statusCode = 400;
    }
}

function normalizeDisplayText(value, label, maxLength, { allowEmpty = false } = {}) {
    if (typeof value !== 'string') {
        throw new NotebookSchemaError(`${label} must be text`);
    }
    const text = value
        .replace(/[\u0000-\u001F\u007F]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if ((!allowEmpty && !text) || text.length > maxLength) {
        throw new NotebookSchemaError(`${label} must be ${allowEmpty ? `at most ${maxLength}` : `between 1 and ${maxLength}`} characters`);
    }
    return text;
}

function normalizeContent(value, label, maxBytes, { allowEmpty = true } = {}) {
    if (typeof value !== 'string') {
        throw new NotebookSchemaError(`${label} must be text`);
    }
    if (!allowEmpty && value.length === 0) {
        throw new NotebookSchemaError(`${label} cannot be empty`);
    }
    if (Buffer.byteLength(value, 'utf8') > maxBytes) {
        throw new NotebookSchemaError(`${label} exceeds the ${Math.round(maxBytes / 1024)} KB limit`);
    }
    return value;
}

function normalizeCollectionKey(value = '') {
    if (typeof value !== 'string' || value.length > 500) {
        throw new NotebookSchemaError('Invalid collection key');
    }
    if (/[\\\u0000-\u001F\u007F]/.test(value)
        || value.startsWith('/')
        || value.endsWith('/')
        || value.includes('//')) {
        throw new NotebookSchemaError('Invalid collection key');
    }
    return value;
}

function normalizeTimestamp(value, fallback = Date.now()) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeTags(value) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > TAG_LIMIT) {
        throw new NotebookSchemaError(`Tags must contain at most ${TAG_LIMIT} items`);
    }
    return [...new Set(value.map(tag => normalizeDisplayText(tag, 'Tag', TAG_MAX_LENGTH)))];
}

function normalizeNoteDocument(value, { touch = false } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new NotebookSchemaError('Note data is required');
    }

    const content = normalizeContent(value.content ?? '', 'Note content', NOTE_CONTENT_MAX_BYTES);
    const created = normalizeTimestamp(value.created);
    return {
        id: normalizeNoteId(value.id),
        name: normalizeDisplayText(value.name, 'Note name', 200),
        content,
        collection: normalizeCollectionKey(value.collection ?? ''),
        created,
        lastModified: touch ? Date.now() : normalizeTimestamp(value.lastModified, created),
        tags: normalizeTags(value.tags),
        wordCount: content.trim().split(/\s+/).filter(Boolean).length
    };
}

function normalizeSnippetDocument(value, { touch = false, chatSessionId = undefined } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new NotebookSchemaError('Snippet data is required');
    }

    const created = normalizeTimestamp(value.created);
    const sessionReference = chatSessionId ?? value.chatSessionId ?? null;
    if (sessionReference !== null
        && (typeof sessionReference !== 'string'
            || sessionReference.length > 128
            || /[\u0000-\u001F\u007F]/.test(sessionReference))) {
        throw new NotebookSchemaError('Invalid snippet session reference');
    }

    const sourceType = value.sourceType ?? 'manual';
    if (!['manual', 'cowriter'].includes(sourceType)) {
        throw new NotebookSchemaError('Invalid snippet source type');
    }

    return {
        id: normalizeSnippetId(value.id),
        title: normalizeDisplayText(value.title, 'Snippet title', 200),
        content: normalizeContent(value.content, 'Snippet content', SNIPPET_CONTENT_MAX_BYTES, { allowEmpty: false }),
        tags: normalizeTags(value.tags),
        created,
        lastModified: touch ? Date.now() : normalizeTimestamp(value.lastModified, created),
        chatSessionId: sessionReference,
        sourceType
    };
}

function normalizeNotebookSettings(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new NotebookSchemaError('Notebook settings are required');
    }

    const collections = value.collections == null
        ? ['']
        : value.collections;
    if (!Array.isArray(collections) || collections.length > 1000) {
        throw new NotebookSchemaError('Notebook settings contain too many collections');
    }

    const interval = Number.isFinite(value.autoSaveInterval)
        ? Math.round(value.autoSaveInterval)
        : 30000;
    if (interval < 5000 || interval > 3600000) {
        throw new NotebookSchemaError('Autosave interval must be between 5 seconds and 1 hour');
    }

    return {
        collections: [...new Set(collections.map(normalizeCollectionKey))],
        defaultCollection: normalizeCollectionKey(value.defaultCollection ?? ''),
        autoSave: value.autoSave !== false,
        autoSaveInterval: interval,
        wordWrap: value.wordWrap !== false,
        previewMode: value.previewMode === true
    };
}

module.exports = {
    NOTE_CONTENT_MAX_BYTES,
    NotebookSchemaError,
    SNIPPET_CONTENT_MAX_BYTES,
    normalizeCollectionKey,
    normalizeNoteDocument,
    normalizeNotebookSettings,
    normalizeSnippetDocument
};
