const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');
const {
    clearToolkitSessionCookie,
    createToolkitSession,
    getCanonicalUserContext,
    getRequestToken,
    getToolkitSession,
    rotateToolkitSession,
    revokeToolkitSession,
    setToolkitSessionCookie
} = require('./toolkit-session');
const {
    clearUserSession,
    createUserSession,
    getRememberedUsers,
    updateRememberedSessionUsername,
    validateSessionToken
} = require('./remembered-session');

const {
    // Constants
    IS_LOCAL,
    USERS_FOLDER,
    ACCOUNTS_FILE,
    GUEST_FOLDER,
    DEFAULT_AVATAR,
    
    // Utilities
    validateUserContext,
    getUserSettingsFolder,
    getUserSitesFolder,
    getUserRoleplaysFolder,
    loadAccounts,
    saveAccounts,
    loadUserSettings,
    saveUserSettings,
    getDefaultSettings,
    generateUserId,
    
} = require('./core');
const {
    ACCOUNT_POLICY,
    AccountError,
    AccountService,
    findDuplicate,
    normalizeEmail,
    normalizeUsername,
    validatePassword
} = require('./account-service');
const { AVATAR_MAX_BYTES, AvatarError, AvatarService } = require('./avatar-service');
const {
    PreferenceError,
    PreferenceService,
    createDefaultPreferences,
    reconcilePreferences
} = require('./preference-service');

const router = express.Router();
const avatarService = new AvatarService({
    getSettingsFolder: getUserSettingsFolder,
    defaultAvatarPath: path.join(__dirname, '..', 'main', DEFAULT_AVATAR)
});
const preferenceService = new PreferenceService({
    loadAccounts,
    saveAccounts,
    loadLegacyPreferences: async userContext => {
        const legacyPath = path.join(getUserSettingsFolder(userContext), 'preferences.json');
        if (!await fs.pathExists(legacyPath)) return {};
        try {
            return await fs.readJson(legacyPath);
        } catch (error) {
            return { legacyReadError: error.message };
        }
    }
});
const accountService = new AccountService({
    loadAccounts,
    saveAccounts,
    usersFolder: USERS_FOLDER,
    clearRememberedSession: clearUserSession,
    updateRememberedUsername: updateRememberedSessionUsername,
    rotateToolkitSession,
    revokeToolkitSession,
    avatarService
});
const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: AVATAR_MAX_BYTES, files: 1 }
}).single('avatar');

function ownedContext(req) {
    return req.body?.userContext || getCanonicalUserContext(req.toolkitSession);
}

function sendServiceError(res, error, fallback) {
    if (error instanceof AccountError || error instanceof AvatarError || error instanceof PreferenceError) {
        return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(fallback, error);
    return res.status(500).json({ error: fallback });
}

function toolkitSessionPayload(res, token) {
    setToolkitSessionCookie(res, token);
    return {
        toolkitSessionToken: token,
        // Temporary response alias for older clients during the migration.
        coWriterSessionToken: token
    };
}

// =============================================================================
// USER REGISTRATION & LOGIN
// =============================================================================

// Register new user account
router.post('/auth/register', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'User registration not available in hosted environment' });
    }

    try {
        const username = normalizeUsername(req.body.username);
        const email = normalizeEmail(req.body.email);
        const password = validatePassword(req.body.password);

        const accounts = await loadAccounts();
        if (findDuplicate(accounts, 'username', username)) return res.status(409).json({ error: 'Username already taken' });
        if (findDuplicate(accounts, 'email', email)) return res.status(409).json({ error: 'Email already registered' });

        // Create new user
        const userId = generateUserId();
        const passwordHash = await bcrypt.hash(password, 10);
        
        const newUser = {
            id: userId,
            username,
            email,
            passwordHash,
            isPremium: false,
            createdAt: Date.now(),
            lastLogin: Date.now(),
            preferences: createDefaultPreferences()
        };

        // Save to accounts
        accounts[userId] = newUser;
        const saved = await saveAccounts(accounts);
        
        if (!saved) {
            return res.status(500).json({ error: 'Failed to save account' });
        }

        // Create user folder structure
        const userFolder = path.join(USERS_FOLDER, userId);
        await fs.ensureDir(path.join(userFolder, 'sites'));
        await fs.ensureDir(path.join(userFolder, 'roleplays'));
        await fs.ensureDir(path.join(userFolder, 'settings'));

        // Initialize user settings
        await saveUserSettings({ userId, isGuest: false }, 'usage', getDefaultSettings('usage'));


        const toolkitSessionToken = createToolkitSession({
            userId,
            username,
            isGuest: false
        });

        // Return user data (without password hash)
        res.json({
            success: true,
            user: {
                id: userId,
                username: username,
                email: email,
                createdAt: newUser.createdAt
            },
            ...toolkitSessionPayload(res, toolkitSessionToken)
        });

    } catch (error) {
        return sendServiceError(res, error, 'Registration failed');
    }
});

// Login user
router.post('/auth/login', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'User login not available in hosted environment' });
    }

    try {
        const { usernameOrEmail, password, rememberMe } = req.body;
        
        if (!usernameOrEmail || !password) {
            return res.status(400).json({ error: 'Username/email and password are required' });
        }

        // Load accounts
        const accounts = await loadAccounts();
        
        // Find user by username or email
        const normalizedLogin = String(usernameOrEmail).trim().toLocaleLowerCase('en-US');
        const user = Object.values(accounts).find(u => (
            String(u.username).toLocaleLowerCase('en-US') === normalizedLogin
            || (u.email && String(u.email).toLocaleLowerCase('en-US') === normalizedLogin)
        ));

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Verify password
        const passwordValid = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValid) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        // Update last login
        user.lastLogin = Date.now();
        accounts[user.id] = user;
        await saveAccounts(accounts);

        // Remember only a random login token; never retain a recoverable password.
        let sessionToken = null;
        if (rememberMe) {
            sessionToken = await createUserSession(user.id, user.username);
        } else {
            // If they unchecked remember me, clear any existing session
            await clearUserSession(user.id);
        }


        const toolkitSessionToken = createToolkitSession({
            userId: user.id,
            username: user.username,
            isGuest: false
        });

        // Return user data with the remembered-login token and CoWriter access token
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                lastLogin: user.lastLogin
            },
            sessionToken,
            ...toolkitSessionPayload(res, toolkitSessionToken)
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Validate session token
router.post('/auth/validate-session', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Session validation not available in hosted environment' });
    }

    try {
        const { sessionToken } = req.body;
        
        if (!sessionToken) {
            return res.json({ valid: false });
        }

        const sessionData = await validateSessionToken(sessionToken);
        
        if (!sessionData) {
            return res.json({ valid: false });
        }

        // Load user account
        const accounts = await loadAccounts();
        const user = accounts[sessionData.userId];
        
        if (!user) {
            return res.json({ valid: false });
        }

        const rotatedRememberedToken = sessionData.requiresRotation
            ? await createUserSession(user.id, user.username)
            : null;


        const toolkitSessionToken = createToolkitSession({
            userId: user.id,
            username: user.username,
            isGuest: false
        });

        res.json({
            valid: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            },
            ...(rotatedRememberedToken ? { sessionToken: rotatedRememberedToken } : {}),
            ...toolkitSessionPayload(res, toolkitSessionToken)
        });

    } catch (error) {
        console.error('Session validation error:', error);
        res.json({ valid: false });
    }
});

// Issue a short-lived server-owned session for guest Toolkit access.
function createGuestToolkitSession(req, res) {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Guest sessions not available in hosted environment' });
    }

    const toolkitSessionToken = createToolkitSession({ isGuest: true });
    return res.json({ success: true, ...toolkitSessionPayload(res, toolkitSessionToken) });
}

router.post('/auth/toolkit-session/guest', createGuestToolkitSession);
router.post('/auth/cowriter-session/guest', createGuestToolkitSession);

// Restore an ordinary (non-remembered) login after a same-tab reload.
async function validateToolkitSession(req, res) {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Session validation not available in hosted environment' });
    }

    try {
        const token = getRequestToken(req);
        const session = getToolkitSession(token);
        if (!session) {
            clearToolkitSessionCookie(res);
            return res.json({ valid: false });
        }

        if (session.isGuest) {
            return res.json({
                valid: true,
                user: { username: 'Guest', isGuest: true },
                ...toolkitSessionPayload(res, token)
            });
        }

        const accounts = await loadAccounts();
        const user = accounts[session.userId];
        if (!user) return res.json({ valid: false });

        return res.json({
            valid: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            },
            ...toolkitSessionPayload(res, token)
        });
    } catch (error) {
        console.error('Toolkit session validation error:', error);
        return res.status(500).json({ valid: false });
    }
}

router.post('/auth/toolkit-session/validate', validateToolkitSession);
router.post('/auth/cowriter-session/validate', validateToolkitSession);

async function logoutToolkitSession(req, res) {
    try {
        const token = getRequestToken(req);
        const session = getToolkitSession(token);
        if (req.body?.forgetRemembered === true && session && !session.isGuest) {
            await clearUserSession(session.userId);
        }
        preferenceService.clearGuest(token);
        revokeToolkitSession(token);
        clearToolkitSessionCookie(res);
        return res.json({ success: true });
    } catch (error) {
        return sendServiceError(res, error, 'Logout failed');
    }
}

router.post('/auth/toolkit-session/logout', logoutToolkitSession);
router.post('/auth/cowriter-session/logout', logoutToolkitSession);

router.post('/auth/get-remembered-credentials', (req, res) => {
    return res.status(410).json({
        found: false,
        error: 'Password retrieval is no longer supported'
    });
});

router.get('/auth/account-policy', (req, res) => {
    res.json(ACCOUNT_POLICY);
});

// Get list of registered users (for login screen) - ONLY REMEMBERED USERS
router.get('/auth/users', async (req, res) => {
    if (!IS_LOCAL) {
        return res.json({ users: [] });
    }

    try {
        const rememberedUsers = await getRememberedUsers(); // CHANGED THIS
        
        // Return only safe user info
        const users = rememberedUsers.map(user => ({
            id: user.userId,
            username: user.username,
            // Private avatar data is available after the account owns a Toolkit session.
            avatar: `/${DEFAULT_AVATAR}`
        }));

        res.json({ users });

    } catch (error) {
        console.error('Error loading users list:', error);
        res.json({ users: [] });
    }
});

// =============================================================================
// USER PROFILE MANAGEMENT
// =============================================================================

// Get user profile
router.post('/user/profile', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'User profiles not available in hosted environment' });
    }
    try {
        return res.json(await accountService.getProfile(ownedContext(req)));
    } catch (error) {
        return sendServiceError(res, error, 'Failed to load profile');
    }
});

// Update user profile
router.put('/user/profile', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'User profile updates not available in hosted environment' });
    }
    try {
        const result = await accountService.updateProfile(
            ownedContext(req),
            req.body.updates,
            req.toolkitSessionToken
        );
        return res.json({
            success: true,
            user: result.profile,
            ...(result.toolkitSessionToken
                ? toolkitSessionPayload(res, result.toolkitSessionToken)
                : {}),
            rememberedSessionRevoked: result.rememberedSessionRevoked
        });
    } catch (error) {
        return sendServiceError(res, error, 'Failed to update profile');
    }
});

// =============================================================================
// AVATAR MANAGEMENT
// =============================================================================

// Upload user avatar
router.post('/user/avatar', (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Avatar uploads not available in hosted environment' });
    }
    avatarUpload(req, res, async err => {
        if (err) {
            const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 2MB)' : err.message;
            return res.status(400).json({ error: message || 'Upload failed' });
        }
        try {
            const avatar = await avatarService.upload(ownedContext(req), req.file);
            return res.json({
                success: true,
                message: 'Avatar uploaded successfully',
                ...avatar
            });
        } catch (error) {
            return sendServiceError(res, error, 'Failed to process avatar upload');
        }
    });
});

// Serve user avatar
router.get('/user/avatar', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Avatar serving not available in hosted environment' });
    }
    try {
        return res.sendFile(await avatarService.resolve(ownedContext(req)));
    } catch (error) {
        return sendServiceError(res, error, 'Failed to serve avatar');
    }
});

router.delete('/user/avatar', async (req, res) => {
    if (!IS_LOCAL) return res.status(403).json({ error: 'Avatar reset not available in hosted environment' });
    try {
        return res.json({ success: true, ...await avatarService.reset(ownedContext(req)) });
    } catch (error) {
        return sendServiceError(res, error, 'Failed to reset avatar');
    }
});

// =============================================================================
// USER PREFERENCES & SETTINGS
// =============================================================================

// Save user preferences (now stored in accounts.json)
router.post('/user/preferences', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'User preferences not available in hosted environment' });
    }
    try {
        const result = await preferenceService.patchLegacy(
            ownedContext(req),
            req.toolkitSessionToken,
            req.body.preferences
        );
        return res.json({ success: true, compatibilityRoute: true, ...result });
    } catch (error) {
        return sendServiceError(res, error, 'Failed to save preferences');
    }
});

// Get user preferences (now from accounts.json)
router.post('/user/preferences/get', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'User preferences not available in hosted environment' });
    }
    try {
        return res.json(await preferenceService.get(ownedContext(req), req.toolkitSessionToken));
    } catch (error) {
        return sendServiceError(res, error, 'Failed to load preferences');
    }
});

router.patch('/user/preferences/:section', async (req, res) => {
    if (!IS_LOCAL) return res.status(403).json({ error: 'User preferences not available in hosted environment' });
    try {
        const result = await preferenceService.patch(
            ownedContext(req),
            req.toolkitSessionToken,
            req.params.section,
            req.body.changes
        );
        return res.json({ success: true, ...result });
    } catch (error) {
        return sendServiceError(res, error, 'Failed to patch preferences');
    }
});

router.post('/auth/update-user', (req, res) => {
    res.status(410).json({ error: 'Use PUT /api/user/profile for account updates' });
});

// =============================================================================
// MIGRATION & LEGACY SUPPORT
// =============================================================================

// Migration endpoint - Move localStorage data to files
router.post('/migrate/localStorage', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Migration not available in hosted environment' });
    }

    try {
        const { users, session, preferences, usage } = req.body;
        let migratedCount = 0;
        const migrationReports = [];

        // Migrate user accounts
        if (users) {
            const accounts = await loadAccounts();
            
            for (const [userId, userData] of Object.entries(users)) {
                if (!accounts[userId]) {
                    // Hash the password if it's plain text
                    let passwordHash = userData.password;
                    if (!userData.password.startsWith('$2b$')) {
                        passwordHash = await bcrypt.hash(userData.password, 10);
                    }

                    const reconciledPreferences = reconcilePreferences(
                        null,
                        userData.settings || {},
                        preferences || {}
                    );
                    accounts[userId] = {
                        id: userId,
                        username: userData.username,
                        email: userData.email,
                        passwordHash: passwordHash,
                        createdAt: userData.createdAt || Date.now(),
                        lastLogin: Date.now(),
                        preferences: reconciledPreferences.preferences,
                        preferenceMigration: {
                            ...reconciledPreferences.report,
                            importSource: 'legacy-local-storage'
                        }
                    };
                    migrationReports.push({ userId, ...accounts[userId].preferenceMigration });

                    // Create user folder structure
                    const userFolder = path.join(USERS_FOLDER, userId);
                    await fs.ensureDir(path.join(userFolder, 'sites'));
                    await fs.ensureDir(path.join(userFolder, 'roleplays'));
                    await fs.ensureDir(path.join(userFolder, 'settings'));

                    // Migrate avatars through the same decoder and format policy as new uploads.
                    if (userData.avatar && userData.avatar.startsWith('data:')) {
                        try {
                            const match = userData.avatar.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
                            if (!match) throw new Error('Legacy avatar format is not supported');
                            const extension = match[1] === 'image/jpeg' ? '.jpg' : `.${match[1].split('/')[1]}`;
                            await avatarService.upload(
                                { userId, username: userData.username, isGuest: false },
                                {
                                    buffer: Buffer.from(match[2], 'base64'),
                                    size: Buffer.byteLength(match[2], 'base64'),
                                    mimetype: match[1],
                                    originalname: `legacy-avatar${extension}`
                                }
                            );
                        } catch (avatarError) {
                            console.warn(`Failed to migrate avatar for ${userData.username}:`, avatarError.message);
                        }
                    }

                    migratedCount++;
                }
            }

            await saveAccounts(accounts);
        }

        console.log(`✅ Migrated ${migratedCount} users from localStorage to files`);

        res.json({
            success: true,
            message: `Successfully migrated ${migratedCount} users`,
            migratedCount,
            preferenceMigrationReports: migrationReports
        });

    } catch (error) {
        console.error('Migration error:', error);
        res.status(500).json({ error: 'Migration failed' });
    }
});

// =============================================================================
// DEBUG ENDPOINTS (for troubleshooting)
// =============================================================================

// Diagnostic endpoint is opt-in and absent from ordinary local releases.
if (process.env.TOOLKIT_AUTH_DEBUG === '1') router.post('/debug/avatar-folder', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Debug endpoints not available in hosted environment' });
    }

    try {
        const { userContext } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const settingsFolder = getUserSettingsFolder(userContext);
        
        console.log('🛠 Debug info:');
        console.log('  - User context:', userContext);
        console.log('  - Settings folder:', settingsFolder);
        console.log('  - USERS_FOLDER:', USERS_FOLDER);
        
        // Check if folder exists
        const exists = await fs.pathExists(settingsFolder);
        console.log('  - Folder exists:', exists);
        
        if (!exists) {
            // Try to create it
            await fs.ensureDir(settingsFolder);
            console.log('  - Created folder successfully');
        }
        
        // Check permissions by creating a test file
        const testFile = path.join(settingsFolder, 'test.txt');
        await fs.writeFile(testFile, 'test');
        await fs.remove(testFile);
        console.log('  - Write permissions: OK');
        
        res.json({
            success: true,
            settingsFolder: settingsFolder,
            exists: await fs.pathExists(settingsFolder),
            writable: true
        });
        
    } catch (error) {
        console.error('❌ Debug error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete user account and all associated data
router.delete('/auth/delete-account', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Account deletion not available in hosted environment' });
    }
    try {
        const result = await accountService.deleteAccount(
            ownedContext(req),
            req.body.password,
            req.toolkitSessionToken
        );
        clearToolkitSessionCookie(res);
        return res.json({
            success: true,
            message: 'Account deleted and user files moved to recoverable staging',
            ...result
        });
    } catch (error) {
        return sendServiceError(res, error, 'Failed to delete account');
    }
});

module.exports = router;
