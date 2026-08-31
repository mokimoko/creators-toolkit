'use strict';

const fs = require('fs-extra');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const {
    projectChatForPersistence
} = require('../../main/cowriter/chat-persistence');

const USERS_FOLDER = path.resolve(__dirname, '..', '..', 'users');
const BACKUP_FOLDER_NAME = 'cowriter-pre-settings-migration-2026-08-29';
const shouldApply = process.argv.includes('--apply');

async function findChatFiles(cowriterFolder) {
    const files = [];
    const activeChatPath = path.join(cowriterFolder, 'active-chat.json');

    if (await fs.pathExists(activeChatPath)) {
        files.push(activeChatPath);
    }

    const chatsFolder = path.join(cowriterFolder, 'chats');
    if (await fs.pathExists(chatsFolder)) {
        const entries = await fs.readdir(chatsFolder, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.json')) {
                files.push(path.join(chatsFolder, entry.name));
            }
        }
    }

    return files;
}

async function writeJsonAtomically(filePath, data) {
    const temporaryPath = `${filePath}.cowriter-settings-${process.pid}.tmp`;
    try {
        await fs.writeJson(temporaryPath, data, { spaces: 2 });
        await fs.move(temporaryPath, filePath, { overwrite: true });
    } finally {
        await fs.remove(temporaryPath);
    }
}

async function run() {
    const userEntries = await fs.readdir(USERS_FOLDER, { withFileTypes: true });
    const candidates = [];

    for (const userEntry of userEntries) {
        if (!userEntry.isDirectory()) {
            continue;
        }

        const userFolder = path.join(USERS_FOLDER, userEntry.name);
        const cowriterFolder = path.join(userFolder, 'cowriter');
        if (!await fs.pathExists(cowriterFolder)) {
            continue;
        }

        for (const filePath of await findChatFiles(cowriterFolder)) {
            const chatData = await fs.readJson(filePath);
            const projectedChat = projectChatForPersistence(chatData);

            if (!isDeepStrictEqual(chatData.settings, projectedChat.settings)) {
                candidates.push({
                    filePath,
                    projectedChat,
                    userFolder,
                    cowriterFolder
                });
            }
        }
    }

    console.log(`CoWriter chat files requiring settings migration: ${candidates.length}`);

    if (!shouldApply) {
        console.log('Dry run only. Re-run with --apply to create backups and migrate.');
        return;
    }

    const backupFolders = new Set();
    for (const candidate of candidates) {
        const backupFolder = path.join(candidate.userFolder, 'backups', BACKUP_FOLDER_NAME);
        const relativeChatPath = path.relative(candidate.cowriterFolder, candidate.filePath);
        const backupPath = path.join(backupFolder, relativeChatPath);

        if (await fs.pathExists(backupPath)) {
            throw new Error(`Backup already exists for ${path.relative(USERS_FOLDER, candidate.filePath)}`);
        }

        await fs.ensureDir(path.dirname(backupPath));
        await fs.copy(candidate.filePath, backupPath, { overwrite: false, errorOnExist: true });
        await writeJsonAtomically(candidate.filePath, candidate.projectedChat);
        backupFolders.add(path.relative(USERS_FOLDER, backupFolder));
    }

    for (const candidate of candidates) {
        const migratedChat = await fs.readJson(candidate.filePath);
        const verifiedProjection = projectChatForPersistence(migratedChat);
        if (!isDeepStrictEqual(migratedChat.settings, verifiedProjection.settings)) {
            throw new Error(`Migration verification failed for ${path.relative(USERS_FOLDER, candidate.filePath)}`);
        }
    }

    console.log(`Migrated and verified CoWriter chat files: ${candidates.length}`);
    for (const backupFolder of backupFolders) {
        console.log(`Backup: users/${backupFolder.replaceAll('\\', '/')}`);
    }
}

run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
