const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');
const { resolvePathInside } = require('./path-security');
const { normalizeLoreProjectName } = require('./lore-security');
const {
    createAccountRouteBoundary,
    createCoWriterRouteBoundary,
    createNotebookRouteBoundary,
    createProjectFileBoundary,
    createProjectRouteBoundary
} = require('./toolkit-session');
const { createCorsOptions, createLocalHostBoundary } = require('./local-api-boundary');
const { createStructuredErrorPayloads } = require('./api-errors');

const {
    IS_LOCAL,
    USERS_FOLDER,
    getUserSitesFolder,
    initializeUserSystem
} = require('./core');

// Import routers
const authRouter = require('./auth');
const projectsRouter = require('./projects');
const { createSiteCatalogRouter } = require('./site-catalog-router');
const llmRouter = require('./llm');
const exportRouter = require('./export');
const notebookRouter = require('./notebook');
const notebookWorkspacesRouter = require('./notebook-workspaces');
const promptsRouter = require('./prompts');
const extractorRouter = require('./extractor');
const characterManagerRouter = require('./character-manager');
const entryHelperRoutes = require('./entry-helper');
const readThroughCommentsRouter = require('./read-through-comments');

const packageJson = require('./package.json');

const DEFAULT_PORT = 9000;
const REQUEST_BODY_LIMIT = '50mb';
const COWRITER_BODY_LIMIT = '5mb';

function normalizePort(value) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid PORT value: ${value}`);
    }
    return port;
}

function createRuntimeState() {
    return {
        status: 'starting',
        error: null,
        readyAt: null
    };
}

function createApp(options = {}) {
const app = express();
const port = normalizePort(options.port ?? process.env.PORT ?? DEFAULT_PORT);
const isLocal = options.isLocal ?? IS_LOCAL;
const runtimeState = options.runtimeState || createRuntimeState();
const serverSessionId = options.serverSessionId
    || `server_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

app.locals.toolkit = {
    port,
    isLocal,
    runtimeState,
    serverSessionId
};

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================

if (isLocal) {
    app.use(createLocalHostBoundary(port));
}
app.use(cors(createCorsOptions(port, isLocal)));
app.use(['/api/llm', '/api/cowriter', '/api/debug/cowriter'], express.json({ limit: COWRITER_BODY_LIMIT }));
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
app.use('/api', createStructuredErrorPayloads());
app.use('/api', createCoWriterRouteBoundary({
    debugEnabled: isLocal && process.env.COWRITER_DEBUG === '1'
}));
app.use('/api', createNotebookRouteBoundary());
app.use('/api', createAccountRouteBoundary());
app.use('/api', createProjectRouteBoundary());

app.get('/api/health', (req, res) => {
    const ready = runtimeState.status === 'ready';
    res.status(ready ? 200 : 503).json({
        status: runtimeState.status,
        ready,
        version: packageJson.version,
        error: runtimeState.error
    });
});

// =============================================================================
// ROUTERS
// =============================================================================

// Mount auth router at /api
app.use('/api', authRouter);

// Focused, session-owned My Sites catalog.
app.use('/api', createSiteCatalogRouter({ isLocal }));

// Mount projects router at /api
app.use('/api', projectsRouter);

// Mount LLM router at /api
app.use('/api', llmRouter);

// Mount export router at /api
app.use('/api', exportRouter);

// Mount notebook router at /api
app.use('/api', notebookRouter);

// Mount notebook workspaces router at /api
app.use('/api', notebookWorkspacesRouter);

app.use('/api', promptsRouter);

app.use('/api', extractorRouter);

app.use('/api', characterManagerRouter);

app.use('/api', entryHelperRoutes);

// Shared margin-note comments used by RP Archiver previews and local testing.
app.use('/api', readThroughCommentsRouter);

// Serve project files (local only) - user-aware static serving
app.get('/projects/:userContext/:projectName/*', createProjectFileBoundary(), (req, res) => {
    if (!isLocal) {
        return res.status(403).json({ error: 'File access not available in hosted environment' });
    }

    try {
        const projectName = normalizeLoreProjectName(req.params.projectName);
        const filePath = req.params[0];
        const session = req.toolkitSession;
        const sitesFolder = session.isGuest
            ? getUserSitesFolder({ isGuest: true })
            : resolvePathInside(USERS_FOLDER, session.userId, 'sites');
        const projectFolder = resolvePathInside(sitesFolder, projectName);
        const fullPath = resolvePathInside(projectFolder, filePath);

        if (!fs.pathExistsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
            return res.status(404).send('File not found');
        }

        res.sendFile(fullPath);
    } catch (error) {
        console.error('Error serving project file:', error);
        res.status(error.statusCode || 500).send(error.message || 'Error serving file');
    }
});

// =============================================================================
// STATIC FILE SERVING
// =============================================================================

app.use('/info-converter', express.static(path.join(__dirname, '..', 'info-converter')));
app.use('/roleplay-converter', express.static(path.join(__dirname, '..', 'roleplay-converter')));
app.use('/cowriter', express.static(path.join(__dirname, '..', 'cowriter')));
app.use('/fonts', express.static(path.join(__dirname, '..', 'fonts')));
app.use('/extractor', express.static(path.join(__dirname, '..', 'minitools', 'extractor')));
app.use('/character-manager', express.static(path.join(__dirname, '..', 'minitools', 'character-manager'))); 
app.get('/utils/file-picker.js', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'main', 'utils', 'file-picker.js'));
});
app.use('/', express.static(path.join(__dirname, '..', 'main')));

// =============================================================================
// BASIC ROUTE HANDLERS
// =============================================================================

app.get('/info-converter', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'info-converter', 'index.html'));
});

app.get('/roleplay-converter', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'roleplay-converter', 'index.html'));
});

app.get('/extractor', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'minitools', 'extractor', 'index.html'));
});

app.get('/character-manager', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'minitools', 'character-manager', 'index.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'main', 'index.html'));
});

// Get environment info and server session
app.get('/api/env', (req, res) => {
    res.json({
        isLocal,
        hasFileAccess: isLocal,
        usersFolder: isLocal ? USERS_FOLDER : null,
        supportsUserContexts: true,
        hasFileBasedAuth: isLocal,
        hasCoWriter: isLocal,
        serverSessionId
    });
});

// Add this route with your other API routes (around line 140)
app.get('/api/version', (req, res) => {
    res.json({
        version: packageJson.version,
        name: packageJson.name
    });
});

// =============================================================================
// ERROR HANDLING & 404
// =============================================================================

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server request error:', {
        name: err?.name || 'Error',
        type: err?.type,
        status: err?.status,
        code: err?.code
    });
    if (err.type === 'entity.too.large' || err.status === 413 || err.code === 'LIMIT_FILE_SIZE') {
        const isCoWriterRequest = req.path.startsWith('/api/cowriter')
            || req.path.startsWith('/api/llm')
            || req.path.startsWith('/api/debug/cowriter');
        return res.status(413).json({
            error: isCoWriterRequest
                ? `CoWriter requests are limited to ${COWRITER_BODY_LIMIT}.`
                : `Request is too large. Lore project requests are limited to ${REQUEST_BODY_LIMIT}; individual asset uploads are limited to 10 MB.`
        });
    }
    if (err.name === 'MulterError') {
        return res.status(400).json({ error: `Asset upload failed: ${err.message}` });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Request body contains invalid JSON' });
    }
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

return app;
}

// =============================================================================
// COWRITER INITIALIZATION
// =============================================================================

// Initialize CoWriter configuration files
async function initializeCoWriter(isLocal = IS_LOCAL) {
    if (!isLocal) return;
}

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function initializeRuntime(options = {}) {
    const isLocal = options.isLocal ?? IS_LOCAL;
    if (isLocal) {
        await initializeUserSystem();
        await initializeCoWriter(isLocal);
    }
}

function logStartup({ port, host, isLocal, serverSessionId }) {
    console.log(`Creator's Toolkit ${packageJson.version} ready at http://localhost:${port}`);
    console.log(`Listening on ${host}:${port} (${isLocal ? 'local' : 'production'})`);
    if (process.env.TOOLKIT_SERVER_DEBUG === '1') console.log(`Server session: ${serverSessionId}`);
}

async function startServer(options = {}) {
    const port = normalizePort(options.port ?? process.env.PORT ?? DEFAULT_PORT);
    const isLocal = options.isLocal ?? IS_LOCAL;
    const host = options.host || (isLocal ? '127.0.0.1' : (process.env.HOST || '0.0.0.0'));
    const runtimeState = options.runtimeState || createRuntimeState();
    const serverSessionId = options.serverSessionId
        || `server_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const app = (options.createApp || createApp)({
        port,
        isLocal,
        runtimeState,
        serverSessionId
    });

    try {
        await (options.initializeRuntime || initializeRuntime)({ isLocal });
    } catch (error) {
        runtimeState.status = 'error';
        runtimeState.error = error.message;
        throw error;
    }

    const server = await new Promise((resolve, reject) => {
        const pendingServer = app.listen(port, host, () => resolve(pendingServer));
        pendingServer.once('error', reject);
    }).catch((error) => {
        runtimeState.status = 'error';
        runtimeState.error = error.code === 'EADDRINUSE'
            ? `Port ${port} is already in use.`
            : error.message;
        throw new Error(runtimeState.error, { cause: error });
    });

    runtimeState.status = 'ready';
    runtimeState.readyAt = new Date().toISOString();
    logStartup({ port, host, isLocal, serverSessionId });

    return {
        app,
        server,
        port,
        host,
        runtimeState,
        async close() {
            if (!server.listening) return;
            runtimeState.status = 'stopping';
            let forceTimer;
            try {
                await new Promise((resolve, reject) => {
                    forceTimer = setTimeout(() => {
                        server.closeAllConnections?.();
                    }, 3_000);
                    forceTimer.unref?.();
                    server.close((error) => error ? reject(error) : resolve());
                    server.closeIdleConnections?.();
                });
                runtimeState.status = 'stopped';
            } finally {
                clearTimeout(forceTimer);
            }
        }
    };
}

function installShutdownHandlers(runningServer) {
    let shuttingDown = false;

    const handleSigint = () => shutdown('SIGINT');
    const handleSigterm = () => shutdown('SIGTERM');
    const handleSighup = () => shutdown('SIGHUP');

    const shutdown = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        process.removeListener('SIGINT', handleSigint);
        process.removeListener('SIGTERM', handleSigterm);
        process.removeListener('SIGHUP', handleSighup);
        console.log(`\n👋 ${signal} received; shutting down Creator's Toolkit server...`);
        try {
            await runningServer.close();
            process.exitCode = 0;
        } catch (error) {
            console.error('Server shutdown failed:', error);
            process.exitCode = 1;
        }
    };

    process.once('SIGINT', handleSigint);
    process.once('SIGTERM', handleSigterm);
    process.once('SIGHUP', handleSighup);
}

if (require.main === module) {
    startServer()
        .then(installShutdownHandlers)
        .catch((error) => {
            console.error(`❌ Creator's Toolkit failed to start: ${error.message}`);
            process.exitCode = 1;
        });
}

module.exports = {
    createApp,
    createRuntimeState,
    initializeRuntime,
    installShutdownHandlers,
    normalizePort,
    startServer
};
