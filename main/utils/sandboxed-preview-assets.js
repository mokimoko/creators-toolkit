(function defineSandboxedPreviewAssets(root) {
    'use strict';

    const revisions = new WeakMap();
    const MESSAGE_TYPE = 'ct-preview-assets';

    function createChannelId() {
        if (root.crypto?.randomUUID) return root.crypto.randomUUID();

        const bytes = new Uint32Array(4);
        root.crypto?.getRandomValues?.(bytes);
        return Array.from(bytes, value => value.toString(16).padStart(8, '0')).join('');
    }

    function isAllowedAssetPath(value, prefixes) {
        const candidate = String(value || '').trim();
        if (!candidate || candidate.includes('\\') || candidate.startsWith('//')) return false;
        if (candidate.split('/').includes('..')) return false;
        return prefixes.some(prefix => candidate.startsWith(prefix));
    }

    function collectAssetPaths(html, prefixes) {
        const paths = new Set();
        const source = String(html || '');
        const attributePattern = /\b(?:src|srcset|poster)\s*=\s*(["'])(.*?)\1/gi;
        const cssPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;

        function addCandidate(value) {
            const candidate = String(value || '').trim().split(/\s+/)[0];
            if (isAllowedAssetPath(candidate, prefixes)) paths.add(candidate);
        }

        for (const match of source.matchAll(attributePattern)) {
            String(match[2] || '').split(',').forEach(addCandidate);
        }
        for (const match of source.matchAll(cssPattern)) addCandidate(match[2]);

        return [...paths].sort((left, right) => right.length - left.length);
    }

    function bridgeScript(channelId) {
        const channel = JSON.stringify(channelId);
        const messageType = JSON.stringify(MESSAGE_TYPE);

        return `<script data-ct-preview-asset-bridge>
(() => {
    'use strict';
    const channel = ${channel};
    const messageType = ${messageType};
    const replacements = new Map();

    function readAsDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener('load', () => resolve(reader.result), { once: true });
            reader.addEventListener('error', () => reject(reader.error || new Error('Image could not be read')), { once: true });
            reader.readAsDataURL(blob);
        });
    }

    function replaceValue(value) {
        let next = String(value || '');
        replacements.forEach((objectUrl, placeholder) => {
            if (next.includes(placeholder)) next = next.split(placeholder).join(objectUrl);
        });
        return next;
    }

    function rewriteElement(element) {
        if (!(element instanceof Element)) return;
        Array.from(element.attributes).forEach(attribute => {
            const next = replaceValue(attribute.value);
            if (next !== attribute.value) element.setAttribute(attribute.name, next);
        });
        if (element.tagName === 'STYLE') {
            const next = replaceValue(element.textContent);
            if (next !== element.textContent) element.textContent = next;
        }
        element.querySelectorAll('*').forEach(child => {
            Array.from(child.attributes).forEach(attribute => {
                const next = replaceValue(attribute.value);
                if (next !== attribute.value) child.setAttribute(attribute.name, next);
            });
            if (child.tagName === 'STYLE') {
                const next = replaceValue(child.textContent);
                if (next !== child.textContent) child.textContent = next;
            }
        });
    }

    const observer = new MutationObserver(records => {
        records.forEach(record => {
            if (record.type === 'attributes') rewriteElement(record.target);
            record.addedNodes.forEach(node => rewriteElement(node));
        });
    });
    observer.observe(document, { attributes: true, childList: true, subtree: true });

    addEventListener('message', async event => {
        const data = event.data;
        if (event.source !== parent || data?.type !== messageType || data.channel !== channel) return;

        replacements.clear();
        const resolved = await Promise.all((data.assets || []).map(async asset => {
            if (!asset?.placeholder || !(asset.blob instanceof Blob)) return null;
            try {
                return [asset.placeholder, await readAsDataUrl(asset.blob)];
            } catch {
                return null;
            }
        }));
        resolved.forEach(entry => {
            if (entry) replacements.set(entry[0], entry[1]);
        });
        rewriteElement(document.documentElement);
    });

    addEventListener('pagehide', () => {
        observer.disconnect();
    }, { once: true });
})();
</script>`;
    }

    function injectBridge(html, script) {
        if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${script}\n</head>`);
        return `${script}${html}`;
    }

    function prepareDocument(html, prefixes) {
        const channelId = createChannelId();
        const entries = collectAssetPaths(html, prefixes).map((path, index) => ({
            path,
            placeholder: `about:blank#ct-preview-asset-${channelId}-${String(index).padStart(6, '0')}-end`
        }));
        let preparedHtml = String(html || '');

        entries.forEach(entry => {
            preparedHtml = preparedHtml.split(entry.path).join(entry.placeholder);
        });

        return {
            channelId,
            entries,
            html: injectBridge(preparedHtml, bridgeScript(channelId))
        };
    }

    async function loadAssets(entries, baseHref, localAssets) {
        const localByPath = new Map((localAssets || []).map(asset => [asset.path, asset.blob]));
        const baseUrl = baseHref ? new URL(baseHref, root.location.origin) : null;
        const loaded = [];
        const failures = [];

        await Promise.all(entries.map(async entry => {
            const localBlob = localByPath.get(entry.path);
            if (localBlob instanceof Blob) {
                loaded.push({ placeholder: entry.placeholder, blob: localBlob });
                return;
            }
            if (!baseUrl) {
                failures.push(entry.path);
                return;
            }

            try {
                const assetUrl = new URL(entry.path, baseUrl);
                if (assetUrl.origin !== baseUrl.origin || !assetUrl.pathname.startsWith(baseUrl.pathname)) {
                    throw new Error('Asset escaped its preview root');
                }

                const response = await root.fetch(assetUrl.href, {
                    cache: 'no-cache',
                    credentials: 'same-origin'
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const blob = await response.blob();
                if (!String(blob.type || '').toLowerCase().startsWith('image/')) {
                    throw new Error('Response was not an image');
                }
                loaded.push({ placeholder: entry.placeholder, blob });
            } catch (error) {
                failures.push(entry.path);
                root.console?.warn?.(`Preview image could not be loaded: ${entry.path}`, error);
            }
        }));

        return { assets: loaded, failures };
    }

    async function render(iframe, options = {}) {
        if (!iframe) return { assets: [], failures: [] };

        const prefixes = Array.isArray(options.assetPrefixes) && options.assetPrefixes.length
            ? options.assetPrefixes : ['assets/', 'images/'];
        const revision = (revisions.get(iframe) || 0) + 1;
        revisions.set(iframe, revision);

        const prepared = prepareDocument(options.html, prefixes);
        const loadEvent = new Promise(resolve => iframe.addEventListener('load', resolve, { once: true }));
        const assetsPromise = loadAssets(prepared.entries, options.baseHref, options.localAssets);

        iframe.srcdoc = prepared.html;
        const [result] = await Promise.all([assetsPromise, loadEvent]);
        if (revisions.get(iframe) !== revision || !iframe.contentWindow) return result;

        iframe.contentWindow.postMessage({
            type: MESSAGE_TYPE,
            channel: prepared.channelId,
            assets: result.assets
        }, '*');
        return result;
    }

    root.ToolkitSandboxedPreviewAssets = Object.freeze({
        collectAssetPaths,
        render
    });
})(window);
