'use strict';

const path = require('path');

function cleanRoleplayTitle(title) {
    return String(title || '').trim().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[<>:"/\\|?*',.()[\]{}]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function buildRoleplayAssetPlan(options) {
    const {
        cleanTitle,
        existingBackgroundPath,
        existingBannerPath,
        existingStoryPaths = [],
        backgroundFile,
        bannerFile,
        storyImages = []
    } = options;
    const plan = [];
    const uploaded = (role, file, relativePath) => plan.push({ role, source: 'upload', file, path: relativePath });
    const existing = (role, relativePath) => plan.push({ role, source: 'existing', path: relativePath });

    if (backgroundFile) {
        uploaded('background', backgroundFile, `images/${cleanTitle}-background${path.extname(backgroundFile.originalname).toLowerCase()}`);
    } else if (existingBackgroundPath) {
        existing('background', existingBackgroundPath);
    }

    if (bannerFile) {
        uploaded('banner', bannerFile, `images/${cleanTitle}-banner${path.extname(bannerFile.originalname).toLowerCase()}`);
    } else if (existingBannerPath) {
        existing('banner', existingBannerPath);
    }

    existingStoryPaths.forEach(relativePath => existing('story', relativePath));
    storyImages.forEach((file, index) => {
        const number = existingStoryPaths.length + index + 1;
        uploaded('story', file, `images/${cleanTitle}-image-${number}${path.extname(file.originalname).toLowerCase()}`);
    });
    return plan;
}

function classifyAssetWrite(alreadyExists) {
    return alreadyExists ? 'replaced' : 'created';
}

module.exports = { buildRoleplayAssetPlan, classifyAssetWrite, cleanRoleplayTitle };
