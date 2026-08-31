const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const { USERS_FOLDER } = require('./core');

const REMEMBERED_SESSION_VERSION = 2;
const STRUCTURED_TOKEN_PATTERN = /^([A-Za-z0-9_-]{1,128})\.([a-f0-9]{64})$/;
const LEGACY_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function createRememberedSessionStore(options = {}) {
    const sessionsFolder = options.sessionsFolder || path.join(USERS_FOLDER, '_sessions');
    const ttlMs = options.ttlMs ?? (90 * 24 * 60 * 60 * 1000);

    function hashToken(token) {
        return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
    }

    function tokensMatch(expectedHash, token) {
        if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash)) {
            return false;
        }
        const actual = Buffer.from(hashToken(token), 'hex');
        const expected = Buffer.from(expectedHash, 'hex');
        return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    }

    function getSessionFile(userId) {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) {
            throw new Error('Invalid remembered-session user ID');
        }
        return path.join(sessionsFolder, `${userId}.json`);
    }

    async function createUserSession(userId, username) {
        await fs.ensureDir(sessionsFolder);
        const token = `${userId}.${crypto.randomBytes(32).toString('hex')}`;
        await fs.writeJson(getSessionFile(userId), {
            version: REMEMBERED_SESSION_VERSION,
            userId,
            username,
            tokenHash: hashToken(token),
            createdAt: Date.now(),
            expiresAt: Date.now() + ttlMs
        });
        return token;
    }

    async function validateSessionToken(token) {
        try {
            if (typeof token !== 'string') return null;
            await fs.ensureDir(sessionsFolder);

            const structuredMatch = token.match(STRUCTURED_TOKEN_PATTERN);
            if (structuredMatch) {
                const userId = structuredMatch[1];
                const sessionFile = getSessionFile(userId);
                if (!await fs.pathExists(sessionFile)) return null;

                const sessionData = await fs.readJson(sessionFile);
                if (sessionData.userId !== userId || !tokensMatch(sessionData.tokenHash, token)) {
                    return null;
                }
                if (Date.now() > sessionData.expiresAt) {
                    await fs.remove(sessionFile);
                    return null;
                }
                return { ...sessionData, requiresRotation: false };
            }

            if (!LEGACY_TOKEN_PATTERN.test(token)) return null;
            const files = await fs.readdir(sessionsFolder);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                const sessionFile = path.join(sessionsFolder, file);
                const sessionData = await fs.readJson(sessionFile);
                const legacyHash = sessionData.legacyTokenHash
                    || (typeof sessionData.token === 'string' ? hashToken(sessionData.token) : null);
                if (!tokensMatch(legacyHash, token)) continue;

                if (Date.now() > sessionData.expiresAt) {
                    await fs.remove(sessionFile);
                    return null;
                }
                return { ...sessionData, requiresRotation: true };
            }
            return null;
        } catch (error) {
            console.error('Error validating remembered session:', error);
            return null;
        }
    }

    async function clearUserSession(userId) {
        const sessionFile = getSessionFile(userId);
        if (await fs.pathExists(sessionFile)) await fs.remove(sessionFile);
    }

    async function updateRememberedSessionUsername(userId, username) {
        const sessionFile = getSessionFile(userId);
        if (!await fs.pathExists(sessionFile)) return;

        const sessionData = await fs.readJson(sessionFile);
        if (sessionData.userId !== userId) return;
        sessionData.username = username;
        await fs.writeJson(sessionFile, sessionData);
    }

    async function getRememberedUsers() {
        await fs.ensureDir(sessionsFolder);
        const files = await fs.readdir(sessionsFolder);
        const remembered = [];

        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
                const sessionFile = path.join(sessionsFolder, file);
                const sessionData = await fs.readJson(sessionFile);
                if (Date.now() > sessionData.expiresAt) {
                    await fs.remove(sessionFile);
                    continue;
                }
                remembered.push({
                    userId: sessionData.userId,
                    username: sessionData.username
                });
            } catch (error) {
                console.warn(`Skipping invalid remembered session file ${file}: ${error.message}`);
            }
        }
        return remembered;
    }

    async function migrateLegacyRememberedSessions() {
        await fs.ensureDir(sessionsFolder);
        const files = await fs.readdir(sessionsFolder);
        let migratedCount = 0;

        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            const sessionFile = path.join(sessionsFolder, file);
            try {
                const sessionData = await fs.readJson(sessionFile);
                if (typeof sessionData.token !== 'string') continue;

                sessionData.version = 1;
                sessionData.legacyTokenHash = hashToken(sessionData.token);
                delete sessionData.token;
                await fs.writeJson(sessionFile, sessionData);
                migratedCount += 1;
            } catch (error) {
                console.warn(`Could not migrate remembered session file ${file}: ${error.message}`);
            }
        }
        return migratedCount;
    }

    return {
        clearUserSession,
        createUserSession,
        getRememberedUsers,
        migrateLegacyRememberedSessions,
        updateRememberedSessionUsername,
        validateSessionToken
    };
}

const defaultStore = createRememberedSessionStore();

module.exports = {
    createRememberedSessionStore,
    ...defaultStore
};
