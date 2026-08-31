'use strict';

const fs = require('fs-extra');
const path = require('node:path');
const {
    createKeyBinding,
    decryptCredential,
    decryptLegacyCredential,
    detectKeyFileFormat,
    encryptCredential,
    loadMasterKey,
    writeTextFileAtomically
} = require('../cowriter-key-store');

const USERS_FOLDER = path.resolve(__dirname, '..', '..', 'users');
const BACKUP_FOLDER_NAME = 'cowriter-pre-key-store-migration-2026-08-29';
const shouldApply = process.argv.includes('--apply');

async function findProviderKeyFiles() {
    const candidates = [];
    const userEntries = await fs.readdir(USERS_FOLDER, { withFileTypes: true });

    for (const userEntry of userEntries) {
        if (!userEntry.isDirectory()) {
            continue;
        }

        const userFolder = path.join(USERS_FOLDER, userEntry.name);
        const providersFolder = path.join(userFolder, 'cowriter', 'providers');
        if (!await fs.pathExists(providersFolder)) {
            continue;
        }

        const providerEntries = await fs.readdir(providersFolder, { withFileTypes: true });
        for (const providerEntry of providerEntries) {
            if (!providerEntry.isFile() || !providerEntry.name.endsWith('.key')) {
                continue;
            }

            candidates.push({
                filePath: path.join(providersFolder, providerEntry.name),
                providerId: path.basename(providerEntry.name, '.key'),
                userFolder,
                userId: userEntry.name
            });
        }
    }

    return candidates;
}

async function run() {
    const candidates = await findProviderKeyFiles();
    const formats = new Map();
    const staged = [];

    for (const candidate of candidates) {
        const originalValue = await fs.readFile(candidate.filePath, 'utf8');
        const format = detectKeyFileFormat(originalValue);
        formats.set(format, (formats.get(format) || 0) + 1);
        staged.push({ ...candidate, originalValue, format });
    }

    console.log(`CoWriter provider key files found: ${candidates.length}`);
    for (const [format, count] of [...formats.entries()].sort()) {
        console.log(`Format ${format}: ${count}`);
    }

    if (!shouldApply) {
        console.log('Dry run only. Re-run with --apply to create backups and migrate legacy keys.');
        return;
    }

    const masterKey = await loadMasterKey(USERS_FOLDER, { create: true });

    for (const candidate of staged) {
        const binding = createKeyBinding(candidate.userId, candidate.providerId);
        if (candidate.format === 'legacy-cbc') {
            const credential = decryptLegacyCredential(candidate.originalValue);
            candidate.migratedValue = encryptCredential(credential, masterKey, binding);
        } else if (candidate.format === 'v2-gcm') {
            decryptCredential(candidate.originalValue, masterKey, binding);
            candidate.migratedValue = candidate.originalValue;
        } else {
            throw new Error('Unsupported provider key file found; no provider key files were changed');
        }

        candidate.backupPath = path.join(
            candidate.userFolder,
            'backups',
            BACKUP_FOLDER_NAME,
            'providers',
            path.basename(candidate.filePath)
        );
        if (candidate.format === 'legacy-cbc' && await fs.pathExists(candidate.backupPath)) {
            throw new Error('A migration backup already exists; no provider key files were changed');
        }
    }

    const legacyCandidates = staged.filter(candidate => candidate.format === 'legacy-cbc');
    for (const candidate of legacyCandidates) {
        await fs.ensureDir(path.dirname(candidate.backupPath));
        await fs.copy(candidate.filePath, candidate.backupPath, { overwrite: false, errorOnExist: true });
    }

    const migrated = [];
    try {
        for (const candidate of legacyCandidates) {
            await writeTextFileAtomically(candidate.filePath, candidate.migratedValue);
            migrated.push(candidate);
        }

        for (const candidate of legacyCandidates) {
            const migratedValue = await fs.readFile(candidate.filePath, 'utf8');
            const binding = createKeyBinding(candidate.userId, candidate.providerId);
            decryptCredential(migratedValue, masterKey, binding);
        }
    } catch (error) {
        for (const candidate of migrated) {
            await writeTextFileAtomically(candidate.filePath, candidate.originalValue);
        }
        throw new Error(`Key migration failed and migrated files were restored: ${error.message}`);
    }

    console.log(`Migrated and authenticated CoWriter provider keys: ${legacyCandidates.length}`);
    const backupFolders = new Set(legacyCandidates.map(candidate => path.dirname(candidate.backupPath)));
    for (const backupFolder of backupFolders) {
        console.log(`Backup: ${path.relative(path.dirname(USERS_FOLDER), backupFolder).replaceAll('\\', '/')}`);
    }
}

run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
