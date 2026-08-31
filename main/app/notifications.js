(function installShellNotifications(root) {
    'use strict';

    class ShellNotifications {
        constructor(documentRef = root.document) {
            this.document = documentRef;
        }

        show(message, type = 'info', duration = 3000) {
            const container = this.document.getElementById('toast-container');
            if (!container) return null;
            const toast = this.document.createElement('div');
            toast.className = `toast ${type}`;
            toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
            toast.textContent = message;
            container.appendChild(toast);
            root.setTimeout(() => toast.remove(), duration);
            return toast;
        }
    }

    root.ToolkitModules = root.ToolkitModules || {};
    root.ToolkitModules.ShellNotifications = ShellNotifications;
})(typeof window !== 'undefined' ? window : null);
