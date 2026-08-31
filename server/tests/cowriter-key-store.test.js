'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    createKeyBinding,
    deleteCredentialFile,
    decryptCredential,
    decryptLegacyCredential,
    detectKeyFileFormat,
    encryptCredential
} = require('../cowriter-key-store');

function createLegacyEnvelope(credential, secret) {
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const ciphertext = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${ciphertext.toString('hex')}`;
}

test('versioned provider credentials use authenticated encryption and binding', () => {
    const masterKey = crypto.randomBytes(32);
    const binding = createKeyBinding('synthetic-user', 'google');
    const credential = 'synthetic-credential-value';
    const envelope = encryptCredential(credential, masterKey, binding);

    assert.equal(detectKeyFileFormat(envelope), 'v2-gcm');
    assert.equal(decryptCredential(envelope, masterKey, binding), credential);
    assert.throws(
        () => decryptCredential(envelope, masterKey, createKeyBinding('other-user', 'google')),
        /authenticated decryption/
    );

    const tamperedEnvelope = JSON.parse(envelope);
    tamperedEnvelope.ciphertext = Buffer.from('tampered').toString('base64');
    assert.throws(
        () => decryptCredential(JSON.stringify(tamperedEnvelope), masterKey, binding),
        /authenticated decryption/
    );
});

test('legacy credentials remain decryptable only for migration', () => {
    const secret = 'synthetic-legacy-secret';
    const credential = 'synthetic-legacy-credential';
    const legacyEnvelope = createLegacyEnvelope(credential, secret);

    assert.equal(detectKeyFileFormat(legacyEnvelope), 'legacy-cbc');
    assert.equal(decryptLegacyCredential(legacyEnvelope, secret), credential);
    assert.throws(() => decryptLegacyCredential(legacyEnvelope, 'wrong-secret'), /no files were changed/);
});

test('credential deletion targets one exact file and reports whether it existed', async () => {
    const testFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'cowriter-key-delete-'));
    try {
        const keyPath = path.join(testFolder, 'google.key');
        const neighboringKeyPath = path.join(testFolder, 'openai.key');
        await fs.writeFile(keyPath, 'synthetic-envelope', 'utf8');
        await fs.writeFile(neighboringKeyPath, 'neighboring-envelope', 'utf8');

        assert.equal(await deleteCredentialFile(keyPath), true);
        assert.equal(await fs.pathExists(keyPath), false);
        assert.equal(await fs.pathExists(neighboringKeyPath), true);
        assert.equal(await deleteCredentialFile(keyPath), false);
    } finally {
        await fs.remove(testFolder);
    }
});
