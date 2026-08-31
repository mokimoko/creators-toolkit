// Settings JavaScript - File-Based Settings with Avatar Uploads
// Use a consistent key that both apps will share
const SHARED_THEME_KEY = 'writingTools_currentTheme';

class SettingsManager {
    constructor(options = {}) {
        if (typeof options.getCurrentUser === 'function') options = { authManager: options };
        this.authManager = options.authManager || null;
        this.preferencesClient = options.preferencesClient || null;
        this.accountClient = options.accountClient || null;
        this.avatarClient = options.avatarClient || null;
        this.applicationPreferences = options.applicationPreferences || null;
        this.appearancePreferences = options.appearancePreferences || null;
        this.aiConfiguration = options.aiConfiguration || null;
        this.mainHasSavedApiKey = false;
        this.apiBase = window.location.origin;
        this.initializeSettings();
        this.themes = {};
        this.currentTheme = 'default';
        
        // ADD THESE:
        this.markdownThemes = [
            { id: 'nord', name: 'Nord', description: 'Clean arctic blues and grays' },
            { id: 'catppuccin', name: 'Catppuccin', description: 'Warm pastels on dark' },
            { id: 'tokyo-night', name: 'Tokyo Night', description: 'Cyberpunk neon vibes' },
            { id: 'its', name: 'ITS (RPG)', description: 'Dark charcoal with red headers' },
            { id: 'ember', name: 'Ember', description: 'Ornate fantasy theme' },
            { id: 'border', name: 'Border', description: 'Clean lines and structure' },
            { id: 'gruvbox', name: 'Gruvbox', description: 'Retro warm terminal colors' },
            { id: 'obsidian', name: 'Obsidian', description: 'Classic Obsidian feel' }
        ];
        
        // Initialize themes asynchronously
        this.initializeThemes();
    }

    async initializeThemes() {
        await this.loadThemes();
        this.populateMarkdownThemeDropdown(); // ADD THIS LINE
    }

    // Populate markdown theme dropdown
    populateMarkdownThemeDropdown() {
        const select = document.getElementById('markdown-theme-select');
        if (!select) return;
        
        // Clear existing options
        select.innerHTML = '';
        
        // Populate options
        this.markdownThemes.forEach(theme => {
            const option = document.createElement('option');
            option.value = theme.id;
            option.textContent = `${theme.name} - ${theme.description}`;
            select.appendChild(option);
        });
        
        console.log('📝 Populated markdown theme dropdown');
    }

    // Load available themes
    async loadThemes() {
        try {
            const response = await fetch('themes/themes.json');
            this.themes = await response.json();
            this.populateThemeDropdown();
            await this.loadSavedTheme(); // Make this await
        } catch (error) {
            console.error('Failed to load themes:', error);
            this.themes = { default: { name: "Default", colors: {} } };
        }
    }

    // Populate theme dropdown
    populateThemeDropdown() {
        const dropdown = document.getElementById('theme-dropdown');
        const selected = document.getElementById('theme-selected');
        const options = document.getElementById('theme-options');
        
        if (!dropdown || !selected || !options) return;
        
        // Clear existing options
        options.innerHTML = '';
        
        // Populate options
        Object.keys(this.themes).forEach(themeId => {
            const theme = this.themes[themeId];
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'dropdown-option';
            option.dataset.value = themeId;
            option.setAttribute('role', 'option');
            option.textContent = theme.name;
            
            options.appendChild(option);
        });
        
        // Set up dropdown interactions
        this.setupCustomDropdown();
    }

    // Setup custom dropdown interactions
    setupCustomDropdown() {
        const dropdown = document.getElementById('theme-dropdown');
        const selected = document.getElementById('theme-selected');
        const options = document.getElementById('theme-options');
        const selectedText = selected.querySelector('.selected-text');
        
        // Toggle dropdown
        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = options.classList.contains('show');
            selected.setAttribute('aria-expanded', String(!isOpen));
            
            // Close all dropdowns first
            document.querySelectorAll('.dropdown-options.show').forEach(opt => {
                opt.classList.remove('show');
                opt.previousElementSibling.classList.remove('open');
            });
            
            if (!isOpen) {
                options.classList.add('show');
                selected.classList.add('open');
            }
        });
        
        // Handle option selection
        options.addEventListener('click', (e) => {
            const option = e.target.closest('.dropdown-option');
            if (!option) return;
            
            const selectedThemeId = option.dataset.value;
            const selectedTheme = this.themes[selectedThemeId];
            
            // Update selected display
            selectedText.innerHTML = option.innerHTML;
            
            // Update selected state
            options.querySelectorAll('.dropdown-option').forEach(opt => {
                opt.classList.remove('selected');
                opt.setAttribute('aria-selected', String(opt === option));
            });
            option.classList.add('selected');
            
            // Close dropdown
            options.classList.remove('show');
            selected.classList.remove('open');
            selected.setAttribute('aria-expanded', 'false');
            
            // Apply theme
            this.applyTheme(selectedThemeId, true);
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) {
                options.classList.remove('show');
                selected.classList.remove('open');
                selected.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // Apply theme
    applyTheme(themeId, showToast = false) {
        if (!this.themes[themeId]) return;
        
        const theme = this.themes[themeId];
        const root = document.documentElement;
        
        // Apply theme colors to CSS custom properties
        Object.entries(theme.colors).forEach(([property, value]) => {
            root.style.setProperty(`--${property}`, value);
        });
        
        this.currentTheme = themeId;
        this.saveThemePreference();
        this.updateThemePreview(theme);
        
        // Broadcast the change (this will trigger the storage event in other tabs/apps)
        localStorage.setItem('writingTools_currentTheme', themeId);
        
        // Only show toast if explicitly requested
        if (showToast) {
            this.showToast(`Theme changed to ${theme.name}`, 'success');
        }
        
        console.log('Theme change broadcasted to other apps');
    }

    // Update theme preview colors
    updateThemePreview(theme) {
        const previewColors = document.querySelectorAll('.preview-color');
        previewColors.forEach(colorDiv => {
            const colorVar = colorDiv.dataset.color;
            if (theme.colors[colorVar]) {
                colorDiv.style.backgroundColor = theme.colors[colorVar];
            }
        });
    }

    async saveThemePreference() {
        if (this.authManager?.getCurrentUser()) {
            try {
                await this.appearancePreferences.save({ theme: this.currentTheme });
                console.log('Theme saved to server preferences');
            } catch (error) {
                console.error('Failed to save theme to server:', error);
            }
        }
    }

    // Load markdown theme settings
    async loadMarkdownThemeSettings() {
        try {
            if (this.authManager?.getCurrentUser()) {
                const preferences = await this.authManager.loadUserPreferences();
                
                const themeSelect = document.getElementById('markdown-theme-select');
                const fontSizeSlider = document.getElementById('markdown-font-size');
                const fontSizeDisplay = document.getElementById('markdown-font-size-display');
                
                if (themeSelect) {
                    themeSelect.value = preferences.markdownTheme || 'nord';
                }
                
                if (fontSizeSlider) {
                    const fontSize = preferences.markdownFontSize || 14;
                    fontSizeSlider.value = fontSize;
                    if (fontSizeDisplay) {
                        fontSizeDisplay.textContent = `${fontSize}px`;
                    }
                }               
            }
        } catch (error) {
            console.error('Error loading markdown theme settings:', error);
        }
    }

    // Save markdown theme settings
    async saveMarkdownThemeSettings() {
        try {
            const themeSelect = document.getElementById('markdown-theme-select');
            const fontSizeSlider = document.getElementById('markdown-font-size');
            
            if (!themeSelect || !fontSizeSlider) return;
            
            const markdownTheme = themeSelect.value;
            const markdownFontSize = parseInt(fontSizeSlider.value);
                    
            await this.appearancePreferences.save({
                markdownTheme,
                markdownFontSize
            });
                    
            // Apply to notebook theme manager if available
            if (window.notebookThemeManager) {
                // Force reload from server to ensure sync
                await window.notebookThemeManager.loadSettings();
                window.notebookThemeManager.applyTheme();
                window.notebookThemeManager.triggerPreviewUpdate();
            }
            
        } catch (error) {
            console.error('Error saving markdown theme settings:', error);
        }
    }

    // Update preview (applies theme immediately)
    updateMarkdownThemePreview() {
        if (window.notebookThemeManager) {
            const themeSelect = document.getElementById('markdown-theme-select');
            const fontSizeSlider = document.getElementById('markdown-font-size');
            
            if (themeSelect && fontSizeSlider) {
                window.notebookThemeManager.currentTheme = themeSelect.value;
                window.notebookThemeManager.currentFontSize = parseInt(fontSizeSlider.value);
                window.notebookThemeManager.applyTheme();
            }
        }
    }

    // Load saved theme
    async loadSavedTheme() {
        let savedTheme = 'default';
        
        // If user is logged in, load from server preferences
        if (this.authManager?.getCurrentUser()) {
            try {
                const serverPreferences = await this.authManager.loadUserPreferences();
                savedTheme = serverPreferences.theme || 'default';
            } catch (error) {
                console.error('Failed to load theme from server:', error);
                // Fallback to localStorage only if server fails
                savedTheme = localStorage.getItem(SHARED_THEME_KEY) || 'default';
            }
        } else {
            savedTheme = localStorage.getItem(SHARED_THEME_KEY) || 'default';
        }
        
        // Update custom dropdown selection
        const selectedText = document.querySelector('#theme-selected .selected-text');
        const option = document.querySelector(`[data-value="${savedTheme}"]`);
        
        if (selectedText && option) {
            selectedText.innerHTML = option.innerHTML;
            
            // Update selected state
            document.querySelectorAll('.dropdown-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            option.classList.add('selected');
        }
        
        this.applyTheme(savedTheme);
    }

    // Method called when user logs in
    async onUserLoggedIn() {
        // Existing functionality - refresh settings modal if open
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal && settingsModal.style.display === 'flex') {
            this.populateSettings();
        }
        
        // NEW: Load user theme preferences
        try {
            const serverPreferences = await this.authManager.loadUserPreferences();
            if (serverPreferences.theme && serverPreferences.theme !== this.currentTheme) {
                
                // Update dropdown
                const selectedText = document.querySelector('#theme-selected .selected-text');
                const option = document.querySelector(`[data-value="${serverPreferences.theme}"]`);
                
                if (selectedText && option) {
                    selectedText.innerHTML = option.innerHTML;
                    
                    // Update selected state
                    document.querySelectorAll('.dropdown-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    option.classList.add('selected');
                }
                
                // Apply the theme
                this.applyTheme(serverPreferences.theme, false);
            }
        } catch (error) {
            console.error('Failed to load user theme preferences:', error);
        }
    }

    // Method called when user logs out  
    onUserLoggedOut() {
        this.mainHasSavedApiKey = false;
        // Existing functionality - close settings modal if open
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal && settingsModal.style.display === 'flex') {
            this.closeSettings();
        }
        
        // NEW: Reset theme to default
        const defaultTheme = 'default';
        
        // Update dropdown
        const selectedText = document.querySelector('#theme-selected .selected-text');
        const option = document.querySelector(`[data-value="${defaultTheme}"]`);
        
        if (selectedText && option) {
            selectedText.innerHTML = option.innerHTML;
            
            // Update selected state
            document.querySelectorAll('.dropdown-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            option.classList.add('selected');
        }
        
        // Apply default theme
        this.applyTheme(defaultTheme, false);
        
        // Clear localStorage
        localStorage.removeItem(SHARED_THEME_KEY);
    }

    // AI Configuration Methods
    async loadAIConfiguration() {
        try {
            // Load configuration from CoWriter settings
            const response = await fetch('/api/cowriter/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userContext: this.authManager.getUserContext()
                })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.settings) {
                    this.populateAIConfiguration(result.settings);
                }
            }
        } catch (error) {
            console.error('Error loading AI configuration:', error);
        }
    }

    // Load available providers from server and populate dropdown
    async loadProviders() {
        try {
            const result = await CoWriterProviderClient.listProviders();
            if (result.success) {
                    const providerSelect = document.getElementById('main-provider-select');
                    if (providerSelect) {
                        // Clear existing options
                        providerSelect.innerHTML = '';
                        
                        // Add provider options
                        result.providers.forEach(provider => {
                            const option = document.createElement('option');
                            option.value = provider.id;
                            option.textContent = provider.name;
                            providerSelect.appendChild(option);
                        });
                        
                        return result.providers;
                    }
            }
        } catch (error) {
            console.error('Error loading providers:', error);
            // Fallback to hardcoded providers if API fails
            this.populateHardcodedProviders();
        }
    }

    // Fallback method for hardcoded providers
    populateHardcodedProviders() {
        const providerSelect = document.getElementById('main-provider-select');
        if (providerSelect) {
            providerSelect.innerHTML = `
                <option value="google">Google Gemini</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="openai">OpenAI GPT</option>
                <option value="openrouter">OpenRouter</option>
                <option value="nanogpt">NanoGPT</option>
            `;
        }
    }

    populateAIConfiguration(settings) {
        // Provider
        const providerSelect = document.getElementById('main-provider-select');
        if (providerSelect) {
            providerSelect.value = settings.provider || 'google';
        }

        // API Key
        this.setMainApiKeyState(Boolean(settings.hasApiKey));

        // Free models toggle
        const freeModelsToggle = document.getElementById('main-free-models-toggle-container');
        if (freeModelsToggle) {
            freeModelsToggle.style.display = settings.provider === 'openrouter' ? 'flex' : 'none';
            const checkbox = document.getElementById('main-free-models-only');
            if (checkbox) {
                checkbox.checked = settings.openRouterFreeOnly || false;
            }
        } else {
            localStorage.setItem(SHARED_THEME_KEY, this.currentTheme);
        }

        const nanoGptModeSelect = document.getElementById('main-nanogpt-mode-select');
        if (nanoGptModeSelect) {
            nanoGptModeSelect.value = settings.nanoGptMode || 'account';
        }
        this.updateMainNanoGptModeVisibility(settings.provider || 'google');
        this.loadModelsForMainSettings(settings.provider || 'google', settings.model);

        this.updateMainApiStatus(settings.hasApiKey);
    }

    async loadModelsForMainSettings(provider, currentModel) {
        const modelSelect = document.getElementById('main-model-select');
        if (!modelSelect) return;
        if (!this.mainModelCatalogUI) {
            this.mainModelCatalogUI = CoWriterModelCatalogUI.create({
                select: 'main-model-select',
                search: 'main-model-search',
                status: 'main-model-catalog-status',
                details: 'main-model-details',
                manualInput: 'main-manual-model-id'
            });
        }
        this.mainModelCatalogUI.setLoading();

        try {
            const modeValue = document.getElementById('main-nanogpt-mode-select')?.value || 'account';
            const result = await CoWriterProviderClient.listModels(
                this.authManager.getUserContext(),
                provider,
                modeValue
            );
            if (result.success) {
                this.mainModelCatalogUI.setCatalog({
                    models: result.models,
                    source: result.source || (result.fromAPI ? 'live' : 'fallback'),
                    currentModel,
                    freeOnly: provider === 'openrouter' && Boolean(document.getElementById('main-free-models-only')?.checked)
                });
            }
        } catch (error) {
            console.error('Error loading models:', error);
            this.mainModelCatalogUI.setUnavailable('Model list unavailable — enter an ID manually', currentModel);
        }
    }

    updateMainApiStatus(hasApiKey) {
        const indicator = document.getElementById('main-status-indicator');
        const text = document.getElementById('main-status-text');

        if (!hasApiKey) {
            indicator.className = 'status-indicator';
            text.textContent = 'No API key configured';
        } else {
            indicator.className = 'status-indicator';
            text.textContent = 'API key configured (click Test to verify)';
        }
    }

    setMainApiKeyState(hasApiKey) {
        this.mainHasSavedApiKey = hasApiKey;
        const input = document.getElementById('main-api-key-input');
        const removeButton = document.getElementById('main-remove-api-key-btn');

        if (input) {
            input.value = hasApiKey ? '••••••••••••••••' : '';
            input.placeholder = hasApiKey
                ? 'API key configured (enter new key to replace)'
                : 'Enter your API key...';
        }

        if (removeButton) {
            removeButton.hidden = !hasApiKey;
            removeButton.disabled = !hasApiKey;
        }

        this.updateMainApiStatus(hasApiKey);
    }

    async loadMainApiKeyForProvider(provider) {
        try {
            const result = await CoWriterProviderKeyClient.getStatus(this.authManager.getUserContext(), provider);
            this.setMainApiKeyState(Boolean(result.hasApiKey));
        } catch (error) {
            console.error('Error loading provider key status:', error);
            this.setMainApiKeyState(false);
        }
    }

    updateMainNanoGptModeVisibility(provider) {
        const container = document.getElementById('main-nanogpt-mode-container');
        if (container) {
            container.hidden = provider !== 'nanogpt';
        }
    }

    async removeMainApiKey() {
        const providerSelect = document.getElementById('main-provider-select');
        const provider = providerSelect.value;
        const providerName = providerSelect.selectedOptions[0]?.textContent || provider;
        if (!this.mainHasSavedApiKey) return;
        const confirmed = await window.CoWriterDialogs.confirm({
            title: 'Remove saved API key?',
            message: `${providerName} will stop working until you save another key.`,
            confirmLabel: 'Remove key',
            danger: true,
            icon: 'fas fa-key'
        });
        if (!confirmed) return;

        const button = document.getElementById('main-remove-api-key-btn');
        button.disabled = true;
        try {
            await CoWriterProviderKeyClient.remove(this.authManager.getUserContext(), provider);
            this.setMainApiKeyState(false);
            this.showToast(`Removed saved key for ${providerName}`, 'success');
            if (window.coWriterManager?.settings.provider === provider) {
                await window.coWriterManager.loadApiKeyForProvider(provider);
            }
        } catch (error) {
            console.error('Error removing provider key:', error);
            this.showToast(error.message || 'Failed to remove saved key', 'error');
            button.disabled = false;
        }
    }

    async saveAIConfiguration() {
        const provider = document.getElementById('main-provider-select').value;
        const model = document.getElementById('main-manual-model-id').value.trim()
            || document.getElementById('main-model-select').value;
        const apiKeyInput = document.getElementById('main-api-key-input');
        const apiKey = apiKeyInput.value;
        const freeModelsOnly = document.getElementById('main-free-models-only')?.checked || false;
        const nanoGptMode = document.getElementById('main-nanogpt-mode-select')?.value || 'account';

        // Determine if API key changed
        const hasNewApiKey = apiKey && apiKey !== '••••••••••••••••';

        try {
            await CoWriterProviderClient.saveSettings(this.authManager.getUserContext(), {
                provider,
                model,
                ...(hasNewApiKey && { apiKey }),
                openRouterFreeOnly: freeModelsOnly,
                nanoGptMode
            });

            // Notify CoWriter to reload settings
            if (window.coWriterManager) {
                await window.coWriterManager.loadUserSettings();
            }

            if (hasNewApiKey) {
                await this.loadMainApiKeyForProvider(provider);
            }

            return true;
        } catch (error) {
            console.error('Error saving AI configuration:', error);
            throw error;
        }
    }

    async testMainConnection() {
        const provider = document.getElementById('main-provider-select').value;
        const model = document.getElementById('main-manual-model-id').value.trim()
            || document.getElementById('main-model-select').value;
        const enteredApiKey = document.getElementById('main-api-key-input').value;
        const candidateApiKey = enteredApiKey && enteredApiKey !== '••••••••••••••••'
            ? enteredApiKey
            : '';
        const nanoGptMode = document.getElementById('main-nanogpt-mode-select')?.value || 'account';
        const testBtn = document.getElementById('main-test-connection-btn');
        const originalText = testBtn.innerHTML;

        testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
        testBtn.disabled = true;

        try {
            const result = await CoWriterProviderClient.testConnection(this.authManager.getUserContext(), {
                provider,
                model,
                nanoGptMode,
                apiKey: candidateApiKey
            });
            const indicator = document.getElementById('main-status-indicator');
            const text = document.getElementById('main-status-text');

            if (result.success) {
                indicator.className = 'status-indicator connected';
                text.textContent = 'Connection successful';
                this.showToast('Connection test successful!', 'success');
            } else {
                indicator.className = 'status-indicator error';
                text.textContent = result.error || 'Connection failed';
                this.showToast(result.error || 'Connection test failed', 'error');
            }
        } catch (error) {
            console.error('Connection test error:', error);
            const indicator = document.getElementById('main-status-indicator');
            const text = document.getElementById('main-status-text');
            indicator.className = 'status-indicator error';
            text.textContent = error.message || 'Connection failed';
            this.showToast(error.message || 'Connection test failed', 'error');
        } finally {
            testBtn.innerHTML = originalText;
            testBtn.disabled = false;
        }
    }

    // Initialize settings system
    initializeSettings() {
        this.setupEventListeners();
        this.authManager = this.authManager || window.authManager || null;
    }

    // Setup event listeners
    setupEventListeners() {
        // Settings button (optional since we removed it)
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.openSettings();
            });
        }

        // Close settings
        document.getElementById('close-settings').addEventListener('click', () => {
            this.closeSettings();
        });

        // Close on overlay click
        document.getElementById('settings-modal').addEventListener('click', (e) => {
            if (e.target.id === 'settings-modal') {
                this.closeSettings();
            }
        });

        // Account form submission
        document.getElementById('account-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAccountUpdate();
        });

        // Add new avatar click handler
        document.getElementById('avatar-picker-btn').addEventListener('click', () => {
            const user = this.authManager.getCurrentUser();
            if (user && user.isGuest) {
                this.showToast('Avatar upload available with account', 'info');
                return;
            }
            document.getElementById('avatar-upload').click();
        });
        // Add this to setupEventListeners() method after the avatar preview click handler:
        document.getElementById('avatar-upload').addEventListener('change', (e) => {
            this.handleAvatarUpload(e);
        });
        document.getElementById('reset-avatar-btn')?.addEventListener('click', () => {
            this.resetAvatar();
        });

        // Logout button
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.handleLogout();
        });

        // Delete account button
        document.getElementById('delete-account-btn').addEventListener('click', () => {
            this.showDeleteConfirmation();
        });

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('settings-modal');
                if (modal && modal.style.display === 'flex') {
                    this.closeSettings();
                }
            }
        });

        // AI Configuration listeners
        document.getElementById('main-provider-select')?.addEventListener('change', (e) => {
            const freeModelsToggle = document.getElementById('main-free-models-toggle-container');
            if (freeModelsToggle) {
                freeModelsToggle.style.display = e.target.value === 'openrouter' ? 'flex' : 'none';
            }
            this.updateMainNanoGptModeVisibility(e.target.value);
            const manualModelInput = document.getElementById('main-manual-model-id');
            if (manualModelInput) manualModelInput.value = '';
            this.loadModelsForMainSettings(e.target.value);
            this.loadMainApiKeyForProvider(e.target.value);
        });

        document.getElementById('main-refresh-models-btn')?.addEventListener('click', () => {
            const provider = document.getElementById('main-provider-select').value;
            this.loadModelsForMainSettings(provider);
        });

        document.getElementById('main-toggle-api-key-btn')?.addEventListener('click', () => {
            const input = document.getElementById('main-api-key-input');
            const icon = document.querySelector('#main-toggle-api-key-btn i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });

        document.getElementById('main-test-connection-btn')?.addEventListener('click', () => {
            this.testMainConnection();
        });

        document.getElementById('main-nanogpt-mode-select')?.addEventListener('change', () => {
            this.loadModelsForMainSettings('nanogpt');
        });

        document.getElementById('main-free-models-only')?.addEventListener('change', (event) => {
            this.mainModelCatalogUI?.setFreeOnly(event.target.checked);
        });

        document.getElementById('main-remove-api-key-btn')?.addEventListener('click', () => {
            this.removeMainApiKey();
        });

        // Handle API key input
        const mainApiKeyInput = document.getElementById('main-api-key-input');
        if (mainApiKeyInput) {
            mainApiKeyInput.addEventListener('focus', (e) => {
                if (e.target.value === '••••••••••••••••') {
                    e.target.value = '';
                    e.target.placeholder = 'Enter your API key...';
                }
            });
            mainApiKeyInput.addEventListener('input', (e) => {
                const hasCandidate = Boolean(e.target.value && e.target.value !== '••••••••••••••••');
                if (hasCandidate) {
                    const statusText = document.getElementById('main-status-text');
                    statusText.textContent = this.mainHasSavedApiKey
                        ? 'Unsaved API key entered (test now, then Update Account to replace the saved key)'
                        : 'Unsaved API key entered (test now or Update Account)';
                } else {
                    this.updateMainApiStatus(this.mainHasSavedApiKey);
                }
            });
        }

        // Markdown theme listeners 
        const markdownThemeSelect = document.getElementById('markdown-theme-select');
        if (markdownThemeSelect) {
            markdownThemeSelect.addEventListener('change', () => {
                this.updateMarkdownThemePreview();
            });
        }

        const markdownFontSize = document.getElementById('markdown-font-size');
        if (markdownFontSize) {
            markdownFontSize.addEventListener('input', (e) => {
                const display = document.getElementById('markdown-font-size-display');
                if (display) {
                    display.textContent = `${e.target.value}px`;
                }
                this.updateMarkdownThemePreview();
            });
        }
    }

    // Open settings modal
    openSettings() {        
        if (!this.authManager || !this.authManager.getCurrentUser()) {
            return;
        }

        // CHANGE: Always populate fresh settings data
        this.populateSettings();
        document.getElementById('settings-modal').style.display = 'flex';
        
        // Check if this somehow affects the about modal
        const aboutModal = document.getElementById('about-modal');
    }

    // Close settings modal
    closeSettings() {
        document.getElementById('settings-modal').style.display = 'none';
        this.clearFormStates();
        
        // Sync with notebook theme manager
        if (window.notebookThemeManager) {
            // Force reload to ensure changes are reflected
            window.notebookThemeManager.checkForUpdates();
        }
    }

    // Populate settings with current user data
    async populateSettings() {
        const user = this.authManager.getCurrentUser();
        if (!user) return;

        document.getElementById('settings-username').value = user.username || '';
        document.getElementById('settings-email').value = user.email || '';
        document.getElementById('settings-new-password').value = '';
        
        // Set avatar preview using the server URL
        const avatarPreview = document.getElementById('settings-avatar-preview');
        avatarPreview.src = user.avatar
            ? `${user.avatar}${user.avatar.includes('?') ? '&' : '?'}v=${user.avatarVersion || 0}`
            : 'images/default-avatar.png';

        // Set user ID badge
        const userIdBadge = document.getElementById('user-id-badge');
        if (user.isGuest) {
            userIdBadge.textContent = 'GUEST';
            userIdBadge.className = 'user-id-badge guest-badge';
        } else {
            userIdBadge.textContent = `ID: ${user.id}`;
            userIdBadge.className = 'user-id-badge';
        }
        
        this.loadSavedTheme();
        await this.loadMarkdownThemeSettings();

        // Load providers first, then AI configuration:
        await this.loadProviders();
        await this.loadAIConfiguration();

        // Load AI tools setting - ensure it exists with default
        try {
            const preferences = await this.authManager.loadUserPreferences();
            
            const aiToolsCheckbox = document.getElementById('ai-tools-enabled');
            if (aiToolsCheckbox) {
                aiToolsCheckbox.checked = preferences.aiToolsEnabled || false;
            }
        } catch (error) {
            console.error('Error loading AI tools setting:', error);
        }

        // Guest mode adjustments
        if (user.isGuest) {
            // Disable email field
            const emailField = document.getElementById('settings-email');
            emailField.disabled = true;
            emailField.placeholder = 'Available with account';
            
            // Disable password field
            const passwordField = document.getElementById('settings-new-password');
            passwordField.disabled = true;
            passwordField.placeholder = 'Available with account';
            
            // Hide delete account section
            const deleteSection = document.querySelector('.delete-account-section');
            if (deleteSection) {
                deleteSection.style.display = 'none';
            }
            
            // Make username read-only
            const usernameField = document.getElementById('settings-username');
            usernameField.value = 'Guest';
            usernameField.disabled = true;

            // Disable avatar upload
            const avatarPicker = document.getElementById('avatar-picker-btn');
            avatarPicker.disabled = true;
            avatarPicker.title = 'Avatar upload available with account';
            document.getElementById('reset-avatar-btn').disabled = true;
        } else {
            // Enable fields for real users
            const emailField = document.getElementById('settings-email');
            emailField.disabled = false;
            emailField.placeholder = 'Email address';
            
            const passwordField = document.getElementById('settings-new-password');
            passwordField.disabled = false;
            passwordField.placeholder = 'New password (leave blank to keep current)';
            
            const deleteSection = document.querySelector('.delete-account-section');
            if (deleteSection) {
                deleteSection.style.display = 'block';
            }
            
            const usernameField = document.getElementById('settings-username');
            usernameField.disabled = false;

            const avatarPicker = document.getElementById('avatar-picker-btn');
            avatarPicker.disabled = false;
            avatarPicker.title = 'Choose a new avatar';
            document.getElementById('reset-avatar-btn').disabled = false;
        }
    }

    // Handle account update
    async handleAccountUpdate() {
        const user = this.authManager.getCurrentUser();
        if (!user || user.isGuest) {
            this.showFormError('settings-username', 'Cannot update guest account');
            return;
        }

        const policy = await (this.authManager.accountPolicyPromise || Promise.resolve({
            username: { minLength: 3, maxLength: 64 },
            password: { minLength: 6, maxLength: 256 }
        }));

        // Load preferences once at the top
        const preferences = await this.authManager.loadUserPreferences();

        const section = document.querySelector('.settings-section');
        const username = document.getElementById('settings-username').value.trim();
        const email = document.getElementById('settings-email').value.trim();
        const newPassword = document.getElementById('settings-new-password').value;

        // Clear previous errors
        this.clearFormErrors();

        // Validation
        if (!username) {
            this.showFormError('settings-username', 'Username is required');
            return;
        }

        if (username.length < policy.username.minLength || username.length > policy.username.maxLength) {
            this.showFormError('settings-username', `Username must be ${policy.username.minLength}-${policy.username.maxLength} characters`);
            return;
        }
        if (policy.username.pattern && !new RegExp(policy.username.pattern).test(username)) {
            this.showFormError('settings-username', 'Username contains unsupported characters');
            return;
        }

        // Only validate email format if email is provided
        if (email && (email.length > (policy.email?.maxLength || 254) || !this.isValidEmail(email))) {
            this.showFormError('settings-email', 'Please enter a valid email address');
            return;
        }

        if (newPassword && (newPassword.length < policy.password.minLength || newPassword.length > policy.password.maxLength)) {
            this.showFormError('settings-new-password', `New password must be ${policy.password.minLength}-${policy.password.maxLength} characters`);
            return;
        }

        // Check if account details changed
        const hasAccountChanges = username !== user.username || 
                                email !== user.email || 
                                newPassword;

        // Check AI tools preference
        const aiToolsCheckbox = document.getElementById('ai-tools-enabled');
        const currentAIToolsValue = preferences.aiToolsEnabled || false;
        const newAIToolsValue = aiToolsCheckbox ? aiToolsCheckbox.checked : false;
        const aiToolsChanged = newAIToolsValue !== currentAIToolsValue;

        // Check if markdown theme changed
        const markdownThemeSelect = document.getElementById('markdown-theme-select');
        const markdownFontSize = document.getElementById('markdown-font-size');
        const currentMarkdownTheme = preferences.markdownTheme || 'nord';
        const currentMarkdownFontSize = preferences.markdownFontSize || 14;
        const newMarkdownTheme = markdownThemeSelect ? markdownThemeSelect.value : currentMarkdownTheme;
        const newMarkdownFontSize = markdownFontSize ? parseInt(markdownFontSize.value) : currentMarkdownFontSize;
        const markdownThemeChanged = newMarkdownTheme !== currentMarkdownTheme || newMarkdownFontSize !== currentMarkdownFontSize;

        // Check if nothing changed at all
        if (!hasAccountChanges && !aiToolsChanged && !markdownThemeChanged) {
            // Try to save AI configuration in case those changed
            try {
                await this.saveAIConfiguration();
                this.showToast('Settings updated successfully!', 'success');
                return;
            } catch (error) {
                // If AI config didn't change either, show no changes message
                this.showToast('No changes to save', 'info');
                return;
            }
        }

        // Show password confirmation popup only if account details changed
        let currentPassword = null;
        if (hasAccountChanges) {
            currentPassword = await this.showPasswordConfirmation();
            if (!currentPassword) {
                return; // User cancelled
            }
        }

        // Add loading state
        section.classList.add('loading');

        try {
            // Update account details if they changed
            if (hasAccountChanges) {
                const updates = { username, email, currentPassword };
                if (newPassword) {
                    updates.password = newPassword;
                }
                
                const result = await this.accountClient.updateProfile(updates);

                if (!result.success) {
                    this.showFormError('settings-username', result.error || 'Update failed');
                    section.classList.remove('loading');
                    return;
                }

                // Clear password field
                document.getElementById('settings-new-password').value = '';
            }

            // Save AI tools preference if changed
            if (aiToolsChanged) {
                await this.aiConfiguration.save({ aiToolsEnabled: newAIToolsValue });
            }

            // Save AI configuration (provider, model, API key)
            try {
                await this.saveAIConfiguration();
            } catch (error) {
                console.error('Failed to save AI configuration:', error);
                // Don't fail the whole update if just AI config fails
            }

            // Save markdown theme settings if changed
            if (markdownThemeChanged) {
                try {
                    await this.saveMarkdownThemeSettings();
                } catch (error) {
                    console.error('Failed to save markdown theme settings:', error);
                }
            }

            // Show success message
            let message = 'Settings updated successfully!';
            if (hasAccountChanges && username !== user.username) {
                message = `Account updated! Welcome, ${username}!`;
            } else if (hasAccountChanges) {
                message = 'Account updated successfully!';
            } else if (aiToolsChanged) {
                message = 'AI tools setting updated!';
            } else if (markdownThemeChanged) {
                message = 'Markdown theme updated!';
            }

            this.showToast(message, 'success');

            // Apply shell visibility immediately when AI tools availability changes.
            if (aiToolsChanged) {
                await window.mainManager?.hideAIFeaturesIfNeeded?.();
            }

        } catch (error) {
            console.error('Account update error:', error);
            this.showFormError('settings-username', 'Update failed. Please try again.');
        } finally {
            section.classList.remove('loading');
        }
    }

    // Add this new method
    async showPasswordConfirmation() {
        return window.ToolkitDialogs.input({
            title: 'Confirm changes',
            message: 'Enter your current password to save account changes.',
            label: 'Current password',
            placeholder: 'Current password',
            inputType: 'password',
            autocomplete: 'current-password',
            confirmLabel: 'Confirm',
            icon: 'fas fa-lock'
        });
    }

    // FIXED: Handle avatar upload with userContext in URL parameters
    async handleAvatarUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const user = this.authManager.getCurrentUser();
        if (!user) {
            this.showToast('Please log in to upload an avatar', 'error');
            return;
        }

        const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
        if (!allowedTypes.has(file.type)) {
            this.showToast('Choose a PNG, JPEG, or WebP image', 'error');
            return;
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            this.showToast('Image must be smaller than 2MB', 'error');
            return;
        }

        try {
            // Show loading state
            const avatarSection = document.querySelector('.settings-section');
            avatarSection.classList.add('loading');

            const result = await this.avatarClient.upload(file);
            if (result.success) {
                // Update avatar preview with strong cache busting
                const avatarPreview = document.getElementById('settings-avatar-preview');
                const userAvatar = document.getElementById('user-avatar');
                
                const avatarUrl = this.avatarClient.versionedUrl(result);
                                
                // Update both preview and main avatar with cache busting
                avatarPreview.src = avatarUrl;
                if (userAvatar) {
                    userAvatar.src = avatarUrl;
                }

                // Update current user's avatar URL in auth manager
                if (this.authManager.currentUser) {
                    this.authManager.currentUser.avatar = result.avatarUrl;
                    this.authManager.currentUser.avatarVersion = result.avatarVersion;
                    this.authManager.updateUserDisplay();
                }

                this.showToast('Avatar updated successfully!', 'success');
            }

        } catch (error) {
            console.error('Avatar upload error:', error);
            this.showToast('Failed to upload avatar: ' + error.message, 'error');
        } finally {
            // Clear the file input
            event.target.value = '';
            
            // Remove loading state
            const avatarSection = document.querySelector('.settings-section');
            avatarSection.classList.remove('loading');
        }
    }

    // Reset avatar to default (removes custom avatar file)
    async resetAvatar() {
        const user = this.authManager.getCurrentUser();
        if (!user) return;

        try {
            // Show loading state
            const avatarSection = document.querySelector('.settings-section');
            avatarSection.classList.add('loading');

            const result = await this.avatarClient.reset();
            
            // Update preview to default
            const avatarPreview = document.getElementById('settings-avatar-preview');
            avatarPreview.src = 'images/default-avatar.png';

            // Update current user's avatar URL
            if (this.authManager.currentUser) {
                this.authManager.currentUser.avatar = result.avatarUrl;
                this.authManager.currentUser.avatarVersion = result.avatarVersion;
                this.authManager.updateUserDisplay();
            }

            this.showToast('Avatar reset to default', 'success');

        } catch (error) {
            console.error('Avatar reset error:', error);
            this.showToast('Failed to reset avatar', 'error');
        } finally {
            const avatarSection = document.querySelector('.settings-section');
            avatarSection.classList.remove('loading');
        }
    }

    // Handle logout
    async handleLogout() {
        const confirmed = await window.CoWriterDialogs.confirm({
            title: 'Log out?',
            message: 'Your local work stays on this device, but account features will be unavailable until you sign in again.',
            confirmLabel: 'Log out',
            icon: 'fas fa-right-from-bracket'
        });
        if (!confirmed) return;
        this.closeSettings();
        await this.authManager.logout();
    }

    // Helper functions
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Form error handling
    showFormError(fieldId, message) {
        const field = document.getElementById(fieldId);
        const formGroup = field.closest('.form-group');
        
        formGroup.classList.add('error');
        
        let errorElement = formGroup.querySelector('.error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            formGroup.appendChild(errorElement);
        }
        
        errorElement.textContent = message;
    }

    showFormSuccess(fieldId, message) {
        const field = document.getElementById(fieldId);
        const formGroup = field.closest('.form-group');
        
        formGroup.classList.add('success');
        
        let successElement = formGroup.querySelector('.success-message');
        if (!successElement) {
            successElement = document.createElement('div');
            successElement.className = 'success-message';
            formGroup.appendChild(successElement);
        }
        
        successElement.textContent = message;
    }

    clearFormErrors() {
        document.querySelectorAll('.settings-section .form-group').forEach(group => {
            group.classList.remove('error', 'success');
        });
        
        document.querySelectorAll('.settings-section .error-message, .settings-section .success-message').forEach(msg => {
            msg.style.display = 'none';
        });
    }

    clearFormStates() {
        this.clearFormErrors();
        document.querySelectorAll('.settings-section').forEach(section => {
            section.classList.remove('loading');
        });
    }

    // Toast notifications
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (toast.parentNode) {
                    container.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    // Show delete account confirmation
    async showDeleteConfirmation() {
        const user = this.authManager.getCurrentUser();
        if (!user || user.isGuest) {
            this.showToast('Cannot delete guest account', 'error');
            return;
        }

        const confirmed = await window.ToolkitDialogs.confirm({
            title: `Delete ${user.username}?`,
            message: 'Export anything you want to keep first. The account will be removed and its local files moved to recoverable staging.',
            confirmLabel: 'Continue',
            danger: true,
            icon: 'fas fa-triangle-exclamation'
        });
        if (!confirmed) return;
        const password = await window.ToolkitDialogs.input({
            title: 'Confirm account deletion',
            message: 'Enter your current password. This revokes your sessions immediately.',
            label: 'Current password',
            inputType: 'password',
            autocomplete: 'current-password',
            confirmLabel: 'Delete account',
            danger: true,
            icon: 'fas fa-lock'
        });
        if (password) await this.handleAccountDeletion(password);
    }

    // Handle actual account deletion
    async handleAccountDeletion(password) {
        try {
            await this.accountClient.deleteAccount(password);
            this.closeSettings();
            await this.authManager.logout({ revoke: false, reason: 'account-deleted' });
            this.showToast('Account deleted; local files moved to recoverable staging', 'success');
        } catch (error) {
            console.error('Account deletion error:', error);
            this.showToast(error.message || 'Account deletion failed', 'error');
        }
    }
}

window.ToolkitModules = window.ToolkitModules || {};
window.ToolkitModules.SettingsManager = SettingsManager;
