(function defineReadThroughIntegration(root) {
    'use strict';

    function escapeMeta(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function editorManager() {
        return root.RPArchiver.get('readThroughEditor').getManager();
    }

    async function prepare() {
        if (!document.getElementById('read-through-enabled')?.checked) return { css: '', js: '' };
        return editorManager().getExportAssets();
    }

    function inject(html) {
        const manager = editorManager();
        const config = manager.getExportConfig();
        if (!config.enabled) return html;

        const { css, js } = manager.assets;
        const script = js.replace(/<\/script/gi, '<\\/script');
        if (!css || !script) {
            throw new Error('Shared read-through assets are not ready. Please try Create again.');
        }

        const metadata = `
    <meta name="rp-read-through-enabled" content="true">
    <meta name="rp-read-through-document-id" content="${escapeMeta(config.documentId)}">
    <meta name="rp-read-through-linked-url" content="${escapeMeta(config.linkedUrl)}">
    <meta name="rp-read-through-endpoint" content="${escapeMeta(config.endpoint)}">
    <style id="rp-read-through-styles">
${css}
    </style>`;

        const cachedComments = JSON.stringify(config.comments || [])
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026');
        const runtime = `
    <script type="application/json" id="rp-read-through-cache">${cachedComments}</script>
    <script id="rp-read-through-runtime">
${script}
    </script>`;

        if (html.includes('</head>')) html = html.replace('</head>', `${metadata}\n</head>`);
        else if (html.includes('<head>')) html = html.replace('<head>', `<head>\n${metadata}`);
        if (html.includes('</body>')) html = html.replace('</body>', `${runtime}\n</body>`);
        else html += `\n${runtime}\n</body>\n</html>`;
        return html;
    }

    root.RPArchiver.define('readThroughIntegration', { inject, prepare });
})(window);
