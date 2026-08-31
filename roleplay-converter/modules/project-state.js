(function defineProjectState(root) {
    'use strict';

    const state = {
        parsedEntries: [],
        parsedParts: [],
        generatedHTML: '',
        importedProject: null
    };

    function replaceParsedContent(parts, entries) {
        state.parsedParts = Array.isArray(parts) ? parts : [];
        state.parsedEntries = Array.isArray(entries) ? entries : [];
    }

    function clearGeneratedHTML() {
        state.generatedHTML = '';
    }

    root.RPArchiver.define('state', {
        clearGeneratedHTML,
        get: () => state,
        replaceParsedContent
    });
})(window);
