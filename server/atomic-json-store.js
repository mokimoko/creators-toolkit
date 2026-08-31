const fs = require('fs-extra');
const path = require('path');

function backupPathFor(filePath) {
    const extension = path.extname(filePath);
    return `${filePath.slice(0, -extension.length)}.backup${extension}`;
}

async function readJsonWithBackup(filePath, fallback = {}) {
    if (!await fs.pathExists(filePath)) return fallback;
    try {
        return await fs.readJson(filePath);
    } catch (primaryError) {
        const backupPath = backupPathFor(filePath);
        if (!await fs.pathExists(backupPath)) throw primaryError;
        return fs.readJson(backupPath);
    }
}

async function writeJsonAtomic(filePath, value, options = {}) {
    await fs.ensureDir(path.dirname(filePath));
    const backupPath = options.backupPath || backupPathFor(filePath);
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeJson(temporaryPath, value, { spaces: options.spaces ?? 2 });

    let movedOriginal = false;
    try {
        if (options.backup !== false && await fs.pathExists(filePath)) {
            await fs.remove(backupPath);
            await fs.move(filePath, backupPath);
            movedOriginal = true;
        }
        await fs.move(temporaryPath, filePath, { overwrite: true });
    } catch (error) {
        await fs.remove(temporaryPath).catch(() => {});
        if (movedOriginal && !await fs.pathExists(filePath)) {
            await fs.move(backupPath, filePath).catch(() => {});
        }
        throw error;
    }
}

module.exports = {
    backupPathFor,
    readJsonWithBackup,
    writeJsonAtomic
};
