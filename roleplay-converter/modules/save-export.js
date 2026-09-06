(function defineSaveExport(root) {
    'use strict';

    let generatedDocumentReady = false;
    let generationInProgress = false;
    let savedGeneratedDocument = '';
    let savedIdentityKey = '';
    let savedRoleplayUrl = '';
    let loreUpdatedDocument = '';
    let loreTargets = [];
    let loreLookupTimer = null;
    let loreLookupRequest = 0;
    let loreUpdateInProgress = false;
    let downloadMenuController = null;

    function element(id) {
        return document.getElementById(id);
    }

    function showStatus(message, type = 'info', duration = 5000) {
        root.RPArchiver.get('previewExport').showStatus(message, type, duration);
    }

    function getCleanTitleValue() {
        return root.RPArchiver.get('htmlRenderer').getCleanTitle() || '';
    }

    function getCurrentIdentity() {
        const universe = element('universe')?.value.trim() || '';
        const cleanTitle = getCleanTitleValue();
        if (!universe || !cleanTitle) return null;
        const filename = `${cleanTitle}.html`;
        return { universe, filename, key: `${universe}\n${filename}` };
    }

    function updateCreateButtonLabel() {
        const button = element('convert-btn');
        if (!button) return;
        const isLoadedProject = Boolean(root.RPArchiver.get('state').get().importedProject);
        button.innerHTML = isLoadedProject
            ? '<i class="fas fa-arrows-rotate" aria-hidden="true"></i><span>Update</span>'
            : '<i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i><span>Create</span>';
        button.title = isLoadedProject
            ? 'Update the loaded roleplay preview'
            : 'Create a new roleplay preview';
        updateDownloadMenuState();
    }

    function updateLoreButtonLabel(button, updated) {
        const label = button?.querySelector('span');
        if (!label) return;
        const count = loreTargets.length;
        if (updated) {
            label.textContent = count === 1 ? 'Lore Codex copy up to date' : `${count} Lore Codex copies up to date`;
        } else {
            label.textContent = count === 1 ? 'Update Lore Codex copy' : `Update ${count} Lore Codex copies`;
        }
    }

    function setActionState() {
        ['save-project-btn', 'copy-btn'].forEach(id => {
            const button = element(id);
            if (button) button.disabled = generationInProgress || !generatedDocumentReady;
        });
        updateDownloadMenuState();

        const openButton = element('open-saved-roleplay-btn');
        if (openButton) {
            openButton.disabled = generationInProgress || !savedRoleplayUrl;
            openButton.title = savedRoleplayUrl
                ? 'Open the saved roleplay in a new browser tab'
                : 'Save the generated roleplay to the Toolkit first';
        }

        const loreButton = element('update-lore-copy-btn');
        if (!loreButton) return;
        const currentHTML = root.RPArchiver.has('state') ? root.RPArchiver.get('state').get().generatedHTML : '';
        const identity = getCurrentIdentity();
        const savedCurrentDocument = Boolean(
            generatedDocumentReady
            && currentHTML
            && savedGeneratedDocument === currentHTML
            && identity
            && savedIdentityKey === identity.key
        );
        const updated = savedCurrentDocument && loreUpdatedDocument === currentHTML;
        loreButton.hidden = loreTargets.length === 0;
        loreButton.disabled = generationInProgress || loreUpdateInProgress || !savedCurrentDocument || updated;
        loreButton.dataset.state = updated ? 'updated' : 'ready';
        const linkedProjects = loreTargets.map(target => target.projectName).join(', ');
        loreButton.title = loreTargets.length
            ? (savedCurrentDocument
                ? `Linked to ${linkedProjects}`
                : `Generate and save this roleplay before updating ${linkedProjects}`)
            : '';
        loreButton.setAttribute('aria-busy', String(loreUpdateInProgress));
        updateLoreButtonLabel(loreButton, updated);
    }

    function setGenerationInProgress(inProgress) {
        generationInProgress = Boolean(inProgress);
        setActionState();
    }

    function hideDownloadFallback() {
        const fallback = element('save-fallback');
        if (fallback) fallback.hidden = true;
    }

    function showDownloadFallback() {
        const fallback = element('save-fallback');
        if (fallback) fallback.hidden = false;
    }

    function invalidate() {
        generatedDocumentReady = false;
        savedGeneratedDocument = '';
        savedIdentityKey = '';
        savedRoleplayUrl = '';
        loreUpdatedDocument = '';
        if (root.RPArchiver.has('state')) root.RPArchiver.get('state').clearGeneratedHTML();
        hideDownloadFallback();
        setActionState();
    }

    function markGenerated(html) {
        const value = typeof html === 'string' ? html : '';
        generatedDocumentReady = Boolean(value.trim());
        savedRoleplayUrl = '';
        root.RPArchiver.get('state').get().generatedHTML = generatedDocumentReady ? value : '';
        hideDownloadFallback();
        setActionState();
    }

    function getGeneratedDocument() {
        const stateHTML = root.RPArchiver.get('state').get().generatedHTML;
        const outputHTML = element('html-output')?.value || '';
        if (!generatedDocumentReady || !stateHTML || stateHTML !== outputHTML) {
            throw new Error('Generate the preview successfully before saving or exporting.');
        }
        return stateHTML;
    }

    function getExportDetails() {
        const title = element('title')?.value.trim() || 'untitled';
        const cleanTitle = getCleanTitleValue();
        return {
            html: getGeneratedDocument(),
            title,
            cleanTitle: cleanTitle || 'untitled',
            universe: element('universe')?.value.trim() || 'Universe',
            cssTemplate: element('css-template')?.value || 'generated.css'
        };
    }

    function getStoredProject() {
        const project = root.RPArchiver.get('state').get().importedProject;
        if (!project?.universe || !project?.filename) return null;
        return { universe: project.universe, filename: project.filename };
    }

    function updateDownloadMenuState() {
        if (!downloadMenuController) return;
        const htmlReady = generatedDocumentReady && !generationInProgress;
        const storyReady = Boolean(getStoredProject()) && !generationInProgress;
        const universeReady = Boolean(getStoredProject()) && !generationInProgress;

        downloadMenuController.setItemState('html', {
            disabled: !htmlReady,
            description: htmlReady ? 'Current generated .html file' : 'Create or update the roleplay first'
        });
        downloadMenuController.setItemState('story', {
            disabled: !storyReady,
            description: storyReady ? 'Saved HTML, CSS, and only its images' : 'Save or load this roleplay first'
        });
        downloadMenuController.setItemState('universe', {
            disabled: !universeReady,
            description: universeReady ? 'Complete saved universe folder as a ZIP' : 'Save or load a roleplay first'
        });
    }

    function downloadSavedArchive(kind) {
        const project = getStoredProject();
        if (!project || !root.userSessionManager?.getUserContext || !root.ToolkitDownloadMenu) {
            showStatus(`Save or load ${kind === 'story' ? 'this roleplay' : 'a roleplay'} before downloading.`, 'error');
            return false;
        }

        const endpoint = kind === 'story'
            ? '/api/roleplay/export-story'
            : '/api/roleplay/export-universe';
        const fields = {
            universe: project.universe,
            userContext: root.userSessionManager.getUserContext()
        };
        if (kind === 'story') fields.filename = project.filename;
        root.ToolkitDownloadMenu.submitPostDownload(endpoint, fields);
        const label = kind === 'story' ? project.filename : project.universe;
        showStatus(`${kind === 'story' ? 'Current story' : 'Entire universe'} download started: ${label}`, 'success', 7000);
        root.RPArchiver.get('notifications').show('success', 'ZIP download started');
        return true;
    }

    function initializeDownloadMenu() {
        if (!root.ToolkitDownloadMenu) return;
        downloadMenuController = root.ToolkitDownloadMenu.initialize('#roleplay-download-menu', {
            onOpen: updateDownloadMenuState,
            onSelect(action) {
                if (action === 'html') exportHTML();
                if (action === 'story' || action === 'universe') downloadSavedArchive(action);
            }
        });
        updateDownloadMenuState();
    }

    function createSaveFormData(details) {
        const selected = getSelectedImageFiles();
        const formData = new FormData();
        formData.append('html', details.html);
        formData.append('title', details.title);
        formData.append('cleanTitle', details.cleanTitle);
        formData.append('universe', details.universe);
        formData.append('cssTemplate', details.cssTemplate);
        formData.append('userContext', JSON.stringify(root.userSessionManager.getUserContext()));

        if (selected.backgroundPath && selected.backgroundExists) {
            formData.append('existingBackgroundPath', selected.backgroundPath);
        }
        if (selected.bannerPath && selected.bannerExists) {
            formData.append('existingBannerPath', selected.bannerPath);
        }
        if (selected.storyPaths.length) {
            formData.append('existingStoryPaths', JSON.stringify(selected.storyPaths));
        }
        if (selected.backgroundFile) formData.append('backgroundImage', selected.backgroundFile);
        if (selected.bannerFile) formData.append('bannerImage', selected.bannerFile);
        selected.storyFiles.forEach((file, index) => formData.append(`storyImage_${index}`, file));
        return formData;
    }

    async function refreshLoreLinks(options = {}) {
        const requestId = ++loreLookupRequest;
        const identity = getCurrentIdentity();
        loreTargets = [];
        setActionState();
        if (!identity || !root.userSessionManager?.getUserContext) return [];

        try {
            const response = await fetch('/api/roleplay/lore-links', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: identity.filename,
                    universe: identity.universe,
                    userContext: root.userSessionManager.getUserContext()
                })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) throw new Error(result.error || `Lore link lookup failed (${response.status})`);
            if (requestId !== loreLookupRequest || getCurrentIdentity()?.key !== identity.key) return [];

            loreTargets = Array.isArray(result.targets)
                ? result.targets.filter(target => target.destinationExists)
                : [];
            setActionState();
            return loreTargets;
        } catch (error) {
            if (requestId === loreLookupRequest) {
                loreTargets = [];
                setActionState();
            }
            root.RPLogger?.warn('Could not check Lore Codex roleplay links:', error);
            if (options.reportErrors) {
                showStatus(`Could not check Lore Codex links: ${error.message}`, 'error');
            }
            return [];
        }
    }

    function scheduleLoreLinkRefresh(delay = 250) {
        window.clearTimeout(loreLookupTimer);
        loreLookupTimer = window.setTimeout(() => {
            loreLookupTimer = null;
            void refreshLoreLinks();
        }, delay);
    }

    function setBusy(button, busy) {
        if (!button) return;
        button.disabled = busy || !generatedDocumentReady;
        button.setAttribute('aria-busy', String(busy));
    }

    async function saveProject() {
        const saveButton = element('save-project-btn');
        hideDownloadFallback();

        try {
            const details = getExportDetails();
            if (!root.userSessionManager?.getUserContext) {
                throw new Error('Toolkit project storage is unavailable in this session.');
            }

            savedGeneratedDocument = '';
            savedIdentityKey = '';
            savedRoleplayUrl = '';
            loreUpdatedDocument = '';
            setActionState();
            setBusy(saveButton, true);
            showStatus('Saving project to the Toolkit…', 'info');
            const response = await fetch('/api/roleplay/save', {
                method: 'POST',
                body: createSaveFormData(details)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) {
                throw new Error(result.error || `Toolkit save failed (${response.status})`);
            }
            if (!result.assetManifest?.html?.path || !result.assetManifest?.template?.path) {
                throw new Error('The Toolkit did not return a complete save manifest.');
            }
            if (typeof result.viewUrl !== 'string' || !result.viewUrl.startsWith('/roleplays/')) {
                throw new Error('The Toolkit did not return a valid roleplay URL.');
            }

            const mediaCount = result.assetManifest.media?.length || 0;
            const mediaSummary = mediaCount ? ` · ${mediaCount} media asset${mediaCount === 1 ? '' : 's'}` : '';
            showStatus(`Saved project to Toolkit: ${result.universe}/${result.filename}${mediaSummary}`, 'success', 7000);
            root.RPArchiver.get('notifications').show('success', 'Project saved to Toolkit');
            root.RPLogger?.debug('RP project save manifest:', result.assetManifest);
            const identity = getCurrentIdentity();
            savedGeneratedDocument = details.html;
            savedIdentityKey = identity?.key || '';
            savedRoleplayUrl = result.viewUrl;
            loreUpdatedDocument = '';
            root.RPArchiver.get('state').setImportedProject({
                universe: result.universe,
                filename: result.filename
            });
            updateCreateButtonLabel();
            await refreshLoreLinks({ reportErrors: true });
            setActionState();
            return result;
        } catch (error) {
            root.RPLogger?.error('Toolkit project save failed:', error);
            showStatus(`Toolkit save failed: ${error.message}`, 'error');
            showDownloadFallback();
            root.RPArchiver.get('notifications').show('error', 'Project was not saved');
            return null;
        } finally {
            setBusy(saveButton, false);
        }
    }

    function openSavedRoleplay() {
        if (!savedRoleplayUrl) {
            showStatus('Save the generated roleplay before opening it.', 'error');
            return false;
        }

        window.open(savedRoleplayUrl, '_blank', 'noopener,noreferrer');
        return true;
    }

    async function updateLoreCopies() {
        const button = element('update-lore-copy-btn');
        try {
            const details = getExportDetails();
            const identity = getCurrentIdentity();
            if (!identity || savedGeneratedDocument !== details.html || savedIdentityKey !== identity.key) {
                throw new Error('Save this generated project before updating Lore Codex.');
            }
            if (!loreTargets.length) throw new Error('No linked Lore Codex copy is available to update.');

            loreUpdateInProgress = true;
            setActionState();
            showStatus('Updating linked Lore Codex roleplay copies…', 'info');
            const response = await fetch('/api/roleplay/update-lore-copies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: identity.filename,
                    universe: identity.universe,
                    targetProjectNames: loreTargets.map(target => target.projectName),
                    userContext: root.userSessionManager.getUserContext()
                })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) {
                throw new Error(result.error || `Lore Codex update failed (${response.status})`);
            }

            const count = result.updatedTargets?.length || loreTargets.length;
            loreUpdatedDocument = details.html;
            const warning = result.warnings?.length ? ` · ${result.warnings.length} service warning${result.warnings.length === 1 ? '' : 's'}` : '';
            showStatus(`Updated ${count} linked Lore Codex cop${count === 1 ? 'y' : 'ies'}${warning}`, result.warnings?.length ? 'info' : 'success', 7000);
            root.RPArchiver.get('notifications').show('success', 'Lore Codex copy updated');
            return result;
        } catch (error) {
            root.RPLogger?.error('Lore Codex roleplay update failed:', error);
            showStatus(`Lore Codex update failed: ${error.message}`, 'error');
            root.RPArchiver.get('notifications').show('error', 'Lore Codex copy was not updated');
            return null;
        } finally {
            loreUpdateInProgress = false;
            if (button) button.setAttribute('aria-busy', 'false');
            setActionState();
        }
    }

    function triggerBrowserDownload(html, title) {
        const cleanTitle = getCleanTitleValue() || 'untitled';
        const filename = `${cleanTitle}.html`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const objectURL = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectURL;
        link.download = filename;
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectURL), 0);
        root.RPLogger?.debug(`Browser export requested for "${title}" as ${filename}`);
        return filename;
    }

    function exportHTML() {
        try {
            const details = getExportDetails();
            const filename = triggerBrowserDownload(details.html, details.title);
            hideDownloadFallback();
            showStatus(`Downloaded raw HTML to your browser downloads: ${filename}`, 'success', 7000);
            root.RPArchiver.get('notifications').show('success', 'Raw HTML download started');
            return filename;
        } catch (error) {
            showStatus(`HTML export failed: ${error.message}`, 'error');
            return null;
        }
    }

    function downloadFallback() {
        try {
            const details = getExportDetails();
            const filename = triggerBrowserDownload(details.html, details.title);
            hideDownloadFallback();
            showStatus(`Downloaded instead of saving to Toolkit: ${filename}`, 'success', 7000);
            return filename;
        } catch (error) {
            showStatus(`Fallback download failed: ${error.message}`, 'error');
            return null;
        }
    }

    root.RPArchiver.define('saveExport', {
        downloadFallback,
        downloadSavedArchive,
        exportHTML,
        getGeneratedDocument,
        invalidate,
        initializeDownloadMenu,
        markGenerated,
        openSavedRoleplay,
        refreshLoreLinks,
        scheduleLoreLinkRefresh,
        setGenerationInProgress,
        saveProject,
        updateCreateButtonLabel,
        updateDownloadMenuState,
        updateLoreCopies
    });
})(window);
