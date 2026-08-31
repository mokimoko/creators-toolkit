const express = require('express');
const fs = require('fs-extra');

// Import everything from core.js
const {
    // Constants
    IS_LOCAL,
    USERS_FOLDER,
    
    // Utilities
    validateUserContext
} = require('./core');
const {
    normalizeNotebookId,
    normalizeNoteId,
    normalizeSnippetId,
    notebookBelongsToUser,
    resolveNotebookChild,
    resolveNotebookFolder,
    resolveNoteFile,
    resolveSnippetFile,
    resolveUserNotebooksFolder
} = require('./notebook-security');
const { queueFileOperation, queueFileOperations, queueJsonWrite } = require('./cowriter-storage');
const { applyCollectionMutationTransaction } = require('./notebook-collection-storage');
const {
    normalizeCollectionKey,
    normalizeNoteDocument,
    normalizeNotebookSettings,
    normalizeSnippetDocument
} = require('./notebook-schemas');
const {
    buildNoteArchiveEntries,
    buildSnippetArchiveEntries,
    createAttachmentHeader,
    createNoteMarkdown,
    createNotebookReadme,
    sanitizeFilename
} = require('./notebook-export-service');

const router = express.Router();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

// Get user's notebooks base folder (NEW)
function getUserNotebooksFolder(userContext) {
    return resolveUserNotebooksFolder(USERS_FOLDER, userContext);
}

// Get user's specific notebook folder (UPDATED)
function getUserNotebookFolder(userContext, notebookId = 'default') {
    return resolveNotebookFolder(USERS_FOLDER, userContext, notebookId);
}

// Get user's notes folder (UPDATED)
function getUserNotesFolder(userContext, notebookId = 'default') {
    return resolveNotebookChild(getUserNotebookFolder(userContext, notebookId), 'notes');
}

// Get user's snippets folder (UPDATED)
function getUserSnippetsFolder(userContext, notebookId = 'default') {
    return resolveNotebookChild(getUserNotebookFolder(userContext, notebookId), 'snippets');
}

function sendNotebookInputError(res, error) {
    return res.status(400).json({ error: error.message || 'Invalid Notebook storage identifier' });
}

function normalizeCollectionsPayload(collections) {
    if (!Array.isArray(collections) || collections.length > 1000) {
        throw new Error('Collections data is required');
    }

    const seenKeys = new Set();
    return collections.map(collection => {
        if (!collection || typeof collection !== 'object') {
            throw new Error('Invalid collection data');
        }

        const key = normalizeCollectionKey(collection.key);
        if (seenKeys.has(key)) throw new Error('Duplicate collection key');
        seenKeys.add(key);

        const name = String(collection.name || '').trim();
        if (!name || name.length > 200) throw new Error('Invalid collection name');

        const parent = collection.parent == null ? null : normalizeCollectionKey(collection.parent);
        const level = key ? key.split('/').length : 0;
        if (level > 4) throw new Error('Maximum nesting level (4) exceeded');

        const color = typeof collection.color === 'string' ? collection.color.trim() : '#b1b695';
        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error('Invalid collection color');

        return {
            key,
            name,
            notes: Array.isArray(collection.notes)
                ? [...new Set(collection.notes.map(normalizeNoteId))]
                : [],
            color: color.toLowerCase(),
            created: Number.isFinite(collection.created) ? collection.created : Date.now(),
            parent,
            level
        };
    });
}

router.param('noteId', (req, res, next, noteId) => {
    try {
        req.params.noteId = normalizeNoteId(noteId);
        next();
    } catch (error) {
        sendNotebookInputError(res, error);
    }
});

router.param('snippetId', (req, res, next, snippetId) => {
    try {
        req.params.snippetId = normalizeSnippetId(snippetId);
        next();
    } catch (error) {
        sendNotebookInputError(res, error);
    }
});

router.param('notebookId', (req, res, next, notebookId) => {
    try {
        req.params.notebookId = normalizeNotebookId(notebookId);
        next();
    } catch (error) {
        sendNotebookInputError(res, error);
    }
});

router.use('/notebook', async (req, res, next) => {
    try {
        const userContext = req.body?.userContext;
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }
        if (userContext.isGuest) {
            return res.status(403).json({ error: 'Notebook requires a signed-in user' });
        }

        const notebookId = normalizeNotebookId(req.body?.notebookId || 'default');
        req.body.notebookId = notebookId;

        if (req.body?.noteId !== undefined) normalizeNoteId(req.body.noteId);
        if (req.body?.noteData?.id !== undefined) normalizeNoteId(req.body.noteData.id);
        if (req.body?.snippetData?.id !== undefined) normalizeSnippetId(req.body.snippetData.id);

        if (!(await notebookBelongsToUser(fs, USERS_FOLDER, userContext, notebookId))) {
            return res.status(404).json({ error: 'Notebook not found' });
        }

        return next();
    } catch (error) {
        return sendNotebookInputError(res, error);
    }
});

// Load notebook settings
async function loadNotebookSettings(userContext, notebookId = 'default') {
    try {
        const notebookFolder = getUserNotebookFolder(userContext, notebookId);
        const settingsPath = resolveNotebookChild(notebookFolder, 'settings.json');
        
        if (await fs.pathExists(settingsPath)) {
            const settings = await fs.readJson(settingsPath);
            return normalizeNotebookSettings(settings);
        }
        
        // Return default settings
        return {
            collections: [''],
            defaultCollection: '',
            autoSave: true,
            autoSaveInterval: 30000,
            wordWrap: true,
            previewMode: false
        };
    } catch (error) {
        console.error('Error loading notebook settings:', error);
        return {
            collections: [''],
            defaultCollection: '',
            autoSave: true,
            autoSaveInterval: 30000,
            wordWrap: true,
            previewMode: false
        };
    }
}

// Save notebook settings
async function saveNotebookSettings(userContext, settings, notebookId = 'default') {
    try {
        const notebookFolder = getUserNotebookFolder(userContext, notebookId);
        await fs.ensureDir(notebookFolder);
        
        const settingsPath = resolveNotebookChild(notebookFolder, 'settings.json');
        await queueJsonWrite(settingsPath, normalizeNotebookSettings(settings));
        return true;
    } catch (error) {
        console.error('Error saving notebook settings:', error);
        return false;
    }
}

// =============================================================================
// NOTES MANAGEMENT
// =============================================================================

// Get all notes for user
router.post('/notebook/notes', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebook not available in hosted environment' });
    }

    try {
        const { userContext, notebookId = 'default' } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const notesFolder = getUserNotesFolder(userContext, notebookId);
        const notes = [];

        // Check if notes folder exists
        if (!await fs.pathExists(notesFolder)) {
            return res.json({ success: true, notes: [] });
        }
        
        const files = await fs.readdir(notesFolder);
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const notePath = resolveNotebookChild(notesFolder, file);
                    const noteData = normalizeNoteDocument(await fs.readJson(notePath));
                    notes.push(noteData);
                } catch (error) {
                    console.warn(`Failed to load note file ${file}:`, error.message);
                }
            }
        }

        // Sort by last modified (newest first)
        notes.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        
        console.log(`📝 Loaded ${notes.length} notes for ${userContext.isGuest ? 'guest' : userContext.username}`);
        res.json({ success: true, notes });
        
    } catch (error) {
        console.error('Error loading notes:', error);
        res.status(500).json({ error: 'Failed to load notes' });
    }
});

// Get specific note
router.post('/notebook/notes/get', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebook not available in hosted environment' });
    }

    try {
        const { userContext, noteId, notebookId = 'default' } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!noteId) {
            return res.status(400).json({ error: 'Note ID is required' });
        }

        const notesFolder = getUserNotesFolder(userContext, notebookId);
        const notePath = resolveNoteFile(notesFolder, noteId);

        if (!await fs.pathExists(notePath)) {
            return res.status(404).json({ error: 'Note not found' });
        }

        const noteData = normalizeNoteDocument(await fs.readJson(notePath));
        
        console.log(`📖 Loaded note "${noteData.name}" for ${userContext.isGuest ? 'guest' : userContext.username}`);
        res.json({ success: true, note: noteData });
        
    } catch (error) {
        console.error('Error loading note:', error);
        res.status(500).json({ error: 'Failed to load note' });
    }
});

// Save note
router.post('/notebook/notes/save', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebook not available in hosted environment' });
    }

    try {
        const { userContext, noteData, notebookId = 'default' } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const notesFolder = getUserNotesFolder(userContext, notebookId);
        await fs.ensureDir(notesFolder);

        const noteToSave = normalizeNoteDocument(noteData, { touch: true });
        const notePath = resolveNoteFile(notesFolder, noteToSave.id);

        await queueJsonWrite(notePath, noteToSave);
        
        const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
        console.log(`💾 Saved note "${noteToSave.name}" for ${userDisplay}`);
        
        res.json({ 
            success: true, 
            message: 'Note saved successfully',
            note: noteToSave
        });
        
    } catch (error) {
        if (error?.statusCode === 400) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Error saving note:', error);
        res.status(500).json({ error: 'Failed to save note' });
    }
});

// Delete note
router.delete('/notebook/notes/:noteId', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebook not available in hosted environment' });
    }

    try {
        const { noteId } = req.params;
        const { userContext, notebookId = 'default' } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!noteId) {
            return res.status(400).json({ error: 'Note ID is required' });
        }

        const notesFolder = getUserNotesFolder(userContext, notebookId);
        const notePath = resolveNoteFile(notesFolder, noteId);

        if (!await fs.pathExists(notePath)) {
            return res.status(404).json({ error: 'Note not found' });
        }

        // Read note name for logging before deletion
        let noteName = noteId;
        try {
            const noteData = await fs.readJson(notePath);
            noteName = noteData.name;
        } catch (e) {
            // Don't fail deletion if we can't read the name
        }

        await queueFileOperation(notePath, () => fs.remove(notePath));
        
        const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
        console.log(`🗑️ Deleted note "${noteName}" for ${userDisplay}`);
        
        res.json({ success: true, message: 'Note deleted successfully' });
        
    } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).json({ error: 'Failed to delete note' });
    }
});

// =============================================================================
// SNIPPETS MANAGEMENT
// =============================================================================

// Get all snippets for user
router.post('/notebook/snippets', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebook not available in hosted environment' });
    }

    try {
        const { userContext, notebookId = 'default' } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const snippetsFolder = getUserSnippetsFolder(userContext, notebookId);
        const snippets = [];

        // Check if snippets folder exists
        if (!await fs.pathExists(snippetsFolder)) {
            return res.json({ success: true, snippets: [] });
        }
        
        const files = await fs.readdir(snippetsFolder);
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const snippetPath = resolveNotebookChild(snippetsFolder, file);
                    const snippetData = normalizeSnippetDocument(await fs.readJson(snippetPath));
                    snippets.push(snippetData);
                } catch (error) {
                    console.warn(`Failed to load snippet file ${file}:`, error.message);
                }
            }
        }

        // Sort by creation date (newest first)
        snippets.sort((a, b) => new Date(b.created) - new Date(a.created));
        
        console.log(`🧩 Loaded ${snippets.length} snippets for ${userContext.isGuest ? 'guest' : userContext.username}`);
        res.json({ success: true, snippets });
        
    } catch (error) {
        console.error('Error loading snippets:', error);
        res.status(500).json({ error: 'Failed to load snippets' });
    }
});

// Save snippet
router.post('/notebook/snippets/save', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebook not available in hosted environment' });
    }

    try {
        const { userContext, snippetData, chatSessionId, notebookId = 'default' } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const snippetsFolder = getUserSnippetsFolder(userContext, notebookId);
        await fs.ensureDir(snippetsFolder);

        const snippetToSave = normalizeSnippetDocument(snippetData, {
            touch: true,
            chatSessionId
        });
        const snippetPath = resolveSnippetFile(snippetsFolder, snippetToSave.id);

        await queueJsonWrite(snippetPath, snippetToSave);
        
        const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
        console.log(`💾 Saved snippet "${snippetToSave.title}" for ${userDisplay}`);
        
        res.json({ 
            success: true, 
            message: 'Snippet saved successfully',
            snippet: snippetToSave
        });
        
    } catch (error) {
        if (error?.statusCode === 400) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Error saving snippet:', error);
        res.status(500).json({ error: 'Failed to save snippet' });
    }
});

// Delete snippet
router.delete('/notebook/snippets/:snippetId', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebook not available in hosted environment' });
    }

    try {
        const { snippetId } = req.params;
        const { userContext, notebookId = 'default' } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!snippetId) {
            return res.status(400).json({ error: 'Snippet ID is required' });
        }

        const snippetsFolder = getUserSnippetsFolder(userContext, notebookId);
        const snippetPath = resolveSnippetFile(snippetsFolder, snippetId);

        if (!await fs.pathExists(snippetPath)) {
            return res.status(404).json({ error: 'Snippet not found' });
        }

        // Read snippet title for logging before deletion
        let snippetTitle = snippetId;
        try {
            const snippetData = await fs.readJson(snippetPath);
            snippetTitle = snippetData.title;
        } catch (e) {
            // Don't fail deletion if we can't read the title
        }

        await queueFileOperation(snippetPath, () => fs.remove(snippetPath));
        
        const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
        console.log(`🗑️ Deleted snippet "${snippetTitle}" for ${userDisplay}`);
        
        res.json({ success: true, message: 'Snippet deleted successfully' });
        
    } catch (error) {
        console.error('Error deleting snippet:', error);
        res.status(500).json({ error: 'Failed to delete snippet' });
    }
});

// =============================================================================
// NOTEBOOK SETTINGS
// =============================================================================

// Get notebook settings
router.post('/notebook/settings', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebook not available in hosted environment' });
    }

    try {
        const { userContext, notebookId = 'default' } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const settings = await loadNotebookSettings(userContext, notebookId);
        res.json({ success: true, settings });
        
    } catch (error) {
        console.error('Error loading notebook settings:', error);
        res.status(500).json({ error: 'Failed to load notebook settings' });
    }
});

// Save notebook settings
router.put('/notebook/settings', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebook not available in hosted environment' });
    }

    try {
        const { userContext, settings, notebookId = 'default' } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!settings) {
            return res.status(400).json({ error: 'Settings data is required' });
        }

        const normalizedSettings = normalizeNotebookSettings(settings);
        const saved = await saveNotebookSettings(userContext, normalizedSettings, notebookId);
        
        if (!saved) {
            return res.status(500).json({ error: 'Failed to save notebook settings' });
        }

        res.json({ success: true, message: 'Notebook settings saved', settings: normalizedSettings });
        
    } catch (error) {
        if (error?.statusCode === 400) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Error saving notebook settings:', error);
        res.status(500).json({ error: 'Failed to save notebook settings' });
    }
});

// =============================================================================
// COLLECTIONS MANAGEMENT
// =============================================================================

// Get collections
// Get collections
router.post('/notebook/collections', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebook not available in hosted environment' });
    }

    try {
        const { userContext, notebookId = 'default' } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const notebookFolder = getUserNotebookFolder(userContext, notebookId);
        const collectionsPath = resolveNotebookChild(notebookFolder, 'collections.json');
        
        let collections = [];
        
        if (await fs.pathExists(collectionsPath)) {
            try {
                const collectionsData = await fs.readJson(collectionsPath);
                collections = normalizeCollectionsPayload(collectionsData.collections || []);
            } catch (error) {
                console.warn('Error reading collections file:', error);
            }
        }

        res.json({ success: true, collections });
        
    } catch (error) {
        console.error('Error loading collections:', error);
        res.status(500).json({ error: 'Failed to load collections' });
    }
});

// =============================================================================
// UTILITY ENDPOINTS
// =============================================================================

// Get notebook statistics
router.post('/notebook/stats', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebook not available in hosted environment' });
    }

    try {
        const { userContext, notebookId = 'default' } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const notesFolder = getUserNotesFolder(userContext, notebookId);
        const snippetsFolder = getUserSnippetsFolder(userContext, notebookId);
        
        let noteCount = 0;
        let snippetCount = 0;
        let totalWords = 0;
        
        // Count notes and words
        if (await fs.pathExists(notesFolder)) {
            const noteFiles = await fs.readdir(notesFolder);
            noteCount = noteFiles.filter(f => f.endsWith('.json')).length;
            
            for (const file of noteFiles) {
                if (file.endsWith('.json')) {
                    try {
                        const noteData = await fs.readJson(resolveNotebookChild(notesFolder, file));
                        totalWords += noteData.wordCount || 0;
                    } catch (e) {
                        // Skip corrupted files
                    }
                }
            }
        }
        
        // Count snippets
        if (await fs.pathExists(snippetsFolder)) {
            const snippetFiles = await fs.readdir(snippetsFolder);
            snippetCount = snippetFiles.filter(f => f.endsWith('.json')).length;
        }
        
        res.json({
            success: true,
            stats: {
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

// Search across notes and snippets
router.post('/notebook/search', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebook not available in hosted environment' });
    }

    try {
        const { userContext, query, searchIn, notebookId = 'default' } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!query || !query.trim()) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const searchTerm = query.toLowerCase();
        const results = {
            notes: [],
            snippets: []
        };

        // Search notes
        if (!searchIn || searchIn.includes('notes')) {
            const notesFolder = getUserNotesFolder(userContext, notebookId);
            if (await fs.pathExists(notesFolder)) {
                const noteFiles = await fs.readdir(notesFolder);
                
                for (const file of noteFiles) {
                    if (file.endsWith('.json')) {
                        try {
                            const noteData = await fs.readJson(resolveNotebookChild(notesFolder, file));
                            
                            if (noteData.name.toLowerCase().includes(searchTerm) ||
                                noteData.content.toLowerCase().includes(searchTerm)) {
                                results.notes.push({
                                    id: noteData.id,
                                    name: noteData.name,
                                    collection: noteData.collection,
                                    lastModified: noteData.lastModified,
                                    matchType: noteData.name.toLowerCase().includes(searchTerm) ? 'title' : 'content'
                                });
                            }
                        } catch (e) {
                            // Skip corrupted files
                        }
                    }
                }
            }
        }

        // Search snippets
        if (!searchIn || searchIn.includes('snippets')) {
            const snippetsFolder = getUserSnippetsFolder(userContext, notebookId);
            if (await fs.pathExists(snippetsFolder)) {
                const snippetFiles = await fs.readdir(snippetsFolder);
                
                for (const file of snippetFiles) {
                    if (file.endsWith('.json')) {
                        try {
                            const snippetData = await fs.readJson(resolveNotebookChild(snippetsFolder, file));
                            
                            if (snippetData.title.toLowerCase().includes(searchTerm) ||
                                snippetData.content.toLowerCase().includes(searchTerm) ||
                                snippetData.tags.some(tag => tag.toLowerCase().includes(searchTerm))) {
                                results.snippets.push({
                                    id: snippetData.id,
                                    title: snippetData.title,
                                    tags: snippetData.tags,
                                    created: snippetData.created,
                                    matchType: snippetData.title.toLowerCase().includes(searchTerm) ? 'title' : 
                                             snippetData.content.toLowerCase().includes(searchTerm) ? 'content' : 'tags'
                                });
                            }
                        } catch (e) {
                            // Skip corrupted files
                        }
                    }
                }
            }
        }

        console.log(`🔍 Search for "${query}" returned ${results.notes.length} notes, ${results.snippets.length} snippets`);
        res.json({ success: true, results });
        
    } catch (error) {
        console.error('Error searching notebook:', error);
        res.status(500).json({ error: 'Failed to search notebook' });
    }
});

// Save entire collections structure
router.post('/notebook/collections/save', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebook not available in hosted environment' });
    }

    try {
        const { userContext, collections, notebookId = 'default' } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const normalizedCollections = normalizeCollectionsPayload(collections);

        const notebookFolder = getUserNotebookFolder(userContext, notebookId);
        await fs.ensureDir(notebookFolder);
        
        const collectionsPath = resolveNotebookChild(notebookFolder, 'collections.json');

        // Save collections structure
        const collectionsData = {
            collections: normalizedCollections,
            lastModified: Date.now()
        };

        await queueJsonWrite(collectionsPath, collectionsData);
        
        const userDisplay = userContext.isGuest ? 'guest' : userContext.username;
        console.log(`📁 Saved ${normalizedCollections.length} collections for ${userDisplay}`);
        
        res.json({ 
            success: true, 
            message: 'Collections saved successfully'
        });
        
    } catch (error) {
        if (/^(Invalid|Duplicate|Collections data|Maximum nesting)/.test(error.message || '')) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Error saving collections:', error);
        res.status(500).json({ error: 'Failed to save collections' });
    }
});

// Apply a hierarchy change without replacing note content that may be newer in the editor.
router.post('/notebook/collections/apply', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Notebook not available in hosted environment' });
    }

    try {
        const {
            userContext,
            collections,
            assignments = [],
            notebookId = 'default'
        } = req.body;
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const normalizedCollections = normalizeCollectionsPayload(collections);
        if (!Array.isArray(assignments) || assignments.length > 10000) {
            return res.status(400).json({ error: 'Invalid collection assignments' });
        }

        const collectionKeys = new Set(normalizedCollections.map(collection => collection.key));
        collectionKeys.add('');
        const normalizedAssignments = [];
        const assignedNoteIds = new Set();
        for (const assignment of assignments) {
            const noteId = normalizeNoteId(assignment?.noteId);
            const collection = normalizeCollectionKey(assignment?.collection);
            if (!collectionKeys.has(collection)) {
                return res.status(400).json({ error: 'Assignment references an unknown collection' });
            }
            if (assignedNoteIds.has(noteId)) {
                return res.status(400).json({ error: 'Duplicate note assignment' });
            }
            assignedNoteIds.add(noteId);
            normalizedAssignments.push({ noteId, collection });
        }

        const notebookFolder = getUserNotebookFolder(userContext, notebookId);
        const notesFolder = getUserNotesFolder(userContext, notebookId);
        const collectionsPath = resolveNotebookChild(notebookFolder, 'collections.json');
        const notePaths = normalizedAssignments.map(assignment => ({
            ...assignment,
            path: resolveNoteFile(notesFolder, assignment.noteId)
        }));

        const timestamp = Date.now();
        const updatedNotes = await queueFileOperations(
            [collectionsPath, ...notePaths.map(note => note.path)],
            () => applyCollectionMutationTransaction({
                fs,
                collectionsPath,
                collections: normalizedCollections,
                noteAssignments: notePaths,
                timestamp
            })
        );

        res.json({
            success: true,
            collections: normalizedCollections,
            notes: updatedNotes
        });
    } catch (error) {
        if (error?.statusCode === 404) {
            return res.status(404).json({ error: error.message });
        }
        if (/^(Invalid|Duplicate|Collections data|Maximum nesting)/.test(error.message || '')) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Error applying collection hierarchy change:', error);
        res.status(500).json({ error: 'Failed to update collections' });
    }
});

// =============================================================================
// EXPORT FUNCTIONALITY
// =============================================================================

// Export individual note as markdown
router.post('/notebook/notes/:noteId/export', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Export not available in hosted environment' });
    }

    try {
        const { noteId } = req.params;
        const { userContext, notebookId = 'default' } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        // Load the note
        const notesFolder = getUserNotesFolder(userContext, notebookId);
        const notePath = resolveNoteFile(notesFolder, noteId);
        
        if (!await fs.pathExists(notePath)) {
            return res.status(404).json({ error: 'Note not found' });
        }

        const noteData = await fs.readJson(notePath);
        const sanitizedName = sanitizeFilename(noteData.name);
        const filename = `${sanitizedName}.md`;
        
        const markdown = createNoteMarkdown(noteData);

        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', createAttachmentHeader(filename));
        res.send(markdown);
        
    } catch (error) {
        console.error('Error exporting note:', error);
        res.status(500).json({ error: 'Failed to export note' });
    }
});

// Export full notebook as ZIP
router.post('/notebook/:notebookId/export', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Export not available in hosted environment' });
    }

    try {
        const { notebookId } = req.params;
        const { userContext } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!(await notebookBelongsToUser(fs, USERS_FOLDER, userContext, notebookId))) {
            return res.status(404).json({ error: 'Notebook not found' });
        }

        const archiver = require('archiver');
        
        // Load notebook metadata, notes, snippets, collections
        const notebookFolder = getUserNotebookFolder(userContext, notebookId);
        const notesFolder = getUserNotesFolder(userContext, notebookId);
        const snippetsFolder = getUserSnippetsFolder(userContext, notebookId);
        const collectionsPath = resolveNotebookChild(notebookFolder, 'collections.json');
        
        let notebookName = notebookId;
        const metadataPath = resolveNotebookChild(getUserNotebooksFolder(userContext), 'notebooks.json');
        if (await fs.pathExists(metadataPath)) {
            const metadata = await fs.readJson(metadataPath);
            const notebookMetadata = Array.isArray(metadata?.notebooks)
                ? metadata.notebooks.find(notebook => notebook?.id === notebookId)
                : null;
            if (notebookMetadata?.name) notebookName = notebookMetadata.name;
        }
        
        const dateStr = new Date().toISOString().split('T')[0];
        const zipFilename = `${sanitizeFilename(notebookName)}_Export_${dateStr}.zip`;
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', createAttachmentHeader(zipFilename));
        
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);
        
        // Load collections structure
        let collections = [];
        if (await fs.pathExists(collectionsPath)) {
            const collectionsData = await fs.readJson(collectionsPath);
            collections = collectionsData.collections || [];
        }
        
        // Load all notes and organize by collection
        const notes = [];
        if (await fs.pathExists(notesFolder)) {
            const noteFiles = await fs.readdir(notesFolder);
            for (const file of noteFiles) {
                if (file.endsWith('.json')) {
                    try {
                        const noteData = await fs.readJson(resolveNotebookChild(notesFolder, file));
                        notes.push(noteData);
                    } catch (e) { /* skip corrupted */ }
                }
            }
        }
        
        const snippets = [];
        if (await fs.pathExists(snippetsFolder)) {
            const snippetFiles = await fs.readdir(snippetsFolder);
            for (const file of snippetFiles) {
                if (file.endsWith('.json')) {
                    try {
                        snippets.push(await fs.readJson(resolveNotebookChild(snippetsFolder, file)));
                    } catch (error) { /* skip corrupted */ }
                }
            }
        }

        for (const entry of buildNoteArchiveEntries(notes, collections)) {
            archive.append(entry.content, { name: entry.name });
        }
        for (const entry of buildSnippetArchiveEntries(snippets)) {
            archive.append(entry.content, { name: entry.name });
        }
        
        // Add README
        const readme = createNotebookReadme(notebookName, notes.length, collections.length, snippets.length);
        archive.append(readme, { name: 'README.md' });
        
        await archive.finalize();
        
    } catch (error) {
        console.error('Error exporting notebook:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to export notebook' });
        }
    }
});

module.exports = router;
