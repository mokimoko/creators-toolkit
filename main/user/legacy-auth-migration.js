(function installLegacyAuthMigrationAdapter(root) {
    'use strict';

    const DATA_KEYS = Object.freeze({
        users: 'writingTools_users',
        preferences: 'writingTools_preferences',
        usage: 'writingTools_usage'
    });
    const STATUS_KEY = 'writingTools_migrationOffered';

    class LegacyAuthMigrationAdapter {
        constructor(options = {}) {
            this.storage = options.storage || root.localStorage;
            this.fetch = options.fetch || root.fetch.bind(root);
            this.apiBase = options.apiBase || root.location.origin;
        }

        hasData() {
            return Object.values(DATA_KEYS).some(key => this.storage.getItem(key));
        }

        getStatus() {
            return this.storage.getItem(STATUS_KEY);
        }

        markDeclined() {
            this.storage.setItem(STATUS_KEY, 'declined');
        }

        readPayload() {
            const readObject = key => JSON.parse(this.storage.getItem(key) || '{}');
            return {
                users: readObject(DATA_KEYS.users),
                preferences: readObject(DATA_KEYS.preferences),
                usage: readObject(DATA_KEYS.usage)
            };
        }

        async migrate() {
            const response = await this.fetch(`${this.apiBase}/api/migrate/localStorage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.readPayload())
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || result.success !== true) {
                throw new Error(result.error || 'Legacy browser-data migration failed');
            }
            return result;
        }

        complete() {
            this.storage.setItem(STATUS_KEY, 'completed');
            Object.values(DATA_KEYS).forEach(key => this.storage.removeItem(key));
        }
    }

    root.LegacyAuthMigrationAdapter = LegacyAuthMigrationAdapter;
})(typeof window !== 'undefined' ? window : null);
