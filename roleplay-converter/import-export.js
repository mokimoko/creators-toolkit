(function defineImportController(root) {
    'use strict';

    function updateLoadedProjectState(sourceName, importContext) {
        const state = root.RPArchiver.get('state');
        if (importContext.storageUniverse) {
            state.setImportedProject({
                universe: importContext.storageUniverse,
                filename: sourceName
            });
        } else {
            state.clearImportedProject();
        }
        root.RPArchiver.get('saveExport').updateCreateButtonLabel();
    }

    function importRoleplayHTML(htmlContent, sourceName = 'imported HTML', importContext = {}) {
        if (typeof htmlContent !== 'string' || !htmlContent.trim()) {
            throw new Error(`${sourceName} is empty or unreadable`);
        }

        if (root.RPArchiver.has('saveExport')) root.RPArchiver.get('saveExport').invalidate();

        const projectData = root.RPArchiver.get('projectData');
        const structuredProject = projectData.extractProjectData(htmlContent);
        if (structuredProject) {
            const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
            root.RPArchiver.get('formBinding').applyStructuredProject(structuredProject, doc, importContext);
            if (root.RPArchiver.has('previewExport')) {
                root.RPArchiver.get('previewExport').showStatus(
                    `Imported ${sourceName} · structured schema v${structuredProject.schemaVersion}`,
                    'success'
                );
            }
            root.RPLogger?.debug(`Imported ${sourceName} as structured schema v${structuredProject.schemaVersion}`);
            updateLoadedProjectState(sourceName, importContext);
            root.RPArchiver.get('saveExport').scheduleLoreLinkRefresh(0);
            return {
                sourceFormat: 'structured',
                schemaVersion: structuredProject.schemaVersion,
                project: structuredProject
            };
        }

        root.RPArchiver.get('legacyImport').importHTML(htmlContent, importContext);
        if (root.RPArchiver.has('previewExport')) {
            root.RPArchiver.get('previewExport').showStatus(
                `Imported ${sourceName} · legacy HTML migrated in memory`,
                'success'
            );
        }
        root.RPLogger?.debug(`Imported ${sourceName} through legacy-v0 adapter`);
        updateLoadedProjectState(sourceName, importContext);
        root.RPArchiver.get('saveExport').scheduleLoreLinkRefresh(0);
        return { sourceFormat: 'legacy-v0', schemaVersion: null, project: null };
    }

    function importRoleplayFile(file) {
        if (!(file instanceof File)) {
            return Promise.reject(new Error('No RP HTML file was selected'));
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                try {
                    importRoleplayHTML(String(reader.result || ''), file.name);
                    resolve(file);
                } catch (error) {
                    reject(error);
                }
            }, { once: true });
            reader.addEventListener('error', () => {
                reject(reader.error || new Error(`Could not read ${file.name}`));
            }, { once: true });
            reader.readAsText(file);
        });
    }

    function importFromFileInput() {
        const file = document.getElementById('import-file')?.files?.[0];
        return file ? importRoleplayFile(file) : Promise.resolve(null);
    }

    root.RPArchiver.define('importController', {
        importFromFileInput,
        importRoleplayFile,
        importRoleplayHTML
    });
})(window);
