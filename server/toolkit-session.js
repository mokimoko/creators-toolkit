const crypto = require('crypto');
const { sendApiError } = require('./api-errors');

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const TOOLKIT_SESSION_COOKIE = 'ct_toolkit_session';
const sessions = new Map();

function normalizePrincipal(userContext) {
    if (userContext?.isGuest === true) {
        return { isGuest: true, userId: null, username: 'Guest' };
    }

    if (!userContext
        || typeof userContext.userId !== 'string'
        || !/^[A-Za-z0-9_-]{1,128}$/.test(userContext.userId)) {
        throw new Error('A valid user or guest context is required');
    }

    return {
        isGuest: false,
        userId: userContext.userId,
        username: typeof userContext.username === 'string' ? userContext.username : ''
    };
}

function pruneExpiredSessions(now = Date.now()) {
    for (const [token, session] of sessions) {
        if (session.expiresAt <= now) sessions.delete(token);
    }
}

function createToolkitSession(userContext, options = {}) {
    const principal = normalizePrincipal(userContext);
    const now = options.now ?? Date.now();
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

    pruneExpiredSessions(now);

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, {
        ...principal,
        createdAt: now,
        expiresAt: now + ttlMs
    });
    return token;
}

function getToolkitSession(token, now = Date.now()) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;

    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= now) {
        sessions.delete(token);
        return null;
    }
    return { ...session };
}

function revokeToolkitSession(token) {
    return typeof token === 'string' && sessions.delete(token);
}

function rotateToolkitSession(token, userContext, options = {}) {
    revokeToolkitSession(token);
    return createToolkitSession(userContext, options);
}

function getCookieToken(req) {
    const cookieHeader = req.headers?.cookie;
    if (typeof cookieHeader !== 'string') return null;

    for (const part of cookieHeader.split(';')) {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex < 0) continue;
        const name = part.slice(0, separatorIndex).trim();
        if (name !== TOOLKIT_SESSION_COOKIE) continue;
        try {
            return decodeURIComponent(part.slice(separatorIndex + 1).trim());
        } catch {
            return null;
        }
    }
    return null;
}

function getRequestToken(req) {
    return req.get?.('X-Toolkit-Session')
        || req.headers?.['x-toolkit-session']
        || req.get?.('X-CoWriter-Session')
        || req.headers?.['x-cowriter-session']
        || getCookieToken(req)
        || null;
}

function setToolkitSessionCookie(res, token) {
    res.cookie(TOOLKIT_SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        path: '/'
    });
}

function clearToolkitSessionCookie(res) {
    res.clearCookie(TOOLKIT_SESSION_COOKIE, {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        path: '/'
    });
}

function parseRequestUserContext(req) {
    const value = req.body?.userContext ?? req.query?.userContext;
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') throw new Error('Invalid user context');

    try {
        return JSON.parse(value);
    } catch {
        throw new Error('Invalid user context');
    }
}

function sessionOwnsContext(session, userContext) {
    if (!session || !userContext) return false;
    if (session.isGuest) return userContext.isGuest === true;
    return userContext.isGuest !== true && userContext.userId === session.userId;
}

function getCanonicalUserContext(session) {
    return session.isGuest
        ? { isGuest: true, username: 'Guest' }
        : {
            isGuest: false,
            userId: session.userId,
            username: session.username
        };
}

function sessionError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function getOwnedUserContext(req, providedContext, options = {}) {
    const session = req.toolkitSession || getToolkitSession(getRequestToken(req));
    if (!session) {
        throw sessionError('Toolkit session required', 401);
    }

    let userContext = providedContext;
    if (typeof userContext === 'string') {
        try {
            userContext = JSON.parse(userContext);
        } catch {
            throw sessionError('Invalid user context', 400);
        }
    }

    if (userContext && !sessionOwnsContext(session, userContext)) {
        throw sessionError('Toolkit session does not own this user context', 403);
    }
    if (session.isGuest && options.allowGuest === false) {
        throw sessionError('This operation requires a signed-in user', 403);
    }

    req.toolkitSession = session;
    return getCanonicalUserContext(session);
}

function requireOwnedContext(req, res, next, options = {}) {
    const token = getRequestToken(req);
    const session = getToolkitSession(token);
    if (!session) {
        return sendApiError(res, 401, 'Toolkit session required', 'SESSION_REQUIRED');
    }

    let userContext;
    try {
        userContext = parseRequestUserContext(req);
    } catch (error) {
        return sendApiError(res, 400, error.message, 'VALIDATION_ERROR');
    }

    if (!userContext && options.allowMissingContext !== true) {
        return sendApiError(res, 400, 'User context required', 'VALIDATION_ERROR');
    }
    if (userContext && !sessionOwnsContext(session, userContext)) {
        return sendApiError(res, 403, 'Toolkit session does not own this user context', 'OWNERSHIP_DENIED');
    }
    if (session.isGuest && options.allowGuest === false) {
        return sendApiError(res, 403, 'This operation requires a signed-in user', 'SIGNED_IN_REQUIRED');
    }

    req.toolkitSession = session;
    req.toolkitSessionToken = token;
    if (userContext) {
        const canonicalContext = getCanonicalUserContext(session);
        req.body = req.body || {};
        req.body.userContext = canonicalContext;
        if (req.query?.userContext !== undefined) {
            req.query.userContext = JSON.stringify(canonicalContext);
        }
    }
    return next();
}

const PUBLIC_COWRITER_ROUTES = new Set([
    'GET /llm/providers',
    'GET /cowriter/quick-prompts',
    'GET /cowriter/prompts/defaults'
]);

function isCoWriterRoute(pathname) {
    return pathname.startsWith('/llm/')
        || pathname.startsWith('/cowriter/')
        || pathname.startsWith('/debug/cowriter/');
}

function createCoWriterRouteBoundary(options = {}) {
    const debugEnabled = options.debugEnabled === true;

    return function coWriterRouteBoundary(req, res, next) {
        if (!isCoWriterRoute(req.path)) return next();
        if (req.path.startsWith('/debug/cowriter/') && !debugEnabled) {
            return sendApiError(res, 404, 'Route not found', 'NOT_FOUND');
        }
        if (PUBLIC_COWRITER_ROUTES.has(`${req.method} ${req.path}`)) return next();

        let userContext;
        try {
            userContext = parseRequestUserContext(req);
        } catch (error) {
            return sendApiError(res, 400, error.message, 'VALIDATION_ERROR');
        }
        if (!userContext && req.path === '/debug/cowriter/prompt') {
            return requireOwnedContext(req, res, next, { allowMissingContext: true });
        }
        return requireOwnedContext(req, res, next);
    };
}

function isNotebookRoute(pathname) {
    return pathname === '/notebooks'
        || pathname.startsWith('/notebooks/')
        || pathname.startsWith('/notebook/');
}

function createNotebookRouteBoundary() {
    return function notebookRouteBoundary(req, res, next) {
        if (!isNotebookRoute(req.path)) return next();
        return requireOwnedContext(req, res, next, { allowGuest: false });
    };
}

const ACCOUNT_ROUTES = new Set([
    'POST /user/profile',
    'PUT /user/profile',
    'POST /user/avatar',
    'GET /user/avatar',
    'DELETE /user/avatar',
    'POST /user/preferences',
    'POST /user/preferences/get',
    'POST /auth/update-user',
    'POST /debug/avatar-folder',
    'DELETE /auth/delete-account'
]);

function createAccountRouteBoundary() {
    return function accountRouteBoundary(req, res, next) {
        const routeKey = `${req.method} ${req.path}`;
        const isPreferencePatch = req.method === 'PATCH' && req.path.startsWith('/user/preferences/');
        if (!ACCOUNT_ROUTES.has(routeKey) && !isPreferencePatch) return next();
        return requireOwnedContext(req, res, next, { allowMissingContext: true });
    };
}

const PROJECT_ROUTES = new Set([
    'POST /github-sync/status',
    'POST /github-sync/select-folder',
    'POST /github-sync/publish',
    'POST /projects',
    'POST /user-sites',
    'POST /projects/load',
    'POST /projects/export',
    'POST /projects/export-info',
    'POST /save',
    'POST /save-built-icon',
    'POST /save-project-config',
    'POST /projects/config',
    'POST /projects/rename',
    'POST /restore-backup',
    'POST /roleplay/import',
    'POST /roleplay/lore-links',
    'POST /roleplay/update-lore-copies',
    'POST /assets/import-image',
    'POST /assets/check',
    'POST /assets/create',
    'POST /assets/import-file',
    'POST /assets/check-lorebook',
    'POST /roleplay/projects',
    'POST /roleplay/load',
    'POST /roleplay/save',
    'POST /roleplay/check-images',
    'POST /roleplay/universes',
    'POST /roleplay/stories',
    'POST /roleplay/load-story',
    'GET /legacy/projects',
    'POST /assets/create-folder',
    'POST /time-systems/load',
    'POST /time-systems/save'
]);

const CONTEXT_OPTIONAL_PROJECT_ROUTES = new Set([
    'POST /user-sites',
    'POST /assets/import-image',
    'POST /assets/import-file',
    'POST /roleplay/save',
    'GET /legacy/projects'
]);

function isProtectedProjectRoute(method, pathname) {
    const routeKey = `${method} ${pathname}`;
    return PROJECT_ROUTES.has(routeKey)
        || (method === 'POST' && pathname.startsWith('/roleplay/list/'));
}

function createProjectRouteBoundary() {
    return function projectRouteBoundary(req, res, next) {
        if (!isProtectedProjectRoute(req.method, req.path)) return next();
        return requireOwnedContext(req, res, next, {
            allowMissingContext: CONTEXT_OPTIONAL_PROJECT_ROUTES.has(`${req.method} ${req.path}`)
        });
    };
}

function createProjectFileBoundary() {
    return function projectFileBoundary(req, res, next) {
        const session = getToolkitSession(getRequestToken(req));
        if (!session) {
            return res.status(401).send('Toolkit session required');
        }

        const requestedUser = req.params.userContext;
        const ownsRequestedUser = session.isGuest
            ? requestedUser === 'guest'
            : requestedUser === session.userId;
        if (!ownsRequestedUser) {
            return res.status(403).send('Toolkit session does not own this project');
        }

        req.toolkitSession = session;
        return next();
    };
}

module.exports = {
    clearToolkitSessionCookie,
    createAccountRouteBoundary,
    createCoWriterRouteBoundary,
    createNotebookRouteBoundary,
    createProjectFileBoundary,
    createProjectRouteBoundary,
    createToolkitSession,
    getCanonicalUserContext,
    getOwnedUserContext,
    getRequestToken,
    getToolkitSession,
    parseRequestUserContext,
    pruneExpiredSessions,
    requireOwnedContext,
    rotateToolkitSession,
    revokeToolkitSession,
    setToolkitSessionCookie,
    sessionOwnsContext,
    TOOLKIT_SESSION_COOKIE,

    // Temporary compatibility names for stabilized CoWriter/Notebook callers.
    createCoWriterSession: createToolkitSession,
    getCoWriterSession: getToolkitSession,
    revokeCoWriterSession: revokeToolkitSession
};
