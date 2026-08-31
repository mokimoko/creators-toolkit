(function installAccountClient(root) {
    'use strict';

    class AccountClient {
        constructor(authManager) {
            this.authManager = authManager;
        }

        async getPolicy() {
            return this.request('/api/auth/account-policy');
        }

        async getProfile() {
            return this.request('/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userContext: this.authManager.getUserContext() })
            });
        }

        async updateProfile(updates) {
            const result = await this.request('/api/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userContext: this.authManager.getUserContext(), updates })
            });
            this.authManager.applyAccountUpdate?.(result);
            return result;
        }

        deleteAccount(password) {
            return this.request('/api/auth/delete-account', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userContext: this.authManager.getUserContext(), password })
            });
        }

        async request(url, init) {
            const response = await fetch(url, init);
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
            return result;
        }
    }

    root.ToolkitModules = root.ToolkitModules || {};
    root.ToolkitModules.AccountClient = AccountClient;
})(window);
