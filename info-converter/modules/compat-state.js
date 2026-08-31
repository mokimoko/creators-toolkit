'use strict';

(function createLoreCompatibilityState(global) {
    const defaults = Object.freeze({
        editingIndex: -1,
        editingType: '',
        editingCategory: '',
        editingEventIndex: -1,
        editingEventContext: 'main',
        currentEditingItem: null,
        currentLoreProject: null,
        currentPublicSiteData: null,
        lastPublicProjectionSummary: null,
        lastLoreImportReport: null,
        htmlGenerated: false,
        dataModified: false,
        projectLoading: false
    });
    const values = { ...defaults };

    for (const key of Object.keys(defaults)) {
        const existing = Object.getOwnPropertyDescriptor(global, key);
        if (existing && !existing.configurable) continue;
        Object.defineProperty(global, key, {
            configurable: true,
            enumerable: false,
            get: () => values[key],
            set: value => { values[key] = value; }
        });
    }

    function resetProjectScoped() {
        for (const [key, value] of Object.entries(defaults)) {
            if (key !== 'projectLoading') values[key] = value;
        }
    }

    global.LoreCodexCompatState = Object.freeze({
        get: key => values[key],
        resetProjectScoped,
        set: (key, value) => {
            if (!Object.prototype.hasOwnProperty.call(defaults, key)) {
                throw new Error(`Unknown Lore Codex compatibility state key: ${key}`);
            }
            values[key] = value;
            return value;
        },
        snapshot: () => ({ ...values })
    });
})(window);
