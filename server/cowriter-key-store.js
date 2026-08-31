'use strict';

const crypto = require('node:crypto');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const fs = require('fs-extra');
const {
    resolvePathInside
} = require('./path-security');

const ENVELOPE_VERSION = 2;
const ENVELOPE_ALGORITHM = 'aes-256-gcm';
const MASTER_KEY_BYTES = 32;
const MASTER_KEY_FOLDER = '.cowriter-key-store';
const MASTER_KEY_FILENAME = 'master.key';
const LEGACY_FALLBACK_SECRET = 'default-dev-key-change-in-production';

class CoWriterKeyStoreError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CoWriterKeyStoreError';
        this.statusCode = 500;
    }
}

function validateCredential(credential) {
    if (
        typeof credential !== 'string'
        || credential.length === 0
        || credential.length > 16384
        || /[\u0000-\u001F\u007F\uFFFD]/.test(credential)
    ) {
        throw new CoWriterKeyStoreError('Provider credential has an invalid format');
    }

    return credential;
}

function createKeyBinding(userId, providerId) {
    return `cowriter-provider-key\u0000${userId}\u0000${providerId}`;
}

function detectKeyFileFormat(storedValue) {
    if (typeof storedValue !== 'string') {
        return 'unknown';
    }

    const trimmedValue = storedValue.trim();
    if (/^[0-9a-f]+:[0-9a-f]+$/i.test(trimmedValue)) {
        return 'legacy-cbc';
    }

    if (trimmedValue.startsWith('{')) {
        try {
            const envelope = JSON.parse(trimmedValue);
            return envelope.version === ENVELOPE_VERSION ? 'v2-gcm' : 'unknown';
        } catch {
            return 'unknown';
        }
    }

    return 'unknown';
}

function decodeMasterKey(encodedKey) {
    const normalizedKey = String(encodedKey).trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedKey)) {
        throw new CoWriterKeyStoreError('CoWriter master key file is malformed');
    }

    const key = Buffer.from(normalizedKey, 'base64');
    if (key.length !== MASTER_KEY_BYTES) {
        throw new CoWriterKeyStoreError('CoWriter master key has an invalid length');
    }

    return key;
}

function getMasterKeyPath(usersFolder) {
    const keyStoreFolder = resolvePathInside(usersFolder, MASTER_KEY_FOLDER);
    return resolvePathInside(keyStoreFolder, MASTER_KEY_FILENAME);
}

async function loadMasterKey(usersFolder, { create = false } = {}) {
    const masterKeyPath = getMasterKeyPath(usersFolder);

    try {
        return decodeMasterKey(await fsPromises.readFile(masterKeyPath, 'utf8'));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }

    if (!create) {
        throw new CoWriterKeyStoreError('CoWriter master key is missing; restore it with the users folder backup');
    }

    await fs.ensureDir(path.dirname(masterKeyPath));
    const generatedKey = crypto.randomBytes(MASTER_KEY_BYTES);

    try {
        await fsPromises.writeFile(masterKeyPath, `${generatedKey.toString('base64')}\n`, {
            encoding: 'utf8',
            flag: 'wx',
            mode: 0o600
        });
        return generatedKey;
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
        return decodeMasterKey(await fsPromises.readFile(masterKeyPath, 'utf8'));
    }
}

function encryptCredential(credential, masterKey, binding) {
    validateCredential(credential);
    if (!Buffer.isBuffer(masterKey) || masterKey.length !== MASTER_KEY_BYTES) {
        throw new CoWriterKeyStoreError('Cannot encrypt without a valid CoWriter master key');
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ENVELOPE_ALGORITHM, masterKey, iv);
    cipher.setAAD(Buffer.from(binding, 'utf8'));
    const ciphertext = Buffer.concat([
        cipher.update(credential, 'utf8'),
        cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    return `${JSON.stringify({
        version: ENVELOPE_VERSION,
        algorithm: ENVELOPE_ALGORITHM,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        ciphertext: ciphertext.toString('base64')
    }, null, 2)}\n`;
}

function decryptCredential(storedValue, masterKey, binding) {
    try {
        const envelope = JSON.parse(String(storedValue));
        if (envelope.version !== ENVELOPE_VERSION || envelope.algorithm !== ENVELOPE_ALGORITHM) {
            throw new Error('Unsupported key envelope');
        }

        const iv = Buffer.from(envelope.iv, 'base64');
        const authTag = Buffer.from(envelope.authTag, 'base64');
        const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
        if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
            throw new Error('Invalid key envelope fields');
        }

        const decipher = crypto.createDecipheriv(ENVELOPE_ALGORITHM, masterKey, iv);
        decipher.setAAD(Buffer.from(binding, 'utf8'));
        decipher.setAuthTag(authTag);
        const credential = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]).toString('utf8');

        return validateCredential(credential);
    } catch (error) {
        if (error instanceof CoWriterKeyStoreError) {
            throw error;
        }
        throw new CoWriterKeyStoreError('Provider credential failed authenticated decryption');
    }
}

function decryptLegacyCredential(storedValue, legacySecret = process.env.COWRITER_ENCRYPTION_KEY || LEGACY_FALLBACK_SECRET) {
    try {
        const [ivHex, ciphertextHex, ...extraParts] = String(storedValue).trim().split(':');
        if (extraParts.length > 0 || !/^[0-9a-f]+$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(ciphertextHex)) {
            throw new Error('Invalid legacy envelope');
        }

        const key = crypto.createHash('sha256').update(legacySecret).digest();
        const iv = Buffer.from(ivHex, 'hex');
        if (iv.length !== 16) {
            throw new Error('Invalid legacy IV');
        }

        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        const credential = Buffer.concat([
            decipher.update(Buffer.from(ciphertextHex, 'hex')),
            decipher.final()
        ]).toString('utf8');

        return validateCredential(credential);
    } catch (error) {
        if (error instanceof CoWriterKeyStoreError) {
            throw error;
        }
        throw new CoWriterKeyStoreError('Legacy provider credential could not be decrypted; no files were changed');
    }
}

async function writeTextFileAtomically(filePath, content) {
    const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
        await fsPromises.writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        await fs.move(temporaryPath, filePath, { overwrite: true });
    } finally {
        await fs.remove(temporaryPath);
    }
}

async function writeCredentialFile({ filePath, usersFolder, binding, credential }) {
    const masterKey = await loadMasterKey(usersFolder, { create: true });
    const envelope = encryptCredential(credential, masterKey, binding);
    await writeTextFileAtomically(filePath, envelope);
}

async function deleteCredentialFile(filePath) {
    if (!await fs.pathExists(filePath)) {
        return false;
    }

    await fs.remove(filePath);
    return true;
}

async function readCredentialFile({ filePath, usersFolder, binding }) {
    const storedValue = await fsPromises.readFile(filePath, 'utf8');
    const format = detectKeyFileFormat(storedValue);

    if (format === 'v2-gcm') {
        const masterKey = await loadMasterKey(usersFolder);
        return { credential: decryptCredential(storedValue, masterKey, binding), format };
    }

    if (format === 'legacy-cbc') {
        return { credential: decryptLegacyCredential(storedValue), format };
    }

    throw new CoWriterKeyStoreError('Provider credential file uses an unsupported format');
}

module.exports = {
    CoWriterKeyStoreError,
    ENVELOPE_VERSION,
    createKeyBinding,
    deleteCredentialFile,
    decryptCredential,
    decryptLegacyCredential,
    detectKeyFileFormat,
    encryptCredential,
    getMasterKeyPath,
    loadMasterKey,
    readCredentialFile,
    writeCredentialFile,
    writeTextFileAtomically
};
