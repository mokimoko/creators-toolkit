(function installSettingsServices(root) {
    'use strict';

    class ApplicationPreferences {
        constructor(preferencesClient) { this.client = preferencesClient; }
        save(changes) { return this.client.patch('application', changes); }
    }

    class AppearancePreferences {
        constructor(preferencesClient) { this.client = preferencesClient; }
        save(changes) { return this.client.patch('appearance', changes); }
    }

    class AIConfigurationPreferences {
        constructor(preferencesClient) { this.client = preferencesClient; }
        save(changes) { return this.client.patch('ai', changes); }
    }

    root.ToolkitModules = root.ToolkitModules || {};
    Object.assign(root.ToolkitModules, {
        ApplicationPreferences,
        AppearancePreferences,
        AIConfigurationPreferences
    });
})(window);
