function getLocalOrigins(port) {
    return new Set([
        `http://localhost:${port}`,
        `http://127.0.0.1:${port}`
    ]);
}

function getLocalHosts(port) {
    return new Set([
        `localhost:${port}`,
        `127.0.0.1:${port}`
    ]);
}

function isAllowedLocalOrigin(origin, port) {
    return !origin || getLocalOrigins(port).has(origin);
}

function isAllowedLocalHost(host, port) {
    return typeof host === 'string' && getLocalHosts(port).has(host.toLowerCase());
}

function createLocalHostBoundary(port) {
    return function localHostBoundary(req, res, next) {
        if (!isAllowedLocalHost(req.get('host'), port)) {
            return res.status(403).json({ error: 'Invalid local host' });
        }

        const origin = req.get('origin');
        if (!isAllowedLocalOrigin(origin, port)) {
            return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
        }

        return next();
    };
}

function createCorsOptions(port, isLocal) {
    if (!isLocal) {
        return { origin: false };
    }

    return {
        credentials: true,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'X-Toolkit-Session', 'X-CoWriter-Session'],
        origin(origin, callback) {
            if (isAllowedLocalOrigin(origin, port)) {
                return callback(null, origin || false);
            }
            return callback(new Error('Cross-origin requests are not allowed'));
        }
    };
}

module.exports = {
    createCorsOptions,
    createLocalHostBoundary,
    getLocalHosts,
    getLocalOrigins,
    isAllowedLocalHost,
    isAllowedLocalOrigin
};
