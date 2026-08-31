'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TOOLKIT_ROOT = path.resolve(__dirname, '..', '..');
const SERVER_ROOT = path.join(TOOLKIT_ROOT, 'server');
const ROLEPLAYS_ROOT = path.resolve(TOOLKIT_ROOT, 'users', 'guest', 'roleplays');
const QA_UNIVERSE = '__rp-archiver-release-qa__';
const QA_ROOT = path.resolve(ROLEPLAYS_ROOT, QA_UNIVERSE);
const PORT = 9138;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const projectData = require(path.join(TOOLKIT_ROOT, 'roleplay-converter', 'modules', 'project-data.js'));

if (path.dirname(QA_ROOT) !== ROLEPLAYS_ROOT) throw new Error('Synthetic cleanup path escaped the guest roleplays folder');
if (fs.existsSync(QA_ROOT)) throw new Error(`Refusing to overwrite an existing QA folder: ${QA_ROOT}`);

const server = spawn(process.execPath, ['server.js'], {
    cwd: SERVER_ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
    windowsHide: true
});

async function waitForServer() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
            const response = await fetch(`${BASE_URL}/roleplay-converter/`);
            if (response.ok) return;
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Release smoke server did not start');
}

function makeProject(sourceText) {
    const project = projectData.createDefaultProject();
    project.story.title = 'RP Archiver Release QA';
    project.story.universe = QA_UNIVERSE;
    project.parts = [{ id: 'part-1', title: 'Synthetic', sourceText, entries: [] }];
    project.editor.sourceText = sourceText;
    project.readThrough = {
        enabled: true,
        documentId: 'rp_release_qa_stable',
        hostedUrl: 'https://example.test/release-qa.html',
        endpoint: '/api/read-through/comments',
        cachedThreads: [{ id: 'thread-release', targets: [{ anchor: 'rp-block-00001' }] }]
    };
    return project;
}

function htmlFor(project) {
    const rendered = '<!doctype html><html><head><meta name="rp-archiver-template" content="generated.css"><title>RP Archiver Release QA</title></head><body><p data-rp-anchor="rp-block-00001">Synthetic QA</p></body></html>';
    return projectData.injectProjectData(rendered, project);
}

async function save(project) {
    const form = new FormData();
    form.append('html', htmlFor(project));
    form.append('title', project.story.title);
    form.append('universe', QA_UNIVERSE);
    form.append('cssTemplate', 'generated.css');
    form.append('userContext', JSON.stringify({ isGuest: true }));
    const response = await fetch(`${BASE_URL}/api/roleplay/save`, { method: 'POST', body: form });
    const result = await response.json();
    assert.equal(response.ok, true, result.error);
    return result;
}

async function reload(filename) {
    const response = await fetch(`${BASE_URL}/api/roleplay/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ universe: QA_UNIVERSE, filename, userContext: { isGuest: true } })
    });
    const result = await response.json();
    assert.equal(response.ok, true, result.error);
    return projectData.extractProjectData(result.content);
}

(async () => {
    try {
        await waitForServer();
        const firstProject = makeProject('Archivist: first-save');
        const firstSave = await save(firstProject);
        assert.equal(firstSave.assetManifest.html.status, 'created');
        assert.equal((await reload(firstSave.filename)).editor.sourceText, 'Archivist: first-save');

        const editedProject = makeProject('Archivist: reload, edit, and resave');
        const secondSave = await save(editedProject);
        assert.equal(secondSave.assetManifest.html.status, 'replaced');
        const reloaded = await reload(secondSave.filename);
        assert.equal(reloaded.editor.sourceText, 'Archivist: reload, edit, and resave');
        assert.equal(reloaded.readThrough.documentId, 'rp_release_qa_stable');
        assert.equal(reloaded.readThrough.cachedThreads[0].targets[0].anchor, 'rp-block-00001');
        process.stdout.write('release server smoke: passed\n');
    } finally {
        server.kill();
        if (fs.existsSync(QA_ROOT)) fs.rmSync(QA_ROOT, { recursive: true, force: true });
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
