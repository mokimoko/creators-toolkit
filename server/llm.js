const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const {
    createKeyBinding,
    deleteCredentialFile,
    readCredentialFile,
    writeCredentialFile
} = require('./cowriter-key-store');
const {
    CoWriterInputError,
    normalizeOpaqueId,
    normalizeProviderId,
    resolveOpaqueFile
} = require('./cowriter-security');
const {
    safeErrorDetails,
    toPublicError
} = require('./cowriter-provider-errors');
const {
    validateChatData,
    validateChatRequest,
    validateSettings,
    validateWorldContext
} = require('./cowriter-schemas');
const {
    migrateChatData,
    migrateSettingsData,
    migrateWorldContext
} = require('./cowriter-migrations');
const {
    queueJsonWrite
} = require('./cowriter-storage');
const {
    loadProviderRegistry,
    publicProviderList
} = require('./cowriter-provider-registry');
const {
    listProviderModels,
    sendProviderChat
} = require('./cowriter-provider-client');
const {
    normalizeProviderCredential
} = require('./cowriter-provider-credentials');
const {
    buildCanonicalPrompt
} = require('./cowriter-prompt-builder');
const {
    resolvePathInside
} = require('./path-security');

// Import everything from core.js
const {
    // Constants
    IS_LOCAL,
    USERS_FOLDER,
    GUEST_FOLDER,
    
    // Utilities
    validateUserContext,
    loadUserSettings,
    saveUserSettings,
    getDefaultSettings
} = require('./core');

const router = express.Router();

// =============================================================================
// CONSTANTS & CONFIGURATION
// =============================================================================

const COWRITER_FOLDER = 'cowriter';
const COWRITER_DEBUG = process.env.COWRITER_DEBUG === '1';
const modelCatalogMemoryCache = new Map();

function publicRouteError(error, fallbackMessage, fallbackStatus = 500) {
    if (error instanceof CoWriterInputError) {
        error.safeForClient = true;
    }
    return toPublicError(error, fallbackMessage, fallbackStatus);
}

function debugLog(...args) {
    if (COWRITER_DEBUG) {
        console.log(...args);
    }
}

function getDefaultCoWriterSettings() {
    return {
        schemaVersion: 1,
        tone: '',
        style: 'collaborative',
        templateId: '',
        worldContextId: '',
        provider: 'google',
        model: 'gemini-1.5-flash',
        openRouterFreeOnly: false,
        nanoGptMode: 'account',
        hasApiKey: false
    };
}

function rejectGuestPersistence(userContext, res) {
    if (userContext?.isGuest !== true) return false;
    res.status(403).json({ error: 'Guest CoWriter data is available for this session only' });
    return true;
}

function modelCatalogCacheKey(userContext, provider, mode) {
    return `${userContext.isGuest ? 'guest' : userContext.userId}:${provider}:${mode}`;
}

async function saveModelCatalog(userContext, provider, mode, models) {
    const record = { schemaVersion: 1, provider, mode, updatedAt: Date.now(), models };
    modelCatalogMemoryCache.set(modelCatalogCacheKey(userContext, provider, mode), record);
    if (userContext.isGuest) return;

    const folder = getUserCoWriterFolder(userContext, 'model-cache');
    const filePath = resolveOpaqueFile(folder, `${provider}_${mode}`, '.json', 'Model cache identifier');
    await queueJsonWrite(filePath, record);
}

async function loadModelCatalog(userContext, provider, mode) {
    const memoryRecord = modelCatalogMemoryCache.get(modelCatalogCacheKey(userContext, provider, mode));
    if (memoryRecord) return memoryRecord.models;
    if (userContext.isGuest) return null;

    const folder = getUserCoWriterFolder(userContext, 'model-cache');
    const filePath = resolveOpaqueFile(folder, `${provider}_${mode}`, '.json', 'Model cache identifier');
    if (!await fs.pathExists(filePath)) return null;
    const record = await fs.readJson(filePath);
    if (!record || record.provider !== provider || record.mode !== mode || !Array.isArray(record.models)) return null;
    modelCatalogMemoryCache.set(modelCatalogCacheKey(userContext, provider, mode), record);
    return record.models;
}

// Get user's CoWriter folder structure
function getUserCoWriterFolder(userContext, subfolder = '') {
    const userFolder = userContext.isGuest
        ? GUEST_FOLDER
        : resolvePathInside(USERS_FOLDER, userContext.userId);
    const baseFolder = resolvePathInside(userFolder, COWRITER_FOLDER);

    return subfolder ? resolvePathInside(baseFolder, subfolder) : baseFolder;
}

async function loadProviders() {
    return (await loadProviderRegistry()).providers;
}

async function getRegisteredProviderId(provider) {
    return normalizeProviderId(provider, await loadProviders());
}

function generationSettings(providerConfig = {}) {
    const configured = providerConfig.defaultGenerationConfig || {};
    return {
        temperature: configured.temperature ?? 0.7,
        maxOutputTokens: configured.maxOutputTokens ?? 2048,
        topP: configured.topP ?? 0.9,
        topK: configured.topK ?? 40
    };
}

// Load the default writing presets used by the canonical prompt builder.
async function loadPrompts() {
    try {
        const promptsPath = path.join(__dirname, '..', 'main', 'cowriter', 'prompts.json');
        if (await fs.pathExists(promptsPath)) {
            return await fs.readJson(promptsPath);
        }
    } catch (error) {
        console.error('Error loading prompts in llm.js:', error);
    }
    
    // Simple fallback with just what llm.js needs
    return {
        mainPrompt: "You are a helpful creative writing assistant.",
        tones: {},
        styles: {},
        templates: {},
        quickPrompts: {}
    };
}

// =============================================================================
// PROVIDER & MODEL MANAGEMENT
// =============================================================================

// Get available providers
router.get('/llm/providers', async (req, res) => {
    try {
        const providerList = publicProviderList(await loadProviderRegistry());
        
        res.json({
            success: true,
            providers: providerList
        });
    } catch (error) {
        console.error('Error loading providers:', error);
        res.status(500).json({ error: 'Failed to load providers' });
    }
});

// Get models for a specific provider
router.get('/llm/models/:provider', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'LLM functionality not available in hosted environment' });
    }

    try {
        const { provider: requestedProvider } = req.params;
        const { userContext, mode: requestedMode } = req.query;
        
        if (!userContext) {
            return res.status(400).json({ error: 'User context required' });
        }

        const parsedUserContext = JSON.parse(userContext);
        const validation = validateUserContext(parsedUserContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const providers = await loadProviders();
        const provider = normalizeProviderId(requestedProvider, providers);
        const providerConfig = providers[provider];

        const mode = provider === 'nanogpt'
            ? (['account', 'subscription', 'paid'].includes(requestedMode) ? requestedMode : 'account')
            : 'account';
        const apiKey = await loadApiKey(parsedUserContext, provider);
        let models;
        let source = 'live';
        try {
            if (!apiKey) throw new CoWriterInputError(`No API key configured for ${provider}`);
            models = await listProviderModels(provider, { apiKey, mode });
            await saveModelCatalog(parsedUserContext, provider, mode, models);
        } catch (apiError) {
            const cachedModels = await loadModelCatalog(parsedUserContext, provider, mode);
            if (cachedModels) {
                models = cachedModels;
                source = 'cache';
            } else {
                models = providerConfig.fallbackModels || [];
                source = 'fallback';
            }
            console.warn(`API fetch failed for ${provider}; using ${source}.`, safeErrorDetails(apiError));
        }

        res.json({
            success: true,
            provider: provider,
            models: models,
            source,
            fromAPI: source === 'live',
            fallback: source === 'fallback'
        });

    } catch (error) {
        console.error('Error getting models:', safeErrorDetails(error));
        const publicError = publicRouteError(error, 'Failed to get models');
        res.status(publicError.statusCode).json({ error: publicError.message, code: publicError.code });
    }
});

// =============================================================================
// CHAT FUNCTIONALITY
// =============================================================================

// Send message to LLM
router.post('/llm/chat', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'LLM functionality not available in hosted environment' });
    }

    try {
        validateChatRequest(req.body);
        const { userContext, message, chatHistory, settings } = req.body;
        
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!settings || !settings.provider || !settings.model) {
            return res.status(400).json({ error: 'Provider and model settings required' });
        }

        const provider = await getRegisteredProviderId(settings.provider);
        const normalizedSettings = { ...settings, provider };
        const providers = await loadProviders();
        const providerConfig = providers[provider];

        // Guest keys remain only in browser memory; account keys stay server-side.
        const apiKey = userContext.isGuest
            ? (normalizedSettings.apiKey ? normalizeProviderCredential(provider, normalizedSettings.apiKey) : null)
            : await loadApiKey(userContext, provider);
        if (!apiKey) {
            return res.status(400).json({ error: `No API key configured for ${provider}` });
        }

        const prompt = await buildCanonicalPrompt({
            message,
            chatHistory,
            settings: normalizedSettings,
            defaultPrompts: await loadPrompts(),
            loadCustomPrompt: loadCustomPromptContent,
            providerConfig
        });
        debugLog('[CoWriter] Prompt assembled.', { provider, model: normalizedSettings.model, ...prompt.metadata });

        const requestController = new AbortController();
        req.once('aborted', () => requestController.abort());
        const result = await sendProviderChat(provider, {
            apiKey,
            model: normalizedSettings.model,
            prompt,
            generation: generationSettings(providerConfig),
            mode: normalizedSettings.nanoGptMode || 'account',
            signal: requestController.signal
        });
        debugLog('[CoWriter] Provider response received.', {
            provider,
            model: normalizedSettings.model,
            characters: result.text.length,
            usage: result.usage
        });

        res.json({
            success: true,
            response: result.text,
            model: normalizedSettings.model,
            provider,
            usage: result.usage
        });

    } catch (error) {
        console.error('Error in LLM chat:', safeErrorDetails(error));
        const publicError = publicRouteError(error, 'Failed to process chat request');
        res.status(publicError.statusCode).json({ error: publicError.message, code: publicError.code });
    }
});

// Send request to LLM provider
async function sendToLLM(provider, model, prompt, apiKey) {
    const providers = await loadProviders();
    const providerId = normalizeProviderId(provider, providers);
    const result = await sendProviderChat(providerId, {
        apiKey,
        model,
        prompt: { system: '', messages: [{ role: 'user', content: prompt }] },
        generation: generationSettings(providers[providerId]),
        mode: 'account'
    });
    return result.text;
}

// Test LLM connection
router.post('/llm/test-connection', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'LLM functionality not available in hosted environment' });
    }

    try {
        const {
            userContext,
            provider: requestedProvider,
            model,
            apiKey: candidateApiKey,
            nanoGptMode = 'account'
        } = req.body;
        
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const provider = await getRegisteredProviderId(requestedProvider);
        validateSettings({ provider, model, nanoGptMode, ...(candidateApiKey && { apiKey: candidateApiKey }) }, {
            allowApiKey: true,
            requireConnection: true
        });

        // Candidate keys can be tested without first persisting them.
        const apiKey = candidateApiKey
            ? normalizeProviderCredential(provider, candidateApiKey)
            : await loadApiKey(userContext, provider);
        if (!apiKey) {
            return res.status(400).json({ error: `No API key configured for ${provider}` });
        }

        // Send test message
        const testPrompt = "Hello! This is a connection test. Please respond with 'Connection successful!' if you receive this message.";
        const providers = await loadProviders();
        const result = await sendProviderChat(provider, {
            apiKey,
            model,
            prompt: { system: '', messages: [{ role: 'user', content: testPrompt }] },
            generation: generationSettings(providers[provider]),
            mode: nanoGptMode
        });
        
        debugLog('[CoWriter] Connection test succeeded.', { provider, model });

        res.json({
            success: true,
            message: 'Connection test successful',
            response: result.text,
            provider: provider,
            model: model
        });

    } catch (error) {
        console.error('Connection test failed:', safeErrorDetails(error));
        const publicError = publicRouteError(error, 'Connection test failed', 400);
        res.status(publicError.statusCode).json({
            success: false,
            error: publicError.message,
            code: publicError.code
        });
    }
});

// =============================================================================
// SETTINGS MANAGEMENT
// =============================================================================

// Get CoWriter settings
router.post('/cowriter/settings', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'CoWriter settings not available in hosted environment' });
    }

    try {
        const { userContext } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        // Load settings from user's cowriter folder
        const settingsPath = getUserCoWriterFolder(userContext, 'settings.json');
        
        let settings = getDefaultCoWriterSettings();

        if (userContext.isGuest) {
            return res.json({ success: true, settings, ephemeral: true });
        }

        if (await fs.pathExists(settingsPath)) {
            const savedSettings = migrateSettingsData(await fs.readJson(settingsPath));
            settings = { ...settings, ...savedSettings };
            validateSettings(settings, { requireConnection: true });
        }

        // Check if API key exists (don't send the actual key)
        const hasApiKey = await checkApiKeyExists(userContext, settings.provider);
        settings.hasApiKey = hasApiKey;

        res.json({
            success: true,
            settings: settings
        });

    } catch (error) {
        console.error('Error loading CoWriter settings:', error);
        res.status(500).json({ error: 'Failed to load settings' });
    }
});

// Get API key status for a specific provider
router.post('/cowriter/api-key', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'CoWriter API keys not available in hosted environment' });
    }

    try {
        const { userContext, provider } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (!provider) {
            return res.status(400).json({ error: 'Provider is required' });
        }

        const registeredProvider = await getRegisteredProviderId(provider);

        if (userContext.isGuest) {
            return res.json({
                success: true,
                provider: registeredProvider,
                hasApiKey: false,
                ephemeral: true
            });
        }

        // Check if API key exists for this provider
        const hasApiKey = await checkApiKeyExists(userContext, registeredProvider);

        res.json({
            success: true,
            provider: registeredProvider,
            hasApiKey: hasApiKey
        });

    } catch (error) {
        console.error('Error checking API key:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to check API key' });
    }
});

// Delete the stored API key for one provider
router.delete('/cowriter/api-key', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'CoWriter API keys not available in hosted environment' });
    }

    try {
        const { userContext, provider } = req.body;
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const providerId = await getRegisteredProviderId(provider);
        if (userContext.isGuest) {
            return res.json({ success: true, provider: providerId, removed: false, ephemeral: true });
        }
        const providersFolder = getUserCoWriterFolder(userContext, 'providers');
        const keyPath = resolveOpaqueFile(providersFolder, providerId, '.key', 'Provider identifier');
        const removed = await deleteCredentialFile(keyPath);

        res.json({
            success: true,
            provider: providerId,
            removed
        });
    } catch (error) {
        console.error('Error deleting API key:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete API key' });
    }
});

// Save CoWriter settings
router.put('/cowriter/settings', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'CoWriter settings not available in hosted environment' });
    }

    try {
        const { userContext, settings } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        validateSettings(settings, { allowApiKey: true, requireConnection: true });

        const provider = await getRegisteredProviderId(settings.provider);

        if (userContext.isGuest) {
            return res.json({
                success: true,
                message: 'Guest settings applied for this session only',
                ephemeral: true
            });
        }

        // Ensure CoWriter folder exists
        const cowriterFolder = getUserCoWriterFolder(userContext);
        await fs.ensureDir(cowriterFolder);

        const settingsPath = getUserCoWriterFolder(userContext, 'settings.json');
        const existingSettings = await fs.pathExists(settingsPath)
            ? migrateSettingsData(await fs.readJson(settingsPath))
            : {};
        const settingsToSave = migrateSettingsData({ ...existingSettings, ...settings, provider });
        await queueJsonWrite(settingsPath, settingsToSave);

        // Handle API key separately if provided
        if (settings.apiKey) {
            await saveApiKey(userContext, provider, settings.apiKey);
        }

        debugLog('[CoWriter] Settings saved.', { guest: userContext.isGuest });

        res.json({
            success: true,
            message: 'Settings saved successfully'
        });

    } catch (error) {
        console.error('Error saving CoWriter settings:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to save settings' });
    }
});

// =============================================================================
// API KEY MANAGEMENT
// =============================================================================

// Save encrypted API key
async function saveApiKey(userContext, provider, apiKey) {
    if (userContext.isGuest) {
        throw new CoWriterInputError('Guest API keys cannot be persisted');
    }
    const providersFolder = getUserCoWriterFolder(userContext, 'providers');
    await fs.ensureDir(providersFolder);

    const providerId = await getRegisteredProviderId(provider);
    const keyPath = resolveOpaqueFile(providersFolder, providerId, '.key', 'Provider identifier');
    const binding = createKeyBinding(userContext.isGuest ? 'guest' : userContext.userId, providerId);

    await writeCredentialFile({
        filePath: keyPath,
        usersFolder: USERS_FOLDER,
        binding,
        credential: normalizeProviderCredential(providerId, apiKey)
    });
}

// Load and decrypt API key
async function loadApiKey(userContext, provider) {
    if (userContext.isGuest) return null;
    const providersFolder = getUserCoWriterFolder(userContext, 'providers');
    const providerId = await getRegisteredProviderId(provider);
    const keyPath = resolveOpaqueFile(providersFolder, providerId, '.key', 'Provider identifier');
    
    if (!await fs.pathExists(keyPath)) {
        return null;
    }

    const binding = createKeyBinding(userContext.isGuest ? 'guest' : userContext.userId, providerId);
    const { credential, format } = await readCredentialFile({
        filePath: keyPath,
        usersFolder: USERS_FOLDER,
        binding
    });

    if (format === 'legacy-cbc') {
        console.warn(`Legacy CoWriter provider key detected for ${providerId}; run the key-store migration.`);
    }

    return normalizeProviderCredential(providerId, credential);
}

// Check if API key exists
async function checkApiKeyExists(userContext, provider) {
    if (userContext.isGuest) return false;
    const providersFolder = getUserCoWriterFolder(userContext, 'providers');
    const providerId = await getRegisteredProviderId(provider);
    const keyPath = resolveOpaqueFile(providersFolder, providerId, '.key', 'Provider identifier');
    return await fs.pathExists(keyPath);
}

// =============================================================================
// WORLD CONTEXT MANAGEMENT
// =============================================================================

// Get saved world contexts
router.post('/cowriter/prompts', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'CoWriter prompts not available in hosted environment' });
    }

    try {
        const { userContext } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (userContext.isGuest) {
            return res.json({ success: true, worldContexts: [], ephemeral: true });
        }

        const promptsFolder = getUserCoWriterFolder(userContext, 'prompts');
        const worldContexts = [];

        if (await fs.pathExists(promptsFolder)) {
            const files = await fs.readdir(promptsFolder);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = resolvePathInside(promptsFolder, file);
                        const contextData = migrateWorldContext(await fs.readJson(filePath));
                        validateWorldContext(contextData);
                        worldContexts.push(contextData);
                    } catch (error) {
                        console.warn(`Failed to load context file ${file}:`, error);
                    }
                }
            }
        }

        // Sort by last modified
        worldContexts.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

        res.json({
            success: true,
            worldContexts: worldContexts
        });

    } catch (error) {
        console.error('Error loading world contexts:', error);
        res.status(500).json({ error: 'Failed to load world contexts' });
    }
});

// Save world context
router.post('/cowriter/prompts/save', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'CoWriter prompts not available in hosted environment' });
    }

    try {
        const { userContext, worldContext } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (rejectGuestPersistence(userContext, res)) return;

        validateWorldContext(worldContext);

        const promptsFolder = getUserCoWriterFolder(userContext, 'prompts');
        await fs.ensureDir(promptsFolder);

        const filePath = resolveOpaqueFile(promptsFolder, worldContext.id, '.json', 'World context identifier');
        
        await queueJsonWrite(filePath, migrateWorldContext(worldContext));

        debugLog('[CoWriter] World context saved.', { guest: userContext.isGuest, contextId: worldContext.id });

        res.json({
            success: true,
            message: 'World context saved successfully'
        });

    } catch (error) {
        console.error('Error saving world context:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to save world context' });
    }
});

// Delete world context
router.delete('/cowriter/prompts/:contextId', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'CoWriter prompts not available in hosted environment' });
    }

    try {
        const { contextId } = req.params;
        const { userContext } = req.body;
        
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (rejectGuestPersistence(userContext, res)) return;

        const promptsFolder = getUserCoWriterFolder(userContext, 'prompts');
        const filePath = resolveOpaqueFile(promptsFolder, contextId, '.json', 'World context identifier');
        
        if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
            debugLog('[CoWriter] World context deleted.', { guest: userContext.isGuest, contextId });
        }

        res.json({
            success: true,
            message: 'World context deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting world context:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete world context' });
    }
});

// =============================================================================
// CHAT HISTORY MANAGEMENT
// =============================================================================

// Get saved chats
router.post('/cowriter/chats', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'CoWriter chats not available in hosted environment' });
    }

    try {
        const { userContext } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (userContext.isGuest) {
            return res.json({ success: true, chats: [], ephemeral: true });
        }

        const chatsFolder = getUserCoWriterFolder(userContext, 'chats');
        const savedChats = [];

        if (await fs.pathExists(chatsFolder)) {
            const files = await fs.readdir(chatsFolder);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = resolvePathInside(chatsFolder, file);
                        const chatData = migrateChatData(await fs.readJson(filePath));
                        validateChatData(chatData);
                        
                        // Don't include full message content in list (for performance)
                        savedChats.push({
                            id: chatData.id,
                            name: chatData.name,
                            folder: chatData.folder || 'Uncategorized',
                            created: chatData.created,
                            lastModified: chatData.lastModified,
                            messageCount: chatData.messages?.length || 0
                        });
                    } catch (error) {
                        console.warn(`Failed to load chat file ${file}:`, error);
                    }
                }
            }
        }

        // Sort by last modified
        savedChats.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

        res.json({
            success: true,
            chats: savedChats
        });

    } catch (error) {
        console.error('Error loading saved chats:', error);
        res.status(500).json({ error: 'Failed to load saved chats' });
    }
});

// Save chat
// Save chat
router.post('/cowriter/chats/save', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'CoWriter chats not available in hosted environment' });
    }

    try {
        const { userContext, chatData, isOverwrite } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (rejectGuestPersistence(userContext, res)) return;

        validateChatData(chatData);
        if (isOverwrite !== undefined && typeof isOverwrite !== 'boolean') {
            throw new CoWriterInputError('isOverwrite must be true or false');
        }

        const chatsFolder = getUserCoWriterFolder(userContext, 'chats');
        await fs.ensureDir(chatsFolder);

        const filePath = resolveOpaqueFile(chatsFolder, chatData.id, '.json', 'Chat identifier');
        
        // Check if file exists when trying to overwrite
        if (isOverwrite && !await fs.pathExists(filePath)) {
            return res.status(404).json({ error: 'Original chat not found for overwrite' });
        }
        
        // If it's a new save, check for duplicate names (optional)
        if (!isOverwrite) {
            // You could add duplicate name checking here if desired
        }
        
        const persistedChatData = migrateChatData(chatData);
        await queueJsonWrite(filePath, persistedChatData);

        debugLog('[CoWriter] Chat saved.', { guest: userContext.isGuest, chatId: chatData.id, overwrite: isOverwrite });

        res.json({
            success: true,
            message: `Chat ${isOverwrite ? 'updated' : 'saved'} successfully`,
            isOverwrite: isOverwrite
        });

    } catch (error) {
        console.error('Error saving chat:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to save chat' });
    }
});

// Load specific chat
router.get('/cowriter/chats/:chatId', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'CoWriter chats not available in hosted environment' });
    }

    try {
        const { chatId } = req.params;
        const { userContext } = req.query;
        
        if (!userContext) {
            return res.status(400).json({ error: 'User context required' });
        }

        const parsedUserContext = JSON.parse(userContext);
        const validation = validateUserContext(parsedUserContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (rejectGuestPersistence(parsedUserContext, res)) return;

        const chatsFolder = getUserCoWriterFolder(parsedUserContext, 'chats');
        const filePath = resolveOpaqueFile(chatsFolder, chatId, '.json', 'Chat identifier');
        
        if (!await fs.pathExists(filePath)) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        const chatData = migrateChatData(await fs.readJson(filePath));
        validateChatData(chatData);

        res.json({
            success: true,
            chat: chatData
        });

    } catch (error) {
        console.error('Error loading chat:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load chat' });
    }
});

// Delete chat
router.delete('/cowriter/chats/:chatId', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'CoWriter chats not available in hosted environment' });
    }

    try {
        const { chatId } = req.params;
        const { userContext } = req.body;
        
        const validation = validateUserContext(userContext);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (rejectGuestPersistence(userContext, res)) return;

        const chatsFolder = getUserCoWriterFolder(userContext, 'chats');
        const filePath = resolveOpaqueFile(chatsFolder, chatId, '.json', 'Chat identifier');
        
        if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
            debugLog('[CoWriter] Chat deleted.', { guest: userContext.isGuest, chatId });
        }

        res.json({
            success: true,
            message: 'Chat deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting chat:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete chat' });
    }
});

// =============================================================================
// PROMPT SYSTEM ENDPOINTS
// =============================================================================

// Get available quick prompts
router.get('/cowriter/quick-prompts', async (req, res) => {
    try {
        const prompts = await loadPrompts();
        
        res.json({
            success: true,
            quickPrompts: prompts.quickPrompts || {}
        });

    } catch (error) {
        console.error('Error loading quick prompts:', error);
        res.status(500).json({ error: 'Failed to load quick prompts' });
    }
});

// =============================================================================
// ACTIVE CHAT MANAGEMENT (for auto-save)
// =============================================================================

// Save active chat
router.post('/cowriter/active-chat/save', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Active chat not available in hosted environment' });
    }

    try {
        const { userContext, chatData } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (userContext.isGuest) {
            return res.json({ success: true, ephemeral: true });
        }

        validateChatData(chatData, { requireIdentity: false });

        const activeChatPath = getUserCoWriterFolder(userContext, 'active-chat.json');
        const persistedChatData = migrateChatData(chatData);
        await queueJsonWrite(activeChatPath, persistedChatData);

        res.json({ success: true });
    } catch (error) {
        console.error('Error saving active chat:', error);
        res.status(500).json({ error: 'Failed to save active chat' });
    }
});

// Load active chat
router.get('/cowriter/active-chat', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Active chat not available in hosted environment' });
    }

    try {
        const { userContext } = req.query;
        
        if (!userContext) {
            return res.status(400).json({ error: 'User context required' });
        }

        const parsedUserContext = JSON.parse(userContext);
        const validation = validateUserContext(parsedUserContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (parsedUserContext.isGuest) {
            return res.json({ success: true, chatData: null, ephemeral: true });
        }

        const activeChatPath = getUserCoWriterFolder(parsedUserContext, 'active-chat.json');
        
        if (await fs.pathExists(activeChatPath)) {
            const chatData = migrateChatData(await fs.readJson(activeChatPath));
            validateChatData(chatData, { requireIdentity: false });
            res.json({ success: true, chatData });
        } else {
            res.json({ success: true, chatData: null });
        }
    } catch (error) {
        console.error('Error loading active chat:', error);
        res.status(500).json({ error: 'Failed to load active chat' });
    }
});

// Clear active chat
router.post('/cowriter/active-chat/clear', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Active chat not available in hosted environment' });
    }

    try {
        const { userContext } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        if (userContext.isGuest) {
            return res.json({ success: true, ephemeral: true });
        }

        const activeChatPath = getUserCoWriterFolder(userContext, 'active-chat.json');
        
        if (await fs.pathExists(activeChatPath)) {
            await fs.remove(activeChatPath);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing active chat:', error);
        res.status(500).json({ error: 'Failed to clear active chat' });
    }
});

// =============================================================================
// DEBUG ENDPOINTS
// =============================================================================

// Debug endpoint for testing prompt assembly
router.post('/debug/cowriter/prompt', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Debug endpoints not available in hosted environment' });
    }

    try {
        const { message, chatHistory, settings } = req.body;
        
        const provider = await getRegisteredProviderId(settings.provider);
        const providerConfig = (await loadProviders())[provider];
        const assembledPrompt = await buildCanonicalPrompt({
            message,
            chatHistory,
            settings: { ...settings, provider },
            defaultPrompts: await loadPrompts(),
            loadCustomPrompt: loadCustomPromptContent,
            providerConfig
        });
        
        res.json({
            success: true,
            prompt: assembledPrompt,
            promptLength: assembledPrompt.metadata.totalCharacters,
            components: {
                hasWorldContext: !!(settings.worldContext && settings.worldContext.trim()),
                hasChatHistory: !!(chatHistory && chatHistory.length > 0),
                style: settings.style
            }
        });

    } catch (error) {
        console.error('Debug prompt assembly error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Debug endpoint for checking folder structure
router.post('/debug/cowriter/folders', async (req, res) => {
    if (!IS_LOCAL) {
        return res.status(403).json({ error: 'Debug endpoints not available in hosted environment' });
    }

    try {
        const { userContext } = req.body;
        const validation = validateUserContext(userContext);
        
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const cowriterFolder = getUserCoWriterFolder(userContext);
        const subfolders = ['chats', 'prompts', 'providers'];
        
        const debug = {
            baseFolder: cowriterFolder,
            exists: await fs.pathExists(cowriterFolder),
            subfolders: {}
        };

        for (const subfolder of subfolders) {
            const subfolderPath = getUserCoWriterFolder(userContext, subfolder);
            debug.subfolders[subfolder] = {
                path: subfolderPath,
                exists: await fs.pathExists(subfolderPath),
                files: await fs.pathExists(subfolderPath) ? await fs.readdir(subfolderPath) : []
            };
        }

        res.json({
            success: true,
            debug: debug
        });

    } catch (error) {
        console.error('Debug folder check error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Load a selected custom preset without trusting its identifier as a path.
async function loadCustomPromptContent(promptId, userContext) {
    try {
        if (!userContext || userContext.isGuest) {
            return null;
        }

        const safePromptId = normalizeOpaqueId(promptId, 'Prompt identifier');
        const customPromptsFolder = getUserCoWriterFolder(userContext, 'custom-prompts');
        
        if (!await fs.pathExists(customPromptsFolder)) {
            return null;
        }

        const files = await fs.readdir(customPromptsFolder);
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const filePath = resolvePathInside(customPromptsFolder, file);
                    const promptData = await fs.readJson(filePath);
                    
                    if (promptData.id === safePromptId) {
                        return promptData.content;
                    }
                } catch (error) {
                    console.warn(`Failed to check custom prompt file ${file}:`, error);
                }
            }
        }

        return null;
    } catch (error) {
        console.error('Error loading custom prompt content:', error);
        return null;
    }
}

module.exports = router;
module.exports.loadApiKey = loadApiKey;
module.exports.sendToLLM = sendToLLM;
