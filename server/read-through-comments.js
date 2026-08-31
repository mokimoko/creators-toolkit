const express = require('express');
const fs = require('fs-extra');
const path = require('path');

const { USERS_FOLDER } = require('./core');

const router = express.Router();
const STORE_FOLDER = path.join(USERS_FOLDER, '_shared-read-through-comments');
const documentQueues = new Map();

const MAX_BODY_LENGTH = 12000;
const MAX_QUOTE_LENGTH = 12000;
const MAX_NAME_LENGTH = 80;
const MAX_TARGETS = 32;

function getCorsHeaders(req) {
    const origin = req.get('origin');
    return {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Cache-Control': 'no-store'
    };
}

router.use((req, res, next) => {
    const headers = getCorsHeaders(req);
    Object.entries(headers).forEach(([name, value]) => res.setHeader(name, value));
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    next();
});

function validateDocumentId(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,120}$/.test(value);
}

function validateColor(value) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
        ? value.toLowerCase()
        : '#b66a3c';
}

function cleanText(value, maxLength) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanAuthor(author = {}) {
    const name = cleanText(author.name, MAX_NAME_LENGTH);
    if (!name) {
        throw new Error('A commenter name is required');
    }

    return {
        id: cleanText(author.id, 120) || `reader_${Date.now()}`,
        name,
        color: validateColor(author.color)
    };
}

function cleanTargets(targets) {
    if (!Array.isArray(targets)) return [];

    return targets.slice(0, MAX_TARGETS).map(target => ({
        anchor: cleanText(target?.anchor, 180),
        start: Math.max(0, Number.parseInt(target?.start, 10) || 0),
        end: Math.max(0, Number.parseInt(target?.end, 10) || 0),
        exact: cleanText(target?.exact, MAX_QUOTE_LENGTH),
        prefix: cleanText(target?.prefix, 240),
        suffix: cleanText(target?.suffix, 240)
    })).filter(target => target.anchor && target.exact && target.end > target.start);
}

function getDocumentPath(documentId) {
    if (!validateDocumentId(documentId)) {
        throw new Error('Invalid read-through document ID');
    }
    return path.join(STORE_FOLDER, `${documentId}.json`);
}

async function readDocument(documentId) {
    const filePath = getDocumentPath(documentId);
    if (!await fs.pathExists(filePath)) {
        return {
            documentId,
            comments: [],
            revision: 0,
            updatedAt: null
        };
    }

    const data = await fs.readJson(filePath);
    return {
        documentId,
        comments: Array.isArray(data.comments) ? data.comments : [],
        revision: Number.isFinite(data.revision) ? data.revision : 0,
        updatedAt: data.updatedAt || null
    };
}

async function writeDocument(documentId, data) {
    const filePath = getDocumentPath(documentId);
    await fs.ensureDir(STORE_FOLDER);
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeJson(tempPath, data, { spaces: 2 });
    await fs.move(tempPath, filePath, { overwrite: true });
}

function queueDocumentUpdate(documentId, updater) {
    const previous = documentQueues.get(documentId) || Promise.resolve();
    const next = previous
        .catch(() => undefined)
        .then(async () => {
            const document = await readDocument(documentId);
            const result = await updater(document);
            document.revision += 1;
            document.updatedAt = new Date().toISOString();
            await writeDocument(documentId, document);
            return { document, result };
        });

    const queued = next.finally(() => {
        if (documentQueues.get(documentId) === queued) {
            documentQueues.delete(documentId);
        }
    });
    documentQueues.set(documentId, queued);

    return queued;
}

router.get('/read-through/comments', async (req, res) => {
    try {
        const { documentId } = req.query;
        const document = await readDocument(documentId);
        res.json(document);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/read-through/comments', async (req, res) => {
    try {
        const { documentId, parentId = null } = req.body || {};
        const kind = req.body?.kind === 'correction' ? 'correction' : 'comment';
        const body = cleanText(req.body?.body, MAX_BODY_LENGTH);
        const replacement = cleanText(req.body?.replacement, MAX_QUOTE_LENGTH);
        const quote = cleanText(req.body?.quote, MAX_QUOTE_LENGTH);
        const author = cleanAuthor(req.body?.author);
        const targets = cleanTargets(req.body?.targets);

        if (!validateDocumentId(documentId)) {
            return res.status(400).json({ error: 'Invalid read-through document ID' });
        }
        if (kind === 'comment' && !body) {
            return res.status(400).json({ error: 'Comment text is required' });
        }
        if (kind === 'correction' && !replacement) {
            return res.status(400).json({ error: 'Replacement text is required' });
        }
        if (!parentId && targets.length === 0) {
            return res.status(400).json({ error: 'A highlighted passage is required' });
        }

        const { document, result } = await queueDocumentUpdate(documentId, current => {
            if (parentId && !current.comments.some(comment => comment.id === parentId && !comment.parentId)) {
                throw new Error('The comment thread no longer exists');
            }

            const now = new Date().toISOString();
            const comment = {
                id: `rtc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
                documentId,
                parentId: parentId || null,
                author,
                kind: parentId ? 'comment' : kind,
                body,
                replacement: parentId ? '' : replacement,
                quote: parentId ? '' : quote,
                targets: parentId ? [] : targets,
                resolved: false,
                correctionStatus: kind === 'correction' && !parentId ? 'pending' : undefined,
                createdAt: now,
                updatedAt: now
            };
            current.comments.push(comment);
            return comment;
        });

        res.status(201).json({ comment: result, revision: document.revision, updatedAt: document.updatedAt });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.patch('/read-through/comments', async (req, res) => {
    try {
        const { documentId, commentId } = req.body || {};
        if (!validateDocumentId(documentId) || typeof commentId !== 'string') {
            return res.status(400).json({ error: 'Invalid comment update request' });
        }

        const { document, result } = await queueDocumentUpdate(documentId, current => {
            const comment = current.comments.find(item => item.id === commentId);
            if (!comment) {
                throw new Error('Comment not found');
            }

            if (typeof req.body.resolved === 'boolean' && !comment.parentId) {
                comment.resolved = req.body.resolved;
            }

            if (comment.kind === 'correction' && ['pending', 'applied', 'dismissed'].includes(req.body.correctionStatus)) {
                comment.correctionStatus = req.body.correctionStatus;
            }

            if (typeof req.body.body === 'string') {
                if (!req.body.actorId || req.body.actorId !== comment.author?.id) {
                    const error = new Error('Only the original author can edit this comment');
                    error.status = 403;
                    throw error;
                }
                const body = cleanText(req.body.body, MAX_BODY_LENGTH);
                if (!body) throw new Error('Comment text is required');
                comment.body = body;
                comment.editedAt = new Date().toISOString();
            }

            if (comment.kind === 'correction' && typeof req.body.replacement === 'string') {
                if (!req.body.actorId || req.body.actorId !== comment.author?.id) {
                    const error = new Error('Only the original author can edit this correction');
                    error.status = 403;
                    throw error;
                }
                const replacement = cleanText(req.body.replacement, MAX_QUOTE_LENGTH);
                if (!replacement) throw new Error('Replacement text is required');
                comment.replacement = replacement;
                comment.editedAt = new Date().toISOString();
            }

            comment.updatedAt = new Date().toISOString();
            return comment;
        });

        res.json({ comment: result, revision: document.revision, updatedAt: document.updatedAt });
    } catch (error) {
        res.status(error.status || 400).json({ error: error.message });
    }
});

router.delete('/read-through/comments', async (req, res) => {
    try {
        const { documentId, commentId } = req.body || {};
        if (!validateDocumentId(documentId) || typeof commentId !== 'string') {
            return res.status(400).json({ error: 'Invalid comment deletion request' });
        }

        const { document } = await queueDocumentUpdate(documentId, current => {
            const comment = current.comments.find(item => item.id === commentId);
            if (!comment) throw new Error('Comment not found');
            if (!req.body.actorId || req.body.actorId !== comment.author?.id) {
                const error = new Error('Only the original author can delete this comment');
                error.status = 403;
                throw error;
            }
            current.comments = current.comments.filter(comment => comment.id !== commentId && comment.parentId !== commentId);
            return null;
        });

        res.json({ success: true, revision: document.revision, updatedAt: document.updatedAt });
    } catch (error) {
        res.status(error.status || 400).json({ error: error.message });
    }
});

module.exports = router;
