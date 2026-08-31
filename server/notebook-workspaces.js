const express = require('express');
const fs = require('fs-extra');

// Import everything from core.js
const {
    // Constants
    IS_LOCAL,
    USERS_FOLDER,
    
    // Utilities
    validateUserContext,
    loadUserSettings,
    saveUserSettings,
    getDefaultSettings
} = require('./core');
const {
    normalizeNotebookId,
    normalizeNotebookMetadata,
    resolveLegacyNotebookFolder,
    resolveNotebookChild,
    resolveNotebookFolder,
    resolveUserNotebooksFolder
} = require('./notebook-security');
const { queueJsonWrite } = require('./cowriter-storage');

const router = express.Router();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

// Get user's notebooks base folder
function getUserNotebooksFolder(userContext) {
    return resolveUserNotebooksFolder(USERS_FOLDER, userContext);
}

// Get specific notebook folder
function getUserNotebookFolder(userContext, notebookId) {
    return resolveNotebookFolder(USERS_FOLDER, userContext, notebookId);
}

// Get notebooks metadata file path
function getNotebooksMetadataPath(userContext) {
    return resolveNotebookChild(getUserNotebooksFolder(userContext), 'notebooks.json');
}

// Get active notebook tracking file
function getActiveNotebookPath(userContext) {
    return resolveNotebookChild(getUserNotebooksFolder(userContext), 'active-notebook.json');
}

// Load notebooks metadata
async function loadNotebooksMetadata(userContext) {
    try {
        const metadataPath = getNotebooksMetadataPath(userContext);
        
        if (await fs.pathExists(metadataPath)) {
            const metadata = await fs.readJson(metadataPath);
            return metadata.notebooks || [];
        }
        
        // Return default if no metadata exists
        return [{
            id: 'default',
            name: 'Default Notebook',
            description: 'Your main notebook',
            icon: '📓',
            color: '#b1b695',
            created: Date.now(),
            lastAccessed: Date.now()
        }];
    } catch (error) {
        console.error('Error loading notebooks metadata:', error);
        return [{
            id: 'default',
            name: 'Default Notebook', 
            description: 'Your main notebook',
            icon: '📓',
            color: '#b1b695',
            created: Date.now(),
            lastAccessed: Date.now()
        }];
    }
}

// Save notebooks metadata
async function saveNotebooksMetadata(userContext, notebooks) {
    try {
        const notebooksFolder = getUserNotebooksFolder(userContext);
        await fs.ensureDir(notebooksFolder);
        
        const metadataPath = getNotebooksMetadataPath(userContext);
        const metadata = {
            notebooks: notebooks,
            lastModified: Date.now()
        };
        
        await queueJsonWrite(metadataPath, metadata);
        return true;
    } catch (error) {
        console.error('Error saving notebooks metadata:', error);
        return false;
    }
}

// Get active notebook ID
async function getActiveNotebookId(userContext) {
    try {
        const activePath = getActiveNotebookPath(userContext);
        
        if (await fs.pathExists(activePath)) {
            const activeData = await fs.readJson(activePath);
            return activeData.activeNotebookId || 'default';
        }
        
        return 'default';
    } catch (error) {
        console.error('Error loading active notebook:', error);
        return 'default';
    }
}

// Set active notebook ID
async function setActiveNotebookId(userContext, notebookId) {
    try {
        const safeNotebookId = normalizeNotebookId(notebookId);
        const notebooksFolder = getUserNotebooksFolder(userContext);
        await fs.ensureDir(notebooksFolder);
        
        const activePath = getActiveNotebookPath(userContext);
        const activeData = {
            activeNotebookId: safeNotebookId,
            lastSwitched: Date.now()
        };
        
        await queueJsonWrite(activePath, activeData);
        return true;
    } catch (error) {
        console.error('Error saving active notebook:', error);
        return false;
    }
}

// Validate notebook ID format
function isValidNotebookId(id) {
    try {
        normalizeNotebookId(id);
        return true;
    } catch {
        return false;
    }
}

router.param('notebookId', (req, res, next, notebookId) => {
    try {
        req.params.notebookId = normalizeNotebookId(notebookId);
        next();
    } catch (error) {
        res.status(400).json({ error: error.message || 'Invalid notebook identifier' });
    }
});

// =============================================================================
// MIGRATION UTILITIES
// =============================================================================

// Check if user needs migration from old structure
async function needsMigration(userContext) {
    const oldNotebookPath = resolveLegacyNotebookFolder(USERS_FOLDER, userContext);
    
    const newNotebooksPath = getUserNotebooksFolder(userContext);
    
    // Needs migration if old structure exists but new doesn't
    return (await fs.pathExists(oldNotebookPath)) && !(await fs.pathExists(newNotebooksPath));
}

// Migrate from old single notebook structure to new multi-notebook structure
async function migrateUserNotebooks(userContext) {
    try {
        const oldNotebookPath = resolveLegacyNotebookFolder(USERS_FOLDER, userContext);
        
        if (!(await fs.pathExists(oldNotebookPath))) {
            console.log('No old notebook to migrate');
            return true;
        }
        
        const newNotebooksFolder = getUserNotebooksFolder(userContext);
        const defaultNotebookPath = getUserNotebookFolder(userContext, 'default');
        
        // Create new structure
        await fs.ensureDir(newNotebooksFolder);
        
        // Move old notebook to default
        await fs.move(oldNotebookPath, defaultNotebookPath);
        
        // Create initial metadata
        const initialMetadata = [{
            id: 'default',
            name: 'Default Notebook',
            description: 'Your main notebook',
            icon: '📓',
            color: '#b1b695',
            created: Date.now(),
            lastAccessed: Date.now()
        }];
        
        await saveNotebooksMetadata(userContext, initialMetadata);
        await setActiveNotebookId(userContext, 'default');
        
        const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
        console.log(`📚 Migrated notebook data for ${userDisplay}`);
        
        return true;
    } catch (error) {
        console.error('Error migrating user notebooks:', error);
        return false;
    }
}

// =============================================================================
// ROUTES
// =============================================================================

// Get all notebooks for user
router.post('/notebooks', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebooks not available in hosted environment' });
    }

    try {
        const { userContext } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        // Check if migration is needed
        if (await needsMigration(userContext)) {
            console.log('Migration needed for user, performing migration...');
            const migrated = await migrateUserNotebooks(userContext);
            if (!migrated) {
                return res.status(500).json({ error: 'Failed to migrate notebook data' });
            }
        }

        const notebooks = await loadNotebooksMetadata(userContext);
        const activeNotebookId = await getActiveNotebookId(userContext);
        
        console.log(`📚 Loaded ${notebooks.length} notebooks for ${userContext.isGuest ? 'guest' : userContext.username}`);
        
        res.json({ 
            success: true, 
            notebooks,
            activeNotebookId
        });
        
    } catch (error) {
        console.error('Error loading notebooks:', error);
        res.status(500).json({ error: 'Failed to load notebooks' });
    }
});

// Create new notebook
router.post('/notebooks/create', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebooks not available in hosted environment' });
    }

    try {
        const { userContext, notebookData } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!notebookData || !notebookData.id || !notebookData.name) {
            return res.status(400).json({ error: 'Invalid notebook data' });
        }

        // Validate notebook ID
        if (!isValidNotebookId(notebookData.id)) {
            return res.status(400).json({ error: 'Invalid notebook ID format' });
        }

        // Load existing notebooks
        const notebooks = await loadNotebooksMetadata(userContext);
        
        // Check if notebook ID already exists
        if (notebooks.some(nb => nb.id === notebookData.id)) {
            return res.status(400).json({ error: 'Notebook ID already exists' });
        }

        // Create notebook folder structure
        const notebookPath = getUserNotebookFolder(userContext, notebookData.id);
        await fs.ensureDir(resolveNotebookChild(notebookPath, 'notes'));
        await fs.ensureDir(resolveNotebookChild(notebookPath, 'snippets'));
        
        // Create default settings and collections
        const defaultSettings = {
            collections: [''],
            defaultCollection: '',
            autoSave: true,
            autoSaveInterval: 30000,
            wordWrap: true,
            previewMode: false
        };
        
        const defaultCollections = {
            collections: [{
                key: '',
                name: 'Uncategorized',
                notes: [],
                color: '#666666',
                created: Date.now()
            }],
            lastModified: Date.now()
        };
        
        await queueJsonWrite(resolveNotebookChild(notebookPath, 'settings.json'), defaultSettings);
        await queueJsonWrite(resolveNotebookChild(notebookPath, 'collections.json'), defaultCollections);
        
        // Add to metadata
        const metadata = normalizeNotebookMetadata(notebookData);
        const newNotebook = {
            id: notebookData.id,
            ...metadata,
            created: Date.now(),
            lastAccessed: Date.now()
        };
        
        notebooks.push(newNotebook);
        await saveNotebooksMetadata(userContext, notebooks);
        
        const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
        console.log(`📓 Created notebook "${newNotebook.name}" for ${userDisplay}`);
        
        res.json({ 
            success: true, 
            message: 'Notebook created successfully',
            notebook: newNotebook
        });
        
    } catch (error) {
        if (error?.statusCode === 400) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Error creating notebook:', error);
        res.status(500).json({ error: 'Failed to create notebook' });
    }
});

// Delete notebook
router.delete('/notebooks/:notebookId', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebooks not available in hosted environment' });
    }

    try {
        const { notebookId } = req.params;
        const { userContext } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        // Can't delete default notebook
        if (notebookId === 'default') {
            return res.status(400).json({ error: 'Cannot delete default notebook' });
        }

        const notebooks = await loadNotebooksMetadata(userContext);
        const notebookIndex = notebooks.findIndex(nb => nb.id === notebookId);
        
        if (notebookIndex === -1) {
            return res.status(404).json({ error: 'Notebook not found' });
        }

        const notebook = notebooks[notebookIndex];
        
        // Delete notebook folder
        const notebookPath = getUserNotebookFolder(userContext, notebookId);
        if (await fs.pathExists(notebookPath)) {
            await fs.remove(notebookPath);
        }
        
        // Remove from metadata
        notebooks.splice(notebookIndex, 1);
        await saveNotebooksMetadata(userContext, notebooks);
        
        // If this was the active notebook, switch to default
        const activeNotebookId = await getActiveNotebookId(userContext);
        if (activeNotebookId === notebookId) {
            await setActiveNotebookId(userContext, 'default');
        }
        
        const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
        console.log(`🗑️ Deleted notebook "${notebook.name}" for ${userDisplay}`);
        
        res.json({ 
            success: true, 
            message: 'Notebook deleted successfully',
            switchedToDefault: activeNotebookId === notebookId
        });
        
    } catch (error) {
        console.error('Error deleting notebook:', error);
        res.status(500).json({ error: 'Failed to delete notebook' });
    }
});

// Switch active notebook
router.post('/notebooks/switch', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebooks not available in hosted environment' });
    }

    try {
        const { userContext, notebookId } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!notebookId) {
            return res.status(400).json({ error: 'Notebook ID is required' });
        }

        // Verify notebook exists
        const notebooks = await loadNotebooksMetadata(userContext);
        const notebook = notebooks.find(nb => nb.id === notebookId);
        
        if (!notebook) {
            return res.status(404).json({ error: 'Notebook not found' });
        }

        // Update active notebook
        await setActiveNotebookId(userContext, notebookId);
        
        // Update last accessed time
        notebook.lastAccessed = Date.now();
        await saveNotebooksMetadata(userContext, notebooks);
        
        const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
        console.log(`🔄 Switched to notebook "${notebook.name}" for ${userDisplay}`);
        
        res.json({ 
            success: true, 
            message: 'Switched notebook successfully',
            activeNotebook: notebook
        });
        
    } catch (error) {
        console.error('Error switching notebook:', error);
        res.status(500).json({ error: 'Failed to switch notebook' });
    }
});

// Update notebook metadata
router.put('/notebooks/:notebookId', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebooks not available in hosted environment' });
    }

    try {
        const { notebookId } = req.params;
        const { userContext, notebookData } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!notebookData) {
            return res.status(400).json({ error: 'Notebook data is required' });
        }

        const notebooks = await loadNotebooksMetadata(userContext);
        const notebookIndex = notebooks.findIndex(nb => nb.id === notebookId);
        
        if (notebookIndex === -1) {
            return res.status(404).json({ error: 'Notebook not found' });
        }

        // Update metadata (preserve ID and creation date)
        const notebook = notebooks[notebookIndex];
        const metadata = normalizeNotebookMetadata(notebookData, notebook);
        notebooks[notebookIndex] = {
            ...notebook,
            ...metadata,
            lastAccessed: Date.now()
        };
        
        await saveNotebooksMetadata(userContext, notebooks);
        
        const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
        console.log(`✏️ Updated notebook "${notebooks[notebookIndex].name}" for ${userDisplay}`);
        
        res.json({ 
            success: true, 
            message: 'Notebook updated successfully',
            notebook: notebooks[notebookIndex]
        });
        
    } catch (error) {
        if (error?.statusCode === 400) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Error updating notebook:', error);
        res.status(500).json({ error: 'Failed to update notebook' });
    }
});

// Get notebook statistics
router.post('/notebooks/:notebookId/stats', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebooks not available in hosted environment' });
    }

    try {
        const { notebookId } = req.params;
        const { userContext } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        // Verify notebook exists
        const notebooks = await loadNotebooksMetadata(userContext);
        if (!notebooks.some(nb => nb.id === notebookId)) {
            return res.status(404).json({ error: 'Notebook not found' });
        }

        const notebookPath = getUserNotebookFolder(userContext, notebookId);
        const notesPath = resolveNotebookChild(notebookPath, 'notes');
        const snippetsPath = resolveNotebookChild(notebookPath, 'snippets');
        
        let noteCount = 0;
        let snippetCount = 0;
        let totalWords = 0;
        
        // Count notes and calculate words
        if (await fs.pathExists(notesPath)) {
            const noteFiles = await fs.readdir(notesPath);
            noteCount = noteFiles.filter(f => f.endsWith('.json')).length;
            
            for (const file of noteFiles) {
                if (file.endsWith('.json')) {
                    try {
                        const noteData = await fs.readJson(resolveNotebookChild(notesPath, file));
                        if (noteData.content) {
                            const words = noteData.content.trim().split(/\s+/).filter(word => word.length > 0).length;
                            totalWords += words;
                        }
                    } catch (e) {
                        // Skip corrupted files
                    }
                }
            }
        }
        
        // Count snippets
        if (await fs.pathExists(snippetsPath)) {
            const snippetFiles = await fs.readdir(snippetsPath);
            snippetCount = snippetFiles.filter(f => f.endsWith('.json')).length;
        }
        
        res.json({
            success: true,
            stats: {
                notebookId,
                noteCount,
                snippetCount,
                totalWords
            }
        });
        
    } catch (error) {
        console.error('Error loading notebook stats:', error);
        res.status(500).json({ error: 'Failed to load notebook statistics' });
    }
});

module.exports = router;
