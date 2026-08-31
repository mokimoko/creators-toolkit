// Theme Manager for RP Archiver
class RPThemeManager {
    constructor() {
        this.themes = {};
        this.currentTheme = 'default';
        this.SHARED_THEME_KEY = 'writingTools_currentTheme';
        this.initializationPromise = null;
        this.storageListenerInitialized = false;
    }

    init() {
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = (async () => {
            await this.loadThemes();
            this.loadSharedTheme();
            this.setupStorageListener();
            return this;
        })();

        return this.initializationPromise;
    }

    async loadThemes() {
        try {
            const response = await fetch('../themes/themes.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.themes = await response.json();
        } catch (error) {
            window.RPLogger?.error('Failed to load themes:', error);
            this.themes = { default: { name: 'Default', colors: {} } };
        }
    }

    loadSharedTheme() {
        const savedTheme = localStorage.getItem(this.SHARED_THEME_KEY) || 'default';
        this.applyTheme(savedTheme);
    }

    applyTheme(themeId) {
        if (!this.themes[themeId]) {
            window.RPLogger?.warn(`Theme ${themeId} not found; using default`);
            themeId = 'default';
        }

        const theme = this.themes[themeId];
        const root = document.documentElement;

        Object.entries(theme.colors).forEach(([property, value]) => {
            root.style.setProperty(`--${property}`, value);
        });

        this.currentTheme = themeId;
        document.body.classList.add('theme-loaded');
        window.RPLogger?.debug(`Theme applied: ${theme.name}`);
    }

    setupStorageListener() {
        if (this.storageListenerInitialized) return;
        this.storageListenerInitialized = true;

        window.addEventListener('storage', event => {
            if (event.key === this.SHARED_THEME_KEY && event.newValue !== event.oldValue) {
                this.loadSharedTheme();
            }
        });
    }
}

let rpThemeManager = null;
window.RPArchiver.define('themeManager', {
    Manager: RPThemeManager,
    getManager: () => rpThemeManager,
    initialize() {
        if (!rpThemeManager) rpThemeManager = new RPThemeManager();
        return rpThemeManager.init();
    }
});
