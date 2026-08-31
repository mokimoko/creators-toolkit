const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { SiteCatalogService } = require('../site-catalog-service');

async function writeProject(root, folder, options = {}) {
    const project = path.join(root, folder);
    await fs.ensureDir(project);
    await fs.writeFile(path.join(project, 'info.html'), options.html || `<title>${folder}</title>`);
    if (options.config !== false) {
        await fs.writeJson(path.join(project, 'project-config.json'), options.config || {
            projectId: `project_${folder.padEnd(8, '_')}`,
            projectName: folder,
            htmlFilename: 'info.html',
            catalog: { version: 1, title: folder, bannerPath: null }
        });
    }
}

test('catalog handles 100 metadata-fast-path projects and safe unusual titles without HTML reads', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-sites-phase5-'));
    t.after(() => fs.remove(root));
    const titles = [`Quotes ' \" punctuation [data-x]`, 'Unicode 世界 🌙', 'x'.repeat(500)];
    await Promise.all(Array.from({ length: 100 }, (_, index) => writeProject(root, `site-${index}`, {
        config: {
            projectId: `project_${String(index).padStart(8, '0')}`,
            projectName: `site-${index}`,
            htmlFilename: 'info.html',
            catalog: { version: 1, title: titles[index % titles.length], bannerPath: 'missing.webp' }
        }
    })));

    let htmlReads = 0;
    const service = new SiteCatalogService({
        fs: { ...fs, readFile: async (...args) => { htmlReads += 1; return fs.readFile(...args); } }
    });
    const result = await service.listSites({ sitesFolder: root, userKey: 'user-a' });

    assert.equal(result.sites.length, 100);
    assert.equal(htmlReads, 0);
    assert.equal(result.sites[0].openUrl.startsWith('/projects/user-a/'), true);
    assert.equal(result.sites.some(site => site.title === 'Unicode 世界 🌙'), true);
    assert.equal(result.sites.every(site => site.bannerExists === false && site.bannerUrl === null), true);
    assert.equal(JSON.stringify(result).includes(root), false);
});

test('legacy parsing is cached, isolated, and identity survives a folder rename', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-sites-legacy-'));
    t.after(() => fs.remove(root));
    await writeProject(root, 'old-name', {
        html: '<title>Legacy & safe</title>',
        config: { projectName: 'original-name', htmlFilename: 'info.html' }
    });
    await fs.ensureDir(path.join(root, 'broken'));
    await fs.writeFile(path.join(root, 'broken', 'project-config.json'), '{broken');

    let parses = 0;
    const service = new SiteCatalogService({
        extractBannerInfo: async () => { parses += 1; return { bannerPath: null, bannerExists: false }; }
    });
    const first = await service.listSites({ sitesFolder: root, userKey: 'user-a' });
    const second = await service.listSites({ sitesFolder: root, userKey: 'user-a' });
    assert.equal(parses, 1);
    assert.equal(first.warnings.some(warning => warning.code === 'HTML_MISSING'), true);

    const originalId = first.sites[0].projectId;
    await fs.move(path.join(root, 'old-name'), path.join(root, 'renamed'));
    const renamed = await service.listSites({ sitesFolder: root, userKey: 'user-a' });
    assert.equal(renamed.sites[0].projectId, originalId);
    assert.equal(renamed.sites[0].projectName, 'renamed');
});

test('My Sites client uses cancellation, delegated safe DOM, stable IDs, and targeted patches', async () => {
    const source = await fs.readFile(path.resolve(__dirname, '..', '..', 'main', 'my-sites.js'), 'utf8');
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /siteById\.get\(card\.dataset\.siteId\)/);
    assert.match(source, /document\.createElement\('article'\)/);
    assert.match(source, /document\.createElement\('button'\)/);
    assert.match(source, /image\.addEventListener\('error'/);
    assert.match(source, /preferencesClient\.patch\('sites'/);
    assert.doesNotMatch(source, /onclick=/);
    assert.doesNotMatch(source, /querySelector\(`\[data-project=/);
});

test('a user switch aborts the stale My Sites refresh', async () => {
    const source = await fs.readFile(path.resolve(__dirname, '..', '..', 'main', 'my-sites.js'), 'utf8');
    let user = { id: 'user-a', username: 'A' };
    let asyncCall = 0;
    let firstSignal;
    const abortable = (signal, value) => {
        asyncCall += 1;
        if (asyncCall > 2) return Promise.resolve(value);
        firstSignal = signal;
        return new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
    };
    const document = { getElementById: () => null };
    const window = { ToolkitModules: {} };
    const context = vm.createContext({ window, document, AbortController, DOMException, console });
    vm.runInContext(source, context);
    const manager = new window.ToolkitModules.MySitesManager(
        { getCurrentUser: () => user, getUserContext: () => ({ userId: user.id, username: user.username }) },
        null,
        { get: ({ signal }) => abortable(signal, { preferences: {} }), patch: async () => ({}) }
    );
    context.fetch = async (_url, options) => {
        return abortable(options.signal, { ok: true, json: async () => ({ sites: [], warnings: [] }) });
    };

    const stale = manager.refresh();
    await Promise.resolve();
    user = { id: 'user-b', username: 'B' };
    const current = manager.refresh();
    await Promise.all([stale, current]);
    assert.equal(firstSignal.aborted, true);
    assert.equal(manager.refreshSessionKey, 'user-b');
});
