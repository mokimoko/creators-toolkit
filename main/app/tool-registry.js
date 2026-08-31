(function installToolRegistry(root) {
    'use strict';

    const TOOL_DEFINITIONS = Object.freeze({
        'info-converter': Object.freeze({ label: 'Lore Codex', url: '/info-converter' }),
        'roleplay-converter': Object.freeze({ label: 'RP Archiver', url: '/roleplay-converter' }),
        extractor: Object.freeze({ label: 'Lorebook Manager', url: '/extractor' }),
        'character-manager': Object.freeze({ label: 'Character Manager', url: '/character-manager' })
    });

    class ShellToolRegistry {
        constructor(options = {}) {
            this.fetch = options.fetch || root.fetch.bind(root);
            this.availability = new Map();
        }

        get(toolId) {
            return TOOL_DEFINITIONS[toolId] || null;
        }

        resolve(toolId, fallbackUrl = null) {
            const tool = this.get(toolId);
            return tool || (fallbackUrl ? { label: toolId, url: fallbackUrl } : null);
        }

        async checkAvailability() {
            const results = await Promise.all(Object.entries(TOOL_DEFINITIONS).map(async ([id, tool]) => {
                try {
                    const response = await this.fetch(tool.url, { method: 'HEAD', cache: 'no-cache' });
                    return [id, response.ok];
                } catch {
                    return [id, false];
                }
            }));
            results.forEach(([id, available]) => this.availability.set(id, available));
            return new Map(this.availability);
        }
    }

    root.ToolkitModules = root.ToolkitModules || {};
    root.ToolkitModules.ShellToolRegistry = ShellToolRegistry;
})(typeof window !== 'undefined' ? window : null);
