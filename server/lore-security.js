'use strict';

const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const { resolvePathInside } = require('./path-security');

const REGISTERED_STYLE_ASSETS = Object.freeze([
    Object.freeze({
        source: 'images/styles/cloudrecesses.png',
        destination: 'images/styles/cloudrecesses.png'
    }),
    Object.freeze({
        source: 'images/styles/mist.png',
        destination: 'images/styles/mist.png'
    }),
    Object.freeze({
        source: 'images/styles/fog.png',
        destination: 'images/styles/fog.png'
    })
]);

const REGISTERED_STYLE_ASSET_MAP = new Map(
    REGISTERED_STYLE_ASSETS.map(asset => [`${asset.source}\n${asset.destination}`, asset])
);

function requestError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function isWindowsReservedName(value) {
    const stem = path.parse(value).name.toUpperCase();
    return /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem);
}

function normalizeLoreProjectName(value) {
    if (typeof value !== 'string') throw requestError('Project name must be text');
    const projectName = value.trim();
    if (!projectName || projectName === '.' || projectName === '..') throw requestError('Project name is required');
    if (projectName.length > 128 || !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(projectName) || isWindowsReservedName(projectName)) {
        throw requestError('Project name may contain only letters, numbers, spaces, hyphens, and underscores');
    }
    return projectName;
}

function normalizeLoreHtmlFilename(value = 'info.html') {
    if (typeof value !== 'string') throw requestError('HTML filename must be text');
    let filename = value.trim();
    if (!filename) filename = 'info.html';
    if (!/\.html?$/i.test(filename)) filename += '.html';
    if (filename.length > 255
        || path.basename(filename) !== filename
        || !/^[\p{L}\p{N}][\p{L}\p{N} _.-]*\.html?$/iu.test(filename)
        || isWindowsReservedName(filename)) {
        throw requestError('HTML filename must be a safe .html basename');
    }
    return filename;
}

function normalizeLoreAssetFolder(value) {
    if (typeof value !== 'string') throw requestError('Asset folder must be text');
    const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const segments = normalized.split('/');
    if (normalized.length > 512
        || segments[0] !== 'assets'
        || segments.some(segment => !/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(segment))) {
        throw requestError('Asset folder must be a safe path below assets');
    }
    return normalized;
}

function normalizeLoreProjectSubfolder(value) {
    if (typeof value !== 'string') throw requestError('Project folder must be text');
    const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const segments = normalized.split('/');
    if (normalized.length > 512
        || !new Set(['assets', 'pages']).has(segments[0])
        || segments.some(segment => !/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(segment))) {
        throw requestError('Project folder must be a safe path below assets or pages');
    }
    return normalized;
}

function normalizeLoreAssetFilename(value, allowedExtensions) {
    if (typeof value !== 'string') throw requestError('Asset filename must be text');
    const filename = value.trim();
    const extension = path.extname(filename).toLowerCase();
    if (filename.length > 255
        || path.basename(filename) !== filename
        || !/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(filename)
        || isWindowsReservedName(filename)
        || (allowedExtensions && !allowedExtensions.has(extension))) {
        throw requestError('Asset filename is not allowed');
    }
    return filename;
}

function normalizeLoreAssetSegment(value, label = 'Asset identifier') {
    if (typeof value !== 'string' || value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value) || isWindowsReservedName(value)) {
        throw requestError(`${label} is not allowed`);
    }
    return value;
}

function decodePngDataUrl(value) {
    if (typeof value !== 'string') throw requestError('Built icon data must be a PNG data URL');
    const match = value.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) throw requestError('Built icon data must be a PNG data URL');
    const buffer = Buffer.from(match[1], 'base64');
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length > 10 * 1024 * 1024 || !buffer.subarray(0, 8).equals(pngSignature)) {
        throw requestError('Built icon data is not a valid PNG');
    }
    return buffer;
}

function normalizeStyleAssetManifest(values = []) {
    if (!Array.isArray(values)) throw requestError('Style asset manifest must be an array');
    if (values.length > 16) throw requestError('Style asset manifest is too large');

    const normalized = new Map();
    for (const value of values) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw requestError('Style asset entries must be objects');
        }
        const registered = REGISTERED_STYLE_ASSET_MAP.get(`${value.source}\n${value.destination}`);
        if (!registered) throw requestError('Style asset manifest contains an unregistered asset');
        normalized.set(registered.destination, registered);
    }
    return [...normalized.values()];
}

async function copyRegisteredStyleAssets(infoConverterRoot, projectFolder, assets) {
    const copied = [];
    for (const asset of assets) {
        const sourcePath = resolvePathInside(infoConverterRoot, ...asset.source.split('/'));
        const destinationPath = resolvePathInside(projectFolder, ...asset.destination.split('/'));
        if (!await fs.pathExists(sourcePath) || !(await fs.stat(sourcePath)).isFile()) {
            throw new Error(`Registered style asset is unavailable: ${asset.source}`);
        }
        await fs.ensureDir(path.dirname(destinationPath));
        await fs.copy(sourcePath, destinationPath, { overwrite: true });
        copied.push(asset.destination);
    }
    return copied;
}

async function cleanupUnusedStyleAssets(projectFolder, currentAssets = []) {
    const retained = new Set(currentAssets.map(asset => asset.destination));
    let cleanedCount = 0;

    for (const asset of REGISTERED_STYLE_ASSETS) {
        if (retained.has(asset.destination)) continue;
        const assetPath = resolvePathInside(projectFolder, ...asset.destination.split('/'));
        if (await fs.pathExists(assetPath)) {
            await fs.remove(assetPath);
            cleanedCount += 1;
        }
    }

    const stylesFolder = resolvePathInside(projectFolder, 'images', 'styles');
    if (await fs.pathExists(stylesFolder) && (await fs.readdir(stylesFolder)).length === 0) {
        await fs.remove(stylesFolder);
        cleanedCount += 1;
    }
    const imagesFolder = resolvePathInside(projectFolder, 'images');
    if (await fs.pathExists(imagesFolder) && (await fs.readdir(imagesFolder)).length === 0) {
        await fs.remove(imagesFolder);
        cleanedCount += 1;
    }
    return cleanedCount;
}

async function writeFilesWithRollback(files) {
    if (!Array.isArray(files) || files.length === 0) return;
    const token = crypto.randomBytes(8).toString('hex');
    const staged = [];
    const committed = [];

    try {
        for (const file of files) {
            const targetPath = path.resolve(file.path);
            const temporaryPath = `${targetPath}.${token}.tmp`;
            const rollbackPath = `${targetPath}.${token}.rollback`;
            const stagedFile = { targetPath, temporaryPath, rollbackPath, existed: false };
            staged.push(stagedFile);
            await fs.ensureDir(path.dirname(targetPath));
            await fs.writeFile(temporaryPath, file.content, file.encoding);
            const existed = await fs.pathExists(targetPath);
            if (existed) await fs.copy(targetPath, rollbackPath, { overwrite: true });
            stagedFile.existed = existed;
        }

        for (const file of staged) {
            await fs.move(file.temporaryPath, file.targetPath, { overwrite: true });
            committed.push(file);
        }
    } catch (error) {
        for (const file of committed.reverse()) {
            if (file.existed && await fs.pathExists(file.rollbackPath)) {
                await fs.move(file.rollbackPath, file.targetPath, { overwrite: true });
            } else {
                await fs.remove(file.targetPath);
            }
        }
        throw error;
    } finally {
        for (const file of staged) {
            if (await fs.pathExists(file.temporaryPath)) await fs.remove(file.temporaryPath);
            if (await fs.pathExists(file.rollbackPath)) await fs.remove(file.rollbackPath);
        }
    }
}

module.exports = {
    REGISTERED_STYLE_ASSETS,
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
};
