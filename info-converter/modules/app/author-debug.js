export function installAuthorDebugCommands(dependencies) {
    const updateAllContentLists = dependencies.updateAllContentLists;
    let infoData = dependencies.getInfoData();
    let userSessionManager = dependencies.getUserSessionManager();

    function syncContext() {
        infoData = dependencies.getInfoData();
        userSessionManager = dependencies.getUserSessionManager();
    }

// Debug function for user session
window.debugUserSession = function() {
    syncContext();
    if (!userSessionManager) {
        console.log('❌ User session manager not initialized');
        return;
    }
    
    console.log('=== USER SESSION DEBUG ===');
    console.log('Session info:', userSessionManager.getSessionInfo());
    console.log('Current user:', userSessionManager.getCurrentUser());
    console.log('User context:', userSessionManager.getUserContext());
    console.log('Is guest:', userSessionManager.isGuest);
    console.log('Is logged in:', userSessionManager.isLoggedIn());
    
    return userSessionManager.getSessionInfo();
};

// Debug function to check appearance state
window.debugAppearance = function() {
    syncContext();
    console.log('=== APPEARANCE DEBUG ===');
    console.log('infoData.appearance:', infoData.appearance);
    
    const controls = {
        template: document.getElementById('appearance-template')?.value,
        colorScheme: document.getElementById('appearance-color-scheme')?.value,
        fontSet: document.getElementById('appearance-font-set')?.value,
        containerStyle: document.getElementById('appearance-container-style')?.value,
        subcontainerStyle: document.getElementById('appearance-subcontainer-style')?.value,
        infodisplayStyle: document.getElementById('appearance-infodisplay-style')?.value
    };
    
    console.log('UI control values:', controls);
    
    const mismatch = Object.keys(controls).filter(key => 
        infoData.appearance && infoData.appearance[key] !== controls[key]
    );
    
    if (mismatch.length > 0) {
        console.log('❌ Mismatches found:', mismatch);
        console.log('Try running: populateAppearanceControls()');
    } else {
        console.log('✅ Data and UI controls match');
    }
    
    return { data: infoData.appearance, controls, mismatch };
};

// Debug function to check hidden items state
window.debugHiddenItems = function() {
    syncContext();
    console.log('=== HIDDEN ITEMS DEBUG ===');
    let totalHidden = 0;
    
    Object.keys(infoData.world).forEach(category => {
        const hidden = infoData.world[category].filter(item => item.hidden);
        if (hidden.length > 0) {
            console.log(`${category}: ${hidden.length} hidden items`);
            hidden.forEach(item => {
                console.log(`  - ${item.name} (hidden: ${item.hidden})`);
                totalHidden++;
            });
        }
    });
    
    if (totalHidden === 0) {
        console.log('No hidden items found in any category');
        console.log('Current infoData structure:', infoData);
    } else {
        console.log(`Total hidden items: ${totalHidden}`);
    }
    
    return totalHidden;
};

// Show all hidden items (unhide them)
window.showHidden = function() {
    syncContext();
    let count = 0;
    
    // Go through all world categories
    Object.keys(infoData.world).forEach(category => {
        infoData.world[category].forEach(item => {
            if (item.hidden) {
                item.hidden = false;
                count++;
            }
        });
    });
    
    // Update the UI
    updateAllContentLists();
    
    console.log(`✅ Unhid ${count} items. They will now appear in the generated HTML.`);
    return count;
};

// Hide a specific item by name
window.hideItem = function(itemName) {
    syncContext();
    if (!itemName || typeof itemName !== 'string') {
        console.error('❌ Please provide an item name as a string');
        return false;
    }
    
    const searchName = itemName.toLowerCase().trim();
    let found = false;
    
    // Search through all world categories
    Object.keys(infoData.world).forEach(category => {
        infoData.world[category].forEach(item => {
            if (item.name && item.name.toLowerCase().includes(searchName)) {
                item.hidden = true;
                found = true;
                console.log(`🙈 Hidden "${item.name}" from ${category}`);
            }
        });
    });
    
    if (found) {
        updateAllContentLists();
        console.log('✅ Item(s) hidden. They will not appear in the generated HTML.');
    } else {
        console.log(`❌ No items found matching "${itemName}"`);
    }
    
    return found;
};

// Show a specific item by name (unhide it)
window.showItem = function(itemName) {
    syncContext();
    if (!itemName || typeof itemName !== 'string') {
        console.error('❌ Please provide an item name as a string');
        return false;
    }
    
    const searchName = itemName.toLowerCase().trim();
    let found = false;
    
    // Search through all world categories
    Object.keys(infoData.world).forEach(category => {
        infoData.world[category].forEach(item => {
            if (item.name && item.name.toLowerCase().includes(searchName) && item.hidden) {
                item.hidden = false;
                found = true;
                console.log(`👁️ Showed "${item.name}" from ${category}`);
            }
        });
    });
    
    if (found) {
        updateAllContentLists();
        console.log('✅ Item(s) unhidden. They will now appear in the generated HTML.');
    } else {
        console.log(`❌ No hidden items found matching "${itemName}"`);
    }
    
    return found;
};

// List all currently hidden items
window.listHidden = function() {
    syncContext();
    const hiddenItems = [];
    
    // Go through all world categories
    Object.keys(infoData.world).forEach(category => {
        infoData.world[category].forEach(item => {
            if (item.hidden) {
                hiddenItems.push({
                    name: item.name,
                    category: category,
                    type: item.category || item.type || 'Unknown'
                });
            }
        });
    });
    
    if (hiddenItems.length === 0) {
        console.log('✅ No hidden items found');
        return [];
    }
    
    console.log(`🙈 Found ${hiddenItems.length} hidden item(s):`);
    console.table(hiddenItems);
    
    console.log('\nTo unhide an item, use: showItem("item name")');
    console.log('To unhide all items, use: showHidden()');
    
    return hiddenItems;
};

// Batch hide items by category
window.hideCategory = function(categoryName) {
    syncContext();
    if (!categoryName || typeof categoryName !== 'string') {
        console.error('❌ Please provide a category name as a string');
        console.log('Available categories:', Object.keys(infoData.world).join(', '));
        return false;
    }
    
    const searchCategory = categoryName.toLowerCase().trim();
    let matchedCategory = null;
    
    // Find matching category (flexible matching)
    Object.keys(infoData.world).forEach(category => {
        if (category.toLowerCase().includes(searchCategory) || searchCategory.includes(category.toLowerCase())) {
            matchedCategory = category;
        }
    });
    
    if (!matchedCategory) {
        console.error(`❌ Category "${categoryName}" not found`);
        console.log('Available categories:', Object.keys(infoData.world).join(', '));
        return false;
    }
    
    let count = 0;
    infoData.world[matchedCategory].forEach(item => {
        if (!item.hidden) {
            item.hidden = true;
            count++;
        }
    });
    
    updateAllContentLists();
    console.log(`🙈 Hidden ${count} items from ${matchedCategory} category`);
    return count;
};

// Batch show items by category
window.showCategory = function(categoryName) {
    syncContext();
    if (!categoryName || typeof categoryName !== 'string') {
        console.error('❌ Please provide a category name as a string');
        console.log('Available categories:', Object.keys(infoData.world).join(', '));
        return false;
    }
    
    const searchCategory = categoryName.toLowerCase().trim();
    let matchedCategory = null;
    
    // Find matching category (flexible matching)
    Object.keys(infoData.world).forEach(category => {
        if (category.toLowerCase().includes(searchCategory) || searchCategory.includes(category.toLowerCase())) {
            matchedCategory = category;
        }
    });
    
    if (!matchedCategory) {
        console.error(`❌ Category "${categoryName}" not found`);
        console.log('Available categories:', Object.keys(infoData.world).join(', '));
        return false;
    }
    
    let count = 0;
    infoData.world[matchedCategory].forEach(item => {
        if (item.hidden) {
            item.hidden = false;
            count++;
        }
    });
    
    updateAllContentLists();
    console.log(`👁️ Showed ${count} items from ${matchedCategory} category`);
    return count;
};

// ===============================
// END HIDDEN ITEMS FUNCTIONS
// ===============================


    return {
        debugAppearance: window.debugAppearance,
        debugHiddenItems: window.debugHiddenItems,
        debugUserSession: window.debugUserSession,
        hideCategory: window.hideCategory,
        hideItem: window.hideItem,
        listHidden: window.listHidden,
        showCategory: window.showCategory,
        showHidden: window.showHidden,
        showItem: window.showItem
    };
}
