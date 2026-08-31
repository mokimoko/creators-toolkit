(function initReadThroughCore(root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && typeof window !== 'undefined') root.RPReadThroughCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createReadThroughCore(root) {
    'use strict';

    const PROFILE_KEY = 'rp-read-through-profile-v1';
    const CACHE_PREFIX = 'rp-read-through-cache-v1:';
    const QUEUE_PREFIX = 'rp-read-through-queue-v1:';
    const SEEN_PREFIX = 'rp-read-through-seen-v1:';
    const BLOCK_SELECTOR = '.rp-container p, .rp-container .html-content';

    function readMeta(name, fallback = '') {
        return root.document?.querySelector(`meta[name="${name}"]`)?.content || fallback;
    }

    function parseJson(value, fallback) {
        try {
            return JSON.parse(value);
        } catch (error) {
            return fallback;
        }
    }

    function createId(prefix) {
        if (root.crypto?.randomUUID) return `${prefix}_${root.crypto.randomUUID()}`;
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    }

    function normalizeColor(value) {
        return /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : '#b66a3c';
    }

    function formatWhen(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        if (seconds < 60) return 'now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function stableAnchorId(index) {
        return `rp-block-${String(index + 1).padStart(5, '0')}`;
    }

    return {
        BLOCK_SELECTOR,
        CACHE_PREFIX,
        PROFILE_KEY,
        QUEUE_PREFIX,
        SEEN_PREFIX,
        createId,
        formatWhen,
        normalizeColor,
        parseJson,
        readMeta,
        stableAnchorId
    };
});
