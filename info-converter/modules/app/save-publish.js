export function createSavePublishController(dependencies) {
    const emptySyncState = () => ({
        configured: false,
        valid: false,
        repositoryPath: '',
        repositoryName: '',
        lastSyncedAt: null
    });
    const showStatus = dependencies.showStatus;
    const showToast = dependencies.showToast;
    const saveBuiltIcons = dependencies.saveBuiltIcons;
    const collectFormData = dependencies.collectFormData;
    const generateHTML = dependencies.generateHTML;
    const loadProjects = dependencies.loadProjects;
    const updateNavProjectDisplay = dependencies.updateNavProjectDisplay;

    let isLocal = false;
    let currentProject = null;
    let userSessionManager = null;
    let infoData = null;
    let githubSyncState = emptySyncState();
    let githubSyncSavedProject = null;
    let backupMadeThisSession = false;

    function syncContext() {
        ({ isLocal, currentProject, userSessionManager, infoData } = dependencies.getContext());
    }

    function setBackupMadeThisSession(value) {
        backupMadeThisSession = Boolean(value);
        window.backupMadeThisSession = backupMadeThisSession;
    }

    function resetSaveSession() {
        githubSyncSavedProject = null;
        setBackupMadeThisSession(false);
        updateGitHubSyncUI();
    }

    function resetRepositoryState() {
        githubSyncSavedProject = null;
        githubSyncState = emptySyncState();
        updateGitHubSyncUI();
    }

    function updateGitHubSyncUI() {
        syncContext();
        const panel = document.getElementById('github-sync-panel');
        const title = document.getElementById('github-sync-title');
        const detail = document.getElementById('github-sync-detail');
        const selectButton = document.getElementById('github-sync-select');
        const updateButton = document.getElementById('github-sync-update');
        if (!panel || !title || !detail || !selectButton || !updateButton) return;
    
        const hasProject = Boolean(isLocal && currentProject);
        panel.classList.toggle('is-hidden', !hasProject);
        if (!hasProject) return;
    
        const canUpdate = githubSyncState.configured
            && githubSyncState.valid
            && githubSyncSavedProject === currentProject
            && window.htmlGenerated
            && !window.dataModified;
    
        selectButton.textContent = githubSyncState.configured ? 'Change Repository' : 'Connect Repository';
        updateButton.classList.toggle('is-hidden', !canUpdate);
    
        if (!githubSyncState.configured) {
            title.textContent = 'No repository connected';
            detail.textContent = 'Choose the local GitHub repository that receives this site.';
            detail.title = '';
        } else if (!githubSyncState.valid) {
            title.textContent = 'Repository needs attention';
            detail.textContent = githubSyncState.error || 'Choose the repository folder again.';
            detail.title = githubSyncState.repositoryPath || '';
        } else {
            title.textContent = githubSyncState.repositoryName || 'Repository connected';
            detail.textContent = canUpdate
                ? githubSyncState.repositoryPath
                : `Connected. Save Project to prepare a public-site update.`;
            detail.title = githubSyncState.repositoryPath;
        }
    }
    
    async function loadGitHubSyncStatus(projectName) {
        syncContext();
        projectName ||= currentProject;
        if (!isLocal || !projectName || !userSessionManager) {
            githubSyncState = { configured: false, valid: false, repositoryPath: '', repositoryName: '', lastSyncedAt: null };
            updateGitHubSyncUI();
            return;
        }
    
        try {
            const response = await fetch('/api/github-sync/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName, userContext: userSessionManager.getUserContext() })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Unable to read repository connection');
            githubSyncState = result;
        } catch (error) {
            console.error('Error loading repository connection:', error);
            githubSyncState = { configured: false, valid: false, repositoryPath: '', repositoryName: '', lastSyncedAt: null };
        }
        updateGitHubSyncUI();
    }
    
    async function selectGitHubRepository() {
        syncContext();
        if (!currentProject || !userSessionManager) {
            showStatus('error', 'Save or load a Lore Codex project first');
            return;
        }
    
        const selectButton = document.getElementById('github-sync-select');
        if (selectButton) selectButton.disabled = true;
        showStatus('info', 'Choose the repository folder in the Windows folder picker...');
    
        try {
            const response = await fetch('/api/github-sync/select-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectName: currentProject,
                    userContext: userSessionManager.getUserContext()
                })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Unable to connect repository');
            if (result.cancelled) {
                showStatus('info', 'Repository selection cancelled');
                return;
            }
    
            githubSyncState = result;
            updateGitHubSyncUI();
            showStatus('success', `Connected to ${result.repositoryName}`);
        } catch (error) {
            console.error('Error connecting repository:', error);
            showStatus('error', error.message);
        } finally {
            if (selectButton) selectButton.disabled = false;
        }
    }
    
    async function updateGitHubRepository() {
        syncContext();
        if (!currentProject || githubSyncSavedProject !== currentProject || !githubSyncState.valid) {
            showStatus('error', 'Save Project before publishing the public site');
            return;
        }
    
        const privacy = window.lastPublicProjectionSummary || {
            hiddenObjectsRemoved: 0,
            noteFieldsRemoved: 0,
            linkedLorebookRemoved: false,
            compatibilityExtensionFieldsRemoved: 0
        };
        const confirmed = confirm(
            `Publish the public Lore Codex files for "${currentProject}" into:\n\n${githubSyncState.repositoryPath}`
            + `\n\nPrivacy check:`
            + `\n• ${privacy.hiddenObjectsRemoved} hidden object(s) removed`
            + `\n• ${privacy.noteFieldsRemoved} author-note field(s) removed`
            + `\n• Linked lorebook source ${privacy.linkedLorebookRemoved ? 'removed' : 'not present'}`
            + `\n• ${privacy.compatibilityExtensionFieldsRemoved} compatibility extension field(s) removed`
            + `\n\nOnly the saved public file manifest will be copied. Repository-only files will be preserved.`
        );
        if (!confirmed) return;
    
        const updateButton = document.getElementById('github-sync-update');
        if (updateButton) {
            updateButton.disabled = true;
            updateButton.textContent = 'Updating Repository...';
        }
        showStatus('info', 'Updating the GitHub repository folder...');
    
        try {
            const response = await fetch('/api/github-sync/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectName: currentProject,
                    userContext: userSessionManager.getUserContext()
                })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Repository update failed');
    
            githubSyncState = { ...githubSyncState, lastSyncedAt: result.lastSyncedAt };
            const unchanged = result.summary?.unchangedFiles || 0;
            showStatus('success', `${result.message}; ${unchanged} already current. Review and push in GitHub Desktop.`);
        } catch (error) {
            console.error('Error updating repository:', error);
            showStatus('error', `Repository update failed: ${error.message}`);
        } finally {
            if (updateButton) {
                updateButton.disabled = false;
                updateButton.textContent = 'Publish Public Site';
            }
            updateGitHubSyncUI();
        }
    }
    
    window.updateGitHubSyncUI = updateGitHubSyncUI;
    window.invalidateGitHubSyncSave = function() {
        githubSyncSavedProject = null;
        updateGitHubSyncUI();
    };
    
    // UPDATE existing saveToSitesFolder function to update nav display
    function updateNavAfterSave(projectName) {
        syncContext();
        currentProject = projectName;
        dependencies.setCurrentProject(projectName);
        updateNavProjectDisplay(projectName);
        updateOpenProjectButton();
        
        // Update nav dropdown selection
        const navProjectList = document.getElementById('nav-project-list');
        if (navProjectList && projectName) {
            navProjectList.value = projectName;
            const navLoadBtn = document.getElementById('nav-load-project-btn');
            if (navLoadBtn) navLoadBtn.disabled = false;
        }
        
        // Refresh projects list
        if (isLocal) {
            loadProjects();
        }
    }
    
    // Update visibility of open project button
    function updateOpenProjectButton() {
        syncContext();
        const openProjectBtn = document.getElementById('open-project-btn');
        openProjectBtn?.classList.toggle('is-hidden', !(isLocal && currentProject));
    }
    
    // Helper function used by saveToSitesFolder
    function checkForGenerationError(html) {
        syncContext();
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        const htmlTitle = titleMatch ? titleMatch[1] : '';
        const hasActualTitle = infoData.basic.title && infoData.basic.title.trim() !== '';
        
        return htmlTitle === 'World Information' && hasActualTitle;
    }
    
    function showSaveFeedback(type, message, duration = 4000) {
        showStatus(type, message);
        if (typeof showToast === 'function') showToast(type, message, duration);
    }
    
    // Enhanced saveToSitesFolder with modal for project name and filename
    async function saveToSitesFolder() {
        syncContext();
        if (!isLocal || !userSessionManager) {
            showSaveFeedback('error', 'File system access not available');
            return;
        }
        
        // Enhanced checks
        if (!window.htmlGenerated) {
            showSaveFeedback('error', 'Please generate HTML first using the "Create" button');
            return;
        }
        
        if (window.dataModified) {
            showSaveFeedback('error', 'Data has been modified. Please regenerate HTML before saving.');
            return;
        }
        
        const html = document.getElementById('html-output').value;
        if (!html) {
            showSaveFeedback('error', 'No HTML content found. Please generate HTML first.');
            return;
        }
    
        const hasError = checkForGenerationError(html);
        
        // Get project name
        const projectNameInput = document.getElementById('project-name');
        const navProjectList = document.getElementById('nav-project-list');
    
        let projectName = '';
        if (projectNameInput && projectNameInput.value) {
            projectName = projectNameInput.value.trim();
        } else if (currentProject) {
            projectName = currentProject;
        } else if (navProjectList && navProjectList.value) {
            projectName = navProjectList.value.trim();
        } else {
            // Show modal to get both project name and filename
            const modal = document.getElementById('saveProjectModal');
            const modalProjectNameInput = document.getElementById('save-project-name');
            const filenameInput = document.getElementById('save-html-filename');
            const confirmBtn = document.getElementById('confirm-save-project');
            
            // Clear previous values
            modalProjectNameInput.value = '';
            filenameInput.value = 'info';
            
            // Show modal
            modal.classList.add('active');
            modalProjectNameInput.focus();
            
            // Handle confirmation
            const handleConfirm = () => {
                projectName = modalProjectNameInput.value.trim();
                const filename = filenameInput.value.trim();
                
                if (!projectName) {
                    showSaveFeedback('error', 'Project name is required');
                    return;
                }
                if (!filename) {
                    showSaveFeedback('error', 'Filename is required');
                    return;
                }
                
                window.projectFilename = filename;
                modal.classList.remove('active');
                
                // Remove listeners
                confirmBtn.removeEventListener('click', handleConfirm);
                modalProjectNameInput.removeEventListener('keydown', handleEnter);
                filenameInput.removeEventListener('keydown', handleEnter);
                
                // Continue with the save by calling the rest of the function
                continueSaveToFolder(projectName, hasError, html);
            };
            
            // Handle Enter key in inputs
            const handleEnter = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                }
            };
            
            confirmBtn.addEventListener('click', handleConfirm);
            modalProjectNameInput.addEventListener('keydown', handleEnter);
            filenameInput.addEventListener('keydown', handleEnter);
            
            return; // Exit and wait for modal
        }
        
        // If we have project name, continue with save
        continueSaveToFolder(projectName, hasError, html);
    }
    
    async function continueSaveToFolder(projectName, hasError, html) {
        syncContext();
        const projectNameInput = document.getElementById('project-name');
        
        try {
            const userContext = userSessionManager.getUserContext();
            let result; // Declare this at the top
            let successMessage = '';
            
            // Get the collected data (needed for saving built icons and style assets)
            const data = collectFormData();
            if (!window.LoreProjectContract) {
                throw new Error('Lore project model is unavailable');
            }
            const editableProject = window.LoreProjectContract.normalizeLoreProject(data);
            window.currentLoreProject = editableProject;
            const publicSite = window.currentPublicSiteData
                || window.LoreProjectContract.createLorePublicSite(editableProject);
            const styleAssets = getRequiredStyleAssets(data);
            const publicFiles = window.LoreProjectContract.buildPublicFileManifest(
                html,
                publicSite,
                styleAssets,
                window.projectFilename || 'info'
            );
            
            // Save built icons FIRST (before either path)
            showSaveFeedback('info', `Saving "${projectName}" to folder...`, 2500);
            showStatus('info', 'Saving built icons...');
            await saveBuiltIcons(projectName, data);
            
            if (hasError) {
                showStatus('info', 'Detected generation error, restoring backup and retrying...');
                
                // First restore the backup
                const restoreResponse = await fetch('/api/restore-backup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectName, userContext })
                });
                
                if (!restoreResponse.ok) {
                    showSaveFeedback('error', 'Failed to restore backup');
                    return;
                }
                
                // Regenerate HTML
                const newHtml = generateHTML();
                const stillHasError = checkForGenerationError(newHtml);
                
                if (stillHasError) {
                    showSaveFeedback('error', 'Unable to generate valid HTML after backup restoration');
                    return;
                }
                
                // Try saving again with skipBackup to preserve the good backup
                const response = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        html: newHtml, 
                        projectName,
                        filename: window.projectFilename || 'info',
                        userContext,
                        skipBackup: backupMadeThisSession,
                        projectData: editableProject,
                        publicFiles,
                        styleAssets
                    })
                });
                
                result = await response.json(); // Set the shared result variable
                
                if (!result.success) {
                    throw new Error(result.error || 'Failed to save after recovery');
                }
                
                successMessage = 'Recovered from generation error and saved successfully';
            } else {
                // Normal save process
                showStatus('info', 'Saving to user folder...');
                
                const response = await fetch('/api/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        html, 
                        projectName,
                        filename: window.projectFilename || 'info',
                        userContext,
                        skipBackup: backupMadeThisSession,
                        projectData: editableProject,
                        publicFiles,
                        styleAssets
                    })
                });
                
                result = await response.json(); // Set the shared result variable
                
                if (!result.success) {
                    throw new Error(result.error || 'Failed to save file');
                }
                
                let statusMessage = result.message || `Saved "${projectName}" to folder`;
                if (result.assetsRemoved && result.assetsRemoved > 0) {
                    statusMessage += ` 🧹 (${result.assetsRemoved} unused style assets cleaned up)`;
                }
                successMessage = statusMessage;
            }
            
            // Common success actions for both paths - now result is defined
            currentProject = result.projectName;
            dependencies.setCurrentProject(result.projectName);
            githubSyncSavedProject = result.projectName;
            
            // Set backup flag to true after first successful save
            setBackupMadeThisSession(true);
            
            if (projectNameInput) {
                projectNameInput.value = result.projectName;
            }
            
            updateNavAfterSave(result.projectName);
            await loadGitHubSyncStatus(result.projectName);
            await loadProjects();
            
            const projectList = document.getElementById('project-list');
            if (projectList && currentProject) {
                projectList.value = currentProject;
                document.getElementById('load-project-btn').disabled = false;
            }
            
            await checkAssetsFolder(result.projectName);
            showSaveFeedback('success', successMessage, 5000);
        } catch (error) {
            console.error('Error saving to user folder:', error);
            showSaveFeedback('error', `Failed to save: ${error.message}`, 6000);
        }
    }
    
    // Assets Management
    function getRequiredStyleAssets(data) {
        const assets = [];
        const appearance = data.appearance || {};
    
        if (appearance.containerStyle === 'wuxia') {
            assets.push({
                source: 'images/styles/cloudrecesses.png',
                destination: 'images/styles/cloudrecesses.png'
            });
        }
    
        if (appearance.subcontainerStyle === 'wuxia') {
            assets.push({
                source: 'images/styles/mist.png',
                destination: 'images/styles/mist.png'
            });
        }
    
        if (appearance.overviewStyle === 'wuxia') {
            assets.push({
                source: 'images/styles/mist.png',
                destination: 'images/styles/mist.png'
            });
            assets.push({
                source: 'images/styles/fog.png',
                destination: 'images/styles/fog.png'
            });
        }
        
        return assets;
    }
    
    async function checkAssetsFolder(projectName) {
        syncContext();
        if (!isLocal || !userSessionManager) return;
        
        const assetsStatus = document.getElementById('assets-status');
        const createAssetsBtn = document.getElementById('create-assets-btn');
        
        if (!assetsStatus || !createAssetsBtn) {
            console.log('Assets UI elements not found, skipping visual updates');
            return;
        }
        
        if (!projectName) {
            assetsStatus.textContent = '⚠ Select or create a project first';
            assetsStatus.className = 'assets-status missing';
            createAssetsBtn.classList.add('is-hidden');
            return;
        }
        
        try {
            const userContext = userSessionManager.getUserContext();
            
            const response = await fetch('/api/assets/check', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ projectName, userContext })
            });
            
            const result = await response.json();
            
            if (result.needsProject) {
                assetsStatus.textContent = result.message;
                assetsStatus.className = 'assets-status missing';
                createAssetsBtn.classList.add('is-hidden');
            } else if (result.exists) {
                assetsStatus.textContent = `✅ Assets folder exists for "${projectName}"`;
                assetsStatus.className = 'assets-status exists';
                createAssetsBtn.classList.add('is-hidden');
            } else {
                assetsStatus.textContent = `⚠ No assets folder for "${projectName}"`;
                assetsStatus.className = 'assets-status missing';
                createAssetsBtn.classList.remove('is-hidden');
                createAssetsBtn.setAttribute('data-project', projectName);
            }
        } catch (error) {
            console.error('Error checking assets folder:', error);
        }
    }
    
    async function createAssetsFolder() {
        syncContext();
        if (!isLocal || !userSessionManager) return;
        
        const createAssetsBtn = document.getElementById('create-assets-btn');
        const projectName = createAssetsBtn.getAttribute('data-project') || document.getElementById('project-name').value.trim();
        
        if (!projectName) {
            showStatus('error', 'Please enter a project name first');
            return;
        }
        
        try {
            showStatus('info', 'Creating assets folder structure...');
            
            const userContext = userSessionManager.getUserContext();
            
            const response = await fetch('/api/assets/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ projectName, userContext })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showStatus('success', result.message);
                await checkAssetsFolder(result.projectName);
            } else {
                throw new Error(result.error || 'Failed to create assets folder');
            }
        } catch (error) {
            console.error('Error creating assets folder:', error);
            showStatus('error', `Failed to create assets folder: ${error.message}`);
        }
    }
    
    
    return {
        checkAssetsFolder,
        createAssetsFolder,
        getRequiredStyleAssets,
        invalidateGitHubSyncSave: window.invalidateGitHubSyncSave,
        loadGitHubSyncStatus,
        resetRepositoryState,
        resetSaveSession,
        saveToSitesFolder,
        selectGitHubRepository,
        setBackupMadeThisSession,
        updateGitHubRepository,
        updateGitHubSyncUI,
        updateOpenProjectButton
    };
}
