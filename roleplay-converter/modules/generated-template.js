(function defineGeneratedTemplate(root) {
    'use strict';

    const TEMPLATE_URL = 'generated-page/template.html';
    const RUNTIME_URL = 'generated-page/runtime.js';
    const RUNTIME_TOKEN = '{{GENERATED_PAGE_RUNTIME}}';
    let template = '';
    let initializationPromise = null;

    async function fetchText(url, label) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Unable to load ${label} (${response.status})`);
        return response.text();
    }

    function initialize() {
        if (template) return Promise.resolve(template);
        if (initializationPromise) return initializationPromise;

        initializationPromise = Promise.all([
            fetchText(TEMPLATE_URL, 'the generated page template'),
            fetchText(RUNTIME_URL, 'the generated page runtime')
        ]).then(([templateSource, runtimeSource]) => {
            if (!templateSource.includes(RUNTIME_TOKEN)) {
                throw new Error('Generated page template is missing its runtime placeholder');
            }
            const safeRuntime = runtimeSource.replace(/<\/script/gi, '<\\/script');
            template = templateSource.replace(RUNTIME_TOKEN, safeRuntime);
            return template;
        }).catch(error => {
            initializationPromise = null;
            throw error;
        });

        return initializationPromise;
    }

    function get() {
        if (!template) {
            throw new Error('Generated page template is not ready. Please wait for RP Archiver to finish starting.');
        }
        return template;
    }

    root.RPArchiver.define('generatedTemplate', { get, initialize });
})(window);
