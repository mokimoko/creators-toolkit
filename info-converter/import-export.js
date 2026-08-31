// Import and Export Functions with Appearance Support, Hidden Items, Notes Support, Plans Support, Character Tags Support, Subtitle Support, and Overview Title/Image Support
import { createLorePayloadAdapters } from './modules/import/payload-adapters.js';

function getAvailableTimeSystemIdsForImport() {
    if (typeof userTimeSystems === 'undefined' || !Array.isArray(userTimeSystems)) return [];
    return userTimeSystems.map(system => system?.id).filter(Boolean);
}

function resetLoreProjectImportState() {
    const contract = window.LoreProjectContract;
    if (!contract) throw new Error('Lore project contract is unavailable');

    if (window.LoreProjectState) {
        window.LoreProjectState.reset({ markDirty: false });
    } else {
        const defaults = contract.toLegacyInfoData(contract.normalizeLoreProject({}));
        Object.keys(infoData).forEach(key => delete infoData[key]);
        Object.assign(infoData, defaults);
        window.infoData = infoData;
    }

    if (typeof overviewLinksData !== 'undefined') overviewLinksData.length = 0;
    if (typeof customNavLinksData !== 'undefined') customNavLinksData.length = 0;
    if (typeof modalHorizontalLinksData !== 'undefined') modalHorizontalLinksData.length = 0;
    if (typeof linkedLorebookData !== 'undefined') linkedLorebookData = null;
    if (typeof linkedLorebookFilename !== 'undefined') linkedLorebookFilename = null;
    if (typeof customPageGalleries !== 'undefined') customPageGalleries = {};
    if (typeof editingPageIndex !== 'undefined') editingPageIndex = -1;
    if (typeof editingElementIndex !== 'undefined') editingElementIndex = -1;

    window.LoreCodexCompatState?.resetProjectScoped();
    window.editingIndex = -1;
    window.editingType = '';
    window.editingCategory = '';
    window.editingEventIndex = -1;
    window.editingEventContext = 'main';
    window.currentEditingItem = null;
    window.currentLoreProject = null;
    window.currentPublicSiteData = null;
    window.lastPublicProjectionSummary = null;
    window.lastLoreImportReport = null;
    window.htmlGenerated = false;
    window.dataModified = false;
    window.LoreProjectState?.setStatus({ dirty: false, generated: false });

    const htmlOutput = document.getElementById('html-output');
    if (htmlOutput) htmlOutput.value = '';
}

const {
    formatLoreImportReport,
    parseDomLegacyAdapter,
    parseFullInfoDataLegacyAdapter,
    parseSchemaJsonAdapter
} = createLorePayloadAdapters({
    contract: window.LoreProjectContract,
    extractDomProject: doc => {
        extractBasicInfo(doc);
        extractAppearanceInfo(doc);
        extractCharacters(doc);
        extractStorylines(doc);
        extractPlans(doc);
        extractWorldInfo(doc);
    },
    getAvailableTimeSystemIds: getAvailableTimeSystemIdsForImport,
    setImportResult: (project, report) => {
        window.lastLoreImportReport = report;
        if (project) window.currentLoreProject = project;
    }
});

async function parseImportedHTML(htmlContent) {
    try {
        console.log('Starting HTML import/parse...');

        // Import always starts from canonical defaults so omitted legacy fields cannot
        // inherit values from the project that was open previously.
        resetLoreProjectImportState();
        
        // Create a temporary DOM element to parse the HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        
        // Try to extract from embedded full data first
        const scripts = Array.from(doc.querySelectorAll('script'));
        const schemaIndex = scripts.findIndex(script => (
            script.id === 'lore-codex-project-data' && script.type === 'application/json'
        ));
        if (schemaIndex > 0) scripts.unshift(...scripts.splice(schemaIndex, 1));
        let foundEmbeddedData = false;
        
        scripts.forEach(script => {
            if (foundEmbeddedData) return;
            const scriptContent = script.textContent;
            let fullData = null;
            const payloadFormat = script.id === 'lore-codex-project-data'
                && script.type === 'application/json'
                ? 'schema-json'
                : 'legacy-fullInfoData';

            try {
                fullData = payloadFormat === 'schema-json'
                    ? parseSchemaJsonAdapter(scriptContent)
                    : parseFullInfoDataLegacyAdapter(scriptContent);
            } catch (adapterError) {
                console.warn(`Could not parse ${payloadFormat} payload:`, adapterError);
            }

            if (fullData) {
                try {
                    console.log(`Found ${payloadFormat} payload, attempting to parse...`);
                    console.log('Embedded project blocks:', Object.keys(fullData));
                    
                    // Use the embedded data directly
                    if (fullData.basic) {
                        infoData.basic = fullData.basic;
                    }
                    // Load overview links
                    if (fullData.basic.overviewLinks) {
                        overviewLinksData = [...fullData.basic.overviewLinks];
                    }
                    // Load custom navigation
                    if (fullData.basic.customNavLinks) {
                        customNavLinksData = [...fullData.basic.customNavLinks];
                    }
                    if (fullData.basic.customNavSettings) {
                        // This will be loaded by initializeCustomNavigation() later
                    }

                    if (fullData.customPages) {
                        infoData.customPages = fullData.customPages;
                        console.log('✅ Loaded custom pages:', fullData.customPages.length);
                    } else {
                        console.log('ℹ️ No custom pages found in embedded data');
                        infoData.customPages = [];
                    }
                    if (fullData.appearance) {
                        infoData.appearance = fullData.appearance;
                    }
                    if (fullData.characters) infoData.characters = fullData.characters;
                    if (fullData.storylines) {
                        infoData.storylines = fullData.storylines;
                        
                        // Migrate storylines for backward compatibility
                        infoData.storylines.forEach(storyline => {
                            if (!storyline.hasOwnProperty('isProjectLink')) {
                                if (storyline.link) {
                                    if (storyline.link.startsWith('roleplays/')) {
                                        storyline.isProjectLink = true;
                                        storyline.link = storyline.link.replace('roleplays/', '');
                                    } else if (storyline.link.match(/^[^\/\s]+\.html$/)) {
                                        storyline.isProjectLink = true;
                                    } else {
                                        storyline.isProjectLink = false;
                                    }
                                } else {
                                    storyline.isProjectLink = false;
                                }
                            }
                        });
                        
                    }
                    if (fullData.storylinesOptions) {
                        infoData.storylinesOptions = fullData.storylinesOptions;
                        console.log('✓ Loaded storylines options:', fullData.storylinesOptions);
                    } else {
                        // Set defaults if not present
                        infoData.storylinesOptions = {
                            showTOC: true,
                            showSections: true,
                            showSubsections: true
                        };
                        console.log('⚠ No storylines options found, using defaults');
                    }
                    if (fullData.charactersOptions) {
                        infoData.charactersOptions = fullData.charactersOptions;
                        console.log('✓ Loaded characters options:', fullData.charactersOptions);
                    } else {
                        // Set defaults if not present
                        infoData.charactersOptions = {
                            showByFaction: true,
                            showInfoDisplay: false
                        };
                        console.log('⚠ No characters options found, using defaults');
                    }
                    if (fullData.cultureOptions) {
                        infoData.cultureOptions = fullData.cultureOptions;
                        console.log('✓ Loaded culture options:', fullData.cultureOptions);
                    } else {
                        // Set defaults if not present
                        infoData.cultureOptions = {
                            customLabel: 'Culture'
                        };
                        console.log('⚠ No culture options found, using defaults');
                    }
                    if (fullData.cultivationOptions) {
                        infoData.cultivationOptions = fullData.cultivationOptions;
                        console.log('✓ Loaded cultivation options:', fullData.cultivationOptions);
                    } else {
                        // Set defaults if not present
                        infoData.cultivationOptions = {
                            customLabel: 'Cultivation'
                        };
                        console.log('⚠ No cultivation options found, using defaults');
                    }
                    if (fullData.magicOptions) {
                        infoData.magicOptions = fullData.magicOptions;
                        console.log('✓ Loaded magic options:', fullData.magicOptions);
                    } else {
                        // Set defaults if not present
                        infoData.magicOptions = {
                            customLabel: 'Magic'
                        };
                        console.log('⚠ No magic options found, using defaults');
                    }
                    if (fullData.eventsOptions) {
                        infoData.eventsOptions = fullData.eventsOptions;
                        console.log('✓ Loaded events options:', fullData.eventsOptions);
                    } else {
                        // Set defaults if not present
                        infoData.eventsOptions = {
                            customLabel: 'Events'
                        };
                        console.log('⚠ No events options found, using defaults');
                    }
                    if (fullData.plans) {
                        infoData.plans = fullData.plans;
                        console.log('Plans details:', fullData.plans.map(p => ({
                            title: p.title, 
                            events: p.events?.length || 0,
                            characterTags: p.characterTags?.length || 0
                        })));
                    } else {
                        console.log('⚠ No plans found in embedded data');
                        infoData.plans = [];
                    }
                    if (fullData.plansOptions) {
                        infoData.plansOptions = fullData.plansOptions;
                        console.log('✓ Loaded plans options:', fullData.plansOptions);
                    } else {
                        console.log('⚠ No plans options found, using default');
                        infoData.plansOptions = { selectedTimeSystemId: 'default' };
                    }
                    // DON'T import userTimeSystems from project - they should come from backend only!
                    // Projects only need to remember WHICH calendar they use, not the definitions
                    console.log('⚠ Skipping embedded userTimeSystems - calendars always load from backend');
                    if (fullData.playlists) {
                        infoData.playlists = fullData.playlists;
                    } else {
                        console.log('⚠ No playlists found in embedded data');
                        infoData.playlists = [];
                    }
                    if (fullData.world) {
                        infoData.world = fullData.world;
                    }

                    if (fullData.linkedLorebook) {
                        infoData.linkedLorebook = fullData.linkedLorebook;
                        console.log('✓ Loaded linked lorebook data');
                        
                    }
                    
                    foundEmbeddedData = true;
                    console.log('Successfully loaded embedded project data');
                    return;
                } catch (e) {
                    console.log('Could not parse embedded full data:', e);
                    console.log('Embedded payload format:', payloadFormat);
                }
            }
            
            // Fallback: try to extract plans separately if fullInfoData failed
            if (!foundEmbeddedData) {
                const plansMatch = scriptContent.match(/var plansData = (\[[\s\S]*?\]);/);
                if (plansMatch) {
                    try {
                        const plansData = JSON.parse(plansMatch[1]);
                        console.log('Found separate plansData:', plansData.length, 'plans');
                        infoData.plans = plansData;
                    } catch (e) {
                        console.log('Could not parse separate plans data:', e);
                    }
                }
            }
        });
        
        if (!foundEmbeddedData) {
            console.log('No embedded data found, using HTML parsing (hidden items, notes, detailed plans, tags, subtitle, and overview title/image may be lost)');
            parseDomLegacyAdapter(doc);
            } else {
                // Even when using embedded data, we should still extract basic info from HTML
                // in case some fields aren't in the embedded data
                if (doc.title || doc.querySelector('#overview, .banner-image, .title-overlay')) {
                    extractBasicInfo(doc);
                }
                console.log('Final appearance settings after embedded data:', infoData.appearance);
            }
        
        // Ensure plans array exists
        if (!infoData.plans) {
            console.log('Initializing empty plans array');
            infoData.plans = [];
        }

        // Ensure playlists array exists
        if (!infoData.playlists) {
            console.log('Initializing empty playlists array');
            infoData.playlists = [];
        }

        // Ensure custom pages array exists
        if (!infoData.customPages) {
            console.log('Initializing empty customPages array for backward compatibility');
            infoData.customPages = [];
        }
        
        // Ensure new overview fields AND subtitle exist
        if (!infoData.basic.hasOwnProperty('overviewTitle')) {
            infoData.basic.overviewTitle = '';
        }
        if (!infoData.basic.hasOwnProperty('overviewImage')) {
            infoData.basic.overviewImage = '';
        }
        if (!infoData.basic.hasOwnProperty('subtitle')) { // Ensure subtitle exists
            infoData.basic.subtitle = '';
        }
        
        // Ensure header settings exist
        if (!infoData.appearance.hasOwnProperty('worldCategoriesHeader')) {
            infoData.appearance.worldCategoriesHeader = 'default';
        }
        if (!infoData.appearance.hasOwnProperty('pageHeader')) {
            infoData.appearance.pageHeader = 'standard';
        }

        // Ensure main container background fields exist.
        if (!infoData.basic.hasOwnProperty('mainContainerBgImage')) {
            infoData.basic.mainContainerBgImage = '';
        }
        if (!infoData.basic.hasOwnProperty('mainContainerBgColor')) {
            infoData.basic.mainContainerBgColor = '';
        }
        if (!infoData.basic.hasOwnProperty('mainContainerOpacity')) {
            infoData.basic.mainContainerOpacity = 100;
        }
        if (!infoData.basic.hasOwnProperty('mainContainerBlur')) {
            infoData.basic.mainContainerBlur = 0;
        }
        
        // Ensure all characters have tags array
        if (infoData.characters && Array.isArray(infoData.characters)) {
            infoData.characters.forEach(character => {
                if (!character.hasOwnProperty('tags')) {
                    character.tags = [];
                }
            });
        }
        
        // Load appearance settings into the UI
        if (infoData.appearance && typeof loadAppearanceSettings === 'function') {
            console.log('Loading appearance settings into UI:', infoData.appearance);
            loadAppearanceSettings(infoData.appearance);
        }
        
        // Update all content lists (this will also update appearance controls)
        console.log('Updating all content lists...');
        console.log('Final data before updating lists:');
        console.log('- Characters:', infoData.characters.length);
        console.log('- Storylines:', infoData.storylines.length);
        console.log('- Plans:', infoData.plans.length);
        console.log('- Playlists:', infoData.playlists.length); 
        console.log('- World categories:', Object.keys(infoData.world));
        console.log('- Basic fields:', Object.keys(infoData.basic));

        // Ensure all required data arrays exist before updating lists
        if (!infoData.characters) infoData.characters = [];
        if (!infoData.storylines) infoData.storylines = [];
        if (!infoData.plans) infoData.plans = [];
        if (!infoData.playlists) infoData.playlists = [];
        if (!infoData.world) infoData.world = {};
        
        window.updateAllContentLists();

        // Reload user's calendars from backend and refresh dropdown
        if (typeof loadUserTimeSystems === 'function') {
            await loadUserTimeSystems();
            if (typeof populateTimeSystemsDropdown === 'function') {
                populateTimeSystemsDropdown();
                const dropdown = document.getElementById('plans-time-system');
                if (dropdown && infoData.plansOptions?.selectedTimeSystemId) {
                    dropdown.value = infoData.plansOptions.selectedTimeSystemId;
                }
            }
        }

        if (typeof renderOverviewLinks === 'function') renderOverviewLinks();
        if (typeof updateAddButtonState === 'function') updateAddButtonState();
        if (typeof renderCustomNavLinks === 'function') renderCustomNavLinks();
        if (typeof updateCustomNavAddButtonState === 'function') updateCustomNavAddButtonState();
        if (typeof renderPagesList === 'function') renderPagesList();
        if (typeof initializeLinkedLorebook === 'function') initializeLinkedLorebook();
        if (typeof window.populateAppearanceControls === 'function') {
            window.populateAppearanceControls();
        }

        if (typeof showStatus === 'function') {
            showStatus('success', formatLoreImportReport(window.lastLoreImportReport));
        }
        return true;
        
    } catch (error) {
        console.error('Error parsing HTML:', error);
        if (typeof showStatus === 'function') {
            showStatus('error', 'Error importing file. Please make sure it\'s a valid .html file.');
        } else {
            window.notifyLoreUser('Error importing file. Please make sure it\'s a valid .html file.');
        }
        return false;
    }
}


function exportData() {
    const data = collectFormData();
    const jsonData = JSON.stringify(data, null, 2);
    
    const element = document.createElement('a');
    element.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonData));
    element.setAttribute('download', 'world-data.json');
    element.style.display = 'none';
    
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

function importData() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    
    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                backupMadeThisSession = false;
                const data = JSON.parse(e.target.result);
                
                // Ensure new overview fields AND subtitle exist with defaults
                if (!data.basic) {
                    data.basic = {};
                }
                if (!data.basic.hasOwnProperty('overviewTitle')) {
                    data.basic.overviewTitle = '';
                }
                if (!data.basic.hasOwnProperty('overviewImage')) {
                    data.basic.overviewImage = '';
                }
                if (!data.basic.hasOwnProperty('subtitle')) {
                    data.basic.subtitle = '';
                }

                // Ensure custom navigation data exists with defaults
                if (!data.basic.hasOwnProperty('customNavLinks')) {
                    data.basic.customNavLinks = [];
                }
                if (!data.basic.hasOwnProperty('customNavSettings')) {
                    data.basic.customNavSettings = {
                        location: null,
                        alignment: null,
                        spacing: null,
                        position: null
                    };
                }
                
                // Ensure appearance data exists
                if (!data.appearance) {
                    data.appearance = {
                        overviewStyle: 'journal',      
                        navigationStyle: 'journal', 
                        colorScheme: 'current',
                        fontSet: 'serif',
                        worldCategoriesHeader: 'default',
                        pageHeader: 'standard',
                        storylineStyle: 'default',
                        containerStyle: 'left-border',
                        subcontainerStyle: 'soft-bg',
                        infodisplayStyle: 'default',
                        bannerSize: 'large',
                        buttonStyle: 'rounded',
                        siteWidth: 'standard' 
                    };
                }
                
                // Ensure plans data exists
                if (!data.plans) {
                    data.plans = [];
                }

                if (!data.playlists) {
                    data.playlists = [];
                }

                // Ensure custom pages exists
                if (!data.customPages) {
                    data.customPages = [];
                }
                
                // Ensure new world categories exist
                // Ensure new world categories exist
                if (!data.world.general) {
                    data.world.general = [];
                }
                if (!data.world.culture) {
                    data.world.culture = [];
                }
                if (!data.world.cultivation) {
                    data.world.cultivation = [];
                }
                if (!data.world.magic) {
                    data.world.magic = [];
                }
                
                // Ensure characters have all required fields including notes and tags
                if (data.characters && Array.isArray(data.characters)) {
                    data.characters.forEach(character => {
                        if (!character.hasOwnProperty('fullName')) {
                            character.fullName = ''; 
                        }
                        if (!character.hasOwnProperty('age')) {
                            character.age = ''; 
                        }
                        if (!character.hasOwnProperty('title')) {
                            character.title = ''; 
                        }
                        if (!character.hasOwnProperty('fightingStyle')) {
                            character.fightingStyle = '';
                        }
                        if (!character.hasOwnProperty('notes')) {
                            character.notes = '';
                        }
                        if (!character.hasOwnProperty('tags')) { // Ensure tags exist
                            character.tags = [];
                        }
                        if (!character.hasOwnProperty('faction')) {
                            character.faction = '';
                        }
                    });
                }
                
                // Migrate storylines to include isProjectLink boolean
                if (data.storylines && Array.isArray(data.storylines)) {
                    data.storylines.forEach(storyline => {
                        // Ensure storyline has the isProjectLink field
                        if (!storyline.hasOwnProperty('isProjectLink')) {
                            if (storyline.link) {
                                // Auto-detect based on link format
                                if (storyline.link.startsWith('roleplays/')) {
                                    storyline.isProjectLink = true;
                                    // Store just the filename
                                    storyline.link = storyline.link.replace('roleplays/', '');
                                } else if (storyline.link.match(/^[^\/\s]+\.html$/)) {
                                    // Just a filename
                                    storyline.isProjectLink = true;
                                } else {
                                    // External URL
                                    storyline.isProjectLink = false;
                                }
                            } else {
                                storyline.isProjectLink = false;
                            }
                        }
                    });
                }
                
                // Ensure plans have all required fields
                if (data.plans && Array.isArray(data.plans)) {
                    data.plans.forEach(plan => {
                        if (!plan.hasOwnProperty('title')) {
                            plan.title = '';
                        }
                        if (!plan.hasOwnProperty('overview')) {
                            plan.overview = '';
                        }
                        if (!plan.hasOwnProperty('characterTags')) {
                            plan.characterTags = [];
                        }
                        if (!plan.hasOwnProperty('events')) {
                            plan.events = [];
                        }
                        
                        // Ensure all events have required fields
                        if (Array.isArray(plan.events)) {
                            plan.events.forEach(event => {
                                if (!event.hasOwnProperty('title')) {
                                    event.title = '';
                                }
                                if (!event.hasOwnProperty('type')) {
                                    event.type = 'rising';
                                }
                                if (!event.hasOwnProperty('timing')) {
                                    event.timing = '';
                                }
                                if (!event.hasOwnProperty('notes')) {
                                    event.notes = '';
                                }
                                if (!event.hasOwnProperty('visible')) {
                                    event.visible = true;
                                }
                            });
                        }
                    });
                }

                // Ensure all characters have all required fields including new card fields
                if (data.characters && Array.isArray(data.characters)) {
                    data.characters.forEach(character => {
                        // ... existing field checks ...
                        if (!character.hasOwnProperty('cardEnabled')) {
                            character.cardEnabled = false;
                        }
                        if (!character.hasOwnProperty('cardPath')) {
                            character.cardPath = '';
                        }
                    });
                }
                
                // Ensure all world items have hidden field, tags, and IDs
                Object.keys(data.world).forEach(category => {
                    if (Array.isArray(data.world[category])) {
                        data.world[category].forEach(item => {
                            if (!item.hasOwnProperty('hidden')) {
                                item.hidden = false;
                            }
                            if (!item.hasOwnProperty('tags')) {
                                item.tags = [];
                            }
                            if (!item.hasOwnProperty('id') || !item.id) {
                                item.id = generateWorldItemIdForImport(category, data.world[category]);
                            }
                        });
                    }
                });

                // Ensure all locations have tags field
                if (data.world && data.world.locations && Array.isArray(data.world.locations)) {
                    data.world.locations.forEach(location => {
                        if (!location.hasOwnProperty('tags')) {
                            location.tags = [];
                        }
                    });
                }
                
                const migration = window.LoreProjectContract.migrateLoreProject(data, {
                    availableTimeSystemIds: getAvailableTimeSystemIdsForImport()
                });
                if (window.LoreProjectState) {
                    window.LoreProjectState.replace(migration.project, { markDirty: true });
                } else {
                    const editorData = window.LoreProjectContract.toLegacyInfoData(migration.project);
                    Object.keys(infoData).forEach(key => delete infoData[key]);
                    Object.assign(infoData, editorData);
                }
                window.currentLoreProject = migration.project;
                window.lastLoreImportReport = { format: 'project-json', ...migration.report };
                // DON'T import userTimeSystems - they should always come from backend
                // if (data.userTimeSystems) {
                //     userTimeSystems = data.userTimeSystems;
                // }
                window.updateAllContentLists();

                // Reload user calendars from backend and refresh dropdown
                if (typeof loadUserTimeSystems === 'function') {
                    await loadUserTimeSystems();
                    if (typeof populateTimeSystemsDropdown === 'function') populateTimeSystemsDropdown();
                }
                
                if (typeof showStatus === 'function') {
                    showStatus('success', formatLoreImportReport(window.lastLoreImportReport));
                } else {
                    window.notifyLoreUser('Data imported successfully!');
                }
            } catch (error) {
                if (typeof showStatus === 'function') {
                    showStatus('error', 'Error importing data: Invalid JSON file');
                } else {
                    window.notifyLoreUser('Error importing data: Invalid JSON file');
                }
            }
        };
        reader.readAsText(file);
    };
    
    fileInput.click();
}

// Helper to generate IDs during import
function generateWorldItemIdForImport(category, items) {
    const prefixMap = {
        'locations': 'loc',
        'concepts': 'concept',
        'events': 'event',
        'creatures': 'creature',
        'plants': 'plant',
        'items': 'item',
        'factions': 'faction',
        'culture': 'culture',
        'cultivation': 'cultivation',
        'magic': 'magic',
        'general': 'general'
    };
    
    const prefix = prefixMap[category] || category;
    
    const existingIds = items
        .filter(item => item.id)
        .map(item => parseInt(item.id.replace(`${prefix}_`, '')))
        .filter(id => !isNaN(id));
    
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    return `${prefix}_${maxId + 1}`;
}

// Make functions globally available
window.parseImportedHTML = parseImportedHTML;
window.exportData = exportData;
window.importData = importData;
