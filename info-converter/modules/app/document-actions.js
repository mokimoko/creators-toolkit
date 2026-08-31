function createResetInfoData() {
    return {
        basic: {
            title: '',
            subtitle: '',
            banner: '',
            overviewTitle: '',
            overview: '',
            overviewImage: '',
            backgroundColor: '',
            backgroundImage: '',
            overviewContentBgImage: '',
            overviewContentBgColor: '',
            overviewContentOpacity: 100,
            overviewContentBlur: 0,
            mainContainerColor: '',
            mainContainerBgImage: '',
            mainContainerBgColor: '',
            titleSettings: {
                show: true,
                position: 'left',
                font: 'theme',
                color: ''
            }
        },
        appearance: {
            template: 'journal',
            overviewStyle: 'journal',
            navigationStyle: 'journal',
            colorScheme: 'current',
            fontSet: 'serif',
            bannerSize: 'large',
            cardStyle: 'current',
            containerStyle: 'left-border',
            subcontainerStyle: 'soft-bg',
            infodisplayStyle: 'default'
        },
        characters: [],
        storylines: [],
        storylinesOptions: {
            showTOC: true,
            showSections: true,
            showSubsections: true
        },
        charactersOptions: {
            showByFaction: true,
            showInfoDisplay: false
        },
        eventsOptions: { customLabel: 'Events' },
        cultureOptions: { customLabel: 'Culture' },
        cultivationOptions: { customLabel: 'Cultivation' },
        magicOptions: { customLabel: 'Magic' },
        plans: [],
        plansOptions: { selectedTimeSystemId: 'default' },
        world: {
            general: [],
            locations: [],
            concepts: [],
            events: [],
            creatures: [],
            plants: [],
            items: [],
            factions: [],
            culture: [],
            cultivation: [],
            magic: []
        }
    };
}

export function createDocumentActions(dependencies) {
    function downloadTextFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const element = document.createElement('a');
        element.href = url;
        element.download = filename;
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        URL.revokeObjectURL(url);
    }

    function downloadHTML() {
        const html = document.getElementById('html-output').value;
        if (!html) {
            dependencies.showStatus('error', 'Please generate HTML first');
            return;
        }

        const projectName = document.getElementById('project-name')?.value.trim() || 'info';
        const filenameInput = document.getElementById('html-filename');
        let filename = filenameInput?.value.trim() || projectName || 'info';
        if (!filename.endsWith('.html')) filename += '.html';
        filename = filename.replace(/[^a-zA-Z0-9-_.]/g, '');

        downloadTextFile(html, filename, 'text/html;charset=utf-8');
    }

    function downloadEditableArchive() {
        if (!window.LoreProjectContract) {
            dependencies.showStatus('error', 'Lore project model is unavailable');
            return;
        }

        let publicHtml = document.getElementById('html-output').value;
        if (!publicHtml || !window.htmlGenerated || window.dataModified) {
            publicHtml = dependencies.generateHTML();
        }

        const editableProject = window.LoreProjectContract.normalizeLoreProject(dependencies.collectFormData());
        const serializedProject = window.LoreProjectContract.serializeEditableProjectData(editableProject);
        const projectScript = `\n<script type="application/json" id="lore-codex-project-data">${serializedProject}<\/script>\n`;
        const archiveHtml = publicHtml.includes('</body>')
            ? publicHtml.replace('</body>', `${projectScript}</body>`)
            : `${publicHtml}${projectScript}`;
        const projectName = document.getElementById('project-name')?.value.trim() || 'lore-codex';
        const safeName = projectName.replace(/[^a-zA-Z0-9-_.]/g, '-') || 'lore-codex';
        downloadTextFile(archiveHtml, `${safeName}.editable.html`, 'text/html;charset=utf-8');
        dependencies.showToast('success', 'Editable archive downloaded. It contains complete authoring data; keep it private.', 6000);
    }

    function importHTML() {
        const fileInput = document.getElementById('import-file');
        if (!fileInput.files || fileInput.files.length === 0) {
            dependencies.notifyUser('Please select a file to import');
            return;
        }

        const reader = new FileReader();
        reader.onload = async event => {
            await dependencies.parseImportedHTML(event.target.result);
        };
        reader.readAsText(fileInput.files[0]);
    }

    function resetForm() {
        if (!confirm('Are you sure you want to reset all data? This cannot be undone.')) return;

        dependencies.replaceInfoData(createResetInfoData());

        const clearedFields = [
            'world-title',
            'world-subtitle',
            'world-title-font',
            'world-title-color',
            'banner-image',
            'overview-title',
            'overview-text',
            'overview-image',
            'background-color',
            'background-image',
            'overview-content-bg-image',
            'overview-content-bg-color',
            'main-container-bg-image',
            'main-container-bg-color',
            'modal-bg-image',
            'modal-bg-color',
            'html-output',
            'project-name'
        ];
        for (const fieldId of clearedFields) {
            const field = document.getElementById(fieldId);
            if (field) field.value = '';
        }

        const resetValues = {
            'overview-content-opacity': '100',
            'overview-content-blur': '0',
            'world-title-font': 'theme',
            'world-title-alignment': 'left',
            'world-title-position': 'bottom'
        };
        for (const [fieldId, value] of Object.entries(resetValues)) {
            const field = document.getElementById(fieldId);
            if (field) field.value = value;
        }

        const titleColorPicker = document.getElementById('world-title-color-picker');
        if (titleColorPicker) titleColorPicker.value = '#000000';
        const titleShowCheckbox = document.getElementById('world-title-visibility');
        if (titleShowCheckbox) titleShowCheckbox.checked = true;

        dependencies.updateAllContentLists();
        dependencies.populateAppearanceControls();
        dependencies.clearCurrentProject();
        dependencies.resetRepositoryState();

        const projectList = document.getElementById('project-list');
        if (projectList) {
            projectList.selectedIndex = 0;
            const loadProjectButton = document.getElementById('load-project-btn');
            if (loadProjectButton) loadProjectButton.disabled = true;
        }

        void dependencies.checkAssetsFolder();
        dependencies.updateOpenProjectButton();
        dependencies.showStatus('success', 'Form reset successfully');
    }

    return {
        downloadEditableArchive,
        downloadHTML,
        importHTML,
        resetForm
    };
}
