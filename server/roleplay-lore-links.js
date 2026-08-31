'use strict';

const fs = require('fs-extra');
const path = require('path');
const { normalizeLoreHtmlFilename } = require('./lore-security');
const { resolvePathInside } = require('./path-security');

const LORE_PROJECT_DATA_FILENAME = 'lore-project.json';

function normalizeStoredRoleplayFilename(value) {
    if (typeof value !== 'string') return '';
    let link = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    if (link.toLowerCase().startsWith('roleplays/')) link = link.slice('roleplays/'.length);
    if (!link || link.includes('/')) return '';
    try {
        return normalizeLoreHtmlFilename(link);
    } catch (error) {
        return '';
    }
}

function findLinkedStorylines(projectData, filename) {
    const storylines = Array.isArray(projectData?.storylines) ? projectData.storylines : [];
    return storylines.filter(storyline => (
        storyline?.isProjectLink === true
        && normalizeStoredRoleplayFilename(storyline.link).toLowerCase() === filename.toLowerCase()
    ));
}

function extractEmbeddedLoreProjectData(html) {
    const source = String(html || '');
    const assignment = /\b(?:var|let|const)\s+fullInfoData\s*=\s*/g.exec(source);
    if (!assignment) return null;
    const start = source.indexOf('{', assignment.index + assignment[0].length);
    if (start < 0) return null;

    let depth = 0;
    let quote = '';
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
        const character = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === quote) quote = '';
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === '{') depth += 1;
        if (character === '}') depth -= 1;
        if (depth !== 0) continue;

        try {
            return JSON.parse(source.slice(start, index + 1));
        } catch (error) {
            return null;
        }
    }
    return null;
}

async function discoverLoreRoleplayTargets(options) {
    const fsImpl = options.fsImpl || fs;
    const sitesFolder = path.resolve(options.sitesFolder);
    const filename = normalizeLoreHtmlFilename(options.filename);
    if (!await fsImpl.pathExists(sitesFolder)) return [];

    const entries = await fsImpl.readdir(sitesFolder, { withFileTypes: true });
    const targets = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const projectFolder = resolvePathInside(sitesFolder, entry.name);
        let projectId = '';
        let htmlFilename = 'info.html';
        const configPath = resolvePathInside(projectFolder, 'project-config.json');
        if (await fsImpl.pathExists(configPath)) {
            try {
                const config = await fsImpl.readJson(configPath);
                projectId = String(config.projectId || '');
                htmlFilename = normalizeLoreHtmlFilename(config.htmlFilename || 'info.html');
            } catch (error) {
                projectId = '';
                htmlFilename = 'info.html';
            }
        }

        let projectData = null;
        const projectDataPath = resolvePathInside(projectFolder, LORE_PROJECT_DATA_FILENAME);
        if (await fsImpl.pathExists(projectDataPath)) {
            try {
                projectData = await fsImpl.readJson(projectDataPath);
            } catch (error) {
                projectData = null;
            }
        }
        if (!projectData) {
            const htmlPath = resolvePathInside(projectFolder, htmlFilename);
            if (await fsImpl.pathExists(htmlPath)) {
                try {
                    projectData = extractEmbeddedLoreProjectData(await fsImpl.readFile(htmlPath, 'utf8'));
                } catch (error) {
                    projectData = null;
                }
            }
        }

        const storylines = findLinkedStorylines(projectData, filename);
        if (!storylines.length) continue;

        const destinationPath = resolvePathInside(projectFolder, 'roleplays', filename);
        targets.push({
            projectId,
            projectName: entry.name,
            storylineTitles: [...new Set(storylines.map(item => String(item.title || '').trim()).filter(Boolean))],
            destinationExists: await fsImpl.pathExists(destinationPath)
        });
    }

    return targets.sort((a, b) => a.projectName.localeCompare(b.projectName));
}

async function collectRoleplaySourceFiles(options) {
    const fsImpl = options.fsImpl || fs;
    const sourceProjectPath = path.resolve(options.sourceProjectPath);
    const filename = normalizeLoreHtmlFilename(options.filename);
    const htmlPath = resolvePathInside(sourceProjectPath, filename);
    if (!await fsImpl.pathExists(htmlPath)) return [];

    const files = [{ relativePath: filename, content: await fsImpl.readFile(htmlPath) }];
    const cssPath = resolvePathInside(sourceProjectPath, 'generated.css');
    if (await fsImpl.pathExists(cssPath)) {
        files.push({ relativePath: 'generated.css', content: await fsImpl.readFile(cssPath) });
    }

    const imagesPath = resolvePathInside(sourceProjectPath, 'images');
    if (await fsImpl.pathExists(imagesPath)) {
        const basename = path.parse(filename).name;
        const imageNames = (await fsImpl.readdir(imagesPath)).filter(name => (
            name.startsWith(`${basename}-`) && /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(name)
        ));
        for (const name of imageNames) {
            files.push({
                relativePath: `images/${name}`,
                content: await fsImpl.readFile(resolvePathInside(imagesPath, name))
            });
        }
    }
    return files;
}

function buildLoreCopyWrites({ sitesFolder, targets, sourceFiles }) {
    const root = path.resolve(sitesFolder);
    const writes = [];
    for (const target of targets) {
        const destinationRoot = resolvePathInside(root, target.projectName, 'roleplays');
        for (const file of sourceFiles) {
            writes.push({
                path: resolvePathInside(destinationRoot, ...file.relativePath.split('/')),
                content: file.content
            });
        }
    }
    return writes;
}

module.exports = {
    LORE_PROJECT_DATA_FILENAME,
    buildLoreCopyWrites,
    collectRoleplaySourceFiles,
    discoverLoreRoleplayTargets,
    extractEmbeddedLoreProjectData,
    findLinkedStorylines,
    normalizeStoredRoleplayFilename
};
