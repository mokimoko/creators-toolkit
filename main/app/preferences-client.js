(function installPreferencesClient(root) {
    'use strict';

    const FIELD_SECTIONS = Object.freeze({
        autoSave: 'application',
        defaultTemplate: 'application',
        notifications: 'application',
        theme: 'appearance',
        markdownTheme: 'appearance',
        markdownFontSize: 'appearance',
        aiToolsEnabled: 'ai',
        favorites: 'sites',
        tags: 'sites'
    });

    class PreferencesClient {
        constructor(authManager) {
            this.authManager = authManager;
        }

        async get(options = {}) {
            const response = await fetch('/api/user/preferences/get', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: options.signal,
                body: JSON.stringify({ userContext: this.authManager.getUserContext() })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'Failed to load preferences');
            return result;
        }

        async patch(section, changes, options = {}) {
            const response = await fetch(`/api/user/preferences/${encodeURIComponent(section)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                signal: options.signal,
                body: JSON.stringify({
                    userContext: this.authManager.getUserContext(),
                    changes
                })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'Failed to save preferences');
            return result;
        }

        async patchFields(fields) {
            const grouped = new Map();
            Object.entries(fields || {}).forEach(([field, value]) => {
                const section = FIELD_SECTIONS[field];
                if (!section) throw new Error(`Unknown preference: ${field}`);
                grouped.set(section, { ...(grouped.get(section) || {}), [field]: value });
            });
            let result = await this.get();
            for (const [section, changes] of grouped) result = await this.patch(section, changes);
            return result;
        }
    }

    root.ToolkitModules = root.ToolkitModules || {};
    root.ToolkitModules.PreferencesClient = PreferencesClient;
})(window);
