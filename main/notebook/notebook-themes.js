/**
 * Notebook Theme Manager
 * Handles markdown themes and font size settings for the notebook
 */

class NotebookThemeManager {
    constructor(preferencesClient = null, appearancePreferences = null) {
        this.preferencesClient = preferencesClient;
        this.appearancePreferences = appearancePreferences;
        this.themes = [
            { id: 'nord', name: 'Nord', description: 'Clean arctic blues and grays' },
            { id: 'catppuccin', name: 'Catppuccin', description: 'Warm pastels on dark' },
            { id: 'tokyo-night', name: 'Tokyo Night', description: 'Cyberpunk neon vibes' },
            { id: 'its', name: 'ITS (RPG)', description: 'Dark charcoal with red headers' },
            { id: 'ember', name: 'Ember', description: 'Ornate fantasy theme with warm colors' },
            { id: 'border', name: 'Border', description: 'Clean lines and structure' },
            { id: 'gruvbox', name: 'Gruvbox', description: 'Retro warm terminal colors' },
            { id: 'obsidian', name: 'Obsidian', description: 'Classic Obsidian feel' }
        ];
        
        this.currentTheme = 'nord';
        this.currentFontSize = 14;
        this.previewContent = null;
        
        this.init();
    }
    
    init() {
        this.previewContent = document.getElementById('preview-content');
        this.setupSettingsButton();
        
        // Don't load settings immediately - wait for auth to be ready
        this.checkAuthAndLoadSettings();
    }

    async checkAuthAndLoadSettings() {
        await window.authManager?.whenReady?.();
        const currentUser = window.authManager?.getCurrentUser?.();
        if (currentUser) {
            await this.loadSettings();
        }
        this.applyTheme();
    }
    
    /**
     * Load theme settings from user preferences
     */
    async loadSettings() {
        try {
            if (!window.authManager?.getCurrentUser()) return;
            const preferences = (await this.preferencesClient.get()).preferences || {};
            this.currentTheme = preferences.markdownTheme || 'nord';
            this.currentFontSize = preferences.markdownFontSize || 14;
        } catch (error) {
            console.error('Error loading theme settings:', error);
        }
    }

    // Check for updates from external sources (like main Settings modal)
    async checkForUpdates() {
        if (window.authManager?.getCurrentUser()) {
            await this.loadSettings();
            this.applyTheme();
            this.triggerPreviewUpdate();
            
            // Also update any open settings modal
            this.updateModalUI();
        }
    }

    // NEW METHOD: Update the modal UI with current values
    updateModalUI() {
        // Update main settings modal if it exists
        const mainMarkdownThemeSelect = document.getElementById('markdown-theme-select');
        const mainMarkdownFontSize = document.getElementById('markdown-font-size');
        const mainMarkdownFontSizeDisplay = document.getElementById('markdown-font-size-display');
        
        if (mainMarkdownThemeSelect) {
            mainMarkdownThemeSelect.value = this.currentTheme;
        }
        
        if (mainMarkdownFontSize) {
            mainMarkdownFontSize.value = this.currentFontSize;
        }
        
        if (mainMarkdownFontSizeDisplay) {
            mainMarkdownFontSizeDisplay.textContent = `${this.currentFontSize}px`;
        }
        
        // Update notebook theme modal if it's open
        const notebookModal = document.querySelector('.modal-overlay');
        if (notebookModal) {
            const themeSelector = notebookModal.querySelector('.theme-selector');
            const fontSizeSlider = notebookModal.querySelector('.font-size-slider');
            const fontSizeDisplay = notebookModal.querySelector('.font-size-display');
            
            if (themeSelector) {
                themeSelector.value = this.currentTheme;
            }
            
            if (fontSizeSlider) {
                fontSizeSlider.value = this.currentFontSize;
            }
            
            if (fontSizeDisplay) {
                fontSizeDisplay.textContent = `${this.currentFontSize}px`;
            }
        }
    }
    
    /**
     * Save theme settings to user preferences
     */
    async saveSettings() {
        try {
            if (!window.authManager?.getCurrentUser()) return;
            await this.appearancePreferences.save({
                markdownTheme: this.currentTheme,
                markdownFontSize: this.currentFontSize
            });
        } catch (error) {
            console.error('Error saving theme settings:', error);
        }
    }
    
    /**
     * Apply the current theme to the preview content
     */
    applyTheme() {
        // Try to get preview content if we don't have it yet
        if (!this.previewContent) {
            this.previewContent = document.getElementById('preview-content');
        }
        
        if (!this.previewContent) {
            return;
        }
        
        // Remove all existing theme classes
        this.themes.forEach(theme => {
            this.previewContent.classList.remove(`markdown-theme-${theme.id}`);
        });
        
        // Add current theme class
        this.previewContent.classList.add(`markdown-theme-${this.currentTheme}`);
        
        // Apply font size
        this.previewContent.style.setProperty('--md-font-size', `${this.currentFontSize}px`);

        // Keep CoWriter messages aligned with the active writing theme.
        const cowriterContainer = document.querySelector('.cowriter-container');
        if (cowriterContainer) {
            // Remove all existing theme classes
            this.themes.forEach(theme => {
                cowriterContainer.classList.remove(`markdown-theme-${theme.id}`);
            });
            
            // Add current theme class
            cowriterContainer.classList.add(`markdown-theme-${this.currentTheme}`);
        }
    }

    // Add this method to handle tab switching
    onNotebookTabActivated() {
        // Refresh preview content reference and reapply theme
        this.previewContent = document.getElementById('preview-content');
        this.applyTheme();
    }

    onCoWriterTabActivated() {
        // Refresh cowriter container reference and reapply theme
        this.applyTheme();
    }
    
    /**
     * Set up the settings button in the editor toolbar
     */
    setupSettingsButton() {
        const settingsBtn = document.getElementById('markdown-theme-btn');
        if (!settingsBtn) return;
        
        // Add click handler
        settingsBtn.addEventListener('click', () => this.showSettingsModal());
    }
    
    /**
     * Show the theme settings modal
     */
    showSettingsModal() {
        const modal = this.createSettingsModal();
        document.body.appendChild(modal);
        
        // Focus the modal for accessibility
        modal.focus();
        
        // Handle ESC key to close
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                this.closeModal(modal);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }
    
    /**
     * Create the settings modal HTML
     */
    createSettingsModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay notebook-theme-modal';
        modal.tabIndex = -1;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'notebook-theme-title');
        
        const modalContent = document.createElement('div');
        modalContent.className = 'notebook-theme-modal-content';
        
        modalContent.innerHTML = `
            <div class="notebook-theme-modal-header">
                <h3 id="notebook-theme-title">Markdown Theme Settings</h3>
                <button type="button" class="close-btn btn-icon" aria-label="Close theme settings" data-dialog-close>&times;</button>
            </div>
            
            <div class="notebook-theme-field">
                <label>Theme:</label>
                <select class="theme-selector">
                    ${this.themes.map(theme => `
                        <option value="${theme.id}" ${theme.id === this.currentTheme ? 'selected' : ''}>
                            ${theme.name} - ${theme.description}
                        </option>
                    `).join('')}
                </select>
            </div>
            
            <div class="notebook-theme-field">
                <label>Font Size:</label>
                <div class="notebook-theme-slider-row">
                    <input type="range" class="font-size-slider" min="10" max="24" value="${this.currentFontSize}">
                    <span class="font-size-display">${this.currentFontSize}px</span>
                </div>
            </div>
            
            <div class="notebook-theme-actions">
                <button type="button" class="cancel-btn btn-secondary">Cancel</button>
                <button type="button" class="apply-btn btn-primary">Apply</button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        
        // Set up event handlers
        this.setupModalHandlers(modal);
        
        return modal;
    }
    
    /**
     * Set up event handlers for the modal
     */
    setupModalHandlers(modal) {
        const themeSelector = modal.querySelector('.theme-selector');
        const fontSizeSlider = modal.querySelector('.font-size-slider');
        const fontSizeDisplay = modal.querySelector('.font-size-display');
        const closeBtn = modal.querySelector('.close-btn');
        const cancelBtn = modal.querySelector('.cancel-btn');
        const applyBtn = modal.querySelector('.apply-btn');
        
        // Store original values for cancel functionality
        const originalTheme = this.currentTheme;
        const originalFontSize = this.currentFontSize;
        
        // Theme selection handler
        themeSelector.addEventListener('change', () => {
            this.currentTheme = themeSelector.value;
            this.applyTheme();
            this.triggerPreviewUpdate();
        });
        
        // Font size slider handler
        fontSizeSlider.addEventListener('input', () => {
            this.currentFontSize = parseInt(fontSizeSlider.value);
            fontSizeDisplay.textContent = `${this.currentFontSize}px`;
            this.applyTheme();
            this.triggerPreviewUpdate();
        });
        
        // Close button handler
        closeBtn.addEventListener('click', () => {
            this.restoreOriginalSettings(originalTheme, originalFontSize);
            this.closeModal(modal);
        });
        
        // Cancel button handler
        cancelBtn.addEventListener('click', () => {
            this.restoreOriginalSettings(originalTheme, originalFontSize);
            this.closeModal(modal);
        });
        
        // Apply button handler
        applyBtn.addEventListener('click', () => {
            this.saveSettings();
            this.closeModal(modal);
        });
        
        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.restoreOriginalSettings(originalTheme, originalFontSize);
                this.closeModal(modal);
            }
        });
    }
    
    /**
     * Restore original settings when canceling
     */
    restoreOriginalSettings(originalTheme, originalFontSize) {
        this.currentTheme = originalTheme;
        this.currentFontSize = originalFontSize;
        this.applyTheme();
        this.triggerPreviewUpdate();
    }
    
    /**
     * Close the modal
     */
    closeModal(modal) {
        modal.remove();
    }
    
    /**
     * Trigger a preview update in the notebook manager
     */
    triggerPreviewUpdate() {
        if (window.notebookManager && window.notebookManager.updatePreview) {
            window.notebookManager.updatePreview();
        }
    }
    
    /**
     * Called when user logs in - reload settings
     */
    onUserLoggedIn() {
        this.loadSettings().then(() => {
            this.applyTheme();
            this.triggerPreviewUpdate();
        });
    }
    
    /**
     * Called when user logs out - reset to defaults
     */
    onUserLoggedOut() {
        this.currentTheme = 'nord';
        this.currentFontSize = 14;
        this.applyTheme();
        this.triggerPreviewUpdate();
    }
    
    /**
     * Get current theme info
     */
    getCurrentTheme() {
        return this.themes.find(t => t.id === this.currentTheme) || this.themes[0];
    }
    
    /**
     * Set theme programmatically
     */
    setTheme(themeId) {
        if (this.themes.some(t => t.id === themeId)) {
            this.currentTheme = themeId;
            this.applyTheme();
            this.triggerPreviewUpdate();
            this.saveSettings();
        }
    }
    
    /**
     * Set font size programmatically
     */
    setFontSize(size) {
        if (size >= 10 && size <= 24) {
            this.currentFontSize = size;
            this.applyTheme();
            this.triggerPreviewUpdate();
            this.saveSettings();
        }
    }
}

window.ToolkitModules = window.ToolkitModules || {};
window.ToolkitModules.NotebookThemeManager = NotebookThemeManager;
