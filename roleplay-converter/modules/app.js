(function initializeRPArchiverNamespace(root) {
    'use strict';

    if (root.RPArchiver) return;

    const modules = Object.create(null);

    root.RPArchiver = {
        define(name, api) {
            if (!name || typeof name !== 'string') {
                throw new TypeError('RP Archiver modules require a name');
            }
            if (modules[name]) {
                throw new Error(`RP Archiver module "${name}" is already defined`);
            }
            modules[name] = Object.freeze(api || {});
            return modules[name];
        },

        get(name) {
            const module = modules[name];
            if (!module) throw new Error(`RP Archiver module "${name}" is unavailable`);
            return module;
        },

        has(name) {
            return Boolean(modules[name]);
        }
    };
})(window);
