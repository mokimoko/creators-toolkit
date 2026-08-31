// Main page behavior. Shell ownership and manager construction live in app/bootstrap.js.

class MainPageManager {
    constructor(options = {}) {
        this.authManager = options.authManager;
        this.tabs = options.tabs;
        this.navigation = options.navigation;
        this.toolRegistry = options.toolRegistry;
        this.mySitesManager = options.mySitesManager;
        this.notebookManager = options.notebookManager;
        this.notebookThemeManager = options.notebookThemeManager;
        this.notebookWorkspaceManager = options.notebookWorkspaceManager;
        this.coWriterManager = options.coWriterManager;
        this.settingsManager = options.settingsManager;
        this.notifications = options.notifications;
        this.initialized = false;
    }

    initializeMainPage() {
        if (this.initialized) return;
        this.initialized = true;
        this.setupCardInteractions();
        this.setupKeyboardShortcuts();
        this.handleImageErrors();
        this.hideAIFeaturesIfNeeded();
    }

    async hideAIFeaturesIfNeeded() {
        try {
            const preferences = await this.authManager?.loadUserPreferences?.() || {};
            const enabled = preferences.aiToolsEnabled === true;
            const cowriterTab = document.querySelector('[data-tab="cowriter"]');
            const managersDropdown = document.querySelector('.nav-dropdown');
            if (cowriterTab) cowriterTab.hidden = !enabled;
            if (managersDropdown) managersDropdown.hidden = !enabled;
        } catch (error) {
            console.error('Error checking AI tools setting:', error);
        }
    }

    showAIFeatures() {
        const cowriterTab = document.querySelector('[data-tab="cowriter"]');
        const managersDropdown = document.querySelector('.nav-dropdown');
        if (cowriterTab) cowriterTab.hidden = false;
        if (managersDropdown) managersDropdown.hidden = false;
    }

    handleMySitesTabActivated() {
        const user = this.authManager?.getCurrentUser?.();
        if (!user) {
            this.mySitesManager?.showEmptyState('Please log in to view your sites.');
            return;
        }
        return this.mySitesManager?.refresh();
    }

    handleNotebookTabActivated() {
        const user = this.authManager?.getCurrentUser?.();
        if (!user) {
            this.notebookManager?.clearUserData?.();
            return;
        }
        this.notebookManager?.onUserLoggedIn?.();
        this.notebookThemeManager?.onNotebookTabActivated?.();
    }

    handleCoWriterTabActivated() {
        const user = this.authManager?.getCurrentUser?.();
        if (!user) {
            this.coWriterManager?.onGuestAccess?.();
            return;
        }
        this.coWriterManager?.onUserLoggedIn?.();
        this.notebookThemeManager?.onCoWriterTabActivated?.();
    }

    setupCardInteractions() {
        document.querySelectorAll('.tool-card, .mini-tool-card').forEach(card => {
            if (card.dataset.shellBound === 'true') return;
            card.dataset.shellBound = 'true';
            card.tabIndex = 0;
            card.addEventListener('click', event => {
                if (event.target.closest('.card-launch-btn')) return;
                const button = card.querySelector('.card-launch-btn');
                button ? this.handleToolLaunch(button) : this.handleMiniToolLaunch(card);
            });
            card.addEventListener('keydown', event => {
                if (!['Enter', ' '].includes(event.key)) return;
                event.preventDefault();
                const button = card.querySelector('.card-launch-btn');
                button ? this.handleToolLaunch(button) : this.handleMiniToolLaunch(card);
            });
        });

        document.querySelectorAll('.card-launch-btn').forEach(button => {
            if (button.dataset.shellBound === 'true') return;
            button.dataset.shellBound = 'true';
            button.addEventListener('click', event => {
                event.stopPropagation();
                this.handleToolLaunch(button);
            });
        });
    }

    handleToolLaunch(button) {
        const card = button.closest('.tool-card');
        return this.launchTool(card, button.dataset.url);
    }

    handleMiniToolLaunch(card) {
        return this.launchTool(card, card.dataset.url);
    }

    async launchTool(card, fallbackUrl) {
        const toolId = card?.dataset.tool;
        const tool = this.toolRegistry?.resolve(toolId, fallbackUrl);
        if (!tool?.url) {
            this.showToast('Tool URL not configured', 'error');
            return false;
        }

        this.trackToolUsage(toolId);
        card?.classList.add('loading');
        try {
            return await this.navigation.navigate(tool.url, {
                label: tool.label,
                icon: 'fas fa-tools'
            });
        } catch (error) {
            card?.classList.remove('loading');
            this.navigation.reset();
            this.showToast('Failed to load tool', 'error');
            console.error('Navigation error:', error);
            return false;
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', event => {
            const active = document.activeElement;
            const isTyping = active && (
                active.matches?.('input, textarea, select') || active.isContentEditable
            );
            if (isTyping) return;

            const tabByKey = { 1: 'tools', 2: 'my-sites', 3: 'cowriter', 4: 'notebook' };
            if (!event.ctrlKey && !event.metaKey && !event.altKey && tabByKey[event.key]) {
                event.preventDefault();
                this.tabs.activate(tabByKey[event.key], { reason: 'keyboard' });
            }
        });
    }

    handleImageErrors() {
        document.querySelectorAll('.card-bg-image').forEach(image => {
            image.addEventListener('error', () => {
                const card = image.closest('.tool-card');
                image.hidden = true;
                const background = card?.querySelector('.card-background');
                if (background) {
                    background.style.background = 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)';
                }
            }, { once: true });
        });
    }

    showToast(message, type = 'info') {
        return this.notifications?.show(message, type);
    }

    checkToolAvailability() {
        return this.toolRegistry?.checkAvailability();
    }

    trackToolUsage(toolName) {
        if (!toolName) return;
        const usage = JSON.parse(localStorage.getItem('writingTools_usage') || '{}');
        usage[toolName] = (usage[toolName] || 0) + 1;
        usage.lastUsed = Date.now();
        localStorage.setItem('writingTools_usage', JSON.stringify(usage));
    }

    onUserLoggedIn() {
        this.hideAIFeaturesIfNeeded();
        if (this.tabs.activeTab === 'my-sites') this.mySitesManager?.refresh();
        if (this.tabs.activeTab === 'cowriter') this.coWriterManager?.onUserLoggedIn?.();
        if (this.tabs.activeTab === 'notebook') this.notebookManager?.onUserLoggedIn?.();
        this.notebookWorkspaceManager?.onUserLoggedIn?.();
        this.notebookThemeManager?.onUserLoggedIn?.();
        this.settingsManager?.onUserLoggedIn?.();
    }

    onUserLoggedOut() {
        this.showAIFeatures();
        this.mySitesManager?.clear('user_logged_out');
        this.coWriterManager?.onUserLoggedOut?.();
        this.notebookManager?.onUserLoggedOut?.();
        this.notebookThemeManager?.onUserLoggedOut?.();
        this.settingsManager?.onUserLoggedOut?.();
        this.tabs.activate('tools', { reason: 'auth' });
    }
}

window.ToolkitModules = window.ToolkitModules || {};
window.ToolkitModules.MainPageManager = MainPageManager;
