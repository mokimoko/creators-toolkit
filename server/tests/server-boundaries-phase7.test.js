const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const path = require('node:path');
const { createStructuredErrorPayloads, sendApiError } = require('../api-errors');

test('structured API errors supply stable codes without replacing explicit boundary codes', () => {
    let payload;
    const res = {
        statusCode: 409,
        status(code) { this.statusCode = code; return this; },
        json(body) { payload = body; return body; }
    };
    createStructuredErrorPayloads()({}, res, () => {});
    res.json({ error: 'Already exists' });
    assert.deepEqual(payload, { error: 'Already exists', code: 'CONFLICT' });

    sendApiError(res, 403, 'Wrong owner', 'OWNERSHIP_DENIED');
    assert.deepEqual(payload, { error: 'Wrong owner', code: 'OWNERSHIP_DENIED' });
});

test('path getters are pure and ordinary project debug endpoints are gated', async () => {
    const core = await fs.readFile(path.resolve(__dirname, '..', 'core.js'), 'utf8');
    const sitesGetter = core.match(/function getUserSitesFolder[\s\S]*?\n}/)?.[0] || '';
    const roleplaysGetter = core.match(/function getUserRoleplaysFolder[\s\S]*?\n}/)?.[0] || '';
    assert.doesNotMatch(sitesGetter, /ensureDir/);
    assert.doesNotMatch(roleplaysGetter, /ensureDir/);

    const projects = await fs.readFile(path.resolve(__dirname, '..', 'projects.js'), 'utf8');
    assert.match(projects, /PROJECT_DEBUG_ENABLED = IS_LOCAL && process\.env\.TOOLKIT_PROJECT_DEBUG === '1'/);
    assert.match(projects, /router\.get\('\/debug\/templates'[\s\S]*?!PROJECT_DEBUG_ENABLED/);
});
