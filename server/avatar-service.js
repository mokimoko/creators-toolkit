const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_OUTPUT_NAME = 'avatar.webp';
const LEGACY_AVATAR_NAMES = Object.freeze([
    AVATAR_OUTPUT_NAME,
    'avatar.png',
    'avatar.jpg',
    'avatar.jpeg',
    'avatar.jfif'
]);
const AVATAR_TYPES = Object.freeze({
    '.jpeg': Object.freeze({ mime: 'image/jpeg', formats: ['jpeg'] }),
    '.jpg': Object.freeze({ mime: 'image/jpeg', formats: ['jpeg'] }),
    '.png': Object.freeze({ mime: 'image/png', formats: ['png'] }),
    '.webp': Object.freeze({ mime: 'image/webp', formats: ['webp'] })
});

class AvatarError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

function validateAvatarDeclaration(file) {
    if (!file?.buffer) throw new AvatarError('No avatar file provided');
    if (file.size > AVATAR_MAX_BYTES) throw new AvatarError('File too large (max 2MB)');
    const extension = path.extname(file.originalname || '').toLowerCase();
    const rule = AVATAR_TYPES[extension];
    if (!rule) throw new AvatarError('Avatar must be PNG, JPEG, or WebP');
    if (file.mimetype !== rule.mime) throw new AvatarError('Avatar extension and MIME type do not match');
    return rule;
}

class AvatarService {
    constructor(options) {
        this.getSettingsFolder = options.getSettingsFolder;
        this.defaultAvatarPath = options.defaultAvatarPath;
    }

    async upload(userContext, file) {
        if (userContext.isGuest) throw new AvatarError('Avatar upload requires a signed-in user', 403);
        const rule = validateAvatarDeclaration(file);
        let metadata;
        try {
            metadata = await sharp(file.buffer, { failOn: 'error' }).metadata();
        } catch {
            throw new AvatarError('Avatar is not a valid decoded image');
        }
        if (!rule.formats.includes(metadata.format)) {
            throw new AvatarError('Avatar content does not match its declared format');
        }
        if (!metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192) {
            throw new AvatarError('Avatar dimensions are invalid or too large');
        }

        const settingsFolder = this.getSettingsFolder(userContext);
        await fs.ensureDir(settingsFolder);
        const temporaryPath = path.join(settingsFolder, `avatar.${process.pid}.${Date.now()}.tmp.webp`);
        const avatarPath = path.join(settingsFolder, AVATAR_OUTPUT_NAME);
        await sharp(file.buffer, { failOn: 'error' })
            .rotate()
            .resize(512, 512, { fit: 'cover', withoutEnlargement: true })
            .webp({ quality: 88 })
            .toFile(temporaryPath);
        await this.removeExisting(settingsFolder, new Set([temporaryPath]));
        await fs.move(temporaryPath, avatarPath, { overwrite: true });
        const stat = await fs.stat(avatarPath);
        return this.contract(stat.mtimeMs);
    }

    async reset(userContext) {
        if (userContext.isGuest) throw new AvatarError('Avatar reset requires a signed-in user', 403);
        const settingsFolder = this.getSettingsFolder(userContext);
        await this.removeExisting(settingsFolder);
        return this.contract(Date.now(), true);
    }

    async resolve(userContext) {
        if (!userContext || userContext.isGuest) return this.defaultAvatarPath;
        const settingsFolder = this.getSettingsFolder(userContext);
        for (const name of LEGACY_AVATAR_NAMES) {
            const avatarPath = path.join(settingsFolder, name);
            if (await fs.pathExists(avatarPath)) return avatarPath;
        }
        return this.defaultAvatarPath;
    }

    async version(userContext) {
        const avatarPath = await this.resolve(userContext);
        if (avatarPath === this.defaultAvatarPath) return 0;
        return Math.floor((await fs.stat(avatarPath)).mtimeMs);
    }

    async removeExisting(settingsFolder, preserve = new Set()) {
        if (!await fs.pathExists(settingsFolder)) return;
        const entries = await fs.readdir(settingsFolder);
        await Promise.all(entries
            .filter(name => /^avatar(?:\.|$)/i.test(name))
            .map(name => path.join(settingsFolder, name))
            .filter(filePath => !preserve.has(filePath))
            .map(filePath => fs.remove(filePath)));
    }

    contract(version, isDefault = false) {
        return {
            avatarUrl: '/api/user/avatar',
            avatarVersion: Math.floor(version),
            isDefault
        };
    }
}

module.exports = {
    AVATAR_MAX_BYTES,
    AVATAR_OUTPUT_NAME,
    LEGACY_AVATAR_NAMES,
    AVATAR_TYPES,
    AvatarError,
    AvatarService,
    validateAvatarDeclaration
};
