// Lore Codex form domain: content controller
window.addCharacter = function() {
    editingIndex = -1;
    editingType = 'character';
    openCharacterModal();
}

window.addStoryline = function() {
    editingIndex = -1;
    editingType = 'storyline';
    openStorylineModal();
}

window.addPlan = function() {
    editingIndex = -1;
    editingType = 'plan';
    openPlanModal();
}

window.addGeneral = function() {
    editingIndex = -1;
    editingType = 'worldItem';
    editingCategory = 'general';
    openWorldItemModal(null, 'general');
}

window.addLocation = function() {
    editingIndex = -1;
    editingType = 'location';
    openLocationModal();
}

window.addConcept = function() {
    editingIndex = -1;
    editingType = 'worldItem';
    editingCategory = 'concepts';
    openWorldItemModal(null, 'concepts');
}

window.addEvent = function() {
    editingIndex = -1;
    editingType = 'worldItem';
    editingCategory = 'events';
    openWorldItemModal(null, 'events');
}

window.addCreature = function() {
    editingIndex = -1;
    editingType = 'worldItem';
    editingCategory = 'creatures';
    openWorldItemModal(null, 'creatures');
}

window.addPlant = function() {
    editingIndex = -1;
    editingType = 'worldItem';
    editingCategory = 'plants';
    openWorldItemModal(null, 'plants');
}

window.addItem = function() {
    editingIndex = -1;
    editingType = 'worldItem';
    editingCategory = 'items';
    openWorldItemModal(null, 'items');
}

window.addFaction = function() {
    editingIndex = -1;
    editingType = 'worldItem';
    editingCategory = 'factions';
    openWorldItemModal(null, 'factions');
}

window.addCulture = function() {
    editingIndex = -1;
    editingType = 'worldItem';
    editingCategory = 'culture';
    openWorldItemModal(null, 'culture');
}

window.addCultivation = function() {
    editingIndex = -1;
    editingType = 'worldItem';
    editingCategory = 'cultivation';
    openWorldItemModal(null, 'cultivation');
}

window.addMagic = function() {
    editingIndex = -1;
    editingType = 'worldItem';
    editingCategory = 'magic';
    openWorldItemModal(null, 'magic');
}

// Collapsible section functionality
function toggleCollapsible(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.toggle-icon');
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        icon.classList.remove('collapsed');
        icon.textContent = '▼';
    } else {
        content.classList.add('collapsed');
        icon.classList.add('collapsed');
        icon.textContent = '▶';
    }
}

// Sub-tab functionality (Generate/Preview)
window.switchSubTab = function(tabName) {
    // Remove active class from sub-tabs only (scope to the .tabs container)
    document.querySelectorAll('.tabs .tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to clicked tab
    const activeTab = document.querySelector(`.tabs [data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}-content-inner`);
    
    if (activeTab && activeContent) {
        activeTab.classList.add('active');
        activeContent.classList.add('active');
        window.LoreAccessibility?.syncTabs();
        
        // If switching to preview, update it
        if (tabName === 'preview') {
            const html = document.getElementById('html-output').value;
            if (html) {
                updatePreview(html);
            }
        }
    }
}

// Legacy tab functionality (keeping for compatibility)
window.switchTab = function(tabName) {
    switchSubTab(tabName);
}

// Content management functions
function addDragListeners(element, container) {
    element.addEventListener('dragstart', function(e) {
        draggedElement = this;
        this.classList.add('dragging');
        container.classList.add('dragging');
        
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.outerHTML);
    });

    element.addEventListener('dragend', function(e) {
        this.classList.remove('dragging');
        container.classList.remove('dragging');
        
        const allItems = container.querySelectorAll('.content-item');
        allItems.forEach(item => item.classList.remove('drag-over'));
        
        // Update data order after drag ends
        updateDataOrder(container);
        
        draggedElement = null;
    });

    element.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const siblings = container.querySelectorAll('.content-item');
        siblings.forEach(sibling => sibling.classList.remove('drag-over'));

        if (this !== draggedElement) {
            this.classList.add('drag-over');
        }
    });

    element.addEventListener('drop', function(e) {
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

function updateDataOrder(container) {
    // Get the category from the container ID
    const containerId = container.id;
    const category = containerId.replace('-list', '');
    
    // Get current data array
    let dataArray;
    if (category === 'characters') {
        dataArray = infoData.characters;
    } else if (category === 'storylines') {
        dataArray = infoData.storylines;
    } else if (category === 'plans') {
        dataArray = infoData.plans;
    } else {
        dataArray = infoData.world[category];
    }
    
    // Get the current visual order from DOM
    const contentItems = container.querySelectorAll('.content-item');
    const newOrder = [];
    
    contentItems.forEach(item => {
        // Extract the index from the edit button onclick attribute
        const editButton = item.querySelector('.btn-edit');
        if (editButton) {
            const onclickAttr = editButton.getAttribute('onclick');
            const indexMatch = onclickAttr.match(/editItem\(['"](.+?)['"],\s*(\d+)\)/);
            if (indexMatch) {
                const originalIndex = parseInt(indexMatch[2]);
                newOrder.push(dataArray[originalIndex]);
            }
        }
    });
    
    // Update the data array with the new order
    if (category === 'characters') {
        infoData.characters = newOrder;
    } else if (category === 'storylines') {
        infoData.storylines = newOrder;
    } else if (category === 'plans') {
        infoData.plans = newOrder;
    } else {
        infoData.world[category] = newOrder;
    }
    
    // Refresh the content list to update button indices
    updateContentList(category);
}

function createContentItem(name, type, index, category) {
    const item = document.createElement('div');
    item.className = 'content-item';
    item.draggable = true;
    
    // Get the actual data to check if it's hidden
    let itemData;
    if (category === 'characters') {
        itemData = infoData.characters[index];
    } else if (category === 'storylines') {
        itemData = infoData.storylines[index];
    } else if (category === 'plans') {
        itemData = infoData.plans[index];
    } else if (category === 'playlists') {
        itemData = infoData.playlists[index];
    } else {
        itemData = infoData.world[category][index];
    }
    
    // Add hidden class if item is hidden
    if (itemData && itemData.hidden) {
        item.classList.add('hidden-item');
    }
    
    const typeDisplay = type ? ` (${type})` : '';
    const hiddenBadge = (itemData && itemData.hidden) ? '<span class="hidden-badge">Hidden</span>' : '';
    
    // For plans, show event count and sub-arc count
    let extraInfo = '';
    if (category === 'plans' && itemData) {
        const mainEvents = itemData.events ? itemData.events.length : 0;
        const visibleMainEvents = itemData.events ? itemData.events.filter(event => event.visible !== false).length : 0;
        
        const subArcs = itemData.subArcs ? itemData.subArcs.length : 0;
        const visibleSubArcs = itemData.subArcs ? itemData.subArcs.filter(arc => arc.visible !== false).length : 0;
        
        let totalSubArcEvents = 0;
        let totalVisibleSubArcEvents = 0;
        
        if (itemData.subArcs) {
            itemData.subArcs.forEach(subArc => {
                if (subArc.events) {
                    totalSubArcEvents += subArc.events.length;
                    totalVisibleSubArcEvents += subArc.events.filter(event => event.visible !== false).length;
                }
            });
        }
        
        const totalEvents = mainEvents + totalSubArcEvents;
        const totalVisibleEvents = visibleMainEvents + totalVisibleSubArcEvents;
        
        extraInfo = ` <span class="event-count">(${totalVisibleEvents}/${totalEvents} events`;
        if (subArcs > 0) {
            extraInfo += `, ${visibleSubArcs}/${subArcs} sub-arcs`;
        }
        extraInfo += ')</span>';
    }
    
    item.innerHTML = `
        <div style="display: flex; align-items: center; flex: 1; min-width: 0;">
            <span class="content-item-name">${name || 'Unnamed Item'}</span>
            <span class="content-item-type">${typeDisplay}</span>
            ${extraInfo}
            ${hiddenBadge}
        </div>
        <div class="content-item-actions">
            <button class="btn-small btn-edit" onclick="editItem('${category}', ${index})">Edit</button>
            <button class="btn-small btn-delete" onclick="deleteItem('${category}', ${index})">Delete</button>
        </div>
    `;
    
    return item;
}

window.updateContentList = function(category) {
    const container = document.getElementById(`${category}-list`);
    let items;
    
    if (category === 'characters') {
        items = infoData.characters;
    } else if (category === 'storylines') {
        items = infoData.storylines;
    } else if (category === 'plans') {
        items = infoData.plans;
    } else if (category === 'playlists') {
        items = infoData.playlists;
    } else {
        // Ensure the category exists before accessing it
        if (!infoData.world[category]) {
            infoData.world[category] = [];
        }
        items = infoData.world[category];
    }

    if (items.length === 0) {
        const emptyText = category === 'plans' ? 'No story arcs added yet' : `No ${category} added yet`;
        container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
        return;
    }

    container.innerHTML = '';
    items.forEach((item, index) => {
        const name = item.name || item.title || 'Unnamed Item';
        // Handle different type field names for different categories
        let type = '';
        if (category === 'locations') {
            type = item.type || '';
        } else if (category === 'storylines') {
            type = item.pairing || '';
        } else if (category === 'plans') {
            type = '';
        } else {
            type = item.category || '';
        }
        
        const contentItem = createContentItem(name, type, index, category);
        
        // Add drag and drop functionality
        addDragListeners(contentItem, container);
        
        container.appendChild(contentItem);
    });
}

window.editItem = function(category, index) {
    editingIndex = index;
    editingCategory = category;
    
    if (category === 'characters') {
        editingType = 'character';
        openCharacterModal(infoData.characters[index]);
    } else if (category === 'storylines') {
        editingType = 'storyline';
        openStorylineModal(infoData.storylines[index]);
    } else if (category === 'plans') {
        editingType = 'plan';
        openPlanModal(infoData.plans[index]);
    } else if (category === 'playlists') {
        editingType = 'playlist';
        openPlaylistModal(infoData.playlists[index]);
    } else if (category === 'locations') {
        editingType = 'location';
        openLocationModal(infoData.world.locations[index]);
    } else {
        editingType = 'worldItem';
        openWorldItemModal(infoData.world[category][index], category);
    }
}

window.deleteItem = function(category, index) {
    let itemName;
    
    if (category === 'characters') {
        itemName = infoData.characters[index]?.name;
    } else if (category === 'storylines') {
        itemName = infoData.storylines[index]?.title;
    } else if (category === 'plans') {
        itemName = infoData.plans[index]?.title;
    } else if (category === 'playlists') {
        itemName = infoData.playlists[index]?.title;
    } else {
        itemName = infoData.world[category][index]?.name;
    }
    
    if (confirm(`Are you sure you want to delete "${itemName || 'this item'}"?`)) {
        if (category === 'characters') {
            infoData.characters.splice(index, 1);
        } else if (category === 'storylines') {
            infoData.storylines.splice(index, 1);
        } else if (category === 'plans') {
            infoData.plans.splice(index, 1);
        } else if (category === 'playlists') {
            infoData.playlists.splice(index, 1);
        } else {
            infoData.world[category].splice(index, 1);
        }
        updateContentList(category);
    }
}
