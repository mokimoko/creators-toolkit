const fs = require('fs');
const path = require('path');

function fail(message) {
    console.error(message);
    process.exit(1);
}

function escapeAttribute(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const [targetArg, linkedUrl, documentId, backupArg] = process.argv.slice(2);
if (!targetArg || !linkedUrl || !documentId) {
    fail('Usage: node enable-existing-read-through.js <html> <hosted-url> <document-id> [backup-html]');
}

try {
    const parsedUrl = new URL(linkedUrl);
    if (!/^https?:$/.test(parsedUrl.protocol)) fail('The hosted URL must use http or https');
} catch (error) {
    fail('The hosted URL is invalid');
}

if (!/^rp_[a-zA-Z0-9_-]{5,117}$/.test(documentId)) {
    fail('The read-through document ID is invalid');
}

const targetPath = path.resolve(targetArg);
const backupPath = backupArg ? path.resolve(backupArg) : null;
const readThroughFolder = path.resolve(__dirname, '..', 'read-through');
const css = fs.readFileSync(path.join(readThroughFolder, 'shared-comments.css'), 'utf8');
const script = fs.readFileSync(path.join(readThroughFolder, 'shared-comments.js'), 'utf8');
let html = fs.readFileSync(targetPath, 'utf8');
const alreadyEnabled = html.includes('name="rp-read-through-enabled"') || html.includes("name='rp-read-through-enabled'");
let anchorNumber = 0;
if (alreadyEnabled) {
    anchorNumber = (html.match(/\bdata-rp-anchor=/g) || []).length;
} else {
    html = html.replace(/<(p|div)\b(?=[^>]*\bdata-original=)(?![^>]*\bdata-rp-anchor=)/gi, match => {
        anchorNumber += 1;
        return `${match} data-rp-anchor="rp-block-${String(anchorNumber).padStart(5, '0')}"`;
    });
}

if (!anchorNumber) fail('No RP paragraphs with data-original attributes were found');

const metadata = `
    <meta name="rp-read-through-enabled" content="true">
    <meta name="rp-read-through-document-id" content="${escapeAttribute(documentId)}">
    <meta name="rp-read-through-linked-url" content="${escapeAttribute(linkedUrl)}">
    <meta name="rp-read-through-endpoint" content="/api/read-through/comments">
    <style id="rp-read-through-styles">
${css}
    </style>`;
const runtime = `
    <script type="application/json" id="rp-read-through-cache">[]</script>
    <script id="rp-read-through-runtime">
${script}
    </script>`;

if (alreadyEnabled) {
    const stylePattern = /<style id=["']rp-read-through-styles["']>[\s\S]*?<\/style>/i;
    const runtimePattern = /<script id=["']rp-read-through-runtime["']>[\s\S]*?<\/script>/i;
    if (!stylePattern.test(html) || !runtimePattern.test(html)) {
        fail('The enabled HTML file is missing its embedded Read-Through assets');
    }
    html = html.replace(stylePattern, metadata.match(/<style[\s\S]*<\/style>/i)[0]);
    html = html.replace(runtimePattern, runtime.match(/<script id=["']rp-read-through-runtime["']>[\s\S]*<\/script>/i)[0]);
    html = html.replace(
        /(<meta name=["']rp-read-through-document-id["'] content=["'])[^"']*(["']>)/i,
        `$1${escapeAttribute(documentId)}$2`
    );
    html = html.replace(
        /(<meta name=["']rp-read-through-linked-url["'] content=["'])[^"']*(["']>)/i,
        `$1${escapeAttribute(linkedUrl)}$2`
    );
} else {
    if (html.includes('</head>')) html = html.replace('</head>', `${metadata}\n</head>`);
    else if (html.includes('<head>')) html = html.replace('<head>', `<head>\n${metadata}`);
    else fail('The HTML file has no head element');

    if (html.includes('</body>')) html = html.replace('</body>', `${runtime}\n</body>`);
    else html += `${runtime}\n</body>\n</html>\n`;
}

if (backupPath) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(targetPath, backupPath, fs.constants.COPYFILE_EXCL);
}

fs.writeFileSync(targetPath, html, 'utf8');
console.log(JSON.stringify({ targetPath, backupPath, documentId, anchors: anchorNumber, updated: alreadyEnabled }, null, 2));
