// Lore Codex form domain: world controller
function openLocationModal(locationData = null) {
    const modalTitle = document.getElementById('location-modal-title');
    
    if (locationData) {
        modalTitle.textContent = 'Edit Location';
        populateLocationModal(locationData);
    } else {
        modalTitle.textContent = 'Add Location';
        clearModalFields('locationModal');
    }
    
    openModal('locationModal');
}

function populateLocationModal(location) {
    document.getElementById('loc-name').value = location.name || '';
    document.getElementById('loc-type').value = location.type || '';
    document.getElementById('loc-status').value = location.status || '';
    document.getElementById('loc-tags').value = (location.tags || []).join(', ');
    document.getElementById('loc-hidden').checked = location.hidden || false;
    document.getElementById('loc-image').value = location.image || '';
    document.getElementById('loc-description').value = location.description || '';
    document.getElementById('loc-features').value = location.features || '';
    document.getElementById('loc-connections').value = location.connections || '';
}

function saveLocation() {
    const locationData = {
        name: document.getElementById('loc-name').value.trim(),
        type: document.getElementById('loc-type').value.trim(),
        status: document.getElementById('loc-status').value.trim(),
        hidden: document.getElementById('loc-hidden').checked,
        tags: document.getElementById('loc-tags').value
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag),
        image: document.getElementById('loc-image').value.trim(),
        description: document.getElementById('loc-description').value.trim(),
        features: document.getElementById('loc-features').value.trim(),
        connections: document.getElementById('loc-connections').value.trim()
    };
    // Validation
    if (!locationData.name) {
        window.notifyLoreUser('Location name is required!');
        return;
    }

    if (editingIndex >= 0 && editingType === 'location') {
        infoData.world.locations[editingIndex] = locationData;
    } else {
        infoData.world.locations.push(locationData);
    }

    updateContentList('locations');
    closeModal('locationModal');
    markDataAsModified();
}

// Generic world item modal functions
function openWorldItemModal(itemData = null, category) {
    const modalTitle = document.getElementById('world-item-modal-title');
    
    // Get category name with custom labels support
    let categoryName;
    if (category === 'general') {
        categoryName = 'General';
    } else if (category === 'magic' && infoData.magicOptions?.customLabel) {
        categoryName = infoData.magicOptions.customLabel;
    } else if (category === 'cultivation' && infoData.cultivationOptions?.customLabel) {
        categoryName = infoData.cultivationOptions.customLabel;
    } else if (category === 'culture' && infoData.cultureOptions?.customLabel) {
        categoryName = infoData.cultureOptions.customLabel;
    } else if (category === 'events' && infoData.eventsOptions?.customLabel) {
        categoryName = infoData.eventsOptions.customLabel;
    } else {
        // Changed slice(1, -1) to slice(1) to prevent cutting off last letter
        categoryName = category.charAt(0).toUpperCase() + category.slice(1);
    }
    
    // Show/hide icon section based on category
    const iconSection = document.getElementById('world-item-icon-section');
    if (iconSection) {
        // Show icon section for items, magic, and cultivation
        iconSection.style.display = (category === 'items' || category === 'magic' || category === 'cultivation') ? 'block' : 'none';
    }
    
    if (itemData) {
        modalTitle.textContent = `Edit ${categoryName}`;
        populateWorldItemModal(itemData);
    } else {
        modalTitle.textContent = `Add ${categoryName}`;
        clearModalFields('worldItemModal');
        
        // CRITICAL: Create a new item object with an ID for new entries
        // This allows icons to be saved even before the entry is saved
        if (category === 'items' || category === 'magic' || category === 'cultivation') {
            window.currentEditingItem = {
                id: generateWorldItemId(category),
                name: '',
                icon: null
            };
        } else {
            window.currentEditingItem = null;
        }
        
        // Reset icon fields (with safety checks) - for items, magic, and cultivation
        if (category === 'items' || category === 'magic' || category === 'cultivation') {
            const iconTypeNone = document.querySelector('input[name="icon-type"][value="none"]');
            const customIconSection = document.getElementById('custom-icon-image-section');
            const builderSection = document.getElementById('icon-builder-section');
            const previewContainer = document.getElementById('icon-preview-container');
            const iconImageInput = document.getElementById('item-icon-image');
            const configureBtn = document.getElementById('configure-icon-btn');
            
            if (iconTypeNone) iconTypeNone.checked = true;
            if (customIconSection) customIconSection.style.display = 'none';
            if (builderSection) builderSection.style.display = 'none';
            if (previewContainer) previewContainer.style.display = 'none';
            if (iconImageInput) iconImageInput.value = '';
            if (configureBtn) configureBtn.style.display = 'none';
            currentIconConfig = null;
        }
    }
    
    // Update labels based on category
    const propertiesLabel = document.querySelector('label[for="item-properties"]');
    if (category === 'locations') {
        propertiesLabel.textContent = 'Notable Features:';
        document.getElementById('item-properties').placeholder = 'Important landmarks, characteristics, points of interest, etc.';
    } else {
        propertiesLabel.textContent = 'Properties/Characteristics:';
        document.getElementById('item-properties').placeholder = 'Special properties, abilities, characteristics, etc.';
    }
    
    // Store the category for saving
    editingCategory = category;
    openModal('worldItemModal');
}

function populateWorldItemModal(item) {
    // SET THIS FIRST, BEFORE ANYTHING ELSE
    window.currentEditingItem = item;
    document.getElementById('item-name').value = item.name || '';
    document.getElementById('item-category').value = item.category || item.type || '';
    document.getElementById('item-status').value = item.status || '';
    document.getElementById('item-tags').value = (item.tags || []).join(', ');
    document.getElementById('item-hidden').checked = item.hidden || false;
    document.getElementById('item-image').value = item.image || '';
    document.getElementById('item-description').value = item.description || '';
    
    // Handle properties/features field (different for locations)
    if (item.features) {
        document.getElementById('item-properties').value = item.features || '';
    } else {
        document.getElementById('item-properties').value = item.properties || '';
    }
    
    // Handle connections field
    document.getElementById('item-connections').value = item.connections || '';
    
    // Handle icon configuration
    if (item.icon) {
        if (item.icon.type === 'custom') {
            document.querySelector('input[name="icon-type"][value="custom"]').checked = true;
            document.getElementById('item-icon-image').value = item.icon.image || '';
            document.getElementById('custom-icon-image-section').style.display = 'block';
            document.getElementById('icon-builder-section').style.display = 'none';
            document.getElementById('configure-icon-btn').style.display = 'none';
            document.getElementById('icon-preview-container').style.display = 'none';
        } else if (item.icon.type === 'builder') {
            document.querySelector('input[name="icon-type"][value="builder"]').checked = true;
            document.getElementById('custom-icon-image-section').style.display = 'none';
            document.getElementById('icon-builder-section').style.display = 'block';
            document.getElementById('configure-icon-btn').style.display = 'inline-block';
            
            window.currentEditingItem = item;
            
            // Show preview
            const previewContainer = document.getElementById('icon-preview-container');
            const previewDisplay = document.getElementById('icon-preview-display');
            const iconPath = getIconPath(item.icon.category, item.icon.file);
            let borderCSS = 'none';
            if (item.icon.borderStyle === 'thin') {
                borderCSS = `2px solid ${item.icon.borderColor}`;
            } else if (item.icon.borderStyle === 'thick') {
                borderCSS = `4px solid ${item.icon.borderColor}`;
            }
            const borderRadius = item.icon.shape === 'circle' ? '50%' : '4px';
            
            previewDisplay.innerHTML = `
                <div style="
                    width: 48px;
                    height: 48px;
                    background-color: ${item.icon.bgColor};
                    border: ${borderCSS};
                    border-radius: ${borderRadius};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 10px 0;
                ">
                    <img src="${iconPath}" alt="${item.icon.name}" 
                        style="width: 28px; height: 28px; image-rendering: pixelated; opacity: ${item.icon.iconOpacity / 100};">
                </div>
            `;
            
            previewContainer.style.display = 'block';
        }
    } else {
        // CRITICAL: Item has no icon - reset everything to "No Icon"
        const iconTypeNone = document.querySelector('input[name="icon-type"][value="none"]');
        const customIconSection = document.getElementById('custom-icon-image-section');
        const builderSection = document.getElementById('icon-builder-section');
        const previewContainer = document.getElementById('icon-preview-container');
        const configureBtn = document.getElementById('configure-icon-btn');
        const iconImageInput = document.getElementById('item-icon-image');
        
        if (iconTypeNone) iconTypeNone.checked = true;
        if (customIconSection) customIconSection.style.display = 'none';
        if (builderSection) builderSection.style.display = 'none';
        if (previewContainer) previewContainer.style.display = 'none';
        if (configureBtn) configureBtn.style.display = 'none';
        if (iconImageInput) iconImageInput.value = '';
    }
}

function getIconPath(category, file) {
    return window.LoreDomainHelpers.getIconPath(category, file);
}

function saveWorldItem() {
    const itemData = {
        name: document.getElementById('item-name').value.trim(),
        image: document.getElementById('item-image').value.trim(),
        description: document.getElementById('item-description').value.trim(),
        status: document.getElementById('item-status').value.trim(),
        hidden: document.getElementById('item-hidden').checked,
        tags: document.getElementById('item-tags').value
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag),
        icon: null  // Will be set below
    };
    
    // Check which icon type is selected
    const iconType = document.querySelector('input[name="icon-type"]:checked').value;
    if (iconType === 'custom') {
        const customImage = document.getElementById('item-icon-image').value.trim();
        if (customImage) {
            itemData.icon = {
                type: 'custom',
                image: customImage
            };
        }
    } else if (iconType === 'builder') {
        // Read from window.currentEditingItem if it exists
        if (window.currentEditingItem && window.currentEditingItem.icon && window.currentEditingItem.icon.type === 'builder') {
            itemData.icon = window.currentEditingItem.icon;
            console.log('✅ Saving builder icon to item:', itemData.icon);
        } else {
            console.warn('⚠️ Builder icon selected but no icon config found');
        }
    }
    
    // Handle different property names for different categories
    if (editingCategory === 'locations') {
        itemData.type = document.getElementById('item-category').value.trim();
        itemData.features = document.getElementById('item-properties').value.trim();
        itemData.connections = document.getElementById('item-connections').value.trim();
    } else {
        itemData.category = document.getElementById('item-category').value.trim();
        itemData.properties = document.getElementById('item-properties').value.trim();
        itemData.connections = document.getElementById('item-connections').value.trim();
    }

    // Generate or preserve ID
    if (editingIndex >= 0) {
        const existingItem = infoData.world[editingCategory][editingIndex];
        itemData.id = existingItem.id || generateWorldItemId(editingCategory);
    } else {
        // Use the ID that was already generated when opening the modal
        // This ensures icons can be saved before the entry is saved
        itemData.id = window.currentEditingItem?.id || generateWorldItemId(editingCategory);
    }

    // Validation
    if (!itemData.name) {
        window.notifyLoreUser('Item name is required!');
        return;
    }

    if (editingIndex >= 0) {
        infoData.world[editingCategory][editingIndex] = itemData;
    } else {
        infoData.world[editingCategory].push(itemData);
    }

    updateContentList(editingCategory);
    closeModal('worldItemModal');
    markDataAsModified();
}

// Add functions for each content type
