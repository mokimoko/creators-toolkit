const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const sharp = require('sharp');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const { IMAGE_EXTENSIONS, isPathInside, resolvePathInside, normalizeMediaPath } = require('./path-security');
const {
    cleanupUnusedStyleAssets,
    copyRegisteredStyleAssets,
    decodePngDataUrl,
    normalizeLoreAssetFilename,
    normalizeLoreAssetFolder,
    normalizeLoreAssetSegment,
    normalizeLoreHtmlFilename,
    normalizeLoreProjectName,
    normalizeLoreProjectSubfolder,
    normalizeStyleAssetManifest,
    writeFilesWithRollback
} = require('./lore-security');
const { buildRoleplayAssetPlan, classifyAssetWrite, cleanRoleplayTitle } = require('./roleplay-assets');
const {
    buildLoreCopyWrites,
    collectRoleplaySourceFiles,
    discoverLoreRoleplayTargets
} = require('./roleplay-lore-links');
const { getOwnedUserContext } = require('./toolkit-session');

const {
    IS_LOCAL,
    USERS_FOLDER,
    GUEST_FOLDER,
    LEGACY_SITES_FOLDER,
    validateUserContext,
    getUserSettingsFolder,
    getUserSitesFolder,
    getUserRoleplaysFolder,
    extractBannerInfo
} = require('./core');

const router = express.Router();
const PROJECT_DEBUG_ENABLED = IS_LOCAL && process.env.TOOLKIT_PROJECT_DEBUG === '1';

const GITHUB_SYNC_IGNORED_DIRECTORIES = new Set(['.git', '.netlify', 'node_modules']);
const LORE_PROJECT_DATA_FILENAME = 'lore-project.json';
const GITHUB_SYNC_IGNORED_FILES = new Set(['project-config.json', LORE_PROJECT_DATA_FILENAME]);
const OPTIONAL_PUBLIC_SERVICE_FILES = [
    'netlify/functions/read-through-comments.mjs',
    'package.json',
    '.gitignore',
    'READ-THROUGH-DEPLOYMENT.md'
];
const INFO_CONVERTER_FOLDER = path.resolve(__dirname, '..', 'info-converter');
const ROLEPLAY_CONVERTER_FOLDER = path.join(__dirname, '..', 'roleplay-converter');
const ROLEPLAY_TEMPLATES_FOLDER = path.join(ROLEPLAY_CONVERTER_FOLDER, 'templates');
const IMAGE_MIME_TYPES = new Set([
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'
]);
const JSON_EXTENSIONS = new Set(['.json']);

function requestError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function validateLoreProjectData(projectData) {
    if (!projectData || typeof projectData !== 'object' || Array.isArray(projectData)) {
        throw requestError('Editable Lore project data must be an object');
    }
    if (projectData.schemaVersion !== 1) {
        throw requestError('Unsupported editable Lore project schema version');
    }
}

function normalizePublicRelativePath(value) {
    if (typeof value !== 'string') throw requestError('Public file manifest entries must be strings');
    const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    const segments = normalized.split('/');
    const normalizedLower = normalized.toLowerCase();
    const firstSegmentLower = (segments[0] || '').toLowerCase();
    if (!normalized || path.isAbsolute(normalized) || segments.some(segment => !segment || segment === '.' || segment === '..')) {
        throw requestError('Public file manifest contains an invalid path');
    }
    if ([...GITHUB_SYNC_IGNORED_FILES].some(file => file.toLowerCase() === normalizedLower)
        || [...GITHUB_SYNC_IGNORED_DIRECTORIES].some(directory => directory.toLowerCase() === firstSegmentLower)) {
        throw requestError('Public file manifest contains a private or unmanaged path');
    }
    if (normalizedLower.startsWith('assets/lorebook/')) {
        throw requestError('Linked lorebook files cannot be published');
    }
    return normalized;
}

function normalizePublicFileManifest(values, htmlFilename) {
    if (!Array.isArray(values)) throw requestError('Public file manifest must be an array');
    if (values.length > 5000) throw requestError('Public file manifest is too large');
    const manifest = new Set(values.map(normalizePublicRelativePath));
    manifest.add(normalizePublicRelativePath(htmlFilename));
    return [...manifest].sort();
}

async function getRoleplayTemplateMap() {
    const templates = new Map();
    if (await fs.pathExists(ROLEPLAY_TEMPLATES_FOLDER)) {
        const files = await fs.readdir(ROLEPLAY_TEMPLATES_FOLDER);
        for (const file of files) {
            if (/^[A-Za-z0-9][A-Za-z0-9._-]*\.css$/i.test(file)) {
                templates.set(file, resolvePathInside(ROLEPLAY_TEMPLATES_FOLDER, file));
            }
        }
    }
    const legacyDefault = path.join(ROLEPLAY_CONVERTER_FOLDER, 'generated.css');
    if (!templates.has('generated.css') && await fs.pathExists(legacyDefault)) {
        templates.set('generated.css', legacyDefault);
    }
    return templates;
}

async function resolveRoleplayTemplate(templateName) {
    if (typeof templateName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.css$/i.test(templateName)) return null;
    return (await getRoleplayTemplateMap()).get(templateName) || null;
}

async function validateUploadedImage(file) {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension) || !IMAGE_MIME_TYPES.has(file.mimetype)) {
        throw requestError(`Unsupported image type: ${file.originalname || 'upload'}`);
    }
    try {
        await sharp(file.buffer, { animated: true }).metadata();
    } catch {
        throw requestError(`Invalid or unreadable image: ${file.originalname || 'upload'}`);
    }
}

async function validateExistingMediaPath(value, universePath) {
    const normalized = normalizeMediaPath(value);
    if (!normalized) return null;
    const resolved = resolvePathInside(universePath, ...normalized.split('/'));
    if (!await fs.pathExists(resolved)) return null;
    const stats = await fs.stat(resolved);
    return stats.isFile() ? normalized : null;
}

async function requireExistingMediaPath(value, universePath, label) {
    if (!value) return null;
    const normalized = await validateExistingMediaPath(value, universePath);
    if (!normalized) throw requestError(`${label} could not be found: ${value}`);
    return normalized;
}

const isSamePathOrInside = isPathInside;

async function validateGitRepositoryPath(repositoryPath) {
    if (!repositoryPath || typeof repositoryPath !== 'string') {
        return { valid: false, error: 'No repository folder selected' };
    }

    const resolvedPath = path.resolve(repositoryPath);
    if (!await fs.pathExists(resolvedPath)) {
        return { valid: false, error: 'The selected repository folder no longer exists' };
    }

    const stats = await fs.stat(resolvedPath);
    if (!stats.isDirectory()) {
        return { valid: false, error: 'The selected path is not a folder' };
    }

    if (!await fs.pathExists(path.join(resolvedPath, '.git'))) {
        return { valid: false, error: 'Select the repository root—the folder containing .git' };
    }

    return { valid: true, path: resolvedPath };
}

async function chooseGitRepositoryFolder(initialPath = '') {
    if (process.platform !== 'win32') {
        throw new Error('The repository folder picker is currently available on Windows only');
    }

    const script = `
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$picker = New-Object System.Windows.Forms.FolderBrowserDialog
$picker.Description = 'Select the root folder of the GitHub repository'
$picker.ShowNewFolderButton = $false
if ($env:LORE_CODEX_REPOSITORY_START -and (Test-Path -LiteralPath $env:LORE_CODEX_REPOSITORY_START)) {
    $picker.SelectedPath = $env:LORE_CODEX_REPOSITORY_START
}
if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $picker.SelectedPath
}
`;
    const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
    const { stdout } = await execFileAsync('powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-STA',
        '-EncodedCommand',
        encodedScript
    ], {
        encoding: 'utf8',
        windowsHide: false,
        env: {
            ...process.env,
            LORE_CODEX_REPOSITORY_START: initialPath || ''
        },
        maxBuffer: 1024 * 1024
    });

    return stdout.trim();
}

function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', reject);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

async function filesMatch(sourcePath, destinationPath) {
    if (!await fs.pathExists(destinationPath)) return false;

    const [sourceStats, destinationStats] = await Promise.all([
        fs.stat(sourcePath),
        fs.stat(destinationPath)
    ]);
    if (!destinationStats.isFile() || sourceStats.size !== destinationStats.size) return false;

    const [sourceHash, destinationHash] = await Promise.all([
        hashFile(sourcePath),
        hashFile(destinationPath)
    ]);
    return sourceHash === destinationHash;
}

async function copyPublicManifestIntoGitRepository(sourceRoot, destinationRoot, publicFiles) {
    const summary = { newFiles: 0, updatedFiles: 0, unchangedFiles: 0, skippedLinks: 0, missingFiles: 0 };
    const manifest = new Set(publicFiles.map(normalizePublicRelativePath));
    const hasReadThroughService = await fs.pathExists(resolvePathInside(sourceRoot, 'netlify', 'functions', 'read-through-comments.mjs'));
    if (hasReadThroughService) OPTIONAL_PUBLIC_SERVICE_FILES.forEach(file => manifest.add(file));

    await fs.ensureDir(destinationRoot);
    for (const relativePath of [...manifest].sort()) {
        const pathSegments = relativePath.split('/');
        const sourcePath = resolvePathInside(sourceRoot, ...pathSegments);
        const destinationPath = resolvePathInside(destinationRoot, ...pathSegments);
        if (!await fs.pathExists(sourcePath)) {
            summary.missingFiles++;
            continue;
        }

        const sourceStats = await fs.lstat(sourcePath);
        if (sourceStats.isSymbolicLink()) {
            summary.skippedLinks++;
            continue;
        }
        if (!sourceStats.isFile()) continue;

        const destinationExists = await fs.pathExists(destinationPath);
        if (destinationExists && await filesMatch(sourcePath, destinationPath)) {
            summary.unchangedFiles++;
            continue;
        }

        await fs.ensureDir(path.dirname(destinationPath));
        await fs.copyFile(sourcePath, destinationPath);
        if (destinationExists) summary.updatedFiles++;
        else summary.newFiles++;
    }
    return summary;
}

async function installNetlifyReadThroughKit(projectFolder) {
    const kitFolder = path.join(__dirname, '..', 'roleplay-converter', 'hosting', 'netlify-comments');
    const sourceFunction = path.join(kitFolder, 'netlify', 'functions', 'read-through-comments.mjs');
    const destinationFunction = path.join(projectFolder, 'netlify', 'functions', 'read-through-comments.mjs');
    const destinationPackage = path.join(projectFolder, 'package.json');
    const destinationGuide = path.join(projectFolder, 'READ-THROUGH-DEPLOYMENT.md');
    const destinationGitignore = path.join(projectFolder, '.gitignore');

    await fs.ensureDir(path.dirname(destinationFunction));
    await fs.copy(sourceFunction, destinationFunction, { overwrite: true });

    if (await fs.pathExists(destinationPackage)) {
        const packageData = await fs.readJson(destinationPackage);
        packageData.dependencies = packageData.dependencies || {};
        packageData.dependencies['@netlify/blobs'] = '^11.0.1';
        packageData.engines = packageData.engines || {};
        packageData.engines.node = packageData.engines.node || '>=22.12.0';
        await fs.writeJson(destinationPackage, packageData, { spaces: 2 });
    } else {
        await fs.copy(path.join(kitFolder, 'package.json'), destinationPackage);
    }

    if (!await fs.pathExists(destinationGuide)) {
        await fs.copy(path.join(kitFolder, 'READ-THROUGH-DEPLOYMENT.md'), destinationGuide);
    }

    const ignoreEntries = ['.netlify/', 'node_modules/'];
    const existingIgnore = await fs.pathExists(destinationGitignore)
        ? await fs.readFile(destinationGitignore, 'utf8')
        : '';
    const missingIgnoreEntries = ignoreEntries.filter(entry => !existingIgnore.split(/\r?\n/).includes(entry));
    if (missingIgnoreEntries.length) {
        const prefix = existingIgnore && !existingIgnore.endsWith('\n') ? '\n' : '';
        await fs.appendFile(destinationGitignore, `${prefix}${missingIgnoreEntries.join('\n')}\n`);
    }

    return [
        'netlify/functions/read-through-comments.mjs',
        'package.json',
        '.gitignore',
        'READ-THROUGH-DEPLOYMENT.md'
    ];
}

async function getGitHubSyncProject(projectName, userContext) {
    const validation = validateUserContext(userContext);
    if (!validation.valid) throw new Error(validation.error);
    if (!projectName) throw new Error('Project name is required');

    const sitesFolder = getUserSitesFolder(userContext);
    const cleanProjectName = normalizeLoreProjectName(projectName);
    const projectFolder = resolvePathInside(sitesFolder, cleanProjectName);
    if (!await fs.pathExists(projectFolder)) {
        throw new Error('Save the Lore Codex project before connecting a repository');
    }

    const configPath = resolvePathInside(projectFolder, 'project-config.json');
    const config = await fs.pathExists(configPath) ? await fs.readJson(configPath) : {};
    return { cleanProjectName, projectFolder, configPath, config };
}

// Read the repository connection for one Lore Codex project.
router.post('/github-sync/status', async (req, res) => {
    if (!IS_LOCAL) return res.status(403).json({ error: 'File system access not available in hosted environment' });

    try {
        const project = await getGitHubSyncProject(req.body.projectName, req.body.userContext);
        const repositoryPath = project.config.githubSync?.repositoryPath || '';
        const validation = repositoryPath
            ? await validateGitRepositoryPath(repositoryPath)
            : { valid: false };

        res.json({
            success: true,
            configured: Boolean(repositoryPath),
            valid: Boolean(validation.valid),
            repositoryPath,
            repositoryName: repositoryPath ? path.basename(repositoryPath) : '',
            lastSyncedAt: project.config.githubSync?.lastSyncedAt || null,
            error: repositoryPath && !validation.valid ? validation.error : null
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Open a native Windows folder picker and remember the selected Git repository.
router.post('/github-sync/select-folder', async (req, res) => {
    if (!IS_LOCAL) return res.status(403).json({ error: 'File system access not available in hosted environment' });

    try {
        const project = await getGitHubSyncProject(req.body.projectName, req.body.userContext);
        const selectedPath = await chooseGitRepositoryFolder(project.config.githubSync?.repositoryPath || '');
        if (!selectedPath) return res.json({ success: true, cancelled: true });

        const repository = await validateGitRepositoryPath(selectedPath);
        if (!repository.valid) return res.status(400).json({ error: repository.error });

        const sourcePath = await fs.realpath(project.projectFolder);
        const repositoryPath = await fs.realpath(repository.path);
        if (isSamePathOrInside(repositoryPath, sourcePath) || isSamePathOrInside(sourcePath, repositoryPath)) {
            return res.status(400).json({ error: 'The repository and Lore Codex site folders must be separate' });
        }

        project.config.githubSync = {
            ...(project.config.githubSync || {}),
            repositoryPath,
            configuredAt: project.config.githubSync?.configuredAt || new Date().toISOString()
        };
        await writeFilesWithRollback([{
            path: project.configPath,
            content: `${JSON.stringify(project.config, null, 2)}\n`,
            encoding: 'utf8'
        }]);

        res.json({
            success: true,
            configured: true,
            valid: true,
            repositoryPath,
            repositoryName: path.basename(repositoryPath),
            lastSyncedAt: project.config.githubSync.lastSyncedAt || null
        });
    } catch (error) {
        console.error('Error selecting Git repository:', error);
        res.status(500).json({ error: error.message || 'Failed to select repository folder' });
    }
});

// Copy new and changed site files into the repository without deleting repository-only files.
router.post('/github-sync/publish', async (req, res) => {
    if (!IS_LOCAL) return res.status(403).json({ error: 'File system access not available in hosted environment' });

    try {
        const project = await getGitHubSyncProject(req.body.projectName, req.body.userContext);
        const repository = await validateGitRepositoryPath(project.config.githubSync?.repositoryPath || '');
        if (!repository.valid) return res.status(400).json({ error: repository.error });

        const sourcePath = await fs.realpath(project.projectFolder);
        const repositoryPath = await fs.realpath(repository.path);
        if (isSamePathOrInside(repositoryPath, sourcePath) || isSamePathOrInside(sourcePath, repositoryPath)) {
            return res.status(400).json({ error: 'The repository and Lore Codex site folders must be separate' });
        }

        const publicFiles = project.config.publicFiles;
        if (!Array.isArray(publicFiles) || publicFiles.length === 0) {
            return res.status(400).json({ error: 'Save this project again to prepare its public file manifest' });
        }
        const summary = await copyPublicManifestIntoGitRepository(sourcePath, repositoryPath, publicFiles);
        project.config.githubSync = {
            ...project.config.githubSync,
            repositoryPath,
            lastSyncedAt: new Date().toISOString(),
            lastSyncSummary: summary
        };
        await writeFilesWithRollback([{
            path: project.configPath,
            content: `${JSON.stringify(project.config, null, 2)}\n`,
            encoding: 'utf8'
        }]);

        res.json({
            success: true,
            repositoryPath,
            repositoryName: path.basename(repositoryPath),
            lastSyncedAt: project.config.githubSync.lastSyncedAt,
            summary,
            message: `${summary.newFiles} new and ${summary.updatedFiles} updated files copied to ${path.basename(repositoryPath)}`
        });
    } catch (error) {
        console.error('Error updating Git repository:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update repository' });
    }
});

// =============================================================================
// LORE CODEX (INFO CONVERTER) ROUTES
// =============================================================================

// Get list of projects for a specific user (local only)
router.post('/projects', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { userContext } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const sitesFolder = getUserSitesFolder(userContext);
        const projects = [];

        if (!await fs.pathExists(sitesFolder)) {
            return res.json([]);
        }
        
        const entries = await fs.readdir(sitesFolder, { withFileTypes: true });
        
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const projectName = entry.name;
                const projectPath = resolvePathInside(sitesFolder, projectName);
                
                // Read config to get filename
                let htmlFilename = 'info.html';
                const configPath = resolvePathInside(projectPath, 'project-config.json');
                if (await fs.pathExists(configPath)) {
                    try {
                        const config = await fs.readJson(configPath);
                        htmlFilename = normalizeLoreHtmlFilename(config.htmlFilename || 'info.html');
                    } catch (e) {
                        htmlFilename = 'info.html';
                    }
                }

                const infoPath = resolvePathInside(projectPath, htmlFilename);
                
                if (await fs.pathExists(infoPath)) {
                    const stats = await fs.stat(infoPath);
                    
                    let title = projectName;
                    try {
                        const htmlContent = await fs.readFile(infoPath, 'utf8');
                        const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/i);
                        if (titleMatch && titleMatch[1]) {
                            title = titleMatch[1];
                        }
                    } catch (e) {}

                    const assetsPath = resolvePathInside(projectPath, 'assets');
                    const hasAssets = await fs.pathExists(assetsPath);

                    projects.push({
                        projectName: projectName,
                        htmlFilename,
                        title: title,
                        lastModified: stats.mtime,
                        size: stats.size,
                        hasAssets: hasAssets,
                        path: projectPath,
                        userContext: userContext
                    });
                }
            }
        }

        projects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        
        console.log(`📖 Found ${projects.length} projects for ${userContext.isGuest ? 'guest' : userContext.username}`);
        res.json(projects);
    } catch (error) {
        console.error('Error reading projects:', error);
        res.status(500).json({ error: 'Failed to read projects folder' });
    }
});

// Load a specific project (local only) - now user-aware
router.post('/projects/load', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { projectName, userContext } = req.body;
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

        // Read project config to get actual filename
        let htmlFilename = 'info.html'; // default for backward compatibility
        let config = {};
        const configPath = resolvePathInside(projectPath, 'project-config.json');
        if (await fs.pathExists(configPath)) {
            config = await fs.readJson(configPath);
            htmlFilename = normalizeLoreHtmlFilename(config.htmlFilename || 'info.html');
        }

        const filePath = resolvePathInside(projectPath, htmlFilename);

        const htmlContent = await fs.readFile(filePath, 'utf8');
        const projectDataFilename = config.projectDataFilename || LORE_PROJECT_DATA_FILENAME;
        if (projectDataFilename !== LORE_PROJECT_DATA_FILENAME) {
            throw requestError('Project config contains an unsupported editable data filename');
        }
        const projectDataPath = resolvePathInside(projectPath, projectDataFilename);
        const projectData = await fs.pathExists(projectDataPath)
            ? await fs.readJson(projectDataPath)
            : null;
        console.log(`📖 Loaded project "${safeProjectName}" for ${userContext.isGuest ? 'guest' : userContext.username}`);
        
        res.json({ 
            projectName: safeProjectName,
            filename: htmlFilename,
            content: htmlContent,
            projectData,
            userContext: userContext,
            success: true
        });
    } catch (error) {
        console.error('Error loading project:', error);
        res.status(error.statusCode || 404).json({ error: error.message || 'Project file not found' });
    }
});

// Save generated HTML to user's folder (local only)
router.post('/save', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { html, projectName, projectData, publicFiles, userContext, styleAssets = [], filename = 'info.html' } = req.body;
        
        if (!html) {
            return res.status(400).json({ error: 'No HTML content provided' });
        }
        
        if (!projectName) {
            return res.status(400).json({ error: 'Project name is required' });
        }
        if (projectData !== undefined) validateLoreProjectData(projectData);

        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const sitesFolder = getUserSitesFolder(userContext);
        const cleanProjectName = normalizeLoreProjectName(projectName);
        const projectFolder = resolvePathInside(sitesFolder, cleanProjectName);
        const configPath = resolvePathInside(projectFolder, 'project-config.json');
        const projectDataPath = resolvePathInside(projectFolder, LORE_PROJECT_DATA_FILENAME);
        await fs.ensureDir(projectFolder);

        let existingConfig = {};
        if (await fs.pathExists(configPath)) {
            try {
                existingConfig = await fs.readJson(configPath);
            } catch (error) {
                console.warn('Could not preserve existing project config:', error);
            }
        }

        let htmlFilename = normalizeLoreHtmlFilename(filename);
        const useExistingFilename = !filename || filename === 'info' || filename === 'info.html';
        if (useExistingFilename && existingConfig.htmlFilename) {
            htmlFilename = normalizeLoreHtmlFilename(existingConfig.htmlFilename);
        }
        const existingHtmlFilename = normalizeLoreHtmlFilename(existingConfig.htmlFilename || htmlFilename);
        const filePath = resolvePathInside(projectFolder, htmlFilename);
        const existingHtmlPath = resolvePathInside(projectFolder, existingHtmlFilename);
        const requestedStyleAssets = normalizeStyleAssetManifest(styleAssets);
        const normalizedPublicFiles = normalizePublicFileManifest(
            publicFiles === undefined ? (existingConfig.publicFiles || [htmlFilename]) : publicFiles,
            htmlFilename
        );
        
        // BACKUP LOGIC: Check if HTML file already exists and back it up (only if not skipping)
        const shouldSkipBackup = req.body.skipBackup || false;
        
        if (!shouldSkipBackup) {
            try {
                if (await fs.pathExists(existingHtmlPath)) {
                    const userFolder = userContext.isGuest 
                        ? GUEST_FOLDER 
                        : resolvePathInside(USERS_FOLDER, userContext.userId);
                    const backupsFolder = resolvePathInside(userFolder, 'backups', 'sites');
                    const backupProjectFolder = resolvePathInside(backupsFolder, cleanProjectName);
                    await fs.ensureDir(backupProjectFolder);

                    const backupPath = resolvePathInside(backupProjectFolder, existingHtmlFilename);
                    await fs.copy(existingHtmlPath, backupPath, { overwrite: true });

                    if (await fs.pathExists(projectDataPath)) {
                        const projectDataBackupPath = resolvePathInside(backupProjectFolder, LORE_PROJECT_DATA_FILENAME);
                        await fs.copy(projectDataPath, projectDataBackupPath, { overwrite: true });
                    }
                    
                    console.log(`✅ Backed up existing ${existingHtmlFilename} for ${cleanProjectName} to user backups folder`);
                }
            } catch (backupError) {
                console.error('❌ Backup failed:', backupError);
                const error = new Error('Backup failed; the existing project was not changed. Retry only after resolving the backup problem.');
                error.statusCode = 409;
                error.code = 'LORE_BACKUP_FAILED';
                throw error;
            }
        }

        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const bannerInfo = await extractBannerInfo(html, projectFolder);
        const config = {
            ...existingConfig,
            projectId: existingConfig.projectId || crypto.randomUUID(),
            projectName: cleanProjectName,
            htmlFilename,
            projectDataFilename: LORE_PROJECT_DATA_FILENAME,
            publicFiles: normalizedPublicFiles,
            created: existingConfig.created || new Date().toISOString(),
            modified: new Date().toISOString(),
            catalog: {
                version: 1,
                title: titleMatch?.[1]?.trim() || cleanProjectName,
                bannerPath: bannerInfo.bannerPath || null
            }
        };

        const assetsCopied = await copyRegisteredStyleAssets(
            INFO_CONVERTER_FOLDER,
            projectFolder,
            requestedStyleAssets
        );

        const writes = [];
        if (projectData !== undefined) {
            writes.push({
                path: projectDataPath,
                content: `${JSON.stringify(projectData, null, 2)}\n`,
                encoding: 'utf8'
            });
        }
        writes.push({
            path: configPath,
            content: `${JSON.stringify(config, null, 2)}\n`,
            encoding: 'utf8'
        });
        // Public HTML is the commit point and is replaced only after its data/config are staged.
        writes.push({ path: filePath, content: html, encoding: 'utf8' });
        await writeFilesWithRollback(writes);

        let cleanedCount = 0;
        try {
            cleanedCount = await cleanupUnusedStyleAssets(projectFolder, requestedStyleAssets);
        } catch (error) {
            console.error('❌ Error during allowlisted style asset cleanup:', error);
        }
        
        const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
        console.log(`💾 Saved "${cleanProjectName}" for ${userDisplay}`);
        
        let responseMessage = `Project saved successfully for ${userDisplay}`;
        
        if (assetsCopied.length > 0) {
            responseMessage += ` (${assetsCopied.length} style assets copied)`;
        }
        
        if (cleanedCount > 0) {
            responseMessage += ` (${cleanedCount} unused assets removed)`;
        }
        
        res.json({ 
            success: true, 
            message: responseMessage,
            projectName: cleanProjectName,
            filepath: filePath,
            projectDataSaved: projectData !== undefined,
            assetsCopied: assetsCopied,
            assetsRemoved: cleanedCount,
            userContext: userContext
        });
    } catch (error) {
        console.error('Error saving file:', error);
        res.status(error.statusCode || 500).json({
            error: error.message || 'Failed to save file',
            code: error.code
        });
    }
});

// Get available item icons by scanning the folder structure
router.get('/icons/scan', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const iconsBasePath = path.join(__dirname, '..', 'info-converter', 'images', 'item-icons');
        
        console.log('🔍 Scanning for item icons at:', iconsBasePath);

        // Check if the base icons folder exists
        if (!await fs.pathExists(iconsBasePath)) {
            console.log('📁 Item icons folder does not exist yet');
            return res.json({ categories: {} });
        }

        // Read all subdirectories (these are the categories)
        const entries = await fs.readdir(iconsBasePath, { withFileTypes: true });
        const categories = {};

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const categoryName = entry.name;
                const categoryPath = path.join(iconsBasePath, categoryName);
                
                // Read all image files in this category
                const files = await fs.readdir(categoryPath);
                const imageFiles = files.filter(file => 
                    /\.(png|jpg|jpeg|gif|svg)$/i.test(file)
                );

                if (imageFiles.length > 0) {
                    categories[categoryName] = imageFiles.map(file => ({
                        name: file.replace(/\.(png|jpg|jpeg|gif|svg)$/i, ''), // Remove extension for display name
                        file: file
                    }));
                    
                    console.log(`  📂 ${categoryName}: ${imageFiles.length} icons`);
                }
            }
        }

        console.log(`✅ Found ${Object.keys(categories).length} icon categories`);
        res.json({ categories });

    } catch (error) {
        console.error('❌ Error scanning icon folders:', error);
        res.status(500).json({ error: 'Failed to scan icon folders' });
    }
});

// Save built icon PNG to project assets folder
router.post('/save-built-icon', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { projectName, itemId, category, pngData, userContext } = req.body;
        
        if (!projectName || !itemId || !pngData) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const sitesFolder = getUserSitesFolder(userContext);
        const safeProjectName = normalizeLoreProjectName(projectName);
        const categoryFolder = normalizeLoreAssetSegment(category || 'items', 'Icon category');
        const safeItemId = normalizeLoreAssetSegment(itemId, 'Item identifier');
        const projectFolder = resolvePathInside(sitesFolder, safeProjectName);
        const iconsFolder = resolvePathInside(projectFolder, 'assets', 'world', categoryFolder, 'icons');
        const iconPath = resolvePathInside(iconsFolder, `${safeItemId}.png`);
        const iconBuffer = decodePngDataUrl(pngData);

        await writeFilesWithRollback([{ path: iconPath, content: iconBuffer }]);
        
        res.json({ 
            success: true,
            iconPath: `assets/world/${categoryFolder}/icons/${safeItemId}.png`
        });
    } catch (error) {
        console.error('Error saving built icon:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to save built icon' });
    }
});

// Save project config (for icon styles, etc.)
router.post('/save-project-config', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { projectName, config, userContext } = req.body;
        
        if (!projectName || !config) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing projectName or config' 
            });
        }

        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (typeof config !== 'object' || Array.isArray(config)) {
            return res.status(400).json({ success: false, error: 'Project config must be an object' });
        }

        const sitesFolder = getUserSitesFolder(userContext);
        const safeProjectName = normalizeLoreProjectName(projectName);
        const projectFolder = resolvePathInside(sitesFolder, safeProjectName);
        const configPath = resolvePathInside(projectFolder, 'project-config.json');
        let existingConfig = {};
        if (await fs.pathExists(configPath)) {
            try {
                existingConfig = await fs.readJson(configPath);
            } catch (error) {
                console.warn('Could not preserve project identity from corrupt config:', error.message);
            }
        }
        config.projectId = existingConfig.projectId || config.projectId || crypto.randomUUID();
        config.legacyNames = [...new Set([
            ...(Array.isArray(existingConfig.legacyNames) ? existingConfig.legacyNames : []),
            existingConfig.projectName,
            projectName
        ].filter(Boolean))];
        await writeFilesWithRollback([{
            path: configPath,
            content: `${JSON.stringify(config, null, 2)}\n`,
            encoding: 'utf8'
        }]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving project config:', error);
        res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
});

router.post('/projects/config', async (req, res) => {
    try {
        const { projectName, userContext } = req.body;
        const validation = validateUserContext(userContext);
        if (!validation.valid) return res.status(400).json({ error: validation.error });
        const sitesFolder = getUserSitesFolder(userContext);
        const projectFolder = resolvePathInside(sitesFolder, normalizeLoreProjectName(projectName));
        const configPath = resolvePathInside(projectFolder, 'project-config.json');

        if (await fs.pathExists(configPath)) {
            const config = await fs.readJson(configPath);
            res.json(config);
        } else {
            res.json({ htmlFilename: 'info.html' });
        }
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load project config' });
    }
});

// Rename project and/or HTML file (local only)
router.post('/projects/rename', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { oldProjectName, newProjectName, oldFilename, newFilename, userContext } = req.body;
        
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!oldProjectName || !newProjectName || !oldFilename || !newFilename) {
            return res.status(400).json({ error: 'All parameters are required' });
        }

        const sitesFolder = getUserSitesFolder(userContext);
        const safeOldProjectName = normalizeLoreProjectName(oldProjectName);
        const safeNewProjectName = normalizeLoreProjectName(newProjectName);
        const oldHtmlFilename = normalizeLoreHtmlFilename(oldFilename);
        const newHtmlFilename = normalizeLoreHtmlFilename(newFilename);
        const oldProjectFolder = resolvePathInside(sitesFolder, safeOldProjectName);
        const newProjectFolder = resolvePathInside(sitesFolder, safeNewProjectName);
        
        // Ensure old project exists
        if (!await fs.pathExists(oldProjectFolder)) {
            return res.status(404).json({ error: 'Original project not found' });
        }

        const projectNameChanged = safeOldProjectName !== safeNewProjectName;
        const filenameChanged = oldHtmlFilename !== newHtmlFilename;

        // CASE 1: Only HTML filename changed
        if (!projectNameChanged && filenameChanged) {
            const oldHtmlPath = resolvePathInside(oldProjectFolder, oldHtmlFilename);
            const newHtmlPath = resolvePathInside(oldProjectFolder, newHtmlFilename);
            if (await fs.pathExists(newHtmlPath)) {
                return res.status(409).json({ error: 'An HTML file with that name already exists' });
            }
            
            // Update or create config
            const configPath = resolvePathInside(oldProjectFolder, 'project-config.json');
            let config = {};
            if (await fs.pathExists(configPath)) {
                config = await fs.readJson(configPath);
            }
            config.projectId = config.projectId || crypto.randomUUID();
            config.htmlFilename = newHtmlFilename;
            config.projectName = safeOldProjectName;

            await fs.move(oldHtmlPath, newHtmlPath, { overwrite: false });
            try {
                await writeFilesWithRollback([{
                    path: configPath,
                    content: `${JSON.stringify(config, null, 2)}\n`,
                    encoding: 'utf8'
                }]);
            } catch (error) {
                await fs.move(newHtmlPath, oldHtmlPath, { overwrite: true });
                throw error;
            }
            
            console.log(`✅ Renamed HTML file: ${oldHtmlFilename} → ${newHtmlFilename}`);
            return res.json({ 
                success: true, 
                message: `HTML file renamed to ${newHtmlFilename}`,
                projectName: safeOldProjectName
            });
        }
        
        // CASE 2: Project name changed (with or without filename change)
        if (projectNameChanged) {
            // Check if new project name already exists
            if (await fs.pathExists(newProjectFolder)) {
                return res.status(400).json({ error: 'A project with that name already exists' });
            }
            
            // Copy entire project folder to new location
            await fs.copy(oldProjectFolder, newProjectFolder);
            try {
                // If filename also changed, rename the HTML file in the new folder
                if (filenameChanged) {
                    const oldHtmlPath = resolvePathInside(newProjectFolder, oldHtmlFilename);
                    const newHtmlPath = resolvePathInside(newProjectFolder, newHtmlFilename);
                    if (await fs.pathExists(newHtmlPath)) throw requestError('An HTML file with that name already exists');
                    await fs.move(oldHtmlPath, newHtmlPath, { overwrite: false });
                }

                // Update config in new folder
                const configPath = resolvePathInside(newProjectFolder, 'project-config.json');
                const config = await fs.pathExists(configPath)
                    ? await fs.readJson(configPath)
                    : {};

                config.projectId = config.projectId || crypto.randomUUID();
                config.legacyNames = [...new Set([
                    ...(Array.isArray(config.legacyNames) ? config.legacyNames : []),
                    config.projectName,
                    safeOldProjectName
                ].filter(Boolean))];
                config.projectName = safeNewProjectName;
                config.htmlFilename = newHtmlFilename;
                await writeFilesWithRollback([{
                    path: configPath,
                    content: `${JSON.stringify(config, null, 2)}\n`,
                    encoding: 'utf8'
                }]);
            } catch (error) {
                await fs.remove(newProjectFolder);
                throw error;
            }
            
            console.log(`✅ Created new project: ${safeNewProjectName} (HTML: ${newHtmlFilename})`);
            return res.json({ 
                success: true, 
                message: `Project created as "${safeNewProjectName}"${filenameChanged ? ` with HTML file "${newHtmlFilename}"` : ''}`,
                projectName: safeNewProjectName
            });
        }
        
        // Should never reach here
        return res.status(400).json({ error: 'No changes specified' });
        
    } catch (error) {
        console.error('Error renaming project:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to rename project' });
    }
});

// Restore backup file (for auto-recovery)
router.post('/restore-backup', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { projectName, userContext } = req.body;
        
        if (!projectName) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const cleanProjectName = normalizeLoreProjectName(projectName);

        const sitesFolder = getUserSitesFolder(userContext);
        const projectFolder = resolvePathInside(sitesFolder, cleanProjectName);
        
        // Read config to get filename
        let htmlFilename = 'info.html';
        const configPath = resolvePathInside(projectFolder, 'project-config.json');
        if (await fs.pathExists(configPath)) {
            try {
                const config = await fs.readJson(configPath);
                htmlFilename = normalizeLoreHtmlFilename(config.htmlFilename || 'info.html');
            } catch (e) {}
        }
        
        const currentFilePath = resolvePathInside(projectFolder, htmlFilename);
        const currentProjectDataPath = resolvePathInside(projectFolder, LORE_PROJECT_DATA_FILENAME);
        
        const userFolder = userContext.isGuest 
            ? GUEST_FOLDER 
            : resolvePathInside(USERS_FOLDER, userContext.userId);
        const backupProjectFolder = resolvePathInside(userFolder, 'backups', 'sites', cleanProjectName);
        const backupPath = resolvePathInside(backupProjectFolder, htmlFilename);
        const projectDataBackupPath = resolvePathInside(backupProjectFolder, LORE_PROJECT_DATA_FILENAME);
        
        // Check if backup exists
        if (!(await fs.pathExists(backupPath))) {
            return res.status(404).json({ error: 'No backup found for this project' });
        }
        
        const writes = [{ path: currentFilePath, content: await fs.readFile(backupPath) }];
        if (await fs.pathExists(projectDataBackupPath)) {
            writes.push({ path: currentProjectDataPath, content: await fs.readFile(projectDataBackupPath) });
        }
        await writeFilesWithRollback(writes);
        
        res.json({ success: true, message: 'Backup restored successfully' });
        
    } catch (error) {
        console.error('Error restoring backup:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to restore backup' });
    }
});

// Generate and download HTML (fallback for hosted environment)
router.post('/generate', (req, res) => {
    try {
        const { html, filename = 'info.html' } = req.body;
        
        if (!html) {
            return res.status(400).json({ error: 'No HTML content provided' });
        }

        const safeFilename = normalizeLoreHtmlFilename(filename);
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('Error generating download:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to generate download' });
    }
});

// Get list of HTML files in matching roleplay folder for dropdown
router.post('/roleplay/list/:projectName', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { projectName } = req.params;
        const { userContext } = req.body;
        
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!projectName) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        const safeProjectName = normalizeLoreProjectName(projectName);
        const roleplaysFolder = getUserRoleplaysFolder(userContext);
        const projectRoleplaysPath = resolvePathInside(roleplaysFolder, safeProjectName);
        
        console.log(`🎭 Checking for roleplay files in: ${projectRoleplaysPath}`);

        // Check if the project-specific roleplay folder exists
        if (!await fs.pathExists(projectRoleplaysPath)) {
            console.log(`📁 No roleplay folder found for project "${projectName}"`);
            return res.json([]);
        }

        // Get all HTML files in the folder
        const files = await fs.readdir(projectRoleplaysPath, { withFileTypes: true });
        const htmlFiles = files.filter(entry => {
            if (!entry.isFile()) return false;
            try {
                return normalizeLoreHtmlFilename(entry.name) === entry.name;
            } catch (error) {
                return false;
            }
        }).map(entry => entry.name);

        console.log(`🎭 Found ${htmlFiles.length} HTML files for project "${projectName}":`, htmlFiles);
        
        // Sort alphabetically for better UX
        htmlFiles.sort();
        
        res.json(htmlFiles);
    } catch (error) {
        console.error('Error listing roleplay files:', error);
        res.status(500).json({ error: 'Failed to list roleplay files' });
    }
});

// Find Lore Codex storylines that already point at a saved RP copy.
router.post('/roleplay/lore-links', async (req, res) => {
    if (!IS_LOCAL) return res.status(403).json({ error: 'File system access not available in hosted environment' });

    try {
        const { filename, universe, userContext } = req.body;
        const validation = validateUserContext(userContext);
        if (!validation.valid) return res.status(400).json({ error: validation.error });

        const safeFilename = normalizeLoreHtmlFilename(filename);
        const safeUniverse = normalizeLoreProjectName(universe);
        const sitesFolder = getUserSitesFolder(userContext);
        const roleplaysFolder = getUserRoleplaysFolder(userContext);
        const sourcePath = resolvePathInside(roleplaysFolder, safeUniverse, safeFilename);
        const targets = await discoverLoreRoleplayTargets({ sitesFolder, filename: safeFilename });

        res.json({
            success: true,
            filename: safeFilename,
            universe: safeUniverse,
            sourceExists: await fs.pathExists(sourcePath),
            targets
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to find linked Lore Codex copies' });
    }
});

// Update only copies that are still linked by editable Lore project data.
router.post('/roleplay/update-lore-copies', async (req, res) => {
    if (!IS_LOCAL) return res.status(403).json({ error: 'File system access not available in hosted environment' });

    try {
        const { filename, universe, targetProjectNames, userContext } = req.body;
        const validation = validateUserContext(userContext);
        if (!validation.valid) return res.status(400).json({ error: validation.error });

        const safeFilename = normalizeLoreHtmlFilename(filename);
        const safeUniverse = normalizeLoreProjectName(universe);
        const requestedTargets = Array.isArray(targetProjectNames)
            ? new Set(targetProjectNames.map(normalizeLoreProjectName))
            : null;
        if (requestedTargets && requestedTargets.size > 100) throw requestError('Too many Lore Codex targets were requested');

        const sitesFolder = getUserSitesFolder(userContext);
        const roleplaysFolder = getUserRoleplaysFolder(userContext);
        const sourceProjectPath = resolvePathInside(roleplaysFolder, safeUniverse);
        const sourceHtmlPath = resolvePathInside(sourceProjectPath, safeFilename);
        if (!await fs.pathExists(sourceHtmlPath)) {
            return res.status(409).json({ error: 'Save the generated RP project before updating Lore Codex' });
        }

        const discovered = await discoverLoreRoleplayTargets({ sitesFolder, filename: safeFilename });
        const targets = discovered.filter(target => (
            target.destinationExists && (!requestedTargets || requestedTargets.has(target.projectName))
        ));
        if (!targets.length) {
            return res.status(409).json({ error: 'No existing Lore Codex copies are still linked to this roleplay' });
        }

        const sourceContents = await collectRoleplaySourceFiles({ sourceProjectPath, filename: safeFilename });
        const writes = buildLoreCopyWrites({ sitesFolder, targets, sourceFiles: sourceContents });
        for (const target of targets) {
            const projectFolder = resolvePathInside(sitesFolder, target.projectName);
            const configPath = resolvePathInside(projectFolder, 'project-config.json');
            if (!await fs.pathExists(configPath)) continue;
            try {
                const config = await fs.readJson(configPath);
                if (!Array.isArray(config.publicFiles)) continue;
                config.publicFiles = normalizePublicFileManifest([
                    ...config.publicFiles,
                    ...sourceContents.map(file => `roleplays/${file.relativePath}`)
                ], normalizeLoreHtmlFilename(config.htmlFilename || 'info.html'));
                config.modified = new Date().toISOString();
                writes.push({ path: configPath, content: `${JSON.stringify(config, null, 2)}\n`, encoding: 'utf8' });
            } catch (error) {
                throw requestError(`Could not update the public file manifest for ${target.projectName}`);
            }
        }
        await writeFilesWithRollback(writes);

        const htmlContent = sourceContents.find(file => file.relativePath === safeFilename).content.toString('utf8');
        const commentsEnabled = /<meta\s+name=["']rp-read-through-enabled["']\s+content=["']true["']/i.test(htmlContent);
        const warnings = [];
        const updatedTargets = [];
        for (const target of targets) {
            let commentServicePrepared = false;
            if (commentsEnabled) {
                try {
                    await installNetlifyReadThroughKit(resolvePathInside(sitesFolder, target.projectName));
                    commentServicePrepared = true;
                } catch (error) {
                    warnings.push(`${target.projectName}: ${error.message}`);
                }
            }
            updatedTargets.push({
                projectId: target.projectId,
                projectName: target.projectName,
                storylineTitles: target.storylineTitles,
                commentServicePrepared,
                copiedFiles: sourceContents.map(file => `roleplays/${file.relativePath}`)
            });
        }

        res.json({
            success: true,
            filename: safeFilename,
            universe: safeUniverse,
            commentsEnabled,
            updatedTargets,
            warnings
        });
    } catch (error) {
        console.error('Error updating linked Lore Codex roleplay copies:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update linked Lore Codex copies' });
    }
});

// Import roleplay files to sites folder
router.post('/roleplay/import', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { filename, projectName, userContext } = req.body;
        
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!filename || !projectName) {
            return res.status(400).json({ error: 'Filename and project name are required' });
        }

        console.log(`🎭 Import request: ${filename} for project ${projectName}`);

        const safeProjectName = normalizeLoreProjectName(projectName);
        const safeFilename = normalizeLoreHtmlFilename(filename);
        const roleplaysFolder = getUserRoleplaysFolder(userContext);
        const sitesFolder = getUserSitesFolder(userContext);
        
        // Source paths (roleplay folder)
        const sourceProjectPath = resolvePathInside(roleplaysFolder, safeProjectName);
        const sourceHtmlPath = resolvePathInside(sourceProjectPath, safeFilename);
        const sourceCssPath = resolvePathInside(sourceProjectPath, 'generated.css');
        const sourceImagesPath = resolvePathInside(sourceProjectPath, 'images');
        
        // Destination paths (sites folder)
        const destProjectPath = resolvePathInside(sitesFolder, safeProjectName);
        const destRoleplaysPath = resolvePathInside(destProjectPath, 'roleplays');
        const destImagesPath = resolvePathInside(destRoleplaysPath, 'images');
        const destHtmlPath = resolvePathInside(destRoleplaysPath, safeFilename);
        const destCssPath = resolvePathInside(destRoleplaysPath, 'generated.css');

        // Check if source HTML file exists
        if (!await fs.pathExists(sourceHtmlPath)) {
            return res.status(404).json({ error: 'Source HTML file not found' });
        }

        // Create destination directories
        await fs.ensureDir(destRoleplaysPath);
        await fs.ensureDir(destImagesPath);

        let copiedFiles = [];
        let errors = [];

        // 1. Copy HTML file
        try {
            await fs.copy(sourceHtmlPath, destHtmlPath);
            copiedFiles.push(safeFilename);
        } catch (error) {
            console.error(`❌ Failed to copy HTML file:`, error);
            errors.push(`HTML file: ${error.message}`);
        }

        // 2. Copy generated.css if it exists
        if (await fs.pathExists(sourceCssPath)) {
            try {
                await fs.copy(sourceCssPath, destCssPath);
                copiedFiles.push('generated.css');
            } catch (error) {
                console.error(`❌ Failed to copy CSS file:`, error);
                errors.push(`CSS file: ${error.message}`);
            }
        } else {
            console.log(`ℹ️ No generated.css found in source folder`);
        }

        // 3. Copy associated images (files that start with filename-)
        if (await fs.pathExists(sourceImagesPath)) {
            try {
                const sourceImages = await fs.readdir(sourceImagesPath);
                const baseFilename = path.parse(safeFilename).name;
                const associatedImages = sourceImages.filter(img => 
                    img.startsWith(`${baseFilename}-`) && 
                    /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(img)
                );

                console.log(`🖼️ Found ${associatedImages.length} associated images for ${baseFilename}:`, associatedImages);

                for (const imageFile of associatedImages) {
                    try {
                        const sourceImagePath = resolvePathInside(sourceImagesPath, imageFile);
                        const destImagePath = resolvePathInside(destImagesPath, imageFile);
                        await fs.copy(sourceImagePath, destImagePath);
                        copiedFiles.push(`images/${imageFile}`);
                    } catch (error) {
                        console.error(`❌ Failed to copy image ${imageFile}:`, error);
                        errors.push(`Image ${imageFile}: ${error.message}`);
                    }
                }
            } catch (error) {
                console.error(`❌ Failed to read source images folder:`, error);
                errors.push(`Reading images folder: ${error.message}`);
            }
        } else {
            console.log(`ℹ️ No images folder found in source`);
        }

        // Extract storyline metadata from the imported HTML
        let storylineData = null;
        let commentServicePrepared = false;
        try {
            const htmlContent = await fs.readFile(destHtmlPath, 'utf8');

            // Shared comments need a tiny Netlify Function beside the static site.
            if (/<meta\s+name=["']rp-read-through-enabled["']\s+content=["']true["']/i.test(htmlContent)) {
                try {
                    const serviceFiles = await installNetlifyReadThroughKit(destProjectPath);
                    copiedFiles.push(...serviceFiles);
                    commentServicePrepared = true;
                    console.log(`💬 Prepared Netlify read-through comment service for ${projectName}`);
                } catch (serviceError) {
                    console.error('Unable to prepare read-through comment service:', serviceError);
                    errors.push(`Read-through comment service: ${serviceError.message}`);
                }
            }
            
            // Initialize storyline data object
            storylineData = {
                title: '',
                pairing: '',
                wordcount: 0,
                lastUpdated: '',
                description: ''
            };
            
            // Extract title from <title> tag
            const titleMatch = htmlContent.match(/<title>([^<]+?)\s+-\s+[^<]*<\/title>/i);
            if (titleMatch) {
                storylineData.title = titleMatch[1].trim();
            } else {
                const simpleTitleMatch = htmlContent.match(/<title>([^<]+)<\/title>/i);
                if (simpleTitleMatch) {
                    storylineData.title = simpleTitleMatch[1].trim();
                }
            }
            
            // Extract pairing from story-info section
            const pairingMatch = htmlContent.match(/<strong>Pairing:<\/strong>\s*([^<]+)/i);
            if (pairingMatch) {
                storylineData.pairing = pairingMatch[1].trim();
            }
            
            // Extract last updated from story-info section
            const updatedMatch = htmlContent.match(/<strong>Last Updated:<\/strong>\s*([^<]+)/i);
            if (updatedMatch) {
                storylineData.lastUpdated = updatedMatch[1].trim();
            }
            
            // Extract description from story-description div
            const descMatch = htmlContent.match(/<div class=["']story-description["']>[\s\S]*?<strong>Description:<\/strong>\s*([^<]+)/i);
            if (descMatch) {
                storylineData.description = descMatch[1].trim();
            }
            
            // Extract word count from story-stats
            const wordcountMatch = htmlContent.match(/<div class=["']stat-item["']>(\d+(?:,\d+)*)\s*words?<\/div>/i);
            if (wordcountMatch) {
                storylineData.wordcount = parseInt(wordcountMatch[1].replace(/,/g, '')) || 0;
            }
            
            console.log('📋 Extracted storyline metadata:', storylineData);
        } catch (error) {
            console.error('Error extracting storyline metadata:', error);
        }

        // Prepare response
        const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
        
        if (errors.length === 0) {
            console.log(`🎉 Successfully imported ${safeFilename} for ${userDisplay}`);
            res.json({ 
                success: true, 
                message: `Successfully imported ${safeFilename}`,
                copiedFiles,
                projectName: safeProjectName,
                userContext,
                storylineData,
                commentServicePrepared
            });
        } else if (copiedFiles.length > 0) {
            console.log(`⚠️ Partial import success for ${safeFilename}:`, { copiedFiles, errors });
            res.json({ 
                success: true, 
                message: `Partially imported ${safeFilename} (some files failed)`,
                copiedFiles,
                errors,
                projectName: safeProjectName,
                userContext,
                storylineData,
                commentServicePrepared
            });
        } else {
            console.log(`❌ Import failed completely for ${filename}:`, errors);
            res.status(500).json({ 
                success: false, 
                error: 'Import failed completely',
                errors
            });
        }
    } catch (error) {
        console.error('Error importing roleplay:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Failed to import roleplay files'
        });
    }
});

// Import image to assets folder
router.post('/assets/import-image', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    // Use simple memory storage first, then handle file saving manually
    const memoryUpload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 10 * 1024 * 1024, // 10MB limit
            files: 1
        },
        fileFilter: (req, file, cb) => {
            const validField = file.fieldname === 'image';
            const validType = IMAGE_MIME_TYPES.has(file.mimetype)
                && IMAGE_EXTENSIONS.has(path.extname(file.originalname || '').toLowerCase());
            if (validField && validType) {
                cb(null, true);
            } else {
                cb(new Error('Only supported RP image uploads are allowed'));
            }
        }
    });

    // Process the upload
    memoryUpload.single('image')(req, res, async (err) => {
        if (err) {
            console.error('Asset image upload error:', err);
            return res.status(400).json({ 
                success: false, 
                error: `Image upload failed: ${err.message}` 
            });
        }

        try {
            const { userContext: userContextStr, projectName, folderPath, filename } = req.body;
            
            if (!req.file) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'No image file provided' 
                });
            }

            const userContext = getOwnedUserContext(req, userContextStr);
            const validation = validateUserContext(userContext);
            
            if (!validation.valid) {
                return res.status(400).json({ 
                    success: false, 
                    error: validation.error 
                });
            }

            if (!projectName || !folderPath || !filename) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Missing required fields: projectName, folderPath, or filename' 
                });
            }

            const sitesFolder = getUserSitesFolder(userContext);
            const safeProjectName = normalizeLoreProjectName(projectName);
            const safeFolderPath = normalizeLoreAssetFolder(folderPath);
            const safeFilename = normalizeLoreAssetFilename(filename, IMAGE_EXTENSIONS);
            if (path.extname(safeFilename).toLowerCase() !== path.extname(req.file.originalname || '').toLowerCase()) {
                throw requestError('Imported image filename must keep its original extension');
            }
            const projectPath = resolvePathInside(sitesFolder, safeProjectName);
            const destinationPath = resolvePathInside(projectPath, ...safeFolderPath.split('/'));
            const finalPath = resolvePathInside(destinationPath, safeFilename);
            await validateUploadedImage(req.file);
            
            // Check if this is an icon (should preserve PNG transparency)
            const isIconPath = safeFolderPath.split('/').includes('icons');
            const isOriginalPNG = req.file.mimetype === 'image/png';

            // For icons that are PNG, preserve transparency - no processing
            if (isIconPath && isOriginalPNG && safeFilename.toLowerCase().endsWith('.png')) {
                console.log('📌 Preserving PNG transparency for icon');
            } else {
                console.log('💾 Saving image without processing');
            }
            await writeFilesWithRollback([{ path: finalPath, content: req.file.buffer }]);

            console.log(`📷 Asset Import Success:`);
            console.log(`  - Project: ${projectName}`);
            console.log(`  - Folder: ${folderPath}`);
            console.log(`  - Filename: ${filename}`);
            console.log(`  - Size: ${req.file.size} bytes`);

            // Build the relative path for the input field
            const relativePath = `${safeFolderPath}/${safeFilename}`;
            
            const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
            
            console.log(`✅ Successfully imported image for ${userDisplay}`);
            console.log(`  - Saved to: ${finalPath}`);
            console.log(`  - Relative path: ${relativePath}`);

            res.json({
                success: true,
                message: `Image imported successfully`,
                relativePath: relativePath,
                filename: safeFilename,
                size: req.file.size,
                userContext: userContext
            });

        } catch (processingError) {
            console.error('Error processing asset import:', processingError);
            res.status(processingError.statusCode || 500).json({
                success: false, 
                error: processingError.message || 'Failed to process image import'
            });
        }
    });
});

// =============================================================================
// ASSETS MANAGEMENT ROUTES
// =============================================================================

// Check if assets folder exists (local only) - now user-aware
router.post('/assets/check', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { projectName, userContext } = req.body;
        
        if (!projectName) {
            return res.json({ 
                exists: false,
                needsProject: true,
                message: 'Select or create a project first'
            });
        }

        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const sitesFolder = getUserSitesFolder(userContext);
        const safeProjectName = normalizeLoreProjectName(projectName);
        const projectPath = resolvePathInside(sitesFolder, safeProjectName);
        const assetsPath = resolvePathInside(projectPath, 'assets');
        
        const exists = await fs.pathExists(assetsPath);
        res.json({ 
            exists,
            path: exists ? assetsPath : null,
            projectName: safeProjectName,
            userContext
        });
    } catch (error) {
        console.error('Error checking assets folder:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to check assets folder' });
    }
});

// Create assets folder structure (local only) - now user-aware
router.post('/assets/create', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { projectName, userContext } = req.body;
        
        if (!projectName) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const sitesFolder = getUserSitesFolder(userContext);
        const safeProjectName = normalizeLoreProjectName(projectName);
        const projectPath = resolvePathInside(sitesFolder, safeProjectName);
        const assetsPath = resolvePathInside(projectPath, 'assets');
        
        // Create basic folder structure
        // Create comprehensive folder structure
        const folders = [
            'assets',
            'assets/characters',
            'assets/ui',
            'assets/ui/backgrounds',
            'assets/ui/banners', 
            'assets/ui/overview',
            'assets/events',
            'assets/world',
            'assets/world/general',
            'assets/world/locations',
            'assets/world/factions',
            'assets/world/culture',
            'assets/world/cultivation',
            'assets/world/magic',
            'assets/world/concepts',
            'assets/world/creatures',
            'assets/world/plants',
            'assets/world/items',
            'assets/world/items/icons' 
        ];

        for (const folder of folders) {
            const safeFolder = normalizeLoreAssetFolder(folder);
            await fs.ensureDir(resolvePathInside(projectPath, ...safeFolder.split('/')));
        }

        // Create a README file
        const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
        const readmeContent = `# Assets Folder for ${safeProjectName}

        This folder contains all assets for the "${safeProjectName}" project.
        Owner: ${userDisplay}

        ## Folder Structure:
        - \`characters/\` - Character images and galleries
        - Create subfolders for each character (e.g., \`characters/john-doe/\`)
        - \`ui/\` - Interface elements
        - \`backgrounds/\` - Background images for pages
        - \`banners/\` - Banner images for this world  
        - \`overview/\` - Overview section images
        - \`events/\` - Event-related images
        - \`world/\` - World-building assets
        - \`general/\` - General images
        - \`locations/\` - Images for locations
        - \`factions/\` - Images for factions
        - \`culture/\` - Cultural elements and imagery
        - \`cultivation/\` - Cultivation system images
        - \`magic/\` - Magic system images
        - \`concepts/\` - Abstract concept illustrations
        - \`creatures/\` - Images for creatures
        - \`plants/\` - Images for plants and flora
        - \`items/\` - Images for items, weapons, artifacts, etc.

        ## Usage:
        When referencing images in the Lore Codex, use relative paths like:
        - \`assets/ui/banners/my-banner.jpg\`
        - \`assets/characters/john-doe/portrait.jpg\`
        - \`assets/world/locations/castle.jpg\`
        - \`assets/events/battle-of-kings.jpg\`

        The generated info.html file will look for these assets relative to its location in the project folder.
        `;

        await writeFilesWithRollback([{
            path: resolvePathInside(assetsPath, 'README.md'),
            content: readmeContent,
            encoding: 'utf8'
        }]);

        console.log(`📁 Created assets folder for "${safeProjectName}" (${userDisplay})`);
        res.json({ 
            success: true, 
            message: `Assets folder structure created for ${safeProjectName}`,
            path: assetsPath,
            projectName: safeProjectName,
            userContext
        });
    } catch (error) {
        console.error('Error creating assets folder:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create assets folder' });
    }
});

// Import general file to project (local only) - user-aware  
router.post('/assets/import-file', multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const validType = ['application/json', 'application/octet-stream', 'text/json'].includes(file.mimetype);
        const validFile = validType && path.extname(file.originalname || '').toLowerCase() === '.json';
        cb(validFile ? null : new Error('Only JSON lorebook files are allowed'), validFile);
    }
}).single('file'), async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { projectName, userContext: userContextStr, filename, folderPath } = req.body;
        
        if (!projectName || !filename || !folderPath) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: projectName, filename, or folderPath'
            });
        }

        const userContext = getOwnedUserContext(req, userContextStr);
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No file uploaded' 
            });
        }

        const sitesFolder = getUserSitesFolder(userContext);
        const safeProjectName = normalizeLoreProjectName(projectName);
        const safeFolderPath = normalizeLoreAssetFolder(folderPath);
        if (safeFolderPath !== 'assets/lorebook') throw requestError('Lorebook imports must use the lorebook asset folder');
        const safeFilename = normalizeLoreAssetFilename(filename, JSON_EXTENSIONS);
        try {
            JSON.parse(req.file.buffer.toString('utf8'));
        } catch {
            throw requestError('Lorebook file must contain valid JSON');
        }
        const projectPath = resolvePathInside(sitesFolder, safeProjectName);
        const destinationPath = resolvePathInside(projectPath, 'assets', 'lorebook');
        const finalPath = resolvePathInside(destinationPath, safeFilename);
        await writeFilesWithRollback([{ path: finalPath, content: req.file.buffer }]);

        console.log(`📁 File Import Success:`);
        console.log(`  - Project: ${projectName}`);
        console.log(`  - Folder: ${folderPath}`);
        console.log(`  - Filename: ${filename}`);
        console.log(`  - Size: ${req.file.size} bytes`);

        // Build the relative path 
        const relativePath = `${safeFolderPath}/${safeFilename}`;
        
        const userDisplay = userContext.isGuest ? 'Guest' : userContext.username;

        res.json({
            success: true,
            message: `File imported successfully`,
            relativePath: relativePath,
            filename: safeFilename,
            size: req.file.size,
            userContext: userContext
        });

    } catch (processingError) {
        console.error('Error processing file import:', processingError);
        res.status(processingError.statusCode || 500).json({
            success: false, 
            error: processingError.message || 'Failed to process file import'
        });
    }
});

// Check for existing lorebook files (local only) - user-aware
router.post('/assets/check-lorebook', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { projectName, userContext } = req.body;
        
        if (!projectName) {
            return res.json({ success: false, message: 'No project specified' });
        }

        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const sitesFolder = getUserSitesFolder(userContext);
        const safeProjectName = normalizeLoreProjectName(projectName);
        const projectPath = resolvePathInside(sitesFolder, safeProjectName);
        const lorebookPath = resolvePathInside(projectPath, 'assets', 'lorebook');
        
        if (!await fs.pathExists(lorebookPath)) {
            return res.json({ success: false, message: 'No lorebook folder found' });
        }
        
        // Get the first JSON file in the lorebook folder
        const files = await fs.readdir(lorebookPath);
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        
        if (jsonFiles.length === 0) {
            return res.json({ success: false, message: 'No lorebook files found' });
        }
        
        // Return the first lorebook file found
        const lorebookFile = jsonFiles[0];
        
        res.json({ 
            success: true,
            lorebookFile: lorebookFile,
            lorebookPath: resolvePathInside(lorebookPath, lorebookFile)
        });
        
    } catch (error) {
        console.error('Error checking lorebook:', error);
        res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to check lorebook' });
    }
});

// =============================================================================
// RP ARCHIVER (ROLEPLAY CONVERTER) ROUTES
// =============================================================================

// Get list of roleplay projects for a specific user (local only)
router.post('/roleplay/projects', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { userContext } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const roleplaysFolder = getUserRoleplaysFolder(userContext);
        const projects = [];

        // Check if roleplays folder exists
        if (!await fs.pathExists(roleplaysFolder)) {
            return res.json([]); // Return empty array if no projects yet
        }
        
        const universeEntries = await fs.readdir(roleplaysFolder, { withFileTypes: true });
        
        for (const universeEntry of universeEntries) {
            if (universeEntry.isDirectory()) {
                const universeName = universeEntry.name;
                const universePath = path.join(roleplaysFolder, universeName);
                
                // Look for HTML files in this universe folder
                const fileEntries = await fs.readdir(universePath, { withFileTypes: true });
                
                for (const fileEntry of fileEntries) {
                    if (fileEntry.isFile() && fileEntry.name.endsWith('.html')) {
                        const filePath = path.join(universePath, fileEntry.name);
                        const stats = await fs.stat(filePath);
                        
                        // Try to extract title from HTML file
                        let title = fileEntry.name.replace('.html', '');
                        let pairing = '';
                        try {
                            const htmlContent = await fs.readFile(filePath, 'utf8');
                            const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/i);
                            if (titleMatch && titleMatch[1]) {
                                const fullTitle = titleMatch[1];
                                // Format is usually "Title - Pairing"
                                const parts = fullTitle.split(' - ');
                                title = parts[0] || title;
                                pairing = parts[1] || '';
                            }
                        } catch (e) {
                            // Fallback to filename
                        }

                        projects.push({
                            filename: fileEntry.name,
                            title: title,
                            pairing: pairing,
                            universe: universeName,
                            lastModified: stats.mtime,
                            size: stats.size,
                            path: filePath,
                            userContext: userContext
                        });
                    }
                }
            }
        }

        // Sort by last modified (newest first)
        projects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        
        console.log(`🎭 Found ${projects.length} roleplay projects for ${userContext.isGuest ? 'guest' : userContext.username}`);
        res.json(projects);
    } catch (error) {
        console.error('Error reading roleplay projects:', error);
        res.status(500).json({ error: 'Failed to read roleplay projects folder' });
    }
});

// Load a specific roleplay project (local only)
router.post('/roleplay/load', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { universe, filename, userContext } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!universe || !filename) {
            return res.status(400).json({ error: 'Universe and filename are required' });
        }

        const roleplaysFolder = getUserRoleplaysFolder(userContext);
        const filePath = resolvePathInside(roleplaysFolder, universe, filename);

        const htmlContent = await fs.readFile(filePath, 'utf8');
        console.log(`🎭 Loaded roleplay "${filename}" from universe "${universe}" for ${userContext.isGuest ? 'guest' : userContext.username}`);
        
        res.json({ 
            filename,
            universe,
            content: htmlContent,
            userContext: userContext,
            success: true
        });
    } catch (error) {
        console.error('Error loading roleplay project:', error);
        res.status(404).json({ error: 'Roleplay file not found' });
    }
});

// Get list of available CSS templates
// Get list of available CSS templates - ENHANCED VERSION with CSS name parsing
router.get('/roleplay/templates', async (req, res) => {
    try {
        const templatesFolder = ROLEPLAY_TEMPLATES_FOLDER;
        const mainCSSPath = await resolveRoleplayTemplate('generated.css');
        const templates = [];
        
        console.log('🎨 CSS Template Discovery:');
        console.log(`  - Templates folder: ${templatesFolder}`);
        console.log(`  - Main CSS file: ${mainCSSPath}`);
        
        // Helper function to extract template name from CSS file
        async function extractTemplateName(filePath, fallbackName) {
            try {
                const cssContent = await fs.readFile(filePath, 'utf8');
                
                // Look for /* Name: TemplateName */ pattern (case insensitive)
                const nameMatch = cssContent.match(/\/\*\s*Name:\s*([^*]+?)\s*\*\//i);
                
                if (nameMatch && nameMatch[1]) {
                    const extractedName = nameMatch[1].trim();
                    console.log(`  - Found name comment in ${path.basename(filePath)}: "${extractedName}"`);
                    return extractedName;
                }
                
                console.log(`  - No name comment found in ${path.basename(filePath)}, using fallback: "${fallbackName}"`);
                return fallbackName;
            } catch (error) {
                console.warn(`  - Error reading ${path.basename(filePath)}: ${error.message}`);
                return fallbackName;
            }
        }
        
        // Always add the default template (main generated.css)
        const mainCSSExists = Boolean(mainCSSPath);
        console.log(`  - Main CSS exists: ${mainCSSExists}`);
        
        let defaultName = 'Default';
        if (mainCSSExists) {
            defaultName = await extractTemplateName(mainCSSPath, 'Default');
        }
        
        templates.push({
            value: 'generated.css',
            label: defaultName,
            exists: mainCSSExists
        });
        
        // Ensure templates folder exists
        await fs.ensureDir(templatesFolder);
        console.log(`  - Templates folder ensured`);
        
        // Check if templates folder exists and read files
        if (await fs.pathExists(templatesFolder)) {
            const files = await fs.readdir(templatesFolder);
            console.log(`  - Found ${files.length} files in templates folder:`, files);
            
            // Filter for CSS files and add them to the list
            for (const file of files) {
                if (file.endsWith('.css') && file !== 'generated.css') {
                    const filePath = path.join(templatesFolder, file);
                    const fileExists = await fs.pathExists(filePath);
                    
                    // Try to extract name from CSS comment, with intelligent fallbacks
                    let templateName;
                    
                    if (fileExists) {
                        // First try to extract from CSS comment
                        templateName = await extractTemplateName(filePath, null);
                        
                        // If no name found, use intelligent fallbacks
                        if (!templateName) {
                            // Check for patterns like "generated_1.css" -> "Template 1"
                            const numberMatch = file.match(/generated[-_](\d+)\.css/);
                            if (numberMatch) {
                                templateName = `Template ${numberMatch[1]}`;
                            } else {
                                // Use filename without extension as last resort
                                templateName = file.replace('.css', '').replace(/[-_]/g, ' ');
                                // Capitalize first letter of each word
                                templateName = templateName.split(' ')
                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                    .join(' ');
                            }
                        }
                    } else {
                        templateName = 'Missing Template';
                    }
                    
                    console.log(`    - ${file} -> "${templateName}" (exists: ${fileExists})`);
                    
                    templates.push({
                        value: file,
                        label: templateName,
                        exists: fileExists
                    });
                }
            }
        } else {
            console.log('  - Templates folder does not exist');
        }
        
        // Sort templates (keep Default first, then alphabetically)
        const defaultTemplate = templates.find(t => t.value === 'generated.css');
        const otherTemplates = templates.filter(t => t.value !== 'generated.css')
            .sort((a, b) => a.label.localeCompare(b.label));
        
        const sortedTemplates = [defaultTemplate, ...otherTemplates];
        
        console.log(`📋 Final template list: ${sortedTemplates.length} templates`);
        sortedTemplates.forEach(t => console.log(`    - ${t.label}: ${t.value} (${t.exists ? 'EXISTS' : 'MISSING'})`));
        
        res.json(sortedTemplates);
    } catch (error) {
        console.error('Error reading CSS templates:', error);
        res.status(500).json({ error: 'Failed to read templates' });
    }
});

// Serve CSS template files for preview
router.get('/templates/:templateName', async (req, res) => {
    try {
        const { templateName } = req.params;
        const templatePath = await resolveRoleplayTemplate(templateName);
        if (!templatePath) return res.status(404).send('Template not found');
        const cssContent = await fs.readFile(templatePath, 'utf8');
        res.type('text/css').send(cssContent);
        
    } catch (error) {
        console.error('Error serving template:', error);
        res.status(500).send('Error loading template');
    }
});

// Save roleplay HTML to user's folder (local only) - with template support
router.post('/roleplay/save', (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    // Create a custom multer instance that handles the dynamic destination
    // Create a custom multer instance that handles files in memory first
    const memoryRoleplayUpload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 5 * 1024 * 1024, // 5MB limit
            files: 20 // Max 20 files total
        },
        fileFilter: (req, file, cb) => {
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Only image files are allowed'));
            }
        }
    });

    // Process the upload
    memoryRoleplayUpload.any()(req, res, async (err) => {
        if (err) {
            console.error('Image upload error:', err);
            return res.status(400).json({ error: `Image upload failed: ${err.message}` });
        }

        try {
            const { html, title, universe, cssTemplate, userContext: userContextStr } = req.body;
            
            console.log('🎭 Roleplay Save Request:');
            console.log(`  - Title: ${title}`);
            console.log(`  - Universe: ${universe}`);
            console.log(`  - CSS Template: ${cssTemplate}`);
            console.log(`  - Has HTML: ${!!html}`);
            console.log(`  - Images uploaded: ${req.files?.length || 0}`);
            
            if (!html) {
                return res.status(400).json({ error: 'No HTML content provided' });
            }

            if (!title || !title.trim()) {
                return res.status(400).json({ error: 'Story title is required' });
            }

            if (!universe || !universe.trim()) {
                return res.status(400).json({ error: 'Universe is required' });
            }

            await Promise.all((req.files || []).map(validateUploadedImage));

            const userContext = getOwnedUserContext(req, userContextStr);
            const validation = validateUserContext(userContext);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }

            const selectedTemplate = cssTemplate || 'generated.css';
            const cssSourcePath = await resolveRoleplayTemplate(selectedTemplate);
            if (!cssSourcePath) {
                return res.status(400).json({ error: 'The selected CSS template is not available' });
            }
            const sourceContent = await fs.readFile(cssSourcePath, 'utf8');
            if (!sourceContent.trim()) throw requestError('The selected CSS template is empty');

            const cleanTitle = cleanRoleplayTitle(title);
            // Clean universe for folder name - only remove invalid characters, keep original case and spaces
            const cleanUniverse = universe.trim().replace(/[<>:"/\\|?*]/g, '');         
            if (!cleanTitle || !cleanUniverse || cleanUniverse === '.' || cleanUniverse === '..') {
                return res.status(400).json({ error: 'Title or universe does not produce a valid folder name' });
            }
            // Get existing image paths from the client (matches what downloadHTML() sends)
            let existingBackgroundPath = req.body.existingBackgroundPath;
            let existingStoryPaths = [];
            if (req.body.existingStoryPaths) {
                try {
                    existingStoryPaths = JSON.parse(req.body.existingStoryPaths);
                } catch {
                    throw requestError('Existing story image paths must be valid JSON');
                }
            }
            if (!Array.isArray(existingStoryPaths)) existingStoryPaths = [];
            let existingBannerPath = req.body.existingBannerPath;

            console.log('🖼️ Existing image data from client:');
            console.log('  - Background path:', existingBackgroundPath);
            console.log('  - Story paths:', existingStoryPaths);

            const roleplaysFolder = getUserRoleplaysFolder(userContext);
            const universePath = resolvePathInside(roleplaysFolder, cleanUniverse);
            const imagesFolder = resolvePathInside(universePath, 'images');
            existingBackgroundPath = await requireExistingMediaPath(
                existingBackgroundPath, universePath, 'The referenced background image'
            );
            existingBannerPath = await requireExistingMediaPath(
                existingBannerPath, universePath, 'The referenced banner image'
            );
            existingStoryPaths = await Promise.all(existingStoryPaths.map((item, index) => (
                requireExistingMediaPath(item, universePath, `Referenced story image ${index + 1}`)
            )));

            const backgroundFile = req.files?.find(file => file.fieldname === 'backgroundImage');
            const bannerFile = req.files?.find(file => file.fieldname === 'bannerImage');
            const storyImages = req.files?.filter(file => file.fieldname.startsWith('storyImage_')) || [];
            storyImages.sort((a, b) => (
                parseInt(a.fieldname.split('_')[1], 10) - parseInt(b.fieldname.split('_')[1], 10)
            ));
            const assetPlan = buildRoleplayAssetPlan({
                cleanTitle,
                existingBackgroundPath,
                existingBannerPath,
                existingStoryPaths,
                backgroundFile,
                bannerFile,
                storyImages
            });

            await fs.ensureDir(imagesFolder);
            const mediaManifest = [];
            for (const asset of assetPlan) {
                if (asset.source === 'existing') {
                    mediaManifest.push({ role: asset.role, path: asset.path, source: asset.source, status: 'reused' });
                    continue;
                }
                const finalFilePath = resolvePathInside(universePath, ...asset.path.split('/'));
                const status = classifyAssetWrite(await fs.pathExists(finalFilePath));
                await fs.writeFile(finalFilePath, asset.file.buffer);
                mediaManifest.push({ role: asset.role, path: asset.path, source: asset.source, status });
                console.log(`💾 ${status === 'replaced' ? 'Replaced' : 'Saved'} ${asset.role} image: ${asset.path}`);
            }
            

            const htmlFilename = `${cleanTitle}.html`;
            const htmlFilePath = resolvePathInside(universePath, htmlFilename);
            
            // Ensure universe directory exists
            await fs.ensureDir(universePath);
            console.log(`📁 Universe folder ensured: ${universePath}`);
            
            // Ensure we're writing to the users folder
            if (!isPathInside(htmlFilePath, USERS_FOLDER)) {
                return res.status(403).json({ error: 'Invalid file path' });
            }

            const cssDestPath = resolvePathInside(universePath, 'generated.css');
            const templateStatus = classifyAssetWrite(await fs.pathExists(cssDestPath));
            await fs.copy(cssSourcePath, cssDestPath);

            // HTML is the commit point: write it once, after every referenced asset is final.
            const htmlStatus = classifyAssetWrite(await fs.pathExists(htmlFilePath));
            await fs.writeFile(htmlFilePath, html, 'utf8');
            console.log(`💾 ${htmlStatus === 'replaced' ? 'Replaced' : 'Saved'} HTML file: ${htmlFilePath}`);

            const assetManifest = {
                schemaVersion: 1,
                html: { path: htmlFilename, status: htmlStatus },
                template: {
                    selected: selectedTemplate,
                    path: 'generated.css',
                    status: templateStatus
                },
                media: mediaManifest
            };
            const collisionsResolved = [assetManifest.html, assetManifest.template, ...mediaManifest]
                .filter(asset => asset.status === 'replaced').length;
            
            const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
            const totalImages = (backgroundFile ? 1 : 0) + (bannerFile ? 1 : 0) + storyImages.length;
            
            console.log(`🎭 Save completed for ${userDisplay}:`);
            console.log(`  - File: ${cleanTitle}.html`);
            console.log(`  - Universe: ${cleanUniverse}`);
            console.log(`  - Images: ${totalImages}`);
            console.log(`  - CSS Template: ${selectedTemplate}`);
            console.log(`  - Deterministic replacements: ${collisionsResolved}`);

            res.json({ 
                success: true, 
                message: `Roleplay saved successfully for ${userDisplay}`,
                conflictsAvoided: collisionsResolved > 0,
                collisionsResolved,
                title: cleanTitle,
                universe: cleanUniverse,
                filename: htmlFilename,
                filepath: htmlFilePath,
                cssTemplate: selectedTemplate,
                cssIncluded: true,
                cssWarning: null,
                imagesUploaded: totalImages,
                assetManifest,
                userContext: userContext
            });
            
        } catch (processingError) {
            console.error('Error processing roleplay save:', processingError);
            res.status(processingError.statusCode || 500).json({
                error: processingError.statusCode ? processingError.message : 'Failed to save roleplay file'
            });
        }
    });
});

// Check if roleplay images exist (for import functionality)
router.post('/roleplay/check-images', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { universe, imagePaths, userContext } = req.body;
        
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!universe || !Array.isArray(imagePaths)) {
            return res.status(400).json({ error: 'Universe and imagePaths array are required' });
        }

        const roleplaysFolder = getUserRoleplaysFolder(userContext);
        const universePath = resolvePathInside(roleplaysFolder, universe);
        
        const existingImages = [];
        const missingImages = [];
        
        for (const imagePath of imagePaths) {
            const normalized = await validateExistingMediaPath(imagePath, universePath);
            if (normalized) {
                existingImages.push(normalized);
            } else {
                missingImages.push(imagePath);
            }
        }
        
        console.log(`🔍 Image check for "${universe}": ${existingImages.length} found, ${missingImages.length} missing`);
        
        res.json({
            existingImages,
            missingImages,
            totalChecked: imagePaths.length
        });
        
    } catch (error) {
        console.error('Error checking image existence:', error);
        res.status(500).json({ error: 'Failed to check image existence' });
    }
});

// Get list of universes (folders in roleplays directory)
router.post('/roleplay/universes', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { userContext } = req.body;
        
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }
        
        console.log(`📁 Loading universes for user:`, userContext.isGuest ? 'Guest' : userContext.username);
        
        const roleplaysFolder = getUserRoleplaysFolder(userContext);
        
        if (!await fs.pathExists(roleplaysFolder)) {
            console.log(`📁 Roleplays folder doesn't exist: ${roleplaysFolder}`);
            return res.json([]);
        }
        
        const items = await fs.readdir(roleplaysFolder);
        
        const universes = [];
        for (const item of items) {
            const itemPath = path.join(roleplaysFolder, item);
            const stat = await fs.stat(itemPath);
            if (stat.isDirectory()) {
                universes.push(item);
            }
        }
        
        console.log(`📁 Found ${universes.length} universes: ${universes.join(', ')}`);
        
        universes.sort();
        res.json(universes);
        
    } catch (error) {
        console.error('❌ Error loading universes:', error);
        res.status(500).json({ error: 'Failed to load universes' });
    }
});

// Get list of stories (HTML files) in a specific universe
router.post('/roleplay/stories', async (req, res) => {
    try {
        const { userContext, universe } = req.body;
        
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }
        
        if (!universe) {
            return res.status(400).json({ error: 'Universe name is required' });
        }
        
        console.log(`📄 Loading stories for universe: ${universe}`);
        
        const roleplaysFolder = getUserRoleplaysFolder(userContext);
        const universePath = resolvePathInside(roleplaysFolder, universe);
        
        if (!await fs.pathExists(universePath)) {
            console.log(`📄 Universe folder doesn't exist: ${universePath}`);
            return res.json([]);
        }
        
        const files = await fs.readdir(universePath);
        
        const stories = [];
        for (const file of files) {
            const filePath = path.join(universePath, file);
            const stat = await fs.stat(filePath);
            
            if (stat.isFile() && /\.html?$/i.test(file)) {
                stories.push({
                    filename: file,
                    size: stat.size,
                    modified: stat.mtime
                });
            }
        }
        
        console.log(`📄 Found ${stories.length} HTML files in ${universe}`);
        
        stories.sort((a, b) => a.filename.localeCompare(b.filename));
        res.json(stories);
        
    } catch (error) {
        console.error('❌ Error loading stories:', error);
        res.status(500).json({ error: 'Failed to load stories' });
    }
});

// Load a specific story file
router.post('/roleplay/load-story', async (req, res) => {
    try {
        const { userContext, universe, storyFilename } = req.body;
        
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }
        
        if (!universe || !storyFilename) {
            return res.status(400).json({ error: 'Universe and story filename are required' });
        }
        
        console.log(`📖 Loading story: ${universe}/${storyFilename}`);
        
        const roleplaysFolder = getUserRoleplaysFolder(userContext);
        const storyPath = resolvePathInside(roleplaysFolder, universe, storyFilename);
        
        // Security check
        const resolvedStoryPath = path.resolve(storyPath);
        const resolvedRoleplaysFolder = path.resolve(roleplaysFolder);
        
        if (!isPathInside(resolvedStoryPath, resolvedRoleplaysFolder)) {
            console.error('❌ Security violation: Path traversal attempt');
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (!await fs.pathExists(storyPath)) {
            console.log(`📖 Story file doesn't exist: ${storyPath}`);
            return res.status(404).json({ error: 'Story file not found' });
        }
        
        const stat = await fs.stat(storyPath);
        if (!stat.isFile()) {
            console.log(`📖 Path is not a file: ${storyPath}`);
            return res.status(400).json({ error: 'Path is not a file' });
        }
        
        const content = await fs.readFile(storyPath, 'utf8');
        
        console.log(`✅ Successfully loaded ${universe}/${storyFilename} (${content.length} characters)`);
        
        res.json({
            success: true,
            content,
            universe,
            filename: storyFilename,
            size: stat.size,
            modified: stat.mtime
        });
        
    } catch (error) {
        console.error('❌ Error loading story:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load story file' 
        });
    }
});

// =============================================================================
// LEGACY & MIGRATION ROUTES
// =============================================================================

// Legacy support: Get old projects from sites folder (for migration)
router.get('/legacy/projects', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const projects = [];
        
        if (await fs.pathExists(LEGACY_SITES_FOLDER)) {
            const entries = await fs.readdir(LEGACY_SITES_FOLDER, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const projectName = entry.name;
                    const projectPath = path.join(LEGACY_SITES_FOLDER, projectName);
                    const infoPath = path.join(projectPath, 'info.html');
                    
                    if (await fs.pathExists(infoPath)) {
                        const stats = await fs.stat(infoPath);
                        
                        let title = projectName;
                        try {
                            const htmlContent = await fs.readFile(infoPath, 'utf8');
                            const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/i);
                            if (titleMatch && titleMatch[1]) {
                                title = titleMatch[1];
                            }
                        } catch (e) {
                            // Fallback to folder name
                        }

                        projects.push({
                            projectName: projectName,
                            title: title,
                            lastModified: stats.mtime,
                            path: projectPath,
                            isLegacy: true
                        });
                    }
                }
            }
        }
        
        res.json(projects);
    } catch (error) {
        console.error('Error reading legacy projects:', error);
        res.status(500).json({ error: 'Failed to read legacy projects' });
    }
});

// =============================================================================
// CUSTOM PAGES ENDPOINTS
// =============================================================================

// Create custom folder structure (local only) - user-aware
router.post('/assets/create-folder', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'File system access not available in hosted environment' });
    }

    try {
        const { projectName, folderPath, userContext } = req.body;
        
        if (!projectName || !folderPath) {
            return res.status(400).json({ error: 'Project name and folder path are required' });
        }

        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const sitesFolder = getUserSitesFolder(userContext);
        const safeProjectName = normalizeLoreProjectName(projectName);
        const safeFolderPath = normalizeLoreProjectSubfolder(folderPath);
        const projectPath = resolvePathInside(sitesFolder, safeProjectName);
        const fullFolderPath = resolvePathInside(projectPath, ...safeFolderPath.split('/'));
        
        // Create directory
        await fs.ensureDir(fullFolderPath);

        res.json({
            success: true,
            message: `Folder created: ${safeFolderPath}`,
            path: fullFolderPath
        });
        
    } catch (error) {
        console.error('Error creating folder:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create folder' });
    }
});

// =============================================================================
// DEBUG ENDPOINTS
// =============================================================================

// Debug endpoint to test template folder structure
router.get('/debug/templates', async (req, res) => {
    if (!PROJECT_DEBUG_ENABLED) {
        return res.status(404).json({ error: 'Route not found' });
    }

    try {
        const templatesFolder = path.join(__dirname, '..', 'roleplay-converter', 'templates');
        const mainCSSPath = path.join(__dirname, '..', 'roleplay-converter', 'generated.css');
        const roleplayConverterFolder = path.join(__dirname, '..', 'roleplay-converter');
        
        const debug = {
            paths: {
                roleplayConverter: roleplayConverterFolder,
                templatesFolder: templatesFolder,
                mainCSS: mainCSSPath
            },
            exists: {
                roleplayConverter: await fs.pathExists(roleplayConverterFolder),
                templatesFolder: await fs.pathExists(templatesFolder),
                mainCSS: await fs.pathExists(mainCSSPath)
            },
            files: {}
        };
        
        // List files in roleplay-converter folder
        if (debug.exists.roleplayConverter) {
            debug.files.roleplayConverter = await fs.readdir(roleplayConverterFolder);
        }
        
        // List files in templates folder
        if (debug.exists.templatesFolder) {
            debug.files.templates = await fs.readdir(templatesFolder);
        } else {
            // Try to create templates folder
            await fs.ensureDir(templatesFolder);
            debug.exists.templatesFolder = await fs.pathExists(templatesFolder);
            debug.files.templates = debug.exists.templatesFolder ? await fs.readdir(templatesFolder) : [];
        }
        
        // Check main CSS file size
        if (debug.exists.mainCSS) {
            const stats = await fs.stat(mainCSSPath);
            debug.mainCSSSize = stats.size;
        }
        
        // Check template file sizes
        if (debug.files.templates) {
            debug.templateSizes = {};
            for (const file of debug.files.templates) {
                if (file.endsWith('.css')) {
                    const filePath = path.join(templatesFolder, file);
                    const stats = await fs.stat(filePath);
                    debug.templateSizes[file] = stats.size;
                }
            }
        }
        
        console.log('🛠️ Template Debug Info:', JSON.stringify(debug, null, 2));
        res.json(debug);
        
    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Debug endpoint to check HTML template structure
router.get('/debug/html-template', (req, res) => {
    if (!PROJECT_DEBUG_ENABLED) return res.status(404).json({ error: 'Route not found' });
    try {
        const indexPath = path.join(__dirname, '..', 'roleplay-converter', 'index.html');
        
        if (fs.pathExistsSync(indexPath)) {
            const indexContent = fs.readFileSync(indexPath, 'utf8');
            
            // Extract the template content
            const templateMatch = indexContent.match(/<template id="html-template">(.*?)<\/template>/s);
            
            if (templateMatch) {
                const templateContent = templateMatch[1];
                
                res.json({
                    success: true,
                    hasTemplate: true,
                    templateLength: templateContent.length,
                    hasHeadTag: templateContent.includes('<head>'),
                    hasHeadCloseTag: templateContent.includes('</head>'),
                    hasHtmlTag: templateContent.includes('<html'),
                    templatePreview: templateContent.substring(0, 1000) + '...',
                    fullTemplate: templateContent
                });
            } else {
                res.json({
                    success: false,
                    error: 'No template found in index.html',
                    indexPreview: indexContent.substring(0, 1000) + '...'
                });
            }
        } else {
            res.json({
                success: false,
                error: 'index.html not found',
                path: indexPath
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =============================================================================
// TIME SYSTEMS ENDPOINTS (for Plans time/calendar management)
// =============================================================================

// Load user's time systems - GET with userContext in header
router.post('/time-systems/load', async (req, res) => {
    try {
        const { userContext } = req.body;
        
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const settingsFolder = getUserSettingsFolder(userContext);
        const timeSystemsPath = path.join(settingsFolder, 'time-systems.json');
        
        // Create settings folder if it doesn't exist
        await fs.ensureDir(settingsFolder);
        
        // Load time systems if file exists, otherwise return empty array
        let timeSystems = [];
        if (await fs.pathExists(timeSystemsPath)) {
            try {
                timeSystems = await fs.readJson(timeSystemsPath);
                console.log(`📅 Loaded ${timeSystems.length} time systems for ${userContext.isGuest ? 'guest' : userContext.username}`);
            } catch (error) {
                console.error('Error reading time systems file:', error);
                timeSystems = [];
            }
        } else {
            console.log(`📅 No time systems file found for ${userContext.isGuest ? 'guest' : userContext.username}, starting fresh`);
        }
        
        res.json({ timeSystems });
        
    } catch (error) {
        console.error('Error loading time systems:', error);
        res.status(500).json({ error: 'Failed to load time systems' });
    }
});

// Save user's time systems
router.post('/time-systems/save', async (req, res) => {
    try {
        const { timeSystems, userContext } = req.body;
        
        if (!timeSystems || !Array.isArray(timeSystems)) {
            return res.status(400).json({ error: 'Invalid time systems data' });
        }
        
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const settingsFolder = getUserSettingsFolder(userContext);
        const timeSystemsPath = path.join(settingsFolder, 'time-systems.json');
        
        // Create settings folder if it doesn't exist
        await fs.ensureDir(settingsFolder);
        
        // Save time systems to file
        await fs.writeJson(timeSystemsPath, timeSystems, { spaces: 2 });
        
        console.log(`💾 Saved ${timeSystems.length} time systems for ${userContext.isGuest ? 'guest' : userContext.username}`);
        
        res.json({ 
            success: true, 
            message: 'Time systems saved successfully',
            count: timeSystems.length 
        });
        
    } catch (error) {
        console.error('Error saving time systems:', error);
        res.status(500).json({ error: 'Failed to save time systems' });
    }
});

module.exports = router;
module.exports.installNetlifyReadThroughKit = installNetlifyReadThroughKit;
