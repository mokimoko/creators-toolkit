'use strict';

const assert = require('assert/strict');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { validateUserContext } = require('../core');
const {
    normalizeLoreAssetFilename,
    normalizeLoreAssetFolder,
    normalizeLoreAssetSegment,
    normalizeLoreHtmlFilename,
    normalizeLoreProjectName,
    normalizeLoreProjectSubfolder,
    normalizeStyleAssetManifest,
    writeFilesWithRollback
} = require('../lore-security');

async function run() {
    assert.equal(normalizeLoreProjectName('Quiet Archive'), 'Quiet Archive');
    assert.equal(normalizeLoreProjectName('逐日吟'), '逐日吟');
    assert.throws(() => normalizeLoreProjectName('../escape'), /Project name/);
    assert.equal(normalizeLoreHtmlFilename('codex'), 'codex.html');
    assert.equal(normalizeLoreHtmlFilename('世界设定'), '世界设定.html');
    assert.throws(() => normalizeLoreHtmlFilename('..\\escape.html'), /safe .html basename/);
    assert.equal(normalizeLoreAssetFolder('assets/world/items'), 'assets/world/items');
    assert.throws(() => normalizeLoreAssetFolder('../outside'), /below assets/);
    assert.equal(normalizeLoreProjectSubfolder('pages/page-123'), 'pages/page-123');
    assert.throws(() => normalizeLoreProjectSubfolder('private/secrets'), /below assets or pages/);
    assert.equal(normalizeLoreAssetFilename('lorebook.json', new Set(['.json'])), 'lorebook.json');
    assert.throws(() => normalizeLoreAssetFilename('..\\escape.json', new Set(['.json'])), /not allowed/);
    assert.equal(normalizeLoreAssetSegment('item_123', 'Item identifier'), 'item_123');
    assert.equal(validateUserContext({ userId: 'user_123', username: 'fixture', isGuest: false }).valid, true);
    assert.equal(validateUserContext({ userId: '..', username: 'fixture', isGuest: false }).valid, false);

    assert.deepEqual(normalizeStyleAssetManifest([
        { source: 'images/styles/mist.png', destination: 'images/styles/mist.png' }
    ]), [
        { source: 'images/styles/mist.png', destination: 'images/styles/mist.png' }
    ]);
    assert.throws(() => normalizeStyleAssetManifest([
        { source: '../server/projects.js', destination: 'images/styles/projects.js' }
    ]), /unregistered asset/);

    const testFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'lore-security-'));
    try {
        const projectPath = path.join(testFolder, 'project.json');
        const htmlPath = path.join(testFolder, 'info.html');
        await fs.writeFile(projectPath, 'old-project', 'utf8');
        await fs.writeFile(htmlPath, 'old-html', 'utf8');

        await assert.rejects(writeFilesWithRollback([
            { path: projectPath, content: 'new-project', encoding: 'utf8' },
            { path: htmlPath, content: 'new-html', encoding: 'not-an-encoding' }
        ]));
        assert.equal(await fs.readFile(projectPath, 'utf8'), 'old-project', 'staging failure preserves project data');
        assert.equal(await fs.readFile(htmlPath, 'utf8'), 'old-html', 'staging failure preserves public HTML');

        await writeFilesWithRollback([
            { path: projectPath, content: 'new-project', encoding: 'utf8' },
            { path: htmlPath, content: 'new-html', encoding: 'utf8' }
        ]);
        assert.equal(await fs.readFile(projectPath, 'utf8'), 'new-project');
        assert.equal(await fs.readFile(htmlPath, 'utf8'), 'new-html');
        assert.equal((await fs.readdir(testFolder)).some(file => /\.(?:tmp|rollback)$/.test(file)), false);
    } finally {
        await fs.remove(testFolder);
    }

    console.log('Lore Phase 4 security checks passed: paths, allowlist, and rollback-protected writes.');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
