import { performanceNow, recordPerformance } from './performance-metrics.js';

export function createProjectController(dependencies) {
    function buildProjectImportContent(result) {
        if (!result.projectData || !window.LoreProjectContract) return result.content;
        const editableProject = window.LoreProjectContract.normalizeLoreProject(result.projectData);
        const serializedProject = window.LoreProjectContract.serializeEditableProjectData(editableProject);
        const projectScript = `<script type="application/json" id="lore-codex-project-data">${serializedProject}<\/script>`;
        const withSchema = result.content.replace(/<head([^>]*)>/i, `<head$1>${projectScript}`);
        return withSchema === result.content ? `${projectScript}${result.content}` : withSchema;
    }

    function notifyProjectLoad(type, message, notification) {
        if (notification === 'toast') {
            dependencies.showToast(type, message, type === 'info' ? 2000 : undefined);
        } else {
            dependencies.showStatus(type, message);
        }
    }

    async function restoreLoadedProjectUi(projectName) {
        dependencies.updateLorebookLinkUI();
        await restoreLinkedLorebook(projectName);
        dependencies.initializeLinkedLorebook();
        dependencies.populateAppearanceControls();

        const { infoData } = dependencies.getContext();
        if (infoData.appearance) dependencies.loadAppearanceSettings(infoData.appearance);
        dependencies.loadOverviewLinksSettings();
        dependencies.loadCustomNavSettings();
    }

    async function loadProjectIntoEditor(projectName, options = {}) {
        const loadStartedAt = performanceNow();
        let loadSucceeded = false;
        const notification = options.notification || 'status';
        const { userSessionManager } = dependencies.getContext();
        if (!projectName || !userSessionManager) return false;

        notifyProjectLoad('info', 'Loading project...', notification);
        dependencies.setProjectLoading(true);
        dependencies.updateGenerateButtonState();

        try {
            const userContext = userSessionManager.getUserContext();
            const response = await fetch('/api/projects/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName, userContext })
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'Failed to load project');

            const imported = await dependencies.parseImportedHTML(buildProjectImportContent(result));
            if (!imported) throw new Error('Project content could not be imported');

            dependencies.setCurrentProject(projectName);
            window.projectFilename = result.filename || 'info';
            dependencies.resetSaveSession();

            await dependencies.loadGitHubSyncStatus(projectName);
            const projectNameInput = document.getElementById('project-name');
            if (projectNameInput) projectNameInput.value = projectName;
            dependencies.updateNavProjectDisplay(projectName);
            await restoreLoadedProjectUi(projectName);

            userSessionManager.setLastProject(projectName);
            dependencies.updateQuickLoadState();
            dependencies.updateOpenProjectButton();
            resetGenerationState();
            dependencies.updateQuickOpenState();
            await dependencies.checkAssetsFolder(projectName);
            notifyProjectLoad('success', `Project "${projectName}" loaded successfully`, notification);
            loadSucceeded = true;
            return true;
        } catch (error) {
            console.error('Error loading project:', error);
            notifyProjectLoad('error', `Failed to load project: ${error.message}`, notification);
            return false;
        } finally {
            recordPerformance('projectLoad', performanceNow() - loadStartedAt, { success: loadSucceeded });
            dependencies.setProjectLoading(false);
            dependencies.updateGenerateButtonState();
        }
    }

    async function loadNavProject() {
        const projectList = document.getElementById('nav-project-list');
        return loadProjectIntoEditor(projectList?.value, { notification: 'toast' });
    }

    async function checkNavAssetsStatus(projectName) {
        const { isLocal, userSessionManager } = dependencies.getContext();
        if (!isLocal || !projectName || !userSessionManager) return;

        try {
            const response = await fetch('/api/assets/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName, userContext: userSessionManager.getUserContext() })
            });
            const result = await response.json();
            if (result.exists) {
                dependencies.showToast('success', `Assets folder exists for '${projectName}'`, 3000);
            } else if (!result.needsProject) {
                dependencies.showToast('info', `No assets folder for '${projectName}'`, 3000);
            }
        } catch (error) {
            console.error('Error checking nav assets:', error);
        }
    }

    function populateProjectSelect(select, projects, currentSelection, currentProject, includeDetails) {
        select.innerHTML = `<option value="">${includeDetails ? 'Select a project...' : 'Select project...'}</option>`;
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.projectName;
            option.textContent = includeDetails
                ? `${project.title} (${new Date(project.lastModified).toLocaleDateString()})`
                : project.title;
            if (!project.hasAssets) option.textContent += includeDetails ? ' - No Assets' : ' (No Assets)';
            select.appendChild(option);
        });

        if (currentSelection && [...select.options].some(option => option.value === currentSelection)) {
            select.value = currentSelection;
            return currentSelection;
        }
        if (currentProject && [...select.options].some(option => option.value === currentProject)) {
            select.value = currentProject;
            return currentProject;
        }
        return '';
    }

    async function loadProjects() {
        const { isLocal, currentProject, userSessionManager } = dependencies.getContext();
        if (!isLocal || !userSessionManager) return;

        try {
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userContext: userSessionManager.getUserContext() })
            });
            const projects = await response.json();

            const projectList = document.getElementById('project-list');
            const navProjectList = document.getElementById('nav-project-list');
            const loadButton = document.getElementById('load-project-btn');
            const navLoadButton = document.getElementById('nav-load-project-btn');

            if (projectList && loadButton) {
                const selectedProject = populateProjectSelect(
                    projectList,
                    projects,
                    projectList.value,
                    currentProject,
                    true
                );
                loadButton.disabled = !selectedProject;
                await dependencies.checkAssetsFolder(selectedProject || undefined);
            }

            if (navProjectList && navLoadButton) {
                const selectedProject = populateProjectSelect(
                    navProjectList,
                    projects,
                    navProjectList.value,
                    currentProject,
                    false
                );
                navLoadButton.disabled = !selectedProject;
            }

            const userDisplay = userSessionManager.isGuest
                ? 'Guest'
                : userSessionManager.getCurrentUser().username;
            console.log(`Loaded ${projects.length} projects for ${userDisplay}`);
        } catch (error) {
            console.error('Error loading projects:', error);
            dependencies.setProjectLoading(false);
            dependencies.updateGenerateButtonState();
            dependencies.showStatus('error', 'Failed to load projects list');
        }
    }

    function resetGenerationState() {
        window.htmlGenerated = false;
        window.dataModified = false;
        window.LoreProjectState?.setStatus({ dirty: false, generated: false });
        dependencies.setBackupMadeThisSession(false);
        dependencies.updateSaveButtonState();
        dependencies.updateQuickOpenState();

        const htmlOutput = document.getElementById('html-output');
        if (htmlOutput) htmlOutput.value = '';
    }

    async function loadProject() {
        const projectList = document.getElementById('project-list');
        return loadProjectIntoEditor(projectList?.value, { notification: 'status' });
    }

    async function restoreLinkedLorebook(projectName) {
        const { isLocal, infoData, userSessionManager } = dependencies.getContext();
        if (!isLocal || !userSessionManager || !projectName) return;

        if (infoData.linkedLorebook?.data) {
            console.log('Lorebook already restored from HTML data');
            window.linkedLorebookData = infoData.linkedLorebook.data;
            window.linkedLorebookFilename = infoData.linkedLorebook.filename;
            return;
        }

        try {
            const userContext = userSessionManager.getUserContext();
            const response = await fetch('/api/assets/check-lorebook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName, userContext })
            });
            const result = await response.json();
            if (!result.success || !result.lorebookFile) return;

            const userPath = userContext.isGuest ? 'guest' : userContext.userId;
            const lorebookResponse = await fetch(
                `/projects/${userPath}/${projectName}/assets/lorebook/${result.lorebookFile}`
            );
            const lorebookData = await lorebookResponse.json();
            window.linkedLorebookData = lorebookData;
            window.linkedLorebookFilename = result.lorebookFile;
            infoData.linkedLorebook = { filename: result.lorebookFile, data: lorebookData };
            console.log('Restored linked lorebook:', result.lorebookFile);
        } catch (error) {
            console.error('Error restoring linked lorebook:', error);
        }
    }

    async function openCurrentProject() {
        const { isLocal, currentProject, userSessionManager } = dependencies.getContext();
        if (!isLocal || !currentProject || !userSessionManager) {
            dependencies.showStatus('error', 'No current project to open');
            return;
        }

        const userContext = userSessionManager.getUserContext();
        const userPath = userContext.isGuest ? 'guest' : userContext.userId;
        try {
            const response = await fetch('/api/projects/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName: currentProject, userContext })
            });
            await response.json();

            let htmlFilename = 'info.html';
            const configResponse = await fetch(`/projects/${userPath}/${currentProject}/project-config.json`);
            if (configResponse.ok) {
                const config = await configResponse.json();
                htmlFilename = config.htmlFilename || htmlFilename;
            }

            const projectUrl = `/projects/${userPath}/${currentProject}/${htmlFilename}`;
            console.log('Opening project URL:', projectUrl);
            window.open(projectUrl, '_blank');
        } catch (error) {
            console.error('Error opening project:', error);
            dependencies.showStatus('error', 'Failed to open project');
        }
    }

    return {
        checkNavAssetsStatus,
        loadNavProject,
        loadProject,
        loadProjectIntoEditor,
        loadProjects,
        openCurrentProject,
        resetGenerationState,
        restoreLinkedLorebook
    };
}
