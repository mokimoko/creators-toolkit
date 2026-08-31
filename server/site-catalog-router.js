const express = require('express');
const { IS_LOCAL, USERS_FOLDER, GUEST_FOLDER } = require('./core');
const { resolvePathInside } = require('./path-security');
const { getOwnedUserContext } = require('./toolkit-session');
const { SiteCatalogService } = require('./site-catalog-service');
const { sendApiError } = require('./api-errors');

function createSiteCatalogRouter(options = {}) {
    const router = express.Router();
    const service = options.service || new SiteCatalogService();
    const isLocal = options.isLocal ?? IS_LOCAL;
    const sitesFolderFor = options.getUserSitesFolder || (userContext => (
        userContext.isGuest
            ? resolvePathInside(GUEST_FOLDER, 'sites')
            : resolvePathInside(USERS_FOLDER, userContext.userId, 'sites')
    ));

    router.post('/user-sites', async (req, res) => {
        if (!isLocal) {
            return sendApiError(res, 403, 'File system access not available in hosted environment', 'LOCAL_ONLY');
        }
        try {
            const userContext = getOwnedUserContext(req, req.body?.userContext);
            const userKey = userContext.isGuest ? 'guest' : userContext.userId;
            const catalog = await service.listSites({
                sitesFolder: sitesFolderFor(userContext),
                userKey
            });
            return res.json(catalog);
        } catch (error) {
            const statusCode = error.statusCode || 500;
            return sendApiError(res, statusCode, error.message || 'Failed to read user sites');
        }
    });

    return router;
}

module.exports = { createSiteCatalogRouter };
