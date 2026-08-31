const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');
const { resolvePathInside } = require('./path-security');
const { normalizeLoreHtmlFilename } = require('./lore-security');
const { extractBannerInfo } = require('./core');

const SITE_CATALOG_SCHEMA_VERSION = 1;

function safeProjectId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : null;
}

function safeRelativeAsset(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    const segments = normalized.split('/');
    if (!normalized || path.isAbsolute(normalized) || /^[a-z][a-z0-9+.-]*:/i.test(normalized)
        || segments.some(segment => !segment || segment === '.' || segment === '..')) return null;
    return normalized;
}

function encodeProjectUrl(userKey, projectName, relativeFile) {
    const segments = String(relativeFile).split('/').map(segment => encodeURIComponent(segment));
    return `/projects/${encodeURIComponent(userKey)}/${encodeURIComponent(projectName)}/${segments.join('/')}`;
}

function legacyProjectId(projectName, htmlFilename, stats, configuredName) {
    const identity = configuredName || `${stats.birthtimeMs || stats.ctimeMs}:${stats.size}:${htmlFilename}:${projectName}`;
    return `legacy_${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

function statSignature(stats) {
    return stats ? `${stats.size}:${stats.mtimeMs}` : 'missing';
}

class SiteCatalogService {
    constructor(options = {}) {
        this.fs = options.fs || fs;
        this.extractBannerInfo = options.extractBannerInfo || extractBannerInfo;
        this.cache = new Map();
    }

    async listSites({ sitesFolder, userKey }) {
        if (!await this.fs.pathExists(sitesFolder)) {
            return { schemaVersion: SITE_CATALOG_SCHEMA_VERSION, sites: [], warnings: [] };
        }

        const entries = await this.fs.readdir(sitesFolder, { withFileTypes: true });
        const directories = entries.filter(entry => entry.isDirectory());
        const settled = await Promise.allSettled(directories.map(entry => (
            this.readSite({ sitesFolder, projectName: entry.name, userKey })
        )));
        const sites = [];
        const warnings = [];

        settled.forEach((result, index) => {
            const projectName = directories[index].name;
            if (result.status === 'fulfilled') {
                if (result.value.site) sites.push(result.value.site);
                if (result.value.warning) warnings.push(result.value.warning);
            } else {
                warnings.push({ projectName, code: 'PROJECT_UNREADABLE' });
            }
        });

        sites.sort((a, b) => Date.parse(b.lastModified) - Date.parse(a.lastModified));
        return { schemaVersion: SITE_CATALOG_SCHEMA_VERSION, sites, warnings };
    }

    async readSite({ sitesFolder, projectName, userKey }) {
        const projectPath = resolvePathInside(sitesFolder, projectName);
        const configPath = resolvePathInside(projectPath, 'project-config.json');
        let config = {};
        let configWarning = null;
        let configStats = null;

        if (await this.fs.pathExists(configPath)) {
            try {
                configStats = await this.fs.stat(configPath);
                config = await this.fs.readJson(configPath);
                if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid config');
            } catch {
                config = {};
                configWarning = { projectName, code: 'CONFIG_CORRUPT' };
            }
        } else {
            configWarning = { projectName, code: 'CONFIG_MISSING' };
        }

        let htmlFilename;
        try {
            htmlFilename = normalizeLoreHtmlFilename(config.htmlFilename || 'info.html');
        } catch {
            htmlFilename = 'info.html';
            configWarning = { projectName, code: 'CONFIG_PARTIAL' };
        }

        const htmlPath = resolvePathInside(projectPath, htmlFilename);
        if (!await this.fs.pathExists(htmlPath)) {
            return { site: null, warning: { projectName, code: 'HTML_MISSING' } };
        }
        const htmlStats = await this.fs.stat(htmlPath);
        if (!htmlStats.isFile()) return { site: null, warning: { projectName, code: 'HTML_MISSING' } };

        const cacheKey = `${userKey}\u0000${projectPath}`;
        const signature = `${statSignature(configStats)}|${statSignature(htmlStats)}`;
        const cached = this.cache.get(cacheKey);
        if (cached?.signature === signature) {
            return { site: cached.site, warning: configWarning || cached.warning };
        }

        const catalogMetadata = config.catalog && typeof config.catalog === 'object' ? config.catalog : {};
        const hasCatalogMetadata = catalogMetadata.version === SITE_CATALOG_SCHEMA_VERSION
            && typeof catalogMetadata.title === 'string';
        let title = typeof catalogMetadata.title === 'string' && catalogMetadata.title.trim()
            ? catalogMetadata.title.trim()
            : (typeof config.title === 'string' && config.title.trim() ? config.title.trim() : null);
        let bannerPath = safeRelativeAsset(catalogMetadata.bannerPath || config.bannerPath);
        let bannerExists = false;
        let htmlContent = null;

        if (!hasCatalogMetadata && (!title || bannerPath === null)) {
            htmlContent = await this.fs.readFile(htmlPath, 'utf8');
            if (!title) {
                const titleMatch = htmlContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
                title = titleMatch?.[1]?.trim() || projectName;
            }
            if (bannerPath === null) {
                const bannerInfo = await this.extractBannerInfo(htmlContent, projectPath);
                bannerPath = safeRelativeAsset(bannerInfo.bannerPath);
                bannerExists = Boolean(bannerPath && bannerInfo.bannerExists);
            }
        }

        if (bannerPath && !bannerExists) {
            const bannerFile = resolvePathInside(projectPath, ...bannerPath.split('/'));
            bannerExists = await this.fs.pathExists(bannerFile) && (await this.fs.stat(bannerFile)).isFile();
        }

        const projectId = safeProjectId(config.projectId)
            || legacyProjectId(projectName, htmlFilename, htmlStats, config.projectName);
        const legacyNames = [...new Set([
            ...(Array.isArray(config.legacyNames) ? config.legacyNames : []),
            config.projectName,
            projectName
        ].filter(value => typeof value === 'string' && value))];
        const created = config.created && !Number.isNaN(Date.parse(config.created))
            ? new Date(config.created).toISOString()
            : new Date(htmlStats.birthtimeMs || htmlStats.ctimeMs).toISOString();
        const lastModified = config.modified && !Number.isNaN(Date.parse(config.modified))
            ? new Date(Math.max(Date.parse(config.modified), htmlStats.mtimeMs)).toISOString()
            : htmlStats.mtime.toISOString();
        const site = Object.freeze({
            schemaVersion: SITE_CATALOG_SCHEMA_VERSION,
            projectId,
            projectName,
            legacyNames,
            title: title || projectName,
            htmlFilename,
            openUrl: encodeProjectUrl(userKey, projectName, htmlFilename),
            lastModified,
            created,
            bannerExists,
            bannerUrl: bannerExists ? encodeProjectUrl(userKey, projectName, bannerPath) : null
        });

        this.cache.set(cacheKey, { signature, site, warning: configWarning });
        return { site, warning: configWarning };
    }
}

module.exports = {
    SITE_CATALOG_SCHEMA_VERSION,
    SiteCatalogService,
    encodeProjectUrl,
    legacyProjectId,
    safeRelativeAsset
};
