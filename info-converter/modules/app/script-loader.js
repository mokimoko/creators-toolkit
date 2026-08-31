const classicScriptLoads = new Map();

export function loadClassicScript(path) {
    const existing = classicScriptLoads.get(path);
    if (existing) return existing;

    const load = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL(`../../${path}`, import.meta.url).href;
        script.async = false;
        script.addEventListener('load', () => resolve(true), { once: true });
        script.addEventListener('error', () => reject(new Error(`Could not load ${path}`)), { once: true });
        document.head.appendChild(script);
    });

    classicScriptLoads.set(path, load);
    return load;
}

export async function loadClassicScripts(paths) {
    for (const path of paths) await loadClassicScript(path);
}

export function installLazyFeatureActions(lifecycle) {
    document.addEventListener('click', async event => {
        const trigger = event.target.closest('[data-lore-lazy-feature][data-lore-lazy-action]');
        if (!trigger) return;

        event.preventDefault();
        const { loreLazyFeature: feature, loreLazyAction: action } = trigger.dataset;
        trigger.setAttribute('aria-busy', 'true');

        try {
            await lifecycle.ensureFeature(feature);
            const handler = window[action];
            if (typeof handler !== 'function') throw new Error(`Feature action ${action} is unavailable`);
            handler();
        } catch (error) {
            console.error(`Could not initialize ${feature}:`, error);
            window.showToast?.('error', 'That tool could not be opened. Please try again.');
        } finally {
            trigger.removeAttribute('aria-busy');
        }
    }, true);
}
