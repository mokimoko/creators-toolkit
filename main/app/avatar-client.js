(function installAvatarClient(root) {
    'use strict';

    class AvatarClient {
        constructor(authManager) {
            this.authManager = authManager;
        }

        async upload(file) {
            const formData = new FormData();
            formData.append('avatar', file);
            return this.request('/api/user/avatar', { method: 'POST', body: formData });
        }

        reset() {
            return this.request('/api/user/avatar', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userContext: this.authManager.getUserContext() })
            });
        }

        versionedUrl(contract) {
            return `${contract.avatarUrl}?v=${encodeURIComponent(contract.avatarVersion)}`;
        }

        async request(url, init) {
            const response = await fetch(url, init);
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'Avatar request failed');
            return result;
        }
    }

    root.ToolkitModules = root.ToolkitModules || {};
    root.ToolkitModules.AvatarClient = AvatarClient;
})(window);
