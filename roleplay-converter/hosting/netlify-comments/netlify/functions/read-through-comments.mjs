import { getStore } from '@netlify/blobs';

const STORE_NAME = 'rp-read-through-comments';
const MAX_BODY_LENGTH = 12000;
const MAX_QUOTE_LENGTH = 12000;
const MAX_NAME_LENGTH = 80;
const MAX_TARGETS = 32;

function corsHeaders(request) {
    const origin = request.headers.get('origin');
    return {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        Vary: 'Origin'
    };
}

function json(request, data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: corsHeaders(request)
    });
}

function validateDocumentId(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,120}$/.test(value);
}

function cleanText(value, maxLength) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanColor(value) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
        ? value.toLowerCase()
        : '#b66a3c';
}

function cleanAuthor(author = {}) {
    const name = cleanText(author.name, MAX_NAME_LENGTH);
    if (!name) throw new Error('A commenter name is required');
    return {
        id: cleanText(author.id, 120) || `reader_${Date.now()}`,
        name,
        color: cleanColor(author.color)
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

function emptyDocument(documentId) {
    return { documentId, comments: [], revision: 0, updatedAt: null };
}

async function readDocument(store, documentId) {
    const value = await store.get(documentId, { type: 'json' });
    if (!value) return emptyDocument(documentId);
    return {
        documentId,
        comments: Array.isArray(value.comments) ? value.comments : [],
        revision: Number.isFinite(value.revision) ? value.revision : 0,
        updatedAt: value.updatedAt || null
    };
}

async function writeDocument(store, document) {
    document.revision += 1;
    document.updatedAt = new Date().toISOString();
    await store.setJSON(document.documentId, document);
    return document;
}

export default async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    try {
        const url = new URL(request.url);
        const requestBody = request.method === 'GET' ? {} : await request.json();
        const documentId = request.method === 'GET'
            ? url.searchParams.get('documentId')
            : requestBody.documentId;

        if (!validateDocumentId(documentId)) {
            return json(request, { error: 'Invalid read-through document ID' }, 400);
        }

        const store = getStore(STORE_NAME);
        const document = await readDocument(store, documentId);

        if (request.method === 'GET') {
            return json(request, document);
        }

        if (request.method === 'POST') {
            const parentId = requestBody.parentId || null;
            const kind = requestBody.kind === 'correction' ? 'correction' : 'comment';
            const body = cleanText(requestBody.body, MAX_BODY_LENGTH);
            const replacement = cleanText(requestBody.replacement, MAX_QUOTE_LENGTH);
            const quote = cleanText(requestBody.quote, MAX_QUOTE_LENGTH);
            const author = cleanAuthor(requestBody.author);
            const targets = cleanTargets(requestBody.targets);

            if (kind === 'comment' && !body) return json(request, { error: 'Comment text is required' }, 400);
            if (kind === 'correction' && !replacement) return json(request, { error: 'Replacement text is required' }, 400);
            if (!parentId && targets.length === 0) {
                return json(request, { error: 'A highlighted passage is required' }, 400);
            }
            if (parentId && !document.comments.some(comment => comment.id === parentId && !comment.parentId)) {
                return json(request, { error: 'The comment thread no longer exists' }, 404);
            }

            const now = new Date().toISOString();
            const comment = {
                id: `rtc_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
                documentId,
                parentId,
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
            document.comments.push(comment);
            await writeDocument(store, document);
            return json(request, { comment, revision: document.revision, updatedAt: document.updatedAt }, 201);
        }

        if (request.method === 'PATCH') {
            const comment = document.comments.find(item => item.id === requestBody.commentId);
            if (!comment) return json(request, { error: 'Comment not found' }, 404);

            if (typeof requestBody.resolved === 'boolean' && !comment.parentId) {
                comment.resolved = requestBody.resolved;
            }
            if (comment.kind === 'correction' && ['pending', 'applied', 'dismissed'].includes(requestBody.correctionStatus)) {
                comment.correctionStatus = requestBody.correctionStatus;
            }
            if (typeof requestBody.body === 'string') {
                if (!requestBody.actorId || requestBody.actorId !== comment.author?.id) {
                    return json(request, { error: 'Only the original author can edit this comment' }, 403);
                }
                const body = cleanText(requestBody.body, MAX_BODY_LENGTH);
                if (!body) return json(request, { error: 'Comment text is required' }, 400);
                comment.body = body;
                comment.editedAt = new Date().toISOString();
            }
            if (comment.kind === 'correction' && typeof requestBody.replacement === 'string') {
                if (!requestBody.actorId || requestBody.actorId !== comment.author?.id) {
                    return json(request, { error: 'Only the original author can edit this correction' }, 403);
                }
                const replacement = cleanText(requestBody.replacement, MAX_QUOTE_LENGTH);
                if (!replacement) return json(request, { error: 'Replacement text is required' }, 400);
                comment.replacement = replacement;
                comment.editedAt = new Date().toISOString();
            }
            comment.updatedAt = new Date().toISOString();
            await writeDocument(store, document);
            return json(request, { comment, revision: document.revision, updatedAt: document.updatedAt });
        }

        if (request.method === 'DELETE') {
            const comment = document.comments.find(item => item.id === requestBody.commentId);
            if (!comment) return json(request, { error: 'Comment not found' }, 404);
            if (!requestBody.actorId || requestBody.actorId !== comment.author?.id) {
                return json(request, { error: 'Only the original author can delete this comment' }, 403);
            }
            document.comments = document.comments.filter(comment => (
                comment.id !== requestBody.commentId && comment.parentId !== requestBody.commentId
            ));
            await writeDocument(store, document);
            return json(request, { success: true, revision: document.revision, updatedAt: document.updatedAt });
        }

        return json(request, { error: 'Method not allowed' }, 405);
    } catch (error) {
        console.error('Read-through comment service error:', error);
        return json(request, { error: error.message || 'Unable to update comments' }, 400);
    }
};

export const config = {
    path: '/api/read-through/comments'
};
