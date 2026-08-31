export function installLoreCodexBootstrap(dependencies) {
    let initializationPromise = null;

    async function initializeLoreCodex() {
        if (initializationPromise) return initializationPromise;

        const finishStartupMetric = window.LorePerformanceMetrics?.start('startup');
        initializationPromise = (async () => {
            document.documentElement.dataset.loreCodexInitialization = 'initializing';
            window.initializeLoreCodexTheme?.();
            document.body.classList.add('theme-loaded');

            await dependencies.initializeEnvironment();
            await dependencies.initializeUserSystem();
            dependencies.ensureWorldCategories();
            dependencies.updateQuickLoadState();

            dependencies.initializeEventListeners();
            window.initializeFormHandlerFeatureListeners?.();
            window.initializeIconBuilderListeners?.();
            window.initializePlanEditorListeners?.();
            window.initializeColorCustomization?.();

            await dependencies.loadProjects();
            await dependencies.checkAssetsFolder();
            await window.loadUserTimeSystems?.();

            dependencies.initializeOverviewLinks();
            dependencies.initializeCustomNavigation();
            dependencies.initializeAppearanceColorPickers();
            if (typeof window.initializeLinkedLorebook === 'function') window.initializeLinkedLorebook();

            dependencies.switchMainTab('project');
            requestAnimationFrame(dependencies.initializeScrollIndicators);

            document.addEventListener('visibilitychange', () => {
                if (document.hidden || !window.loreCodexThemeManager) return;
                const savedTheme = localStorage.getItem('writingTools_currentTheme');
                if (savedTheme && savedTheme !== window.loreCodexThemeManager.currentTheme) {
                    window.loreCodexThemeManager.loadSharedTheme();
                }
            });

            await dependencies.initializeLoreCodexAbout();
            dependencies.initializeLoreContextMenu();
            document.documentElement.dataset.loreCodexInitialization = 'ready';
            finishStartupMetric?.({
                status: 'ready',
                ...window.LorePerformanceMetrics?.getRuntimeFootprint?.()
            });
            console.log('Lore Codex initialized successfully with theme support');
        })().catch(error => {
            document.documentElement.dataset.loreCodexInitialization = 'failed';
            finishStartupMetric?.({ status: 'failed' });
            console.error('Lore Codex initialization failed:', error);
            throw error;
        });

        return initializationPromise;
    }

    window.initializeLoreCodex = initializeLoreCodex;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => void initializeLoreCodex(), { once: true });
    } else {
        void initializeLoreCodex();
    }

    return initializeLoreCodex;
}
