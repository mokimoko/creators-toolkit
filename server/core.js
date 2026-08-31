// Core utilities, constants, middleware, and helper functions
const fs = require('fs-extra');
const path = require('path');
const { resolvePathInside } = require('./path-security');
const multer = require('multer');
const { readJsonWithBackup, writeJsonAtomic } = require('./atomic-json-store');

// CONSTANTS
const IS_LOCAL = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
const USERS_FOLDER = path.join(__dirname, '..', 'users');
const ACCOUNTS_FILE = path.join(USERS_FOLDER, 'accounts.json');
const GUEST_FOLDER = path.join(USERS_FOLDER, 'guest');
const LEGACY_SITES_FOLDER = path.join(__dirname, 'sites'); // Keep for backward compatibility
const DEFAULT_AVATAR = 'images/default-avatar.png';

// USER CONTEXT VALIDATION
function validateUserContext(userContext) {
    if (!userContext) {
        return { valid: false, error: 'No user context provided' };
    }
    
    if (userContext.isGuest) {
        return { valid: true };
    }
    
    if (!userContext.userId || !userContext.username || !/^[A-Za-z0-9_-]{1,128}$/.test(userContext.userId)) {
        return { valid: false, error: 'Invalid user context' };
    }
    
    return { valid: true };
}

// FILE SYSTEM UTILITIES
function getUserSettingsFolder(userContext) {
    if (userContext.isGuest) {
        return resolvePathInside(GUEST_FOLDER, 'settings');
    } else {
        return resolvePathInside(USERS_FOLDER, userContext.userId, 'settings');
    }
}

function getUserSitesFolder(userContext) {
    if (userContext.isGuest) {
        return resolvePathInside(GUEST_FOLDER, 'sites');
    } else {
        return resolvePathInside(USERS_FOLDER, userContext.userId, 'sites');
    }
}

function getUserRoleplaysFolder(userContext) {
    if (userContext.isGuest) {
        return resolvePathInside(GUEST_FOLDER, 'roleplays');
    } else {
        return resolvePathInside(USERS_FOLDER, userContext.userId, 'roleplays');
    }
}

// USER ACCOUNT MANAGEMENT
async function loadAccounts() {
    try {
        return await readJsonWithBackup(ACCOUNTS_FILE, {});
    } catch (error) {
        console.error('Error loading accounts:', error);
        return {};
    }
}

async function saveAccounts(accounts) {
    try {
        await writeJsonAtomic(ACCOUNTS_FILE, accounts);
        return true;
    } catch (error) {
        console.error('Error saving accounts:', error);
        return false;
    }
}

// USER SETTINGS MANAGEMENT
async function loadUserSettings(userContext, settingType) {
    try {
        const settingsFolder = getUserSettingsFolder(userContext);
        
        const settingsFile = path.join(settingsFolder, `${settingType}.json`);
        
        if (await fs.pathExists(settingsFile)) {
            const data = await fs.readJson(settingsFile);
            
            // RECOVERY LOGIC for preferences
            if (settingType === 'preferences') {
                const needsRecovery = (!data.favorites || data.favorites.length === 0) && (!data.tags || Object.keys(data.tags).length === 0);
                
                if (needsRecovery) {
                    console.log(`🚨 Missing favorites/tags for ${userContext.isGuest ? 'guest' : userContext.username}, checking backup...`);
                    
                    const backupFile = path.join(settingsFolder, 'preferences.backup.json');
                    if (await fs.pathExists(backupFile)) {
                        const backup = await fs.readJson(backupFile);
                        const hasBackupData = (backup.favorites && backup.favorites.length > 0) || (backup.tags && Object.keys(backup.tags).length > 0);
                        
                        if (hasBackupData) {
                            console.log(`🛠️ RESTORING from backup: favorites: ${backup.favorites.length}, tags: ${Object.keys(backup.tags).length}`);
                            data.favorites = backup.favorites || [];
                            data.tags = backup.tags || {};
                            
                            // Save the recovered data back to main file
                            await fs.writeJson(settingsFile, data, { spaces: 2 });
                            console.log(`✅ Recovery complete for ${userContext.isGuest ? 'guest' : userContext.username}`);
                        }
                    }
                }
            }
            
            return data;
        }
        
        // Return defaults based on setting type
        return getDefaultSettings(settingType);
    } catch (error) {
        console.error(`Error loading ${settingType} settings:`, error);
        return getDefaultSettings(settingType);
    }
}

async function saveUserSettings(userContext, settingType, data) {
    try {
        const settingsFolder = getUserSettingsFolder(userContext);
        
        // Ensure settings folder exists
        await fs.ensureDir(settingsFolder);
        
        const settingsFile = path.join(settingsFolder, `${settingType}.json`);
        await writeJsonAtomic(settingsFile, data);
        
        // CREATE BACKUP for preferences that contain favorites/tags
        if (settingType === 'preferences' && (data.favorites || data.tags)) {
            const backupFile = path.join(settingsFolder, 'preferences.backup.json');
            const backupData = {
                favorites: data.favorites || [],
                tags: data.tags || {},
                timestamp: Date.now(),
                backupReason: 'auto_save'
            };
            await writeJsonAtomic(backupFile, backupData, { backup: false });
            console.log(`💾 Created backup for ${userContext.isGuest ? 'guest' : userContext.username} - favorites: ${(data.favorites || []).length}, tags: ${Object.keys(data.tags || {}).length}`);
        }
        
        return true;
    } catch (error) {
        console.error(`Error saving ${settingType} settings:`, error);
        return false;
    }
}

function getDefaultSettings(settingType) {
    const defaults = {
        preferences: {
            theme: 'dark',
            autoSave: true,
            defaultTemplate: 'generated.css',
            notifications: true,
            aiToolsEnabled: false 
        },
        usage: {
            toolsUsed: {},
            lastUsed: Date.now(),
            projectsCreated: 0
        }
    };
    return defaults[settingType] || {};
}

// UTILITY FUNCTIONS
function generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// HTML PARSING UTILITIES
async function extractBannerInfo(htmlContent, projectPath) {
    let bannerPath = null;
    let bannerExists = false;
    
    try {
        // First, try to extract from embedded fullInfoData
        const fullInfoDataMatch = htmlContent.match(/var fullInfoData = ({.*?});/s);
        if (fullInfoDataMatch) {
            try {
                const fullInfoData = JSON.parse(fullInfoDataMatch[1]);
                if (fullInfoData.basic && fullInfoData.basic.banner) {
                    bannerPath = fullInfoData.basic.banner;
                }
            } catch (e) {
                console.warn('Could not parse fullInfoData:', e.message);
            }
        }
        
        // If not found in embedded data, try to extract from banner image HTML
        if (!bannerPath) {
            const bannerImgMatch = htmlContent.match(/<img[^>]+class="banner-image"[^>]+src="([^"]+)"/i);
            if (bannerImgMatch) {
                bannerPath = bannerImgMatch[1];
            }
        }
        
        // If still not found, try alternative banner extraction methods
        if (!bannerPath) {
            const headerBannerMatch = htmlContent.match(/<img[^>]+alt="Banner"[^>]+src="([^"]+)"/i);
            if (headerBannerMatch) {
                bannerPath = headerBannerMatch[1];
            }
        }
        
        // Check if banner file actually exists
        if (bannerPath) {
            const normalizedBannerPath = typeof bannerPath === 'string'
                ? bannerPath.trim().replace(/\\/g, '/').replace(/^\.\//, '')
                : '';
            const segments = normalizedBannerPath.split('/');
            if (!normalizedBannerPath
                || path.isAbsolute(normalizedBannerPath)
                || /^[a-z][a-z0-9+.-]*:/i.test(normalizedBannerPath)
                || segments.some(segment => !segment || segment === '.' || segment === '..')) {
                bannerPath = null;
                return { bannerPath, bannerExists };
            }
            const fullBannerPath = resolvePathInside(projectPath, ...segments);
            bannerExists = await fs.pathExists(fullBannerPath) && (await fs.stat(fullBannerPath)).isFile();
            bannerPath = normalizedBannerPath;
            
            // If the file doesn't exist, clear the banner path
            if (!bannerExists) {
                bannerPath = null;
            }
        }
        
    } catch (error) {
        console.warn('Error extracting banner info:', error.message);
    }
    
    return {
        bannerPath: bannerPath,
        bannerExists: bannerExists
    };
}

// Multer configuration for roleplay images
// Replace the roleplayImageStorage in your core.js with this version
const roleplayImageStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        // This will be set dynamically in the route handler
        cb(null, req.imagesFolder);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        
        if (file.fieldname === 'backgroundImage') {
            // Use temporary name for background - will be renamed later
            cb(null, `temp-background-${Date.now()}${ext}`);
        } else if (file.fieldname.startsWith('storyImage_')) {
            // Use temporary name for story images - will be renamed later to avoid conflicts
            const tempIndex = file.fieldname.split('_')[1];
            cb(null, `temp-story-${tempIndex}-${Date.now()}${ext}`);
        } else {
            cb(new Error('Unknown file field'));
        }
    }
});

const roleplayImageUpload = multer({
    storage: roleplayImageStorage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 20 // Max 20 files total
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// INITIALIZATION FUNCTION
async function initializeUserSystem() {
    try {
        // Ensure users folder structure exists
        fs.ensureDirSync(USERS_FOLDER);
        fs.ensureDirSync(path.join(GUEST_FOLDER, 'sites'));
        fs.ensureDirSync(path.join(GUEST_FOLDER, 'roleplays'));
        fs.ensureDirSync(path.join(GUEST_FOLDER, 'settings'));
        
        // Initialize accounts.json if it doesn't exist
        if (!await fs.pathExists(ACCOUNTS_FILE)) {
            await writeJsonAtomic(ACCOUNTS_FILE, {}, { backup: false });
            console.log('✅ Created accounts.json');
        }
        
        console.log('✅ File-based user system initialized');
        console.log(`📁 Users folder: ${USERS_FOLDER}`);
        console.log(`👥 Accounts file: ${ACCOUNTS_FILE}`);
        
    } catch (error) {
        console.error('Error initializing user system:', error);
        throw error;
    }
}

// EXPORTS
module.exports = {
    // Constants
    IS_LOCAL,
    USERS_FOLDER,
    ACCOUNTS_FILE,
    GUEST_FOLDER,
    LEGACY_SITES_FOLDER,
    DEFAULT_AVATAR,
    
    // Validation
    validateUserContext,
    
    // File system utilities
    getUserSettingsFolder,
    getUserSitesFolder,
    getUserRoleplaysFolder,
    
    // Account management
    loadAccounts,
    saveAccounts,
    
    // Settings management
    loadUserSettings,
    saveUserSettings,
    getDefaultSettings,
    
    // Utilities
    generateUserId,
    extractBannerInfo,
    
    // Multer configurations
    roleplayImageUpload,
    
    // Initialization
    initializeUserSystem
};
