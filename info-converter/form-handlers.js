// Lore Codex form domain: options and compatibility exports
// Storylines Options functions
function openStorylinesOptionsModal() {
    // Populate checkboxes with current values
    document.getElementById('storylines-show-toc').checked = infoData.storylinesOptions?.showTOC ?? true;
    document.getElementById('storylines-show-sections').checked = infoData.storylinesOptions?.showSections ?? true;
    document.getElementById('storylines-show-subsections').checked = infoData.storylinesOptions?.showSubsections ?? true;
    
    openModal('storylinesOptionsModal');
}

function saveStorylinesOptions() {
    // Ensure storylinesOptions exists
    if (!infoData.storylinesOptions) {
        infoData.storylinesOptions = {};
    }
    
    infoData.storylinesOptions.showTOC = document.getElementById('storylines-show-toc').checked;
    infoData.storylinesOptions.showSections = document.getElementById('storylines-show-sections').checked;
    infoData.storylinesOptions.showSubsections = document.getElementById('storylines-show-subsections').checked;
    
    closeModal('storylinesOptionsModal');
    markDataAsModified();
    
    if (typeof showStatus === 'function') {
        showStatus('success', 'Storylines display options saved!');
    }
}

// Plans Options functions
async function openPlansOptionsModal() {
    await window.LoreFeatureLifecycle?.ensureFeature('timeSystems');
    // Populate time system dropdown
    if (typeof populateTimeSystemsDropdown === 'function') {
        populateTimeSystemsDropdown();
    }
    
    // Set current selection
    const selectedSystem = infoData.plansOptions?.selectedTimeSystemId || 'default';
    document.getElementById('plans-time-system').value = selectedSystem;
    
    openModal('plansOptionsModal');
}

function savePlansOptions() {
    // Ensure plansOptions exists
    if (!infoData.plansOptions) {
        infoData.plansOptions = {};
    }
    
    infoData.plansOptions.selectedTimeSystemId = document.getElementById('plans-time-system').value;
    
    closeModal('plansOptionsModal');
    markDataAsModified();
    
    if (typeof showStatus === 'function') {
        showStatus('success', 'Plans options saved!');
    }
}

// Magic Options functions
function openMagicOptionsModal() {
    // Populate input with current value
    const customLabel = infoData.magicOptions?.customLabel || 'Magic';
    document.getElementById('magic-custom-label').value = customLabel;
    
    openModal('magicOptionsModal');
}

function saveMagicOptions() {
    // Ensure magicOptions exists
    if (!infoData.magicOptions) {
        infoData.magicOptions = {};
    }
    
    infoData.magicOptions.customLabel = document.getElementById('magic-custom-label').value.trim() || 'Magic';
    
    closeModal('magicOptionsModal');
    markDataAsModified();
    
    updateCategoryLabels();
    
    if (typeof showStatus === 'function') {
        showStatus('success', 'Magic display options saved!');
    }
}

// Cultivation Options functions
function openCultivationOptionsModal() {
    // Populate input with current value
    const customLabel = infoData.cultivationOptions?.customLabel || 'Cultivation';
    document.getElementById('cultivation-custom-label').value = customLabel;
    
    openModal('cultivationOptionsModal');
}

function saveCultivationOptions() {
    // Ensure cultivationOptions exists
    if (!infoData.cultivationOptions) {
        infoData.cultivationOptions = {};
    }
    
    infoData.cultivationOptions.customLabel = document.getElementById('cultivation-custom-label').value.trim() || 'Cultivation';
    
    closeModal('cultivationOptionsModal');
    markDataAsModified();
    
    updateCategoryLabels();
    
    if (typeof showStatus === 'function') {
        showStatus('success', 'Cultivation display options saved!');
    }
}

// Culture Options functions
function openCultureOptionsModal() {
    // Populate input with current value
    const customLabel = infoData.cultureOptions?.customLabel || 'Culture';
    document.getElementById('culture-custom-label').value = customLabel;
    
    openModal('cultureOptionsModal');
}

function saveCultureOptions() {
    // Ensure cultureOptions exists
    if (!infoData.cultureOptions) {
        infoData.cultureOptions = {};
    }
    
    infoData.cultureOptions.customLabel = document.getElementById('culture-custom-label').value.trim() || 'Culture';
    
    closeModal('cultureOptionsModal');
    markDataAsModified();
    
    updateCategoryLabels();
    
    if (typeof showStatus === 'function') {
        showStatus('success', 'Culture display options saved!');
    }
}

// Events Options functions
function openEventsOptionsModal() {
    // Populate input with current value
    const customLabel = infoData.eventsOptions?.customLabel || 'Events';
    document.getElementById('events-custom-label').value = customLabel;
    
    openModal('eventsOptionsModal');
}

function saveEventsOptions() {
    // Ensure eventsOptions exists
    if (!infoData.eventsOptions) {
        infoData.eventsOptions = {};
    }
    
    infoData.eventsOptions.customLabel = document.getElementById('events-custom-label').value.trim() || 'Events';
    
    closeModal('eventsOptionsModal');
    markDataAsModified();
    
    updateCategoryLabels();
    
    if (typeof showStatus === 'function') {
        showStatus('success', 'Events display options saved!');
    }
}

// Update category display labels in the UI
function updateCategoryLabels() {
    // Update Magic labels
    if (infoData.magicOptions?.customLabel) {
        const magicLabel = infoData.magicOptions.customLabel;
        
        // Update section header
        const magicSectionHeader = document.querySelector('#magic-section .section-header h3');
        if (magicSectionHeader) {
            magicSectionHeader.innerHTML = `<i class="fas fa-wand-magic-sparkles"></i> ${magicLabel}`;
        }
        
        // Update sidebar
        const magicSidebarItem = document.querySelector('.sidebar-item[data-category="magic"] .category-name');
        if (magicSidebarItem) {
            magicSidebarItem.textContent = magicLabel;
        }
        
        // Update add button text
        const magicAddBtn = document.getElementById('add-magic');
        if (magicAddBtn) {
            magicAddBtn.textContent = `+ Add ${magicLabel}`;
        }
    }

    // Update Culture labels
    if (infoData.cultureOptions?.customLabel) {
        const cultureLabel = infoData.cultureOptions.customLabel;
        
        // Update section header
        const cultureSectionHeader = document.querySelector('#culture-section .section-header h3');
        if (cultureSectionHeader) {
            cultureSectionHeader.innerHTML = `<i class="fas fa-theater-masks"></i> ${cultureLabel}`;
        }
        
        // Update sidebar
        const cultureSidebarItem = document.querySelector('.sidebar-item[data-category="culture"] .category-name');
        if (cultureSidebarItem) {
            cultureSidebarItem.textContent = cultureLabel;
        }
        
        // Update add button text
        const cultureAddBtn = document.getElementById('add-culture');
        if (cultureAddBtn) {
            cultureAddBtn.textContent = `+ Add ${cultureLabel}`;
        }
    }
    
    // Update Cultivation labels
    if (infoData.cultivationOptions?.customLabel) {
        const cultivationLabel = infoData.cultivationOptions.customLabel;
        
        // Update section header
        const cultivationSectionHeader = document.querySelector('#cultivation-section .section-header h3');
        if (cultivationSectionHeader) {
            cultivationSectionHeader.innerHTML = `<i class="fas fa-leaf"></i> ${cultivationLabel}`;
        }
        
        // Update sidebar
        const cultivationSidebarItem = document.querySelector('.sidebar-item[data-category="cultivation"] .category-name');
        if (cultivationSidebarItem) {
            cultivationSidebarItem.textContent = cultivationLabel;
        }
        
        // Update add button text
        const cultivationAddBtn = document.getElementById('add-cultivation');
        if (cultivationAddBtn) {
            cultivationAddBtn.textContent = `+ Add ${cultivationLabel}`;
        }
    }

    // Update Events labels
    if (infoData.eventsOptions?.customLabel) {
        const eventsLabel = infoData.eventsOptions.customLabel;
        
        // Update section header
        const eventsSectionHeader = document.querySelector('#events-section .section-header h3');
        if (eventsSectionHeader) {
            eventsSectionHeader.innerHTML = `<i class="fas fa-calendar-alt"></i> ${eventsLabel}`;
        }
        
        // Update sidebar
        const eventsSidebarItem = document.querySelector('.sidebar-item[data-category="events"] .category-name');
        if (eventsSidebarItem) {
            eventsSidebarItem.textContent = eventsLabel;
        }
        
        // Update add button text
        const eventsAddBtn = document.getElementById('add-event');
        if (eventsAddBtn) {
            eventsAddBtn.textContent = `+ Add ${eventsLabel}`;
        }
    }
}

// Characters Options functions
function openCharactersOptionsModal() {
    // Populate checkboxes with current values
    const showByFactionCheckbox = document.getElementById('characters-show-by-faction');
    const showInfoDisplayCheckbox = document.getElementById('characters-show-info-display');
    const manageFactionOrderBtn = document.getElementById('manage-faction-order-btn');
    
    showByFactionCheckbox.checked = infoData.charactersOptions?.showByFaction ?? true;
    showInfoDisplayCheckbox.checked = infoData.charactersOptions?.showInfoDisplay ?? false; // NEW - default false
    
    // Enable/disable the order button based on checkbox
    if (manageFactionOrderBtn) {
        manageFactionOrderBtn.disabled = !showByFactionCheckbox.checked;
    }
    
    // Add listener to checkbox to update button state
    showByFactionCheckbox.addEventListener('change', function() {
        if (manageFactionOrderBtn) {
            manageFactionOrderBtn.disabled = !this.checked;
        }
    });
    
    openModal('charactersOptionsModal');
}

function saveCharactersOptions() {
    // Ensure charactersOptions exists
    if (!infoData.charactersOptions) {
        infoData.charactersOptions = {};
    }
    
    infoData.charactersOptions.showByFaction = document.getElementById('characters-show-by-faction').checked;
    infoData.charactersOptions.showInfoDisplay = document.getElementById('characters-show-info-display').checked;
    
    closeModal('charactersOptionsModal');
    markDataAsModified();
    
    if (typeof showStatus === 'function') {
        showStatus('success', 'Characters display options saved!');
    }
}

// Faction Order functions
function openFactionOrderModal() {
    const container = document.getElementById('faction-order-list');
    if (!container) return;
    
    // Get factions that are actually assigned to characters
    const assignedFactions = new Set();
    infoData.characters.forEach(character => {
        if (character.faction && character.faction.trim()) {
            assignedFactions.add(character.faction.trim());
        }
    });
    
    if (assignedFactions.size === 0) {
        window.notifyLoreUser('No factions are currently assigned to characters.');
        return;
    }
    
    // Get faction indices from world.factions
    const factionItems = [];
    infoData.world.factions.forEach((faction, index) => {
        if (assignedFactions.has(faction.name)) {
            factionItems.push({ name: faction.name, index: index });
        }
    });
    
    // Sort based on saved order if it exists
    if (infoData.charactersOptions?.factionOrder) {
        factionItems.sort((a, b) => {
            const aIndex = infoData.charactersOptions.factionOrder.indexOf(a.index);
            const bIndex = infoData.charactersOptions.factionOrder.indexOf(b.index);
            
            // If both in saved order, use saved order
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            // If only a is in saved order, a comes first
            if (aIndex !== -1) return -1;
            // If only b is in saved order, b comes first
            if (bIndex !== -1) return 1;
            // Neither in saved order, sort alphabetically
            return a.name.localeCompare(b.name);
        });
    } else {
        // No saved order, sort alphabetically
        factionItems.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    // Populate the list
    container.innerHTML = '';
    factionItems.forEach((item, displayIndex) => {
        const factionItem = document.createElement('div');
        factionItem.className = 'event-item';
        factionItem.draggable = true;
        factionItem.setAttribute('data-index', displayIndex);
        factionItem.setAttribute('data-faction-index', item.index);
        
        factionItem.innerHTML = `
            <div class="event-item-header">
                <i class="fas fa-grip-vertical drag-handle"></i>
                <span class="event-item-title">${item.name}</span>
            </div>
        `;
        
        container.appendChild(factionItem);
    });
    
    // Initialize drag and drop
    initializeFactionOrderDragDrop(container);
    
    openModal('factionOrderModal');
}

function initializeFactionOrderDragDrop(container) {
    const factionItems = container.querySelectorAll('.event-item');
    let draggedElement = null;
    
    factionItems.forEach(item => {
        item.addEventListener('dragstart', function(e) {
            draggedElement = this;
            this.classList.add('dragging');
            container.classList.add('dragging');
            
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', this.outerHTML);
        });

        item.addEventListener('dragend', function(e) {
            this.classList.remove('dragging');
            container.classList.remove('dragging');
            
            const allItems = container.querySelectorAll('.event-item');
            allItems.forEach(item => item.classList.remove('drag-over'));
            
            draggedElement = null;
        });

        item.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const siblings = container.querySelectorAll('.event-item');
            siblings.forEach(sibling => sibling.classList.remove('drag-over'));

            if (this !== draggedElement) {
                this.classList.add('drag-over');
            }
        });

        item.addEventListener('drop', function(e) {
            e.preventDefault();
            
            if (this !== draggedElement && draggedElement) {
                const rect = this.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                
                if (e.clientY < midpoint) {
                    container.insertBefore(draggedElement, this);
                } else {
                    container.insertBefore(draggedElement, this.nextSibling);
                }
            }
            
            this.classList.remove('drag-over');
        });
    });

    container.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });

    container.addEventListener('drop', function(e) {
        e.preventDefault();
        
        if (e.target === container && draggedElement) {
            container.appendChild(draggedElement);
        }
    });
}

function saveFactionOrder() {
    const container = document.getElementById('faction-order-list');
    if (!container) return;
    
    // Ensure charactersOptions exists
    if (!infoData.charactersOptions) {
        infoData.charactersOptions = {};
    }
    
    // Get the current order from the DOM
    const factionItems = container.querySelectorAll('.event-item');
    const factionOrder = [];
    
    factionItems.forEach(item => {
        const factionIndex = parseInt(item.getAttribute('data-faction-index'));
        factionOrder.push(factionIndex);
    });
    
    infoData.charactersOptions.factionOrder = factionOrder;
    
    closeModal('factionOrderModal');
    markDataAsModified();
    
    if (typeof showStatus === 'function') {
        showStatus('success', 'Faction order saved!');
    }
}

// Info-Display Labels functions
function openInfoDisplayLabelsModal() {
    // Populate inputs with current values or defaults
    const labels = infoData.charactersOptions?.infoDisplayLabels || {};
    
    document.getElementById('info-display-label-age').value = labels.age || 'Age';
    document.getElementById('info-display-label-origin').value = labels.origin || 'Origin';
    document.getElementById('info-display-label-faction').value = labels.faction || 'Faction';
    document.getElementById('info-display-label-items').value = labels.items || 'Special Items';
    
    openModal('infoDisplayLabelsModal');
}

function saveInfoDisplayLabels() {
    // Ensure charactersOptions exists
    if (!infoData.charactersOptions) {
        infoData.charactersOptions = {};
    }
    
    // Save custom labels
    infoData.charactersOptions.infoDisplayLabels = {
        age: document.getElementById('info-display-label-age').value.trim() || 'Age',
        origin: document.getElementById('info-display-label-origin').value.trim() || 'Origin',
        faction: document.getElementById('info-display-label-faction').value.trim() || 'Faction',
        items: document.getElementById('info-display-label-items').value.trim() || 'Special Items'
    };
    
    closeModal('infoDisplayLabelsModal');
    markDataAsModified();
    
    if (typeof showStatus === 'function') {
        showStatus('success', 'Info-Display labels saved!');
    }
}

// Date and icon-color controls that depend on the complete editor DOM.
function initializeFormHandlerFeatureListeners() {

    const storyDateBtn = document.getElementById('story-date-display');
    const clearStoryDateBtn = document.getElementById('clear-story-date-btn');
    const storyYearlyCheckbox = document.getElementById('story-yearly');
    const storyPerennialCheckbox = document.getElementById('story-yearly-perennial');
    
    if (storyDateBtn) {
        storyDateBtn.onclick = () => openStoryDatePicker(false);
    }
    
    if (clearStoryDateBtn) {
        clearStoryDateBtn.onclick = clearStoryDate;
    }
    
    if (storyYearlyCheckbox) {
        storyYearlyCheckbox.addEventListener('change', function() {
            const controls = document.getElementById('story-yearly-controls');
            controls.style.display = this.checked ? 'flex' : 'none';
            if (!this.checked) {
                document.getElementById('story-yearly-duration').value = '';
                document.getElementById('story-yearly-perennial').checked = false;
            }
        });
    }
    
    if (storyPerennialCheckbox) {
        storyPerennialCheckbox.addEventListener('change', function() {
            const durationInput = document.getElementById('story-yearly-duration');
            durationInput.disabled = this.checked;
            if (this.checked) durationInput.value = '';
        });
    }

    // Color picker sync for icon bg color
    const iconBgColorPicker = document.getElementById('icon-bg-color-picker');
    if (iconBgColorPicker) {
        iconBgColorPicker.addEventListener('input', function() {
            document.getElementById('icon-bg-color').value = this.value;
            updateIconPreview();
        });
    }
    
    const iconBgColorText = document.getElementById('icon-bg-color');
    if (iconBgColorText) {
        iconBgColorText.addEventListener('input', function() {
            if (/^#[0-9A-F]{6}$/i.test(this.value)) {
                document.getElementById('icon-bg-color-picker').value = this.value;
            }
        });
    }
    
    // Color picker sync for icon border color
    const iconBorderColorPicker = document.getElementById('icon-border-color-picker');
    if (iconBorderColorPicker) {
        iconBorderColorPicker.addEventListener('input', function() {
            document.getElementById('icon-border-color').value = this.value;
            updateIconPreview();
        });
    }
    
    const iconBorderColorText = document.getElementById('icon-border-color');
    if (iconBorderColorText) {
        iconBorderColorText.addEventListener('input', function() {
            if (/^#[0-9A-F]{6}$/i.test(this.value)) {
                document.getElementById('icon-border-color-picker').value = this.value;
            }
        });
    }
}

window.initializeFormHandlerFeatureListeners = initializeFormHandlerFeatureListeners;

// Make savePlaylist globally accessible
window.savePlaylist = savePlaylist;

// Make functions globally available
window.openFactionOrderModal = openFactionOrderModal;
window.saveFactionOrder = saveFactionOrder;

// Make functions globally available
window.openCharactersOptionsModal = openCharactersOptionsModal;
window.saveCharactersOptions = saveCharactersOptions;

// Make functions globally available
window.openStorylinesOptionsModal = openStorylinesOptionsModal;
window.saveStorylinesOptions = saveStorylinesOptions;
