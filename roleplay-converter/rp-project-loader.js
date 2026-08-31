// RP Archiver Project Selection System
// Handles universe/story dropdown selection and loading

class RPProjectLoader {
    constructor() {
        this.currentUniverses = [];
        this.currentStories = [];
        this.userSessionManager = null;
        this.initialized = false;
        this.eventHandlersInitialized = false;
    }

    initialize(userSessionManager = window.userSessionManager) {
        if (this.initialized) {
            if (userSessionManager) this.userSessionManager = userSessionManager;
            return this;
        }

        this.initialized = true;
        this.userSessionManager = userSessionManager || null;
        
        this.setupUI();
        this.setupEventListeners();

        if (this.userSessionManager) this.loadUniverses();
        else this.showFallbackMode();

        window.RPLogger?.debug('Project loader initialized');
        return this;
    }
    
    setupUI() {
        if (document.getElementById('universe-dropdown')) return;

        // Find the current import controls
        const importControls = document.querySelector('.nav-import-controls');
        if (!importControls) {
            window.RPLogger?.error('Could not find import controls container');
            return;
        }
        
        // Hide the original import button but keep it for fallback
        const originalImportBtn = document.getElementById('import-btn');
        if (originalImportBtn) {
            originalImportBtn.style.display = 'none';
        }
        
        // Create new project selection UI
        const projectUI = document.createElement('div');
        projectUI.className = 'project-selection-controls';
        projectUI.innerHTML = `
            <select id="universe-dropdown" class="universe-select" aria-label="Select universe" disabled>
                <option value="">Select Universe...</option>
            </select>
            <select id="story-dropdown" class="story-select" aria-label="Select story" disabled>
                <option value="">Select Story...</option>
            </select>
            <button id="load-project-btn" class="btn-secondary" type="button" title="Load selected project" aria-label="Load selected project" disabled>
                <i class="fas fa-folder-open" aria-hidden="true"></i> Load
            </button>
        `;
        
        // Insert the new UI
        importControls.appendChild(projectUI);
        
        window.RPLogger?.debug('Project selection UI created');
    }
    
    setupEventListeners() {
        if (this.eventHandlersInitialized) return;

        const universeDropdown = document.getElementById('universe-dropdown');
        const storyDropdown = document.getElementById('story-dropdown');
        const loadBtn = document.getElementById('load-project-btn');

        this.eventHandlersInitialized = true;
        
        if (universeDropdown) {
            universeDropdown.addEventListener('change', () => this.onUniverseChange());
        }
        
        if (storyDropdown) {
            storyDropdown.addEventListener('change', () => this.onStoryChange());
        }
        
        if (loadBtn) {
            loadBtn.addEventListener('click', () => this.onLoadClick());
        }
        
        window.RPLogger?.debug('Project loader event listeners initialized');
    }
    
    async loadUniverses() {
        if (!this.userSessionManager) {
            window.RPLogger?.debug('No user session manager; using manual import');
            this.showFallbackMode();
            return;
        }
        
        try {
            window.RPLogger?.debug('Loading RP universes');
            
            // Additional check to make sure userSessionManager is actually functional
            let userContext;
            try {
                userContext = this.userSessionManager.getUserContext();
                if (!userContext) {
                    throw new Error('getUserContext returned null');
                }
            } catch (contextError) {
                window.RPLogger?.debug('User context unavailable; using manual import');
                this.showFallbackMode();
                return;
            }
            
            const response = await fetch('/api/roleplay/universes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userContext })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const universes = await response.json();
            this.currentUniverses = universes;
            
            window.RPLogger?.debug(`Found ${universes.length} RP universes`);
            
            this.updateUniverseDropdown();
            
        } catch (error) {
            window.RPLogger?.error('Error loading RP universes:', error);
            this.showFallbackMode();
        }
    }
    
    async loadStories(universeName) {
        if (!this.userSessionManager || !universeName) {
            return;
        }
        
        try {
            window.RPLogger?.debug(`Loading stories for universe: ${universeName}`);
            
            const userContext = this.userSessionManager.getUserContext();
            const response = await fetch('/api/roleplay/stories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userContext, universe: universeName })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const stories = await response.json();
            this.currentStories = stories;
            
            window.RPLogger?.debug(`Found ${stories.length} stories in ${universeName}`);
            
            this.updateStoryDropdown();
            
        } catch (error) {
            window.RPLogger?.error('Error loading RP stories:', error);
            this.currentStories = [];
            this.updateStoryDropdown();
        }
    }
    
    updateUniverseDropdown() {
        const dropdown = document.getElementById('universe-dropdown');
        if (!dropdown) return;
        
        dropdown.innerHTML = '<option value="">Select Universe...</option>';
        
        if (this.currentUniverses.length === 0) {
            dropdown.disabled = true;
            this.updateLoadButton();
            return;
        }
        
        this.currentUniverses.forEach(universe => {
            const option = document.createElement('option');
            option.value = universe;
            option.textContent = universe;
            dropdown.appendChild(option);
        });
        
        dropdown.disabled = false;
        this.updateLoadButton();
    }
    
    updateStoryDropdown() {
        const dropdown = document.getElementById('story-dropdown');
        if (!dropdown) return;
        
        dropdown.innerHTML = '<option value="">Select Story...</option>';
        
        if (this.currentStories.length === 0) {
            dropdown.disabled = true;
            this.updateLoadButton();
            return;
        }
        
        this.currentStories.forEach(story => {
            const option = document.createElement('option');
            option.value = story.filename;
            // Show filename without extension for cleaner display
            const displayName = story.filename.replace(/\.html?$/i, '');
            option.textContent = displayName;
            dropdown.appendChild(option);
        });
        
        dropdown.disabled = false;
        this.updateLoadButton();
    }
    
    updateLoadButton() {
        const loadBtn = document.getElementById('load-project-btn');
        const universeDropdown = document.getElementById('universe-dropdown');
        const storyDropdown = document.getElementById('story-dropdown');
        
        if (!loadBtn || !universeDropdown || !storyDropdown) return;
        
        const hasValidSelection = universeDropdown.value && storyDropdown.value;
        const hasUniverses = this.currentUniverses.length > 0;
        
        if (hasValidSelection) {
            // Valid project selection
            loadBtn.disabled = false;
            loadBtn.innerHTML = '<i class="fas fa-folder-open"></i>';
            loadBtn.title = `Load ${storyDropdown.value} from ${universeDropdown.value}`;
        } else if (hasUniverses) {
            // Has universes but no valid selection
            loadBtn.disabled = false;
            loadBtn.innerHTML = '<i class="fas fa-upload"></i>';
            loadBtn.title = 'No selection - click to import file manually';
        } else {
            // No universes at all
            loadBtn.disabled = false;
            loadBtn.innerHTML = '<i class="fas fa-upload"></i>';
            loadBtn.title = 'No projects found - click to import file manually';
        }
    }
    
    onUniverseChange() {
        const universeDropdown = document.getElementById('universe-dropdown');
        const storyDropdown = document.getElementById('story-dropdown');
        
        if (!universeDropdown || !storyDropdown) return;
        
        const selectedUniverse = universeDropdown.value;
        
        if (selectedUniverse) {
            window.RPLogger?.debug(`Universe selected: ${selectedUniverse}`);
            this.loadStories(selectedUniverse);
        } else {
            // Clear story dropdown
            storyDropdown.innerHTML = '<option value="">Select Story...</option>';
            storyDropdown.disabled = true;
            this.currentStories = [];
            this.updateLoadButton();
        }
    }
    
    onStoryChange() {
        window.RPLogger?.debug('Story selection changed');
        this.updateLoadButton();
    }
    
    async onLoadClick() {
        const universeDropdown = document.getElementById('universe-dropdown');
        const storyDropdown = document.getElementById('story-dropdown');
        
        if (!universeDropdown || !storyDropdown) {
            this.fallbackToManualImport();
            return;
        }
        
        const selectedUniverse = universeDropdown.value;
        const selectedStory = storyDropdown.value;
        
        if (selectedUniverse && selectedStory) {
            // Load the selected project
            await this.loadSelectedProject(selectedUniverse, selectedStory);
        } else {
            // Fall back to manual import
            this.fallbackToManualImport();
        }
    }
    
    async loadSelectedProject(universe, storyFilename) {
        if (!this.userSessionManager) {
            window.RPLogger?.error('No user session manager available');
            return;
        }
        
        try {
            window.RPLogger?.debug(`Loading project: ${universe}/${storyFilename}`);
            
            const userContext = this.userSessionManager.getUserContext();
            const response = await fetch('/api/roleplay/load-story', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userContext, 
                    universe, 
                    storyFilename 
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                if (window.RPArchiver.has('importController')) {
                    window.RPArchiver.get('importController').importRoleplayHTML(result.content, storyFilename, {
                        storageUniverse: result.universe || universe
                    });
                    window.RPArchiver.get('notifications').show('success', 'Project imported successfully');
                    window.RPArchiver.get('previewExport').showStatus(`Loaded "${storyFilename}"`, 'success');
                    window.RPLogger?.debug('Project parsed and loaded into the form');
                } else {
                    throw new Error('Import controller is not available');
                }
            } else {
                throw new Error(result.error || 'Failed to load project');
            }
            
        } catch (error) {
            window.RPLogger?.error('Error loading project:', error);
            window.RPArchiver.get('previewExport').showStatus(`Failed to load project: ${error.message}`, 'error');
            window.RPArchiver.get('notifications').show('error', 'Error importing data');
        }
    }
    
    fallbackToManualImport() {
        window.RPLogger?.debug('Using manual file import');
        
        const originalImportFile = document.getElementById('import-file');
        if (originalImportFile) {
            originalImportFile.click();
        } else {
            window.RPLogger?.error('Manual import file input not found');
        }
    }
    
    showFallbackMode() {
        window.RPLogger?.debug('Project loader is in manual-import mode');
        
        const universeDropdown = document.getElementById('universe-dropdown');
        const storyDropdown = document.getElementById('story-dropdown');
        const loadBtn = document.getElementById('load-project-btn');
        
        if (universeDropdown) {
            universeDropdown.disabled = true;
            universeDropdown.innerHTML = '<option value="">No projects found</option>';
        }
        
        if (storyDropdown) {
            storyDropdown.disabled = true;
            storyDropdown.innerHTML = '<option value="">No stories found</option>';
        }
        
        if (loadBtn) {
            loadBtn.disabled = false;
            loadBtn.innerHTML = '<i class="fas fa-upload"></i>';
            loadBtn.title = 'No organized projects found - click to import file manually';
        }
        
        // Clear stored data
        this.currentUniverses = [];
        this.currentStories = [];
    }
    
    // Public method to refresh the project list
    refresh() {
        window.RPLogger?.debug('Refreshing project list');
        
        // Try to reinitialize if user session is now available
        if (window.userSessionManager) {
            try {
                const testContext = window.userSessionManager.getUserContext();
                if (testContext !== null && testContext !== undefined) {
                    window.RPLogger?.debug('User session is available; loading project list');
                    this.userSessionManager = window.userSessionManager;
                    this.loadUniverses();
                    return;
                }
            } catch (error) {
                window.RPLogger?.debug('User session is not ready');
            }
        }
        
        // If we have a user session manager, just reload universes
        if (this.userSessionManager) {
            this.loadUniverses();
        } else {
            window.RPLogger?.debug('No user session manager available after refresh');
            this.showFallbackMode();
        }
    }
    
    // Public method to get current selection info
    getSelection() {
        const universeDropdown = document.getElementById('universe-dropdown');
        const storyDropdown = document.getElementById('story-dropdown');
        
        return {
            universe: universeDropdown?.value || null,
            story: storyDropdown?.value || null,
            hasValidSelection: !!(universeDropdown?.value && storyDropdown?.value)
        };
    }
}

const rpProjectLoader = new RPProjectLoader();
window.RPArchiver.define('projectLoader', {
    Loader: RPProjectLoader,
    getLoader: () => rpProjectLoader,
    initialize(userSessionManager = window.userSessionManager) {
        return rpProjectLoader.initialize(userSessionManager);
    }
});
