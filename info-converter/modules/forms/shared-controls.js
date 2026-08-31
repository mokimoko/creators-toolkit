// Lore Codex form domain: shared controls
let storyEditingDate = null;
let storyEditingTime = null;
let storyEditingEndDate = null;
let storyEditingEndTime = null;
let isSelectingStoryEndDate = false;

// Modal management functions
window.openModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        
        // Handle z-index for nested modals
        if (modalId === 'eventModal') {
            // Check if we're opening from within another modal
            const openModals = document.querySelectorAll('.modal[style*="block"]');
            if (openModals.length > 1) {
                // We have nested modals, increase z-index
                modal.style.zIndex = '2000';
            }
        } else if (modalId === 'imageImportModal') {
            // Image import modal should be on top of everything
            const openModals = document.querySelectorAll('.modal[style*="block"]');
            if (openModals.length > 1) {
                // If there are already modals open, put this on top
                modal.style.zIndex = '3000';
            }
        }
    }
}

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.style.zIndex = ''; // Reset z-index
        document.body.style.overflow = ''; // Restore scrolling
        clearModalFields(modalId);
        
        // Reset editing state ONLY for specific modals to avoid conflicts with nested modals
        if (modalId === 'characterModal') {
            editingIndex = -1;
            editingType = '';
            editingCategory = '';
        } else if (modalId === 'storylineModal') {
            editingIndex = -1;
            editingType = '';
            editingCategory = '';
        } else if (modalId === 'planModal') {
            editingIndex = -1;
            editingType = '';
            editingCategory = '';
            currentEditingEvents = []; // Reset the working copy
            currentEditingSubArcs = []; // Reset sub-arcs working copy
            currentEditingSubArcEvents = []; // Reset sub-arc events working copy
        } else if (modalId === 'locationModal') {
            editingIndex = -1;
            editingType = '';
            editingCategory = '';
        } else if (modalId === 'worldItemModal') {
            editingIndex = -1;
            editingType = '';
            editingCategory = '';
        }
        
        // IMPORTANT: Reset event editing state when closing the event modal
        if (modalId === 'eventModal') {
            editingEventIndex = -1;
            editingEventContext = 'main';
            currentEditingSubevents = []; // Clear character moments
            editingSubeventIndex = -1;   // Reset subevent editing index
        }
        
        // Reset sub-arc editing state when closing sub-arc modal
        if (modalId === 'subArcModal') {
            editingSubArcIndex = -1;
            currentEditingSubArcEvents = []; // Reset working copy
        }
    }
}

function clearModalFields(modalId) {
    const modal = document.getElementById(modalId);
    const inputs = modal.querySelectorAll('input, textarea');
    inputs.forEach(input => {
        if (input.type === 'checkbox') {
            input.checked = input.id === 'event-visible' || input.id === 'subarc-visible'; // Default visibility to true
        } else if (input.type === 'radio') {
            // Don't clear radio button values, just reset checked state
            // The first radio with 'checked' attribute will remain selected
            // Do nothing here - radio buttons keep their values
        } else {
            input.value = '';
        }
    });
    
    // Reset select elements too
    const selects = modal.querySelectorAll('select');
    selects.forEach(select => select.selectedIndex = 0);

    if (modalId === 'characterModal') {
        // Reset stats to defaults
        const defaultStats = ['Strength', 'Constitution', 'Agility', 'Technique', 'Defense', 'Charisma'];
        document.getElementById('char-stat-range').value = 100;
        
        for (let i = 1; i <= 6; i++) {
            document.getElementById(`char-stat-${i}-label`).value = defaultStats[i - 1];
            document.getElementById(`char-stat-${i}-value`).value = 0;
        }
    }
    
    // Clear events list if it's the plan modal
    if (modalId === 'planModal') {
        const eventsContainer = document.getElementById('events-list-container');
        if (eventsContainer) {
            eventsContainer.innerHTML = '<div class="empty-state">No events added yet</div>';
        }
        
        const subArcsContainer = document.getElementById('subarcs-list-container');
        if (subArcsContainer) {
            subArcsContainer.innerHTML = '<div class="empty-state">No sub-arcs added yet</div>';
        }
        
        currentEditingEvents = [];
        currentEditingSubArcs = [];
        currentEditingSubArcEvents = [];
    }
}

// Playlist modal functions
function openPlaylistModal(playlistData = null) {
    const modalTitle = document.getElementById('playlist-modal-title');
    
    if (playlistData) {
        modalTitle.textContent = 'Edit Playlist';
        populatePlaylistModal(playlistData);
    } else {
        modalTitle.textContent = 'Add Playlist';
        clearModalFields('playlistModal');
    }
    
    openModal('playlistModal');
    setupPlaylistTagAutocomplete();
}

function populatePlaylistModal(playlist) {
    document.getElementById('playlist-title').value = playlist.title || '';
    document.getElementById('playlist-spotify-url').value = playlist.spotifyUrl || '';
    document.getElementById('playlist-tags').value = (playlist.tags || []).join(', ');
    document.getElementById('playlist-description').value = playlist.description || '';
}

function savePlaylist() {
    const playlistData = {
        title: document.getElementById('playlist-title').value.trim(),
        spotifyUrl: document.getElementById('playlist-spotify-url').value.trim(),
        tags: document.getElementById('playlist-tags').value.trim()
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0),
        description: document.getElementById('playlist-description').value.trim()
    };

    // Validation
    if (!playlistData.title) {
        window.notifyLoreUser('Playlist title is required!');
        return;
    }

    if (!playlistData.spotifyUrl) {
        window.notifyLoreUser('Spotify URL is required!');
        return;
    }

    if (editingIndex >= 0 && editingType === 'playlist') {
        infoData.playlists[editingIndex] = playlistData;
    } else {
        infoData.playlists.push(playlistData);
    }

    updateContentList('playlists');
    closeModal('playlistModal');
    markDataAsModified();
}

// Setup character tag autocomplete for playlists
function setupPlaylistTagAutocomplete() {
    const input = document.getElementById('playlist-tags');
    if (!input) return;
    
    // Get all character names for autocomplete
    const characterNames = infoData.characters.map(char => char.name).filter(name => name);
    
    // Simple autocomplete implementation - you can enhance this later
    input.addEventListener('input', function(e) {
        const value = e.target.value;
        const lastComma = value.lastIndexOf(',');
        
        if (lastComma > -1) {
            const currentTag = value.substring(lastComma + 1).trim();
            // Add autocomplete suggestions logic here if needed
        }
    });


}

function setupCharacterColorInputs() {
    const colorText = document.getElementById('char-color');
    const colorPicker = document.getElementById('char-color-picker');
    
    if (colorText && colorPicker) {
        // Sync picker to text input
        colorText.addEventListener('input', () => {
            const color = colorText.value.trim();
            if (window.isValidHexColor(color)) {
                colorPicker.value = color;
            }
        });
        
        // Sync text input to picker
        colorPicker.addEventListener('input', () => {
            colorText.value = colorPicker.value;
        });
    }
}

function populateFactionDropdown() {
    const factionSelect = document.getElementById('char-faction');
    if (!factionSelect) return;
    
    // Clear existing options except "None"
    factionSelect.innerHTML = '<option value="">None</option>';
    
    // Get factions from world building
    if (infoData.world && infoData.world.factions) {
        infoData.world.factions.forEach(faction => {
            const option = document.createElement('option');
            option.value = faction.name;
            option.textContent = faction.name;
            factionSelect.appendChild(option);
        });
    }
}

function populateLocationDropdown() {
    const locationSelect = document.getElementById('char-location');
    if (!locationSelect) return;
    
    // Clear existing options except "None"
    locationSelect.innerHTML = '<option value="">None</option>';
    
    // Get locations from world building
    if (infoData.world && infoData.world.locations) {
        infoData.world.locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location.name;
            option.textContent = location.name;
            locationSelect.appendChild(option);
        });
    }
}

function populateItemsDropdown() {
    const dropdown = document.getElementById('char-items-dropdown');
    if (!dropdown) return;
    
    // Clear existing options
    dropdown.innerHTML = '';
    
    // Get items from world building that have icons
    if (infoData.world && infoData.world.items) {
        const itemsWithIcons = infoData.world.items.filter(item => {
            return item.icon && (item.icon.type === 'custom' || item.icon.type === 'builder');
        });
        
        if (itemsWithIcons.length === 0) {
            dropdown.innerHTML = '<div style="padding: 8px 12px; color: var(--text-muted);">No items with icons available</div>';
        } else {
            itemsWithIcons.forEach(item => {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'multiselect-option';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = item.name;
                checkbox.id = `item-${item.name.replace(/\s+/g, '-')}`;
                checkbox.onchange = updateItemsDisplay;
                
                const label = document.createElement('label');
                label.htmlFor = checkbox.id;
                label.textContent = item.name;
                
                optionDiv.appendChild(checkbox);
                optionDiv.appendChild(label);
                dropdown.appendChild(optionDiv);
            });
        }
    }
}

function toggleItemsDropdown() {
    const dropdown = document.getElementById('char-items-dropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
}

function updateItemsDisplay() {
    const dropdown = document.getElementById('char-items-dropdown');
    const display = document.getElementById('char-items-display');
    
    if (!dropdown || !display) return;
    
    const checkedBoxes = dropdown.querySelectorAll('input[type="checkbox"]:checked');
    
    if (checkedBoxes.length === 0) {
        display.textContent = 'Select items...';
    } else if (checkedBoxes.length === 1) {
        display.textContent = checkedBoxes[0].value;
    } else {
        display.textContent = `${checkedBoxes.length} items selected`;
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('char-items-dropdown');
    const button = document.getElementById('char-items-button');
    
    if (dropdown && button && !dropdown.contains(e.target) && !button.contains(e.target)) {
        dropdown.style.display = 'none';
    }

    // Skills
    const skillsDropdown = document.getElementById('char-skills-dropdown');
    const skillsButton = document.getElementById('char-skills-button');
    
    if (skillsDropdown && skillsButton && !skillsDropdown.contains(e.target) && !skillsButton.contains(e.target)) {
        skillsDropdown.style.display = 'none';
    }
});

function populateSkillsDropdown() {
    const dropdown = document.getElementById('char-skills-dropdown');
    if (!dropdown) return;
    
    dropdown.innerHTML = '';
    
    const skillsWithIcons = [];
    
    // Get Magic entries with icons
    if (infoData.world && infoData.world.magic) {
        infoData.world.magic.forEach(magicItem => {
            if (magicItem.icon && (magicItem.icon.type === 'custom' || magicItem.icon.type === 'builder')) {
                skillsWithIcons.push({
                    name: magicItem.name,
                    category: 'magic'
                });
            }
        });
    }
    
    // Get Cultivation entries with icons
    if (infoData.world && infoData.world.cultivation) {
        infoData.world.cultivation.forEach(cultivationItem => {
            if (cultivationItem.icon && (cultivationItem.icon.type === 'custom' || cultivationItem.icon.type === 'builder')) {
                skillsWithIcons.push({
                    name: cultivationItem.name,
                    category: 'cultivation'
                });
            }
        });
    }
    
    skillsWithIcons.sort((a, b) => a.name.localeCompare(b.name));
    
    if (skillsWithIcons.length === 0) {
        dropdown.innerHTML = '<div style="padding: 8px 12px; color: var(--text-muted);">No magic/cultivation skills with icons available</div>';
    } else {
        skillsWithIcons.forEach(skill => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'multiselect-option';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = skill.name;
            checkbox.id = `skill-${skill.name.replace(/\s+/g, '-')}`;
            checkbox.dataset.category = skill.category;
            checkbox.onchange = updateSkillsDisplay;
            
            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = skill.name;
            
            optionDiv.appendChild(checkbox);
            optionDiv.appendChild(label);
            dropdown.appendChild(optionDiv);
        });
    }
}

function toggleSkillsDropdown() {
    const dropdown = document.getElementById('char-skills-dropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
}

function updateSkillsDisplay() {
    const dropdown = document.getElementById('char-skills-dropdown');
    const display = document.getElementById('char-skills-display');
    
    if (!dropdown || !display) return;
    
    const checkedBoxes = dropdown.querySelectorAll('input[type="checkbox"]:checked');
    
    if (checkedBoxes.length === 0) {
        display.textContent = 'Select skills...';
    } else if (checkedBoxes.length === 1) {
        display.textContent = checkedBoxes[0].value;
    } else {
        display.textContent = `${checkedBoxes.length} skills selected`;
    }
}

// Update stat max values when range changes
function updateStatRanges() {
    const maxRange = document.getElementById('char-stat-range').value || 100;
    
    for (let i = 1; i <= 6; i++) {
        const valueInput = document.getElementById(`char-stat-${i}-value`);
        if (valueInput) {
            valueInput.max = maxRange;
            // If current value exceeds new max, adjust it
            if (parseInt(valueInput.value) > parseInt(maxRange)) {
                valueInput.value = maxRange;
            }
        }
    }
}

// Initialize stat range listeners
function initializeStatListeners() {
    const rangeInput = document.getElementById('char-stat-range');
    if (rangeInput) {
        rangeInput.addEventListener('change', updateStatRanges);
        rangeInput.addEventListener('input', updateStatRanges);
    }
}

// Update openCharacterModal to set up color inputs
