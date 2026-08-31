const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp']);

function isPathInside(candidatePath, parentPath) {
    const candidate = path.resolve(candidatePath);
    const parent = path.resolve(parentPath);
    const relative = path.relative(parent, candidate);
    return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function resolvePathInside(parentPath, ...segments) {
    const resolved = path.resolve(parentPath, ...segments);
    if (!isPathInside(resolved, parentPath)) throw new Error('Resolved path is outside the allowed folder');
    return resolved;
}

function normalizeMediaPath(value) {
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return null;
    const normalized = value.trim().replace(/\\/g, '/');
    const pieces = normalized.split('/');
    if (pieces.length !== 2 || pieces[0] !== 'images' || !pieces[1] || pieces[1] !== path.basename(pieces[1])) return null;
    if (!IMAGE_EXTENSIONS.has(path.extname(pieces[1]).toLowerCase())) return null;
    return `images/${pieces[1]}`;
}

module.exports = { IMAGE_EXTENSIONS, isPathInside, resolvePathInside, normalizeMediaPath };
