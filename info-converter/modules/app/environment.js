function exposeEnvironment(environment) {
    window.isLocal = environment.isLocal;
    window.hasFileAccess = environment.hasFileAccess;
    window.sitesFolder = environment.sitesFolder;
}

export async function detectEnvironment() {
    try {
        const response = await fetch('/api/env');
        if (!response.ok) throw new Error(`Environment request failed (${response.status})`);

        const result = await response.json();
        const environment = {
            isLocal: Boolean(result.isLocal),
            hasFileAccess: Boolean(result.hasFileAccess),
            sitesFolder: result.sitesFolder || null
        };
        exposeEnvironment(environment);
        return environment;
    } catch (error) {
        console.error('Error detecting environment:', error);
        const fallback = { isLocal: false, hasFileAccess: false, sitesFolder: null };
        exposeEnvironment(fallback);
        return fallback;
    }
}

export function renderEnvironmentAccess(environment, callbacks = {}) {
    const projectSection = document.getElementById('project-section');
    const importSection = document.getElementById('import-section');
    const saveToSitesButton = document.getElementById('save-to-sites-btn');
    const navProjectControls = document.querySelector('.nav-project-controls');
    const hasLocalAccess = environment.isLocal && environment.hasFileAccess;

    projectSection?.classList.toggle('is-hidden', !hasLocalAccess);
    importSection?.classList.toggle('is-hidden', hasLocalAccess);
    saveToSitesButton?.classList.toggle('is-hidden', !hasLocalAccess);
    navProjectControls?.classList.toggle('is-hidden', !hasLocalAccess);

    callbacks.updateOpenProjectButton?.();
    callbacks.updateGitHubSyncUI?.();
}
