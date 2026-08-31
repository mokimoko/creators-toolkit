(function installToolkitBootstrap(root) {
    'use strict';

    const COMPATIBILITY_GLOBALS = Object.freeze([
        'authManager',
        'settingsManager',
        'aboutManager',
        'mySitesManager',
        'notebookThemeManager',
        'notebookWorkspaceManager',
        'notebookManager',
        'coWriterManager',
        'mainManager'
    ]);

    async function start() {
        if (root.toolkitShell?.status) return root.toolkitShell.ready;

        const shell = {
            status: 'starting',
            compatibilityGlobals: COMPATIBILITY_GLOBALS
        };
        root.toolkitShell = shell;

        shell.ready = (async () => {
            const modules = root.ToolkitModules;
            const authManager = new modules.AuthManager();
            shell.authManager = root.authManager = authManager;
            await authManager.whenReady();

            const loading = new modules.ShellLoadingController(authManager);
            const notifications = new modules.ShellNotifications();
            const navigation = new modules.ShellNavigationController({ loading });
            const toolRegistry = new modules.ShellToolRegistry();
            const tabs = new modules.ShellTabController();
            navigation.initialize();

            const preferencesClient = new modules.PreferencesClient(authManager);
            const accountClient = new modules.AccountClient(authManager);
            const avatarClient = new modules.AvatarClient(authManager);
            const applicationPreferences = new modules.ApplicationPreferences(preferencesClient);
            const appearancePreferences = new modules.AppearancePreferences(preferencesClient);
            const aiConfiguration = new modules.AIConfigurationPreferences(preferencesClient);
            authManager.preferencesClient = preferencesClient;
            authManager.accountClient = accountClient;
            authManager.avatarClient = avatarClient;
            authManager.accountPolicyPromise = accountClient.getPolicy();

            const settingsManager = new modules.SettingsManager({
                authManager,
                preferencesClient,
                accountClient,
                avatarClient,
                applicationPreferences,
                appearancePreferences,
                aiConfiguration
            });
            const aboutManager = new modules.AboutManager();
            const dialogs = new modules.ShellDialogs({ settingsManager, aboutManager });
            const notebookThemeManager = new modules.NotebookThemeManager(preferencesClient, appearancePreferences);
            const notebookWorkspaceManager = new modules.NotebookWorkspaceManager();

            root.settingsManager = settingsManager;
            root.aboutManager = aboutManager;
            root.notebookThemeManager = notebookThemeManager;
            root.notebookWorkspaceManager = notebookWorkspaceManager;

            const notebookManager = new modules.NotebookManager();
            const coWriterManager = new modules.CoWriterManager();
            const mySitesManager = new modules.MySitesManager(authManager, navigation, preferencesClient);

            root.notebookManager = notebookManager;
            root.coWriterManager = coWriterManager;
            root.mySitesManager = mySitesManager;

            const mainManager = new modules.MainPageManager({
                authManager,
                tabs,
                navigation,
                toolRegistry,
                mySitesManager,
                notebookManager,
                notebookThemeManager,
                notebookWorkspaceManager,
                coWriterManager,
                settingsManager,
                notifications
            });
            root.mainManager = mainManager;

            const userMenu = new modules.ShellUserMenu({
                navigation,
                dialogs
            });

            Object.assign(shell, {
                navigation,
                loading,
                notifications,
                dialogs,
                preferencesClient,
                accountClient,
                avatarClient,
                applicationPreferences,
                appearancePreferences,
                aiConfiguration,
                toolRegistry,
                tabs,
                userMenu,
                settingsManager,
                aboutManager,
                mySitesManager,
                notebookThemeManager,
                notebookWorkspaceManager,
                notebookManager,
                coWriterManager,
                mainManager
            });

            tabs
                .register('my-sites', () => mainManager.handleMySitesTabActivated())
                .register('notebook', () => mainManager.handleNotebookTabActivated())
                .register('cowriter', () => mainManager.handleCoWriterTabActivated());

            mainManager.initializeMainPage();
            userMenu.initialize();
            tabs.initialize('tools');

            document.addEventListener('auth:changed', event => {
                if (event.detail?.user) mainManager.onUserLoggedIn();
                else mainManager.onUserLoggedOut();
            });

            shell.status = 'ready';
            document.dispatchEvent(new CustomEvent('shell:ready', { detail: { shell } }));
            void mainManager.checkToolAvailability();
            return shell;
        })().catch(error => {
            shell.status = 'error';
            shell.error = error;
            console.error('Creator’s Toolkit bootstrap failed:', error);
            throw error;
        });

        return shell.ready;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        void start();
    }
})(window);
