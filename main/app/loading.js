(function installShellLoading(root) {
    'use strict';

    class ShellLoadingController {
        constructor(authManager) {
            this.authManager = authManager;
        }

        show(message = 'Loading...', icon = null) {
            this.authManager?.showGlobalLoading?.(message, icon);
        }

        hide() {
            this.authManager?.hideGlobalLoading?.();
        }
    }

    root.ToolkitModules = root.ToolkitModules || {};
    root.ToolkitModules.ShellLoadingController = ShellLoadingController;
})(typeof window !== 'undefined' ? window : null);
