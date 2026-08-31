(function installShellNavigation(root) {
    'use strict';

    class ShellNavigationController {
        constructor(options = {}) {
            this.loading = options.loading;
            this.window = options.window || root;
            this.document = options.document || root.document;
            this.pending = null;
            this.initialized = false;
            this.reset = this.reset.bind(this);
            this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        }

        initialize() {
            if (this.initialized) return;
            this.initialized = true;
            this.window.addEventListener('pageshow', this.reset);
            this.window.addEventListener('online', this.reset);
            this.document.addEventListener('visibilitychange', this.handleVisibilityChange);
        }

        handleVisibilityChange() {
            if (!this.document.hidden) this.reset();
        }

        async navigate(url, options = {}) {
            if (!url || this.pending) return false;
            const destination = new URL(url, this.window.location.origin);
            this.pending = { url: destination.href, startedAt: Date.now() };
            this.document.documentElement.dataset.navigationState = 'pending';

            const message = options.message
                || (options.label ? `Loading ${options.label}...` : 'Loading...');
            this.loading?.show(message, options.icon || null);

            await new Promise(resolve => this.window.requestAnimationFrame(resolve));
            this.window.location.assign(destination.href);
            return true;
        }

        reset() {
            if (!this.pending && this.document.documentElement.dataset.navigationState !== 'pending') return;
            this.pending = null;
            delete this.document.documentElement.dataset.navigationState;
            this.loading?.hide();
        }

        isPending() {
            return Boolean(this.pending);
        }
    }

    root.ToolkitModules = root.ToolkitModules || {};
    root.ToolkitModules.ShellNavigationController = ShellNavigationController;
})(typeof window !== 'undefined' ? window : null);
