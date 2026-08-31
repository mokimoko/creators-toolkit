'use strict';

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const writeQueues = new Map();

async function writeJsonAtomic(filePath, value) {
    await fs.ensureDir(path.dirname(filePath));
    const tempPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;

    try {
        await fs.writeJson(tempPath, value, { spaces: 2 });
        await fs.rename(tempPath, filePath);
    } catch (error) {
        await fs.remove(tempPath).catch(() => {});
        throw error;
    }
}

function queueFileOperation(filePath, operation) {
    if (typeof operation !== 'function') {
        return Promise.reject(new TypeError('A queued file operation is required'));
    }

    const previous = writeQueues.get(filePath) || Promise.resolve();
    const queued = previous
        .catch(() => {})
        .then(operation);

    writeQueues.set(filePath, queued);
    return queued.finally(() => {
        if (writeQueues.get(filePath) === queued) {
            writeQueues.delete(filePath);
        }
    });
}

function queueFileOperations(filePaths, operation) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
        return Promise.reject(new TypeError('At least one queued file path is required'));
    }
    if (typeof operation !== 'function') {
        return Promise.reject(new TypeError('A queued file operation is required'));
    }

    const keys = [...new Set(filePaths)].sort();
    const previous = keys.map(key => writeQueues.get(key) || Promise.resolve());
    const queued = Promise.all(previous.map(promise => promise.catch(() => {})))
        .then(operation);

    keys.forEach(key => writeQueues.set(key, queued));
    return queued.finally(() => {
        keys.forEach(key => {
            if (writeQueues.get(key) === queued) writeQueues.delete(key);
        });
    });
}

function queueJsonWrite(filePath, value) {
    return queueFileOperation(filePath, () => writeJsonAtomic(filePath, value));
}

module.exports = {
    queueFileOperation,
    queueFileOperations,
    queueJsonWrite,
    writeJsonAtomic
};
