'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('fs-extra');
const { writeJsonAtomic } = require('./cowriter-storage');
const { normalizeNotebookId } = require('./notebook-security');
const { resolvePathInside } = require('./path-security');

async function listFilesRecursive(folder) {
    if (!(await fs.pathExists(folder))) return [];
    const files = [];
    const visit = async current => {
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = resolvePathInside(current, entry.name);
            if (entry.isDirectory()) await visit(entryPath);
            else if (entry.isFile()) files.push(entryPath);
        }
    };
    await visit(folder);
    return files.sort((left, right) => left.localeCompare(right));
}

async function sha256(filePath) {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
}

async function listLegacyDefaultNotes(usersFolder) {
    const results = [];
    if (!(await fs.pathExists(usersFolder))) return results;

    const users = await fs.readdir(usersFolder, { withFileTypes: true });
    for (const user of users) {
        if (!user.isDirectory() || !/^user_[A-Za-z0-9_-]+$/.test(user.name)) continue;
        const notebooksFolder = resolvePathInside(usersFolder, user.name, 'notebooks');
        if (!(await fs.pathExists(notebooksFolder))) continue;

        const notebooks = await fs.readdir(notebooksFolder, { withFileTypes: true });
        for (const notebook of notebooks) {
            if (!notebook.isDirectory()) continue;
            try {
                normalizeNotebookId(notebook.name);
            } catch {
                continue;
            }

            const notesFolder = resolvePathInside(notebooksFolder, notebook.name, 'notes');
            if (!(await fs.pathExists(notesFolder))) continue;
            for (const file of await fs.readdir(notesFolder, { withFileTypes: true })) {
                if (!file.isFile() || !file.name.endsWith('.json')) continue;
                const notePath = resolvePathInside(notesFolder, file.name);
                try {
                    const note = await fs.readJson(notePath);
                    if (note?.collection === 'default') {
                        results.push({
                            userId: user.name,
                            notebookId: notebook.name,
                            path: notePath
                        });
                    }
                } catch {
                    // Invalid documents are left untouched and reported by normal loading diagnostics.
                }
            }
        }
    }
    return results.sort((left, right) => left.path.localeCompare(right.path));
}

function createBackupName(now) {
    return `notebook-user-data-pre-default-migration-${now.toISOString()}`
        .replace(/[:.]/g, '-')
        .replace(/Z$/, 'Z');
}

async function createVerifiedNotebookBackup({ usersFolder, backupRoot, affectedUserIds, now }) {
    await fs.ensureDir(backupRoot);
    let backupName = createBackupName(now);
    let backupFolder = resolvePathInside(backupRoot, backupName);
    let suffix = 2;
    while (await fs.pathExists(backupFolder)) {
        backupFolder = resolvePathInside(backupRoot, `${backupName}-${suffix}`);
        suffix += 1;
    }

    const entries = [];
    for (const userId of [...affectedUserIds].sort()) {
        const source = resolvePathInside(usersFolder, userId, 'notebooks');
        const destination = resolvePathInside(backupFolder, 'users', userId, 'notebooks');
        await fs.copy(source, destination, { overwrite: false, errorOnExist: true });

        for (const sourceFile of await listFilesRecursive(source)) {
            const relative = path.relative(source, sourceFile);
            const backupFile = resolvePathInside(destination, ...relative.split(path.sep));
            const [sourceHash, backupHash] = await Promise.all([sha256(sourceFile), sha256(backupFile)]);
            if (sourceHash !== backupHash) {
                throw new Error(`Backup verification failed for ${path.join(userId, 'notebooks', relative)}`);
            }
            entries.push({
                path: path.join('users', userId, 'notebooks', relative).replace(/\\/g, '/'),
                sha256: sourceHash
            });
        }
    }

    const manifest = {
        createdAt: now.toISOString(),
        purpose: 'Notebook legacy default-collection migration backup',
        files: entries
    };
    await writeJsonAtomic(resolvePathInside(backupFolder, 'BACKUP-MANIFEST.json'), manifest);
    return { backupFolder, manifest };
}

async function migrateLegacyDefaultCollections({ usersFolder, backupRoot, now = new Date() }) {
    const candidates = await listLegacyDefaultNotes(usersFolder);
    if (candidates.length === 0) {
        return { migrated: [], backupFolder: null, alreadyCurrent: true };
    }

    const affectedUserIds = new Set(candidates.map(candidate => candidate.userId));
    const { backupFolder } = await createVerifiedNotebookBackup({
        usersFolder,
        backupRoot,
        affectedUserIds,
        now
    });

    const migrated = [];
    try {
        for (const candidate of candidates) {
            const beforeHash = await sha256(candidate.path);
            const note = await fs.readJson(candidate.path);
            if (note.collection !== 'default') continue;
            await writeJsonAtomic(candidate.path, { ...note, collection: '' });
            const verified = await fs.readJson(candidate.path);
            if (verified.collection !== '') throw new Error('Migration verification failed');
            migrated.push({
                path: path.relative(usersFolder, candidate.path).replace(/\\/g, '/'),
                beforeSha256: beforeHash,
                afterSha256: await sha256(candidate.path)
            });
        }
    } catch (error) {
        for (const item of migrated) {
            const source = resolvePathInside(backupFolder, 'users', ...item.path.split('/'));
            const destination = resolvePathInside(usersFolder, ...item.path.split('/'));
            await fs.copy(source, destination, { overwrite: true });
        }
        throw error;
    }

    const report = {
        completedAt: new Date().toISOString(),
        backupFolder: path.relative(path.dirname(backupRoot), backupFolder).replace(/\\/g, '/'),
        migratedCount: migrated.length,
        migrated
    };
    await writeJsonAtomic(resolvePathInside(backupFolder, 'MIGRATION-REPORT.json'), report);
    return { migrated, backupFolder, alreadyCurrent: false };
}

module.exports = {
    createVerifiedNotebookBackup,
    listLegacyDefaultNotes,
    migrateLegacyDefaultCollections,
    sha256
};
