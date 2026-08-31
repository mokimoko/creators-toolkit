(function installShellDialogs(root) {
    'use strict';

    class ShellDialogs {
        constructor(options = {}) {
            this.settingsManager = options.settingsManager;
            this.aboutManager = options.aboutManager;
        }

        openSettings() {
            this.settingsManager?.openSettings?.();
        }

        openAbout() {
            this.aboutManager?.openAbout?.();
        }
    }

    root.ToolkitModules = root.ToolkitModules || {};
    root.ToolkitModules.ShellDialogs = ShellDialogs;
})(typeof window !== 'undefined' ? window : null);
