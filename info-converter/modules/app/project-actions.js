export function createProjectActions(dependencies) {
    const generateHTML = dependencies.generateHTML;
    const loadNavProject = dependencies.loadNavProject;
    const loadProjects = dependencies.loadProjects;
    const openCurrentProject = dependencies.openCurrentProject;
    const saveToSitesFolder = dependencies.saveToSitesFolder;
    const showToast = dependencies.showToast;
    const updateNavProjectDisplay = dependencies.updateNavProjectDisplay;
    let isLocal = false;
    let currentProject = null;
    let userSessionManager = null;

    function syncContext() {
        ({ isLocal, currentProject, userSessionManager } = dependencies.getContext());
    }

    async function quickGenerate() {
        syncContext();
        // Hide context menu
        document.getElementById('generate-context-menu').style.display = 'none';
        
        try {
            showToast('info', 'Quick generating...');
            
            // Generate HTML
            const html = await generateHTML();
            if (!html) {
                showToast('error', 'Failed to generate HTML');
                return;
            }
            
            // Save to folder (only if in local mode)
            if (isLocal) {
                await saveToSitesFolder();
            } else {
                showToast('success', 'HTML generated successfully (download available)');
            }
            
        } catch (error) {
            console.error('Quick generate error:', error);
            showToast('error', `Quick generate failed: ${error.message}`);
        }
    }
    
    // Quick Open function
    function quickOpenProject() {
        syncContext();
        // Hide context menu
        document.getElementById('generate-context-menu').style.display = 'none';
        
        if (!window.isLocal || !window.currentProject || !window.userSessionManager) {
            showToast('error', 'No current project to open');
            return;
        }
        
        if (!window.htmlGenerated) {  // Changed this line
            showToast('error', 'Please generate HTML first');
            return;
        }
        
        openCurrentProject();
    }
    
    // Function to update Quick Open availability
    function updateQuickOpenState() {
        syncContext();
        const quickOpenOption = document.getElementById('quick-open-option');
        if (!quickOpenOption) return;
        
        console.log('Quick Open State Check:', {
            isLocal: window.isLocal,
            currentProject: window.currentProject,
            userSessionManager: !!window.userSessionManager,
            htmlGenerated: window.htmlGenerated
        });
        
        const canOpen = window.isLocal && window.currentProject && window.userSessionManager && window.htmlGenerated;
        
        if (canOpen) {
            quickOpenOption.classList.remove('disabled');
            console.log('Quick Open enabled');
        } else {
            quickOpenOption.classList.add('disabled');
            console.log('Quick Open disabled');
        }
    }
    
    // Quick Load function
    async function quickLoadLastProject() {
        syncContext();
        // Hide context menu
        document.getElementById('nav-project-context-menu').style.display = 'none';
        
        if (!userSessionManager) return;
        
        const lastProject = userSessionManager.getLastProject();
        if (!lastProject) {
            showToast('info', 'No last project available');
            return;
        }
        
        // Set the dropdown value and trigger load
        const navProjectList = document.getElementById('nav-project-list');
        if (navProjectList) {
            navProjectList.value = lastProject;
            await loadNavProject();
        }
    }
    
    // Function to update Quick Load availability
    function updateQuickLoadState() {
        syncContext();
        const quickLoadOption = document.getElementById('quick-load-option');
        if (!quickLoadOption || !userSessionManager) return;
        
        const lastProject = userSessionManager.getLastProject();
        
        if (lastProject) {
            quickLoadOption.classList.remove('disabled');
        } else {
            quickLoadOption.classList.add('disabled');
        }
    }
    
    // Show rename project modal
    async function showRenameProjectModal() {
        syncContext();
        // Hide context menu
        document.getElementById('nav-project-context-menu').style.display = 'none';
        
        if (!isLocal || !currentProject) {
            showToast('error', 'No project selected to rename');
            return;
        }
        
        const modal = document.getElementById('renameProjectModal');
        const projectNameInput = document.getElementById('rename-project-name');
        const filenameInput = document.getElementById('rename-html-filename');
        const confirmBtn = document.getElementById('confirm-rename-project');
        const cancelBtn = document.getElementById('cancel-rename-project');
        
        // Get current filename from config
        let currentFilename = 'info';
        try {
            const userContext = userSessionManager.getUserContext();
            const userPath = userContext.isGuest ? 'guest' : userContext.userId;
            const configResponse = await fetch(`/projects/${userPath}/${currentProject}/project-config.json`);
            if (configResponse.ok) {
                const config = await configResponse.json();
                currentFilename = config.htmlFilename ? config.htmlFilename.replace('.html', '') : 'info';
            }
        } catch (error) {
            console.warn('Could not load current filename:', error);
        }
        
        // Pre-fill with current values
        projectNameInput.value = currentProject;
        filenameInput.value = currentFilename;
        
        // Show modal
        modal.classList.add('active');
        projectNameInput.focus();
        projectNameInput.select();
        
        // Handle confirmation
        const handleConfirm = async () => {
            const newProjectName = projectNameInput.value.trim();
            const newFilename = filenameInput.value.trim();
            
            if (!newProjectName) {
                showToast('error', 'Project name is required');
                return;
            }
            if (!newFilename) {
                showToast('error', 'Filename is required');
                return;
            }
            
            // Check if anything actually changed
            if (newProjectName === currentProject && newFilename === currentFilename) {
                showToast('info', 'No changes made');
                modal.classList.remove('active');
                cleanup();
                return;
            }
            
            modal.classList.remove('active');
            cleanup();
            
            // Perform the rename
            await renameProject(currentProject, newProjectName, currentFilename, newFilename);
        };
        
        // Handle cancel
        const handleCancel = () => {
            modal.classList.remove('active');
            cleanup();
        };
        
        // Handle Enter key
        const handleEnter = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            } else if (e.key === 'Escape') {
                handleCancel();
            }
        };
        
        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            projectNameInput.removeEventListener('keydown', handleEnter);
            filenameInput.removeEventListener('keydown', handleEnter);
        };
        
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        projectNameInput.addEventListener('keydown', handleEnter);
        filenameInput.addEventListener('keydown', handleEnter);
    }
    
    // Rename project and/or HTML file
    async function renameProject(oldProjectName, newProjectName, oldFilename, newFilename) {
        syncContext();
        try {
            showToast('info', 'Renaming...');
            
            const userContext = userSessionManager.getUserContext();
            
            const response = await fetch('/api/projects/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    oldProjectName,
                    newProjectName,
                    oldFilename,
                    newFilename,
                    userContext
                })
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to rename');
            }
            
            showToast('success', result.message);
            
        // Update current project if project name changed
        if (oldProjectName !== newProjectName) {
            currentProject = newProjectName;
            dependencies.setCurrentProject(newProjectName);
            updateNavProjectDisplay(newProjectName);
        }
            
            // Update filename in memory if it changed
            if (oldFilename !== newFilename) {
                window.projectFilename = newFilename;
            }
            
            // Refresh projects list
            await loadProjects();
            
            // Select the new/renamed project in dropdown
            const navProjectList = document.getElementById('nav-project-list');
            if (navProjectList) {
                navProjectList.value = newProjectName;
            }
    
            // Reload the project to pick up changes
            await loadNavProject();
            
        } catch (error) {
            console.error('Rename error:', error);
            showToast('error', `Failed to rename: ${error.message}`);
        }
    }
    
    
    return {
        quickGenerate,
        quickLoadLastProject,
        quickOpenProject,
        renameProject,
        showRenameProjectModal,
        updateQuickLoadState,
        updateQuickOpenState
    };
}
