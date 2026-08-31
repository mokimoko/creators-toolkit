const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const { readJsonWithBackup, writeJsonAtomic } = require('../atomic-json-store');
const { AccountService, findDuplicate, normalizeUsername } = require('../account-service');
const { AvatarService, validateAvatarDeclaration } = require('../avatar-service');
const { PreferenceService, validateSectionPatch } = require('../preference-service');
const projectRoot = path.resolve(__dirname, '..', '..');

test('section preference patches preserve unrelated canonical settings', async () => {
    let accounts = {
        user_a: {
            id: 'user_a',
            username: 'Alice',
            settings: { theme: 'ember', aiToolsEnabled: true }
        }
    };
    const service = new PreferenceService({
        loadAccounts: async () => structuredClone(accounts),
        saveAccounts: async next => { accounts = structuredClone(next); return true; },
        loadLegacyPreferences: async () => ({ favorites: ['site-one'] })
    });
    const context = { userId: 'user_a', username: 'Alice', isGuest: false };

    await Promise.all([
        service.patch(context, 'token-a', 'appearance', { markdownFontSize: 18 }),
        service.patch(context, 'token-a', 'sites', { tags: { 'site-one': ['favorite'] } })
    ]);
    const result = await service.get(context, 'token-a');

    assert.equal(result.preferences.theme, 'ember');
    assert.equal(result.preferences.aiToolsEnabled, true);
    assert.equal(result.preferences.markdownFontSize, 18);
    assert.deepEqual(result.preferences.favorites, ['site-one']);
    assert.deepEqual(result.preferences.tags, { 'site-one': ['favorite'] });
    assert.equal(accounts.user_a.preferenceMigration.performed, true);
});

test('atomic JSON writes retain a last-known-good backup', async t => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-atomic-phase4-'));
    t.after(() => fs.remove(folder));
    const file = path.join(folder, 'accounts.json');
    await writeJsonAtomic(file, { revision: 1 });
    await writeJsonAtomic(file, { revision: 2 });
    await fs.writeFile(file, '{broken');

    assert.deepEqual(await readJsonWithBackup(file), { revision: 1 });
});

test('guest preferences are session-scoped and preference input is validated', async () => {
    const service = new PreferenceService({ loadAccounts: async () => ({}), saveAccounts: async () => true });
    const guest = { isGuest: true };
    await service.patch(guest, 'guest-a', 'appearance', { theme: 'ember' });

    assert.equal((await service.get(guest, 'guest-a')).preferences.theme, 'ember');
    assert.equal((await service.get(guest, 'guest-b')).preferences.theme, 'default');
    assert.throws(() => validateSectionPatch('ai', { aiToolsEnabled: 'yes' }), /boolean/);
    assert.throws(() => validateSectionPatch('appearance', { unknown: true }), /Unknown/);
});

test('account identity rules are case-insensitive and normalized', () => {
    const accounts = { a: { id: 'a', username: 'Alice', email: 'ALICE@example.test' } };
    assert.equal(normalizeUsername('  Alice Smith  '), 'Alice Smith');
    assert.equal(findDuplicate(accounts, 'username', 'alice').id, 'a');
    assert.equal(findDuplicate(accounts, 'email', 'alice@EXAMPLE.test').id, 'a');
});

test('sensitive profile updates require the current password and return canonical identity', async () => {
    const passwordHash = await bcrypt.hash('current-password', 4);
    let accounts = { user_a: { id: 'user_a', username: 'Alice', email: null, passwordHash } };
    const service = new AccountService({
        loadAccounts: async () => structuredClone(accounts),
        saveAccounts: async next => { accounts = structuredClone(next); return true; },
        usersFolder: os.tmpdir(),
        clearRememberedSession: async () => {},
        updateRememberedUsername: async () => {},
        rotateToolkitSession: () => 'rotated-token',
        revokeToolkitSession: () => {},
        avatarService: { version: async () => 0 }
    });
    const context = { userId: 'user_a', username: 'Alice', isGuest: false };

    await assert.rejects(service.updateProfile(context, { username: 'Alicia' }, 'old-token'), /Current password/);
    const result = await service.updateProfile(
        context,
        { username: 'Alicia', currentPassword: 'current-password' },
        'old-token'
    );
    assert.equal(result.profile.username, 'Alicia');
    assert.equal(result.toolkitSessionToken, 'rotated-token');
});

test('account deletion stages files before removing the account record', async t => {
    const usersFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-account-phase4-'));
    t.after(() => fs.remove(usersFolder));
    const passwordHash = await bcrypt.hash('correct-password', 4);
    let accounts = { user_a: { id: 'user_a', username: 'Alice', passwordHash } };
    await fs.outputFile(path.join(usersFolder, 'user_a', 'sites', 'project.json'), '{}');
    const service = new AccountService({
        loadAccounts: async () => structuredClone(accounts),
        saveAccounts: async next => { accounts = structuredClone(next); return true; },
        usersFolder,
        clearRememberedSession: async () => {},
        updateRememberedUsername: async () => {},
        rotateToolkitSession: () => null,
        revokeToolkitSession: () => {},
        avatarService: { version: async () => 0 }
    });

    const result = await service.deleteAccount(
        { userId: 'user_a', username: 'Alice', isGuest: false },
        'correct-password',
        'toolkit-token'
    );

    assert.equal(accounts.user_a, undefined);
    assert.equal(await fs.pathExists(path.join(usersFolder, 'user_a')), false);
    assert.equal(await fs.pathExists(path.join(usersFolder, '.trash', 'account-deletions', result.deletionId)), true);
});

test('avatar upload decodes allowlisted images, normalizes storage, and resets it', async t => {
    const userRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-avatar-phase4-'));
    t.after(() => fs.remove(userRoot));
    const settingsFolder = path.join(userRoot, 'settings');
    await fs.outputFile(path.join(settingsFolder, 'avatar.png'), 'obsolete');
    const buffer = await sharp({
        create: { width: 16, height: 16, channels: 4, background: '#b87333' }
    }).png().toBuffer();
    const file = { buffer, size: buffer.length, mimetype: 'image/png', originalname: 'portrait.png' };
    const service = new AvatarService({
        getSettingsFolder: () => settingsFolder,
        defaultAvatarPath: path.join(userRoot, 'default.png')
    });

    validateAvatarDeclaration(file);
    assert.throws(() => validateAvatarDeclaration({ ...file, mimetype: 'image/jpeg' }), /do not match/);
    assert.throws(() => validateAvatarDeclaration({ ...file, size: 3 * 1024 * 1024 }), /too large/);
    await assert.rejects(
        service.upload({ userId: 'user_a', isGuest: false }, { ...file, buffer: Buffer.from('not-an-image') }),
        /valid decoded image/
    );
    const uploaded = await service.upload({ userId: 'user_a', isGuest: false }, file);
    assert.equal(uploaded.avatarUrl, '/api/user/avatar');
    assert.equal(uploaded.avatarVersion > 0, true);
    assert.equal(await fs.pathExists(path.join(settingsFolder, 'avatar.webp')), true);
    assert.equal(await fs.pathExists(path.join(settingsFolder, 'avatar.png')), false);

    const reset = await service.reset({ userId: 'user_a', isGuest: false });
    assert.equal(reset.isDefault, true);
    assert.equal(await fs.pathExists(path.join(settingsFolder, 'avatar.webp')), false);
});

test('Phase 4 browser contracts use section patches, stable avatars, and shared dialogs', () => {
    const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    const authRoutes = read('server/auth.js');
    const settings = read('main/settings.js');
    const mySites = read('main/my-sites.js');

    assert.match(authRoutes, /router\.patch\('\/user\/preferences\/:section'/);
    assert.match(authRoutes, /router\.delete\('\/user\/avatar'/);
    assert.doesNotMatch(authRoutes, /avatarUrl:.*userContext/);
    assert.doesNotMatch(settings, /onclick=/);
    assert.doesNotMatch(settings, /(?:^|[^.\w])confirm\s*\(/m);
    assert.doesNotMatch(mySites, /fetch\('\/api\/user\/preferences/);
});
