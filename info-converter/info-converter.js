
import './modules/app/performance-metrics.js';
import { createAccessibilityController } from './modules/app/accessibility.js';
import { createAppearanceControls, isValidHexColor } from './modules/app/appearance-controls.js';
import { installLoreCodexBootstrap } from './modules/app/bootstrap.js';
import { installAuthorDebugCommands } from './modules/app/author-debug.js';
import { initializeEditorContextMenus, initializeLoreContextMenu } from './modules/app/context-menu.js';
import { createDocumentActions } from './modules/app/document-actions.js';
import { createDomainButtonController } from './modules/app/domain-buttons.js';
import { createEditorShell } from './modules/app/editor-shell.js';
import { detectEnvironment, renderEnvironmentAccess } from './modules/app/environment.js';
import { createFeatureLifecycle } from './modules/app/feature-lifecycle.js';
import { createImageImportController } from './modules/app/image-import.js';
import { installLazyFeatureActions, loadClassicScripts } from './modules/app/script-loader.js';
import {
    createNavigationController,
    switchMainTab,
    toggleCollapsible,
    updateNavProjectDisplay
} from './modules/app/navigation.js';
import { createProjectActions } from './modules/app/project-actions.js';
import { createProjectController } from './modules/app/project-controller.js';
import { createProjectFormBindings } from './modules/app/project-form-bindings.js';
import { createProjectFormAdapter } from './modules/forms/project-form-adapter.js';
import { createSavePublishController } from './modules/app/save-publish.js';
import { createStorylineLinkController } from './modules/app/storyline-link.js';
import { createTextEditorController } from './modules/app/text-editor.js';
import { showStatus, showToast } from './modules/app/ui-feedback.js';
import { createUserUiController } from './modules/app/user-ui.js';
// Global variables for Lore Codex
let htmlGenerated = false;
let dataModified = false;
let projectLoading = false; 
// Make these variables globally accessible to other script files
window.htmlGenerated = htmlGenerated;
window.dataModified = dataModified;
window.backupMadeThisSession = false;
window.projectLoading = projectLoading;
let infoData = {
    basic: {
        title: '',
        subtitle: '',        // Subtitle field
        banner: '',
        overviewTitle: '',
        overview: '',
        overviewImage: '',
        overviewLinks: [],
        backgroundColor: '',
        backgroundImage: '',
        overviewContentBgImage: '',
        overviewContentBgColor: '',
        overviewContentOpacity: 100,
        overviewContentBlur: 0,
        mainContainerColor: '',
        mainContainerBgImage: '',
        mainContainerBgColor: '',
        // Title/Subtitle display settings
        titleSettings: {
            show: true,        // Show or hide title/subtitle
            position: 'left',  // 'left', 'center', or 'right'
            font: 'theme',     // Font set to use or 'theme' for default
            color: ''          // Custom color or '' for theme default
        }
    },
    appearance: {
        template: 'journal',
        bannerStyle: 'none', 
        overviewStyle: 'journal',
        navigationStyle: 'journal',
        colorScheme: 'current',
        fontSet: 'serif',
        bannerSize: 'large',
        worldCategoriesHeader: 'default',
        pageHeader: 'standard',
        cardStyle: 'current',
        containerStyle: 'left-border',
        subcontainerStyle: 'soft-bg',
        infodisplayStyle: 'default',
        siteWidth: 'standard'
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
    eventsOptions: {
        customLabel: 'Events'
    },
    cultureOptions: {
        customLabel: 'Culture'
    },
    cultivationOptions: {
        customLabel: 'Cultivation'
    },
    magicOptions: {
        customLabel: 'Magic'
    },
    plans: [], // Story arcs/plans with sub-arcs
    plansOptions: {
        selectedTimeSystemId: 'default'
    },
    playlists: [],
    world: {
        locations: [],
        concepts: [],
        events: [],
        creatures: [],
        plants: [],
        items: [],
        factions: [],
        culture: [],
        cultivation: [],
        magic: [],
        general: []
    },
    customPages: [],
    linkedLorebook: null,
};
// Make infoData globally accessible to other script files
window.infoData = infoData;
window.LoreProjectState?.configure(infoData);
// Environment and server state
let isLocal = false;
let hasFileAccess = false;
let sitesFolder = null;
let currentProject = null;

// Current editing state - make globally accessible
// Current editing state - make globally accessible
window.editingIndex = -1;
window.editingType = '';
window.editingCategory = '';
window.editingEventIndex = -1;
window.editingEventContext = 'main';

// Ensure all world categories exist
function ensureWorldCategories() {
    const expectedCategories = [
        'general', 'locations', 'concepts', 'events', 'creatures',
        'plants', 'items', 'factions', 'culture', 'cultivation', 'magic'
    ];
    
    if (!infoData.world) {
        infoData.world = {};
    }
    
    expectedCategories.forEach(category => {
        if (!infoData.world[category]) {
            infoData.world[category] = [];
        }
    });
}

// Save all built icons to project folder
async function saveBuiltIcons(projectName, data) {
    if (!data.world) return;
    
    const userContext = userSessionManager.getUserContext();
    const savePromises = [];
    
    // Go through all world items
    for (const category in data.world) {
        if (Array.isArray(data.world[category])) {
            for (const item of data.world[category]) {

                // Only save if it has a builder icon with generated PNG data
                if (item.icon && item.icon.type === 'builder' && item.icon.generatedPNG) {

                    const promise = fetch('/api/save-built-icon', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            projectName: projectName,
                            itemId: item.id,
                            category: category,
                            pngData: item.icon.generatedPNG,
                            userContext: userContext
                        })
                    }).then(response => response.json())
                      .then(result => {
                          if (result.success) {
                              console.log(`    ✅ Saved icon: ${result.iconPath}`);
                          } else {
                              console.error(`    ❌ Failed to save icon for ${item.name}`);
                          }
                          return result;
                      })
                      .catch(err => {
                          console.error(`    ❌ Error saving icon for ${item.name}:`, err);
                          return { success: false };
                      });

                    savePromises.push(promise);
                }
            }
        }
    }
    
    if (savePromises.length > 0) {
        const results = await Promise.all(savePromises);
        const successCount = results.filter(r => r.success).length;
    } else {
        console.log('ℹ️ No built icons found to save');
    }
}

// Environment Detection and Setup
async function initializeEnvironment() {
    const environment = await detectEnvironment();
    isLocal = environment.isLocal;
    hasFileAccess = environment.hasFileAccess;
    sitesFolder = environment.sitesFolder;
    renderEnvironmentAccess(environment, { updateOpenProjectButton, updateGitHubSyncUI });
}

// Project Management Functions
// Navigation Project Management Functions
let loadNavProject;
let loadProject;
let loadProjectIntoEditor;
let loadProjects;
let openCurrentProject;
let resetGenerationState;
let restoreLinkedLorebook;
let checkAssetsFolder;
let createAssetsFolder;
let loadGitHubSyncStatus;
let savePublishController;
let saveToSitesFolder;
let selectGitHubRepository;
let updateGitHubRepository;
let updateGitHubSyncUI;
let updateOpenProjectButton;
let handleSidebarKeyboard;
let initializeScrollIndicators;
let initializeSidebar;
let switchToCategory;
let updateAllContentLists;
let updateAllItemCounts;
let updateContentList;
let updateItemCount;
let initializeUserSystem;
let quickGenerate;
let quickLoadLastProject;
let quickOpenProject;
let showRenameProjectModal;
let updateQuickLoadState;
let updateQuickOpenState;
let downloadEditableArchive;
let downloadHTML;
let importHTML;
let resetForm;
let initializeAppearanceColorPickers;
let initializeMainContainerBackgroundControls;
let initializeModalBackgroundControls;
let initializeOverviewBackgroundControls;
let initializeTextEditorModal;
let initializeImageImport;
let imageImportController;
let populateStorylineDropdown;
let handleStorylineDropdownChange;
let handleStorylineImport;
let populateTitleFontDropdown;
let initializeButtons;
let initializeEventListeners;
let initializeFormListeners;
let projectFormAdapter;

// Initialize universal text editor modal functionality
// Quick Generate function
// Console helper commands
//console.log('User session commands available:');
//console.log('- debugUserSession() - Show user session debug info');
//console.log('- userSessionManager.login(username, password) - Login user');
//console.log('- userSessionManager.logout() - Logout current user');
//console.log('- userSessionManager.setGuestMode() - Switch to guest mode');

({
    handleSidebarKeyboard,
    initializeScrollIndicators,
    initializeSidebar,
    switchToCategory,
    updateAllContentLists,
    updateAllItemCounts,
    updateContentList,
    updateItemCount
} = createNavigationController({
    getInfoData: () => infoData,
    createContentItem: (...args) => globalThis.createContentItem(...args),
    isValidHexColor,
    renderPagesList: (...args) => globalThis.renderPagesList?.(...args),
    updateCategoryLabels: (...args) => globalThis.updateCategoryLabels?.(...args)
}));

({ initializeUserSystem } = createUserUiController({
    initializeUserSession: () => window.initializeUserSession(),
    initializeAuthUI: manager => window.initializeAuthUI(manager)
}));

installAuthorDebugCommands({
    getInfoData: () => infoData,
    getUserSessionManager: () => window.userSessionManager,
    updateAllContentLists
});

projectFormAdapter = createProjectFormAdapter({ getInfoData: () => infoData });
window.collectFormData = projectFormAdapter.collectFormData;
window.cleanupData = projectFormAdapter.cleanupData;

// Add keyboard navigation
document.addEventListener('keydown', handleSidebarKeyboard);

savePublishController = createSavePublishController({
    getContext: () => ({ isLocal, currentProject, infoData, userSessionManager }),
    setCurrentProject: projectName => {
        currentProject = projectName;
        window.currentProject = projectName;
    },
    saveBuiltIcons,
    collectFormData: () => globalThis.collectFormData(),
    generateHTML: () => globalThis.generateHTML(),
    loadProjects: (...args) => loadProjects(...args),
    updateNavProjectDisplay,
    showStatus,
    showToast
});
({
    checkAssetsFolder,
    createAssetsFolder,
    loadGitHubSyncStatus,
    saveToSitesFolder,
    selectGitHubRepository,
    updateGitHubRepository,
    updateGitHubSyncUI,
    updateOpenProjectButton
} = savePublishController);

({
    quickGenerate,
    quickLoadLastProject,
    quickOpenProject,
    showRenameProjectModal,
    updateQuickLoadState,
    updateQuickOpenState
} = createProjectActions({
    getContext: () => ({ isLocal, currentProject, userSessionManager }),
    setCurrentProject: projectName => {
        currentProject = projectName;
        window.currentProject = projectName;
    },
    generateHTML: () => window.generateHTML(),
    loadNavProject: (...args) => loadNavProject(...args),
    loadProjects: (...args) => loadProjects(...args),
    openCurrentProject: (...args) => openCurrentProject(...args),
    saveToSitesFolder: (...args) => saveToSitesFolder(...args),
    showToast,
    updateNavProjectDisplay
}));

({
    loadNavProject,
    loadProject,
    loadProjectIntoEditor,
    loadProjects,
    openCurrentProject,
    resetGenerationState,
    restoreLinkedLorebook
} = createProjectController({
    getContext: () => ({ isLocal, currentProject, infoData, userSessionManager }),
    setCurrentProject: projectName => {
        currentProject = projectName;
        window.currentProject = projectName;
    },
    setProjectLoading: loading => {
        projectLoading = loading;
        window.projectLoading = loading;
    },
    setBackupMadeThisSession: value => savePublishController.setBackupMadeThisSession(value),
    resetSaveSession: () => savePublishController.resetSaveSession(),
    parseImportedHTML: async content => {
        await window.LoreFeatureLifecycle.ensureFeature('projectImporter');
        return window.parseImportedHTML(content);
    },
    updateGenerateButtonState: () => globalThis.updateGenerateButtonState?.(),
    updateSaveButtonState: () => window.updateSaveButtonState?.(),
    updateLorebookLinkUI: () => globalThis.updateLorebookLinkUI?.(),
    initializeLinkedLorebook: () => window.initializeLinkedLorebook?.(),
    populateAppearanceControls: () => window.populateAppearanceControls?.(),
    loadAppearanceSettings: appearance => window.loadAppearanceSettings?.(appearance),
    loadOverviewLinksSettings: () => globalThis.loadOverviewLinksSettings?.(),
    loadCustomNavSettings: () => globalThis.loadCustomNavSettings?.(),
    loadGitHubSyncStatus,
    updateNavProjectDisplay,
    updateQuickLoadState,
    updateQuickOpenState,
    updateOpenProjectButton,
    checkAssetsFolder,
    showStatus,
    showToast
}));

({
    downloadEditableArchive,
    downloadHTML,
    importHTML,
    resetForm
} = createDocumentActions({
    checkAssetsFolder: (...args) => checkAssetsFolder(...args),
    clearCurrentProject: () => {
        currentProject = null;
        window.currentProject = null;
    },
    collectFormData: () => globalThis.collectFormData(),
    generateHTML: () => globalThis.generateHTML(),
    notifyUser: message => window.notifyLoreUser(message),
    parseImportedHTML: async content => {
        await window.LoreFeatureLifecycle.ensureFeature('projectImporter');
        return window.parseImportedHTML(content);
    },
    populateAppearanceControls: () => window.populateAppearanceControls(),
    replaceInfoData: nextInfoData => {
        infoData = window.LoreProjectState?.configure(nextInfoData) || nextInfoData;
        window.infoData = infoData;
        window.LoreProjectState?.setStatus({ dirty: true, generated: false });
    },
    resetRepositoryState: () => savePublishController.resetRepositoryState(),
    showStatus,
    showToast,
    updateAllContentLists: (...args) => updateAllContentLists(...args),
    updateOpenProjectButton: (...args) => updateOpenProjectButton(...args)
}));

({
    initializeAppearanceColorPickers,
    initializeMainContainerBackgroundControls,
    initializeModalBackgroundControls,
    initializeOverviewBackgroundControls,
    populateTitleFontDropdown
} = createAppearanceControls({
    getInfoData: () => infoData,
    markDataAsModified: () => window.markDataAsModified()
}));

({ initializeTextEditorModal } = createTextEditorController({
    calculatePageCount: wordCount => globalThis.calculatePageCount?.(wordCount),
    countWords: text => globalThis.countWords?.(text)
}));

imageImportController = createImageImportController({
    closeModal: modalId => globalThis.closeModal(modalId),
    getContext: () => ({
        currentCustomPageId: globalThis.getCurrentCustomPageId?.(),
        currentProject,
        editingCategory: window.editingCategory,
        userSessionManager
    }),
    notifyUser: message => window.notifyLoreUser(message),
    openModal: modalId => globalThis.openModal(modalId),
    showToast
});
({ initializeImageImport } = imageImportController);

({
    handleStorylineDropdownChange,
    handleStorylineImport,
    populateStorylineDropdown
} = createStorylineLinkController({
    getContext: () => ({ currentProject, userSessionManager }),
    openStorylineModal: storyline => globalThis.openStorylineModal(storyline)
}));

({ initializeButtons } = createDomainButtonController({
    addCharacter: () => globalThis.addCharacter(),
    addConcept: () => globalThis.addConcept(),
    addCreature: () => globalThis.addCreature(),
    addCulture: () => globalThis.addCulture(),
    addCultivation: () => globalThis.addCultivation(),
    addEvent: () => globalThis.addEvent(),
    addEventToPlan: context => globalThis.addEventToPlan(context),
    addEventToSubArc: () => globalThis.addEventToSubArc(),
    addFaction: () => globalThis.addFaction(),
    addGeneral: () => globalThis.addGeneral(),
    addItem: () => globalThis.addItem(),
    addLocation: () => globalThis.addLocation(),
    addMagic: () => globalThis.addMagic(),
    addPlan: () => globalThis.addPlan(),
    addPlant: () => globalThis.addPlant(),
    addStoryline: () => globalThis.addStoryline(),
    addSubArc: () => globalThis.addSubArc(),
    downloadEditableArchive,
    downloadHTML,
    generateHTML: () => globalThis.generateHTML(),
    importHTML,
    openCharactersOptionsModal: () => globalThis.openCharactersOptionsModal(),
    openCultureOptionsModal: () => globalThis.openCultureOptionsModal(),
    openCultivationOptionsModal: () => globalThis.openCultivationOptionsModal(),
    openCurrentProject,
    openEventsOptionsModal: () => globalThis.openEventsOptionsModal(),
    openFactionOrderModal: () => globalThis.openFactionOrderModal(),
    openInfoDisplayLabelsModal: () => globalThis.openInfoDisplayLabelsModal(),
    openMagicOptionsModal: () => globalThis.openMagicOptionsModal(),
    openPlansOptionsModal: () => globalThis.openPlansOptionsModal(),
    openPlaylistModal: () => globalThis.openPlaylistModal(),
    openStorylinesOptionsModal: () => globalThis.openStorylinesOptionsModal(),
    prepareNewPlaylist: () => {
        window.editingIndex = -1;
        window.editingType = 'playlist';
    },
    saveCharacter: () => globalThis.saveCharacter(),
    saveCharactersOptions: () => globalThis.saveCharactersOptions(),
    saveCultureOptions: () => globalThis.saveCultureOptions(),
    saveCultivationOptions: () => globalThis.saveCultivationOptions(),
    saveEvent: () => globalThis.saveEvent(),
    saveEventsOptions: () => globalThis.saveEventsOptions(),
    saveFactionOrder: () => globalThis.saveFactionOrder(),
    saveInfoDisplayLabels: () => globalThis.saveInfoDisplayLabels(),
    saveLocation: () => globalThis.saveLocation(),
    saveMagicOptions: () => globalThis.saveMagicOptions(),
    savePlan: () => globalThis.savePlan(),
    savePlansOptions: () => globalThis.savePlansOptions(),
    saveStoryline: () => globalThis.saveStoryline(),
    saveStorylinesOptions: () => globalThis.saveStorylinesOptions(),
    saveSubArc: () => globalThis.saveSubArc(),
    saveToSitesFolder,
    saveWorldItem: () => globalThis.saveWorldItem(),
    selectGitHubRepository,
    updateGitHubRepository,
    updateSaveButtonState: () => globalThis.updateSaveButtonState?.()
}));

({ initializeFormListeners } = createProjectFormBindings({
    getInfoData: () => infoData,
    isValidHexColor,
    markDataAsModified: () => window.markDataAsModified(),
    populateStorylineDropdown
}));

const { initializeAccessibility } = createAccessibilityController({
    closeModal: modalId => globalThis.closeModal?.(modalId),
    switchMainTab,
    switchSubTab: tabName => globalThis.switchSubTab?.(tabName)
});

const featureLifecycle = createFeatureLifecycle({
    appearance: () => window.initializeAppearance?.(),
    customPages: async () => {
        await loadClassicScripts([
            'modules/custom-pages/custom-page-state.js',
            'modules/custom-pages/custom-page-list-renderer.js',
            'modules/custom-pages/custom-page-element-controller.js',
            'modules/custom-pages/custom-pages.js',
            'modules/custom-pages/custom-navigation.js'
        ]);
        window.customPageTemplates?.initialize();
        window.initializeCustomPages?.();
    },
    timeSystems: async () => {
        await loadClassicScripts([
            'modules/time-systems.js',
            'modules/time-systems/month-editor.js',
            'modules/time-systems/day-editor.js',
            'modules/time-systems/era-season-editor.js',
            'modules/time-systems/mini-calendar.js'
        ]);
        await window.initializeTimeSystems?.();
    },
    projectImporter: async () => {
        await loadClassicScripts([
            'modules/import/dom-basic.js',
            'modules/import/dom-appearance.js',
            'modules/import/dom-characters.js',
            'modules/import/dom-storylines.js',
            'modules/import/dom-plans.js',
            'modules/import/dom-world.js'
        ]);
        await import('./import-export.js');
    },
    characterImporter: () => loadClassicScripts(['modules/import/character-import.js']),
    lorebookImporter: async () => {
        await loadClassicScripts([
            'modules/import/lorebook-import.js',
            'modules/import/lorebook-link.js'
        ]);
        window.initializeLinkedLorebook?.();
    }
});
installLazyFeatureActions(featureLifecycle);

({ initializeEventListeners } = createEditorShell({
    checkAssetsFolder: (...args) => checkAssetsFolder(...args),
    closeModal: modalId => globalThis.closeModal(modalId),
    createAssetsFolder: (...args) => createAssetsFolder(...args),
    downloadHTML,
    generateHTML: () => globalThis.generateHTML(),
    handleStorylineDropdownChange,
    handleStorylineImport,
    initializeButtons,
    initializeEditorContextMenus: () => initializeEditorContextMenus({
        updateQuickOpenState,
        quickGenerate,
        quickOpenProject,
        quickLoadLastProject,
        showRenameProjectModal,
        isValidHexColor,
        showToast
    }),
    initializeFormListeners,
    initializeAccessibility,
    initializeImageImport,
    initializeMainContainerBackgroundControls,
    initializeModalBackgroundControls,
    initializeOverviewBackgroundControls,
    initializeSidebar,
    initializeTextEditorModal,
    isLocal: () => isLocal,
    loadNavProject,
    loadProject,
    loadProjects,
    populateTitleFontDropdown,
    saveToSitesFolder,
    switchMainTab,
    switchSubTab: tabName => globalThis.switchSubTab(tabName),
    toggleCollapsible
}));

// Make functions globally available
window.toggleCollapsible = toggleCollapsible;
window.initializeSidebar = initializeSidebar;
window.switchToCategory = switchToCategory;
window.updateItemCount = updateItemCount;
window.updateAllItemCounts = updateAllItemCounts;
// Make updateQuickOpenState globally accessible
window.updateQuickOpenState = updateQuickOpenState;
// Make variables globally accessible to other script files
window.currentProject = currentProject;
window.userSessionManager = userSessionManager;

// Make utility functions globally available
window.resetForm = resetForm;
window.loadProjects = loadProjects;
window.saveToSitesFolder = saveToSitesFolder;
window.openCurrentProject = openCurrentProject;
window.updateOpenProjectButton = updateOpenProjectButton;
window.isValidHexColor = isValidHexColor;
window.initializeImageImport = initializeImageImport;
window.openImageImportModal = imageImportController.openImageImportModal;

installLoreCodexBootstrap({
    initializeEnvironment,
    initializeUserSystem,
    ensureWorldCategories,
    updateQuickLoadState,
    initializeEventListeners,
    loadProjects,
    checkAssetsFolder,
    initializeOverviewLinks,
    initializeCustomNavigation,
    initializeAppearanceColorPickers,
    switchMainTab,
    initializeScrollIndicators,
    initializeLoreCodexAbout,
    initializeLoreContextMenu
});
