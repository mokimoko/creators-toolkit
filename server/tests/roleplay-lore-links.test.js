'use strict';

const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    buildLoreCopyWrites,
    collectRoleplaySourceFiles,
    discoverLoreRoleplayTargets,
    extractEmbeddedLoreProjectData,
    findLinkedStorylines,
    normalizeStoredRoleplayFilename
} = require('../roleplay-lore-links');
const { writeFilesWithRollback } = require('../lore-security');

test('project roleplay links normalize to safe HTML basenames', () => {
    assert.equal(normalizeStoredRoleplayFilename('roleplays/chapter-one.html'), 'chapter-one.html');
    assert.equal(normalizeStoredRoleplayFilename('./roleplays/chapter-one'), 'chapter-one.html');
    assert.equal(normalizeStoredRoleplayFilename('../chapter-one.html'), '');
    assert.equal(normalizeStoredRoleplayFilename('https://example.com/chapter-one.html'), '');
});

test('only explicit project-linked storylines qualify', () => {
    const matches = findLinkedStorylines({ storylines: [
        { title: 'One', link: 'roleplays/chapter.html', isProjectLink: true },
        { title: 'External', link: 'chapter.html', isProjectLink: false },
        { title: 'Other', link: 'other.html', isProjectLink: true }
    ] }, 'chapter.html');
    assert.deepEqual(matches.map(item => item.title), ['One']);
});

test('legacy embedded Lore data is parsed as JSON without executing scripts', () => {
    globalThis.__loreLinkProbe = 0;
    const html = `<script>var fullInfoData = {"storylines":[{"title":"Legacy","link":"chapter.html","isProjectLink":true}],"text":"} still in a string"}; globalThis.__loreLinkProbe = 1;</script>`;
    assert.equal(extractEmbeddedLoreProjectData(html).storylines[0].title, 'Legacy');
    assert.equal(globalThis.__loreLinkProbe, 0);
    delete globalThis.__loreLinkProbe;
});

test('discovery reports linked Lore projects and whether their copy already exists', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-rp-lore-links-'));
    t.after(() => fs.remove(root));

    async function project(name, storylines, copyExists) {
        const folder = path.join(root, name);
        await fs.ensureDir(path.join(folder, 'roleplays'));
        await fs.writeJson(path.join(folder, 'lore-project.json'), { schemaVersion: 1, storylines });
        await fs.writeJson(path.join(folder, 'project-config.json'), { projectId: `id-${name}` });
        if (copyExists) await fs.writeFile(path.join(folder, 'roleplays', 'chapter.html'), '<html></html>');
    }

    await project('Linked', [{ title: 'Chapter', link: 'chapter.html', isProjectLink: true }], true);
    await project('Missing copy', [{ title: 'Chapter mirror', link: 'roleplays/chapter.html', isProjectLink: true }], false);
    await project('Unrelated', [{ title: 'Other', link: 'other.html', isProjectLink: true }], true);

    const legacyFolder = path.join(root, 'Legacy');
    await fs.ensureDir(path.join(legacyFolder, 'roleplays'));
    await fs.writeJson(path.join(legacyFolder, 'project-config.json'), { projectId: 'id-Legacy', htmlFilename: 'codex.html' });
    await fs.writeFile(path.join(legacyFolder, 'codex.html'), '<script>var fullInfoData = {"storylines":[{"title":"Old chapter","link":"chapter.html","isProjectLink":true}]};</script>');
    await fs.writeFile(path.join(legacyFolder, 'roleplays', 'chapter.html'), '<html></html>');

    assert.deepEqual(await discoverLoreRoleplayTargets({ sitesFolder: root, filename: 'chapter.html' }), [
        {
            projectId: 'id-Legacy',
            projectName: 'Legacy',
            storylineTitles: ['Old chapter'],
            destinationExists: true
        },
        {
            projectId: 'id-Linked',
            projectName: 'Linked',
            storylineTitles: ['Chapter'],
            destinationExists: true
        },
        {
            projectId: 'id-Missing copy',
            projectName: 'Missing copy',
            storylineTitles: ['Chapter mirror'],
            destinationExists: false
        }
    ]);
});

test('copy planning updates HTML, shared CSS, and only matching roleplay media', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-rp-lore-copy-'));
    t.after(() => fs.remove(root));
    const source = path.join(root, 'source');
    const sites = path.join(root, 'sites');
    await fs.ensureDir(path.join(source, 'images'));
    await fs.writeFile(path.join(source, 'chapter.html'), '<html>new</html>');
    await fs.writeFile(path.join(source, 'generated.css'), '.new{}');
    await fs.writeFile(path.join(source, 'images', 'chapter-banner.png'), 'new image');
    await fs.writeFile(path.join(source, 'images', 'different-banner.png'), 'leave out');
    await fs.ensureDir(path.join(sites, 'Codex', 'roleplays'));
    await fs.writeFile(path.join(sites, 'Codex', 'roleplays', 'chapter.html'), '<html>old</html>');

    const sourceFiles = await collectRoleplaySourceFiles({ sourceProjectPath: source, filename: 'chapter.html' });
    assert.deepEqual(sourceFiles.map(file => file.relativePath), [
        'chapter.html',
        'generated.css',
        'images/chapter-banner.png'
    ]);
    await writeFilesWithRollback(buildLoreCopyWrites({
        sitesFolder: sites,
        targets: [{ projectName: 'Codex' }],
        sourceFiles
    }));

    assert.equal(await fs.readFile(path.join(sites, 'Codex', 'roleplays', 'chapter.html'), 'utf8'), '<html>new</html>');
    assert.equal(await fs.readFile(path.join(sites, 'Codex', 'roleplays', 'generated.css'), 'utf8'), '.new{}');
    assert.equal(await fs.readFile(path.join(sites, 'Codex', 'roleplays', 'images', 'chapter-banner.png'), 'utf8'), 'new image');
    assert.equal(await fs.pathExists(path.join(sites, 'Codex', 'roleplays', 'images', 'different-banner.png')), false);
});

test('RP-to-Lore routes are session-protected and update from the canonical saved copy', async () => {
    const projects = await fs.readFile(path.resolve(__dirname, '..', 'projects.js'), 'utf8');
    const sessions = await fs.readFile(path.resolve(__dirname, '..', 'toolkit-session.js'), 'utf8');
    assert.match(projects, /router\.post\('\/roleplay\/lore-links'/);
    assert.match(projects, /router\.post\('\/roleplay\/update-lore-copies'/);
    assert.match(projects, /getUserRoleplaysFolder\(userContext\)/);
    assert.match(projects, /Save the generated RP project before updating Lore Codex/);
    assert.match(projects, /const writes = buildLoreCopyWrites/);
    assert.match(projects, /writeFilesWithRollback\(writes\)/);
    assert.match(sessions, /POST \/roleplay\/lore-links/);
    assert.match(sessions, /POST \/roleplay\/update-lore-copies/);
});
