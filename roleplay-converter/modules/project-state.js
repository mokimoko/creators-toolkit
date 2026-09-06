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

    function clearImportedProject() {
        state.importedProject = null;
    }

    function setImportedProject(project) {
        state.importedProject = project && typeof project === 'object' ? { ...project } : null;
    }

    root.RPArchiver.define('state', {
        clearGeneratedHTML,
        clearImportedProject,
        get: () => state,
        replaceParsedContent,
        setImportedProject
    });
})(window);
