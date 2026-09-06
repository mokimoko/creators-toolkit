const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const { normalizeLoreProjectName } = require('./lore-security');
const { resolvePathInside } = require('./path-security');

// Import from core.js
const {
    IS_LOCAL,
    validateUserContext,
    getUserSitesFolder,
    getUserRoleplaysFolder
} = require('./core');

const router = express.Router();

function requestError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseUserContext(value) {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        throw requestError('User context must be valid JSON');
    }
}

function normalizeRoleplayUniverse(value) {
    if (typeof value !== 'string') throw requestError('Universe name must be text');
    const universe = value.trim();
    if (!universe || universe === '.' || universe === '..' || universe.length > 128
        || path.basename(universe) !== universe || /[\u0000-\u001f<>:"/\\|?*]/.test(universe)) {
        throw requestError('Universe name is not valid');
    }
    return universe;
}

function normalizeRoleplayHtmlFilename(value) {
    if (typeof value !== 'string') throw requestError('Story filename must be text');
    const filename = value.trim();
    if (!filename || filename.length > 255 || path.basename(filename) !== filename
        || /[\u0000-\u001f<>:"/\\|?*]/.test(filename) || !/\.html?$/i.test(filename)) {
        throw requestError('Story filename must be a safe HTML filename');
    }
    return filename;
}

function downloadFilename(value, fallback) {
    const cleaned = String(value || '').replace(/[^a-zA-Z0-9-_]/g, '_').replace(/^_+|_+$/g, '');
    return cleaned || fallback;
}

function attachArchiveResponse(res, archive, filename) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    archive.on('warning', error => {
        if (error.code === 'ENOENT') console.warn('Archive entry disappeared during export:', error.message);
        else archive.emit('error', error);
    });
    archive.on('error', error => {
        console.error('Archive export failed:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to create archive' });
        else res.destroy(error);
    });
    archive.pipe(res);
}

function collectLocalImageReferences(source) {
    const references = new Set();
    const consider = rawValue => {
        let value = String(rawValue || '').trim().replace(/^['"]|['"]$/g, '');
        if (!value || value.startsWith('#') || /^(?:data:|https?:|blob:|\/\/)/i.test(value)) return;
        value = value.split(/[?#]/, 1)[0].replace(/\\/g, '/').replace(/^\.\//, '');
        try {
            value = decodeURIComponent(value);
        } catch {
            return;
        }
        const normalized = path.posix.normalize(value);
        if (normalized.startsWith('images/') && normalized !== 'images/' && !normalized.includes('../')) {
            references.add(normalized);
        }
    };

    const attributePattern = /\b(?:src|href|poster)\s*=\s*(["'])(.*?)\1/gi;
    const srcsetPattern = /\bsrcset\s*=\s*(["'])(.*?)\1/gi;
    const cssUrlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
    let match;
    while ((match = attributePattern.exec(source))) consider(match[2]);
    while ((match = srcsetPattern.exec(source))) {
        match[2].split(',').forEach(candidate => consider(candidate.trim().split(/\s+/, 1)[0]));
    }
    while ((match = cssUrlPattern.exec(source))) consider(match[2]);
    return references;
}

async function requireSavedRoleplay(userContext, universeValue, filenameValue) {
    userContext = parseUserContext(userContext);
    const validation = validateUserContext(userContext);
    if (!validation.valid) throw requestError(validation.error);
    const universe = normalizeRoleplayUniverse(universeValue);
    const roleplaysFolder = getUserRoleplaysFolder(userContext);
    const universePath = resolvePathInside(roleplaysFolder, universe);
    if (!await fs.pathExists(universePath) || !(await fs.stat(universePath)).isDirectory()) {
        throw requestError('Saved universe not found', 404);
    }

    let filename = null;
    let htmlPath = null;
    if (filenameValue !== undefined) {
        filename = normalizeRoleplayHtmlFilename(filenameValue);
        htmlPath = resolvePathInside(universePath, filename);
        if (!await fs.pathExists(htmlPath) || !(await fs.stat(htmlPath)).isFile()) {
            throw requestError('Saved story not found', 404);
        }
    }
    return { universe, universePath, filename, htmlPath };
}

// =============================================================================
// PROJECT EXPORT ROUTES
// =============================================================================

// Export a project as ZIP file
router.post('/projects/export', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Export not available in hosted environment' });
    }

    try {
        const { projectName } = req.body;
        const userContext = parseUserContext(req.body.userContext);
        
        // Validate user context
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!projectName || !projectName.trim()) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        const sitesFolder = getUserSitesFolder(userContext);
        const safeProjectName = normalizeLoreProjectName(projectName);
        const projectPath = resolvePathInside(sitesFolder, safeProjectName);

        // Check if project exists
        if (!await fs.pathExists(projectPath)) {
            console.log(`📁 Project not found: ${projectPath}`);
            return res.status(404).json({ error: 'Project not found' });
        }

        // Check if it's actually a directory
        const projectStat = await fs.stat(projectPath);
        if (!projectStat.isDirectory()) {
            return res.status(400).json({ error: 'Project path is not a directory' });
        }

        // Generate filename with current date
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        const cleanProjectName = safeProjectName.replace(/[^a-zA-Z0-9-_]/g, '_');
        const zipFilename = `${cleanProjectName}_Export_${dateStr}.zip`;
        
        const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
        console.log(`📦 Starting export for ${userDisplay}: ${safeProjectName}`);
        console.log(`   📁 Source: ${projectPath}`);
        console.log(`   📄 Output: ${zipFilename}`);

        // Set response headers for file download
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
        res.setHeader('Cache-Control', 'no-cache');

        // Create archiver instance
        const archive = archiver('zip', {
            zlib: { level: 6 } // Balanced compression keeps larger project downloads responsive.
        });

        // Handle archiver errors
        archive.on('error', (err) => {
            console.error('📦 Archive error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to create archive' });
            }
        });

        // Handle archiver warnings
        archive.on('warning', (err) => {
            if (err.code === 'ENOENT') {
                console.warn('📦 Archive warning (file not found):', err);
            } else {
                console.error('📦 Archive warning:', err);
            }
        });

        // Track progress
        let totalFiles = 0;
        archive.on('entry', (entry) => {
            totalFiles++;
            if (totalFiles % 10 === 0) { // Log every 10 files
                console.log(`   📄 Processed ${totalFiles} files...`);
            }
        });

        // Pipe archive data to response
        archive.pipe(res);

        // Add the entire project directory to the archive
        // This will preserve the folder structure: ProjectName/info.html, ProjectName/assets/...
        archive.directory(projectPath, safeProjectName);

        // Finalize the archive
        await archive.finalize();

        console.log(`✅ Export completed: ${zipFilename}`);
        console.log(`   📊 Total files: ${totalFiles}`);
        console.log(`   📏 Archive size: ${archive.pointer()} bytes`);

    } catch (error) {
        console.error('❌ Export error:', error);
        
        // Send error response if headers haven't been sent yet
        if (!res.headersSent) {
            res.status(error.statusCode || 500).json({
                error: 'Failed to export project',
                details: error.message 
            });
        }
    }
});

// Export one saved RP story with its shared CSS and only the images it references.
router.post('/roleplay/export-story', async (req, res) => {
    if (!IS_LOCAL) return res.status(403).json({ error: 'Export not available in hosted environment' });

    try {
        const saved = await requireSavedRoleplay(
            req.body.userContext,
            req.body.universe,
            req.body.filename
        );
        const html = await fs.readFile(saved.htmlPath, 'utf8');
        const cssPath = resolvePathInside(saved.universePath, 'generated.css');
        if (!await fs.pathExists(cssPath) || !(await fs.stat(cssPath)).isFile()) {
            throw requestError('Saved story CSS not found', 404);
        }
        const css = await fs.readFile(cssPath, 'utf8');
        const imageReferences = new Set([
            ...collectLocalImageReferences(html),
            ...collectLocalImageReferences(css)
        ]);

        const archive = archiver('zip', { zlib: { level: 6 } });
        const storyName = path.parse(saved.filename).name;
        const zipFilename = `${downloadFilename(storyName, 'Story')}.zip`;
        attachArchiveResponse(res, archive, zipFilename);

        const archiveRoot = saved.universe;
        archive.file(saved.htmlPath, { name: path.posix.join(archiveRoot, saved.filename) });
        archive.file(cssPath, { name: path.posix.join(archiveRoot, 'generated.css') });
        archive.append('', { name: path.posix.join(archiveRoot, 'images/') });

        for (const reference of imageReferences) {
            const imagePath = resolvePathInside(saved.universePath, ...reference.split('/'));
            if (!await fs.pathExists(imagePath)) continue;
            const stat = await fs.lstat(imagePath);
            if (stat.isFile() && !stat.isSymbolicLink()) {
                archive.file(imagePath, { name: path.posix.join(archiveRoot, reference) });
            }
        }

        await archive.finalize();
    } catch (error) {
        console.error('Story export failed:', error);
        if (!res.headersSent) {
            res.status(error.statusCode || 500).json({
                error: error.statusCode ? error.message : 'Failed to export story'
            });
        }
    }
});

// Export the saved universe exactly as it appears in the user's roleplays folder.
router.post('/roleplay/export-universe', async (req, res) => {
    if (!IS_LOCAL) return res.status(403).json({ error: 'Export not available in hosted environment' });

    try {
        const saved = await requireSavedRoleplay(req.body.userContext, req.body.universe);
        const archive = archiver('zip', { zlib: { level: 6 } });
        const zipFilename = `${downloadFilename(saved.universe, 'Universe')}.zip`;
        attachArchiveResponse(res, archive, zipFilename);
        archive.directory(saved.universePath, saved.universe);
        await archive.finalize();
    } catch (error) {
        console.error('Universe export failed:', error);
        if (!res.headersSent) {
            res.status(error.statusCode || 500).json({
                error: error.statusCode ? error.message : 'Failed to export universe'
            });
        }
    }
});

// Get export info for a project (optional - for showing file counts, sizes, etc.)
router.post('/projects/export-info', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Export not available in hosted environment' });
    }

    try {
        const { projectName } = req.body;
        const userContext = parseUserContext(req.body.userContext);
        
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!projectName) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        const sitesFolder = getUserSitesFolder(userContext);
        const safeProjectName = normalizeLoreProjectName(projectName);
        const projectPath = resolvePathInside(sitesFolder, safeProjectName);

        if (!await fs.pathExists(projectPath)) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Calculate project info
        const info = await calculateProjectInfo(projectPath);
        
        console.log(`📊 Export info for "${safeProjectName}": ${info.fileCount} files, ${formatFileSize(info.totalSize)}`);
        
        res.json({
            projectName: safeProjectName,
            ...info,
            formattedSize: formatFileSize(info.totalSize)
        });

    } catch (error) {
        console.error('Error getting export info:', error);
        res.status(500).json({ error: 'Failed to get export information' });
    }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Calculate total files and size in a directory
async function calculateProjectInfo(dirPath) {
    let fileCount = 0;
    let totalSize = 0;
    let hasAssets = false;
    let hasImages = false;
    
    async function scanDirectory(currentPath) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const entryPath = path.join(currentPath, entry.name);
            
            if (entry.isDirectory()) {
                // Check for special folders
                if (entry.name === 'assets') hasAssets = true;
                if (entry.name === 'images') hasImages = true;
                
                // Recursively scan subdirectory
                await scanDirectory(entryPath);
            } else if (entry.isFile()) {
                fileCount++;
                const stat = await fs.stat(entryPath);
                totalSize += stat.size;
            }
        }
    }
    
    await scanDirectory(dirPath);
    
    return {
        fileCount,
        totalSize,
        hasAssets,
        hasImages
    };
}

// Format file size in human readable format
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    
    return `${size.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

module.exports = router;
