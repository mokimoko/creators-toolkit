import { debounce } from './debounce.js';

export function switchMainTab(tabName) {
    document.querySelectorAll('.main-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.main-tab-content').forEach(content => content.classList.remove('active'));

    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}-content`);
    if (!activeTab || !activeContent) {
        console.error(`Could not find main tab or content for: ${tabName}`);
        return;
    }

    activeTab.classList.add('active');
    activeContent.classList.add('active');
    window.LoreAccessibility?.syncTabs();
    void window.LoreFeatureLifecycle?.ensureForTab(tabName);
}

export function updateNavProjectDisplay(projectName) {
    const display = document.getElementById('current-project-name');
    if (!display) return;

    if (projectName) {
        display.textContent = projectName;
        display.classList.remove('is-hidden');
    } else {
        display.classList.add('is-hidden');
    }
}

export function toggleCollapsible(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.toggle-icon');
    if (!content || !icon) return;

    content.classList.toggle('collapsed');
    icon.classList.toggle('collapsed');
    header.setAttribute('aria-expanded', String(!content.classList.contains('collapsed')));
}

export function createNavigationController(dependencies) {
    const createContentItem = dependencies.createContentItem;
    const isValidHexColor = dependencies.isValidHexColor;
    const renderPagesList = dependencies.renderPagesList;
    const updateCategoryLabels = dependencies.updateCategoryLabels;
    let infoData = dependencies.getInfoData();
    let draggedElement = null;

    function syncInfoData() {
        infoData = dependencies.getInfoData();
    }

// AUTOSCROLL STUFF

// Auto-scroll variables
let autoScrollInterval = null;
let autoScrollSpeed = 0;
let isDragging = false;

// Auto-scroll configuration
const AUTO_SCROLL_ZONE_HEIGHT = 40; // pixels from edge to trigger scroll
const AUTO_SCROLL_SPEED = 2; // pixels per interval
const AUTO_SCROLL_INTERVAL = 16; // milliseconds (60fps)

// Enhanced drag listeners with auto-scroll
function addDragListeners(element, container) {
    element.draggable = true;
    
    element.addEventListener('dragstart', function(e) {
        draggedElement = this;
        isDragging = true;
        this.classList.add('dragging');
        container.classList.add('dragging');
        
        // Set up auto-scroll monitoring
        setupAutoScroll(container);
        
        e.dataTransfer.effectAllowed = 'move';
    });
    
    element.addEventListener('dragend', function(e) {
        isDragging = false;
        this.classList.remove('dragging');
        container.classList.remove('dragging');
        
        // Clean up auto-scroll
        cleanupAutoScroll();
        
        // Clean up drag-over states
        document.querySelectorAll('.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        
        draggedElement = null;
    });
    
    element.addEventListener('dragover', function(e) {
        e.preventDefault();
        
        if (draggedElement && draggedElement !== this) {
            // Remove existing drag-over classes
            container.querySelectorAll('.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
            
            // Add drag-over to current element
            this.classList.add('drag-over');
            
            // Update auto-scroll based on mouse position
            updateAutoScroll(e, container);
        }
    });
    
    element.addEventListener('drop', function(e) {
        e.preventDefault();
        
        if (draggedElement && draggedElement !== this) {
            // Handle the actual reordering
            handleDrop(draggedElement, this, container);
        }
        
        this.classList.remove('drag-over');
    });
}

// Set up auto-scroll monitoring
function setupAutoScroll(container) {
    updateScrollIndicators(container);
    
    // Start monitoring interval
    if (!autoScrollInterval) {
        autoScrollInterval = setInterval(() => {
            if (autoScrollSpeed !== 0 && isDragging) {
                container.scrollTop += autoScrollSpeed;
                updateScrollIndicators(container);
            }
        }, AUTO_SCROLL_INTERVAL);
    }
}

// Update auto-scroll based on mouse position
function updateAutoScroll(e, container) {
    if (!isDragging) return;
    
    const containerRect = container.getBoundingClientRect();
    const mouseY = e.clientY;
    const relativeY = mouseY - containerRect.top;
    const containerHeight = containerRect.height;
    
    // Check if mouse is in auto-scroll zones
    if (relativeY < AUTO_SCROLL_ZONE_HEIGHT && container.scrollTop > 0) {
        // Near top, scroll up
        const intensity = (AUTO_SCROLL_ZONE_HEIGHT - relativeY) / AUTO_SCROLL_ZONE_HEIGHT;
        autoScrollSpeed = -AUTO_SCROLL_SPEED * intensity;
    } else if (relativeY > containerHeight - AUTO_SCROLL_ZONE_HEIGHT && 
               container.scrollTop < container.scrollHeight - container.clientHeight) {
        // Near bottom, scroll down
        const intensity = (relativeY - (containerHeight - AUTO_SCROLL_ZONE_HEIGHT)) / AUTO_SCROLL_ZONE_HEIGHT;
        autoScrollSpeed = AUTO_SCROLL_SPEED * intensity;
    } else {
        // Not in auto-scroll zone
        autoScrollSpeed = 0;
    }
}

// Clean up auto-scroll
function cleanupAutoScroll() {
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
    }
    autoScrollSpeed = 0;
}

// Update scroll indicators
function updateScrollIndicators(container) {
    if (!container) return;
    
    const canScrollUp = container.scrollTop > 0;
    const canScrollDown = container.scrollTop < container.scrollHeight - container.clientHeight;
    
    container.classList.toggle('can-scroll-up', canScrollUp);
    container.classList.toggle('can-scroll-down', canScrollDown);
}

// Handle actual drop and reordering
function handleDrop(draggedEl, targetEl, container) {
    syncInfoData();
    const draggedIndex = Array.from(container.children).indexOf(draggedEl);
    const targetIndex = Array.from(container.children).indexOf(targetEl);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Determine the content type and update the data
    const contentType = getContentTypeFromContainer(container);
    if (!contentType) return;
    
    // Move the item in the data array
    let items;
    if (contentType === 'characters') {
        items = infoData.characters;
    } else if (contentType === 'storylines') {
        items = infoData.storylines;
    } else if (contentType === 'plans') {
        items = infoData.plans;
    } else if (contentType === 'playlists') {
        items = infoData.playlists;
    } else if (infoData.world[contentType]) {
        items = infoData.world[contentType];
    }
    
    if (items && draggedIndex !== targetIndex) {
        // Move item in array
        const [movedItem] = items.splice(draggedIndex, 1);
        items.splice(targetIndex, 0, movedItem);
        
        // Update the UI
        updateContentList(contentType);
        
        console.log(`Moved ${contentType} item from position ${draggedIndex} to ${targetIndex}`);
    }
}

// Helper function to determine content type from container
function getContentTypeFromContainer(container) {
    const id = container.id;
    if (id.includes('characters')) return 'characters';
    if (id.includes('storylines')) return 'storylines';
    if (id.includes('plans')) return 'plans';
    if (id.includes('playlists')) return 'playlists';
    if (id.includes('general')) return 'general';
    if (id.includes('locations')) return 'locations';
    if (id.includes('concepts')) return 'concepts';
    if (id.includes('events')) return 'events';
    if (id.includes('creatures')) return 'creatures';
    if (id.includes('plants')) return 'plants';
    if (id.includes('items')) return 'items';
    if (id.includes('factions')) return 'factions';
    if (id.includes('culture')) return 'culture';
    if (id.includes('cultivation')) return 'cultivation';
    if (id.includes('magic')) return 'magic';
    return null;
}

// Initialize scroll indicators on all content lists
function initializeScrollIndicators() {
    document.querySelectorAll('.content-list').forEach(container => {
        updateScrollIndicators(container);
        
        // Add scroll event listener to update indicators
        container.addEventListener('scroll', () => {
            updateScrollIndicators(container);
        });
    });
}

// =====================
// END Auto Scroll Stuff
// =====================


let activeCategory = 'characters';
const debouncedContentSearch = debounce(handleContentSearch, 120);

// Initialize sidebar navigation
function initializeSidebar() {
    const sidebar = document.querySelector('.content-sidebar');
    sidebar?.addEventListener('click', event => {
        const item = event.target.closest('.sidebar-item');
        if (item) switchToCategory(item.getAttribute('data-category'));
    });
    
    // Set up sidebar collapse/expand
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', toggleSidebar);
    }
    
    // Set up search functionality
    const searchInput = document.getElementById('content-search');
    if (searchInput) {
        searchInput.addEventListener('input', debouncedContentSearch);
    }

    const mobileCategory = document.getElementById('mobile-content-category');
    if (mobileCategory) {
        syncMobileCategoryOptions();
        mobileCategory.addEventListener('change', event => switchToCategory(event.target.value));
    }

    const mobileSearch = document.getElementById('mobile-content-search');
    if (mobileSearch) {
        mobileSearch.addEventListener('input', debouncedContentSearch);
    }
    
    // Initialize with first category active
    switchToCategory('characters');
    updateAllItemCounts();
}

// Switch to a specific category
function switchToCategory(category) {
    debouncedContentSearch.cancel();
    // Update sidebar active state
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const sidebarItem = document.querySelector(`[data-category="${category}"]`);
    if (sidebarItem) {
        sidebarItem.classList.add('active');
    }
    
    // Update content sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    const contentSection = document.getElementById(`${category}-section`);
    if (contentSection) {
        contentSection.classList.add('active');
        activeCategory = category;
    }

    const mobileCategory = document.getElementById('mobile-content-category');
    if (mobileCategory) mobileCategory.value = category;
    
    // Clear search when switching categories
    const searchInput = document.getElementById('content-search');
    if (searchInput) {
        searchInput.value = '';
    }
    const mobileSearch = document.getElementById('mobile-content-search');
    if (mobileSearch) mobileSearch.value = '';
    clearContentSearch();
    window.LoreAccessibility?.syncContentNavigation();
}

function syncMobileCategoryOptions() {
    const mobileCategory = document.getElementById('mobile-content-category');
    if (!mobileCategory) return;

    const options = Array.from(document.querySelectorAll('.sidebar-item[data-category]')).map(item => ({
        value: item.dataset.category,
        label: item.querySelector('.category-name')?.textContent?.trim() || item.dataset.category
    }));
    mobileCategory.replaceChildren(...options.map(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    }));
    mobileCategory.value = activeCategory;
}

// Toggle sidebar collapsed state
function toggleSidebar() {
    const sidebar = document.querySelector('.content-sidebar');
    const btn = document.getElementById('sidebar-collapse-btn');
    
    if (sidebar && btn) {
        sidebar.classList.toggle('collapsed');
        
        if (sidebar.classList.contains('collapsed')) {
            btn.innerHTML = '›';
            btn.title = 'Expand sidebar';
        } else {
            btn.innerHTML = '‹';
            btn.title = 'Collapse sidebar';
        }
    }
}

// Update item count for a specific category
function updateItemCount(category) {
    syncInfoData();
    const countElement = document.getElementById(`${category}-count`);
    if (!countElement) return;
    
    let count = 0;
    
    if (category === 'characters') {
        count = infoData.characters.length;
    } else if (category === 'storylines') {
        count = infoData.storylines.length;
    } else if (category === 'plans') {
        count = infoData.plans.length;
    } else if (category === 'playlists') {
        count = infoData.playlists.length;
    } else if (infoData.world[category]) {
        count = infoData.world[category].length;
    }
    
    countElement.textContent = count;
    
    // Update count badge visibility
    if (count > 0) {
        countElement.style.visibility = 'visible';
    } else {
        countElement.style.visibility = 'hidden';
    }
}

// Update all item counts
function updateAllItemCounts() {
    const categories = [
        'characters', 'storylines', 'plans', 'playlists',
        'general', 'locations', 'factions', 'culture', 'cultivation', 'magic',
        'concepts', 'events', 'creatures', 'plants', 'items'
    ];
    
    categories.forEach(category => {
        updateItemCount(category);
    });
}

// Handle content search
function handleContentSearch(event) {
    const searchTerm = event.target.value.toLowerCase().trim();
    
    if (!searchTerm) {
        clearContentSearch();
        return;
    }
    
    // Get current category list
    const currentList = document.getElementById(`${activeCategory}-list`);
    if (!currentList) return;
    
    const items = currentList.querySelectorAll('.content-item');
    let visibleCount = 0;
    
    items.forEach(item => {
        const itemName = item.querySelector('.content-item-name');
        const itemType = item.querySelector('.content-item-type');
        
        if (itemName) {
            const nameText = itemName.textContent.toLowerCase();
            const typeText = itemType ? itemType.textContent.toLowerCase() : '';
            const isMatch = nameText.includes(searchTerm) || typeText.includes(searchTerm);
            item.classList.toggle('is-search-hidden', !isMatch);
            if (isMatch) visibleCount++;
        }
    });
    
    // Show/hide empty state based on results
    const emptyState = currentList.querySelector('.empty-state');
    if (emptyState) {
        if (visibleCount === 0 && items.length > 0) {
            emptyState.classList.remove('is-hidden');
            emptyState.textContent = `No ${activeCategory} match "${searchTerm}"`;
        } else {
            emptyState.classList.add('is-hidden');
        }
    }
}

// Clear content search
function clearContentSearch() {
    const currentList = document.getElementById(`${activeCategory}-list`);
    if (!currentList) return;
    
    // Show all items
    const items = currentList.querySelectorAll('.content-item');
    items.forEach(item => {
        item.classList.remove('is-search-hidden');
    });
    
    // Reset empty state
    const emptyState = currentList.querySelector('.empty-state');
    if (emptyState) {
        if (items.length === 0) {
            emptyState.classList.remove('is-hidden');
            emptyState.textContent = `No ${activeCategory} added yet`;
        } else {
            emptyState.classList.add('is-hidden');
        }
    }
}

// Updated updateContentList function to work with new structure
function updateContentList(category) {
    syncInfoData();
    const container = document.getElementById(`${category}-list`);
    let items;
    
    if (category === 'characters') {
        items = infoData.characters || [];
    } else if (category === 'storylines') {
        items = infoData.storylines || [];
    } else if (category === 'plans') {
        items = infoData.plans || [];
    } else if (category === 'playlists') {
        items = infoData.playlists || [];
    } else {
        // Ensure the category exists before accessing it
        if (!infoData.world[category]) {
            infoData.world[category] = [];
        }
        items = infoData.world[category];
    }
    
    if (items.length === 0) {  // Now items will always be an array
        const emptyText = category === 'plans' ? 'No story arcs added yet' : `No ${category} added yet`;
        container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    } else {
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
    
    // Update item count for this category
    updateItemCount(category);
    
    // Clear any active search when content is updated
    const searchInput = document.getElementById('content-search');
    if (searchInput && searchInput.value) {
        // Reapply search if there is an active search term
        handleContentSearch({ target: searchInput });
    }

    // Add at the end of the function
    setTimeout(() => {
        const container = document.getElementById(`${category}-list`);
        if (container) {
            updateScrollIndicators(container);
        }
    }, 50);
}

// Updated updateAllContentLists to include count updates
function updateAllContentLists() {
    syncInfoData();
    // Update basic info fields with null checks
    const worldTitleElement = document.getElementById('world-title');
    if (worldTitleElement) worldTitleElement.value = infoData.basic.title;
    
    const worldSubtitleElement = document.getElementById('world-subtitle');
    if (worldSubtitleElement) worldSubtitleElement.value = infoData.basic.subtitle || '';

    const titleFontSelect = document.getElementById('world-title-font');
    const titleColorText = document.getElementById('world-title-color');
    const titleColorPicker = document.getElementById('world-title-color-picker');
    
    const bannerImageElement = document.getElementById('banner-image');
    if (bannerImageElement) bannerImageElement.value = infoData.basic.banner;
    
    const overviewTitleElement = document.getElementById('overview-title');
    if (overviewTitleElement) overviewTitleElement.value = infoData.basic.overviewTitle || '';
    
    const overviewTextElement = document.getElementById('overview-text');
    if (overviewTextElement) overviewTextElement.value = infoData.basic.overview;
    
    const overviewImageElement = document.getElementById('overview-image');
    if (overviewImageElement) overviewImageElement.value = infoData.basic.overviewImage || '';
    
    const backgroundColorElement = document.getElementById('background-color');
    if (backgroundColorElement) backgroundColorElement.value = infoData.basic.backgroundColor || '';
    
    const backgroundImageElement = document.getElementById('background-image');
    if (backgroundImageElement) backgroundImageElement.value = infoData.basic.backgroundImage || '';
    
    const overviewContentBgImageElement = document.getElementById('overview-content-bg-image');
    if (overviewContentBgImageElement) overviewContentBgImageElement.value = infoData.basic.overviewContentBgImage || '';
    
    const overviewContentBgColorElement = document.getElementById('overview-content-bg-color');
    if (overviewContentBgColorElement) overviewContentBgColorElement.value = infoData.basic.overviewContentBgColor || '';
    
    const overviewContentOpacityElement = document.getElementById('overview-content-opacity');
    if (overviewContentOpacityElement) overviewContentOpacityElement.value = infoData.basic.overviewContentOpacity || 100;
    
    const overviewContentBlurElement = document.getElementById('overview-content-blur');
    if (overviewContentBlurElement) overviewContentBlurElement.value = infoData.basic.overviewContentBlur || 0;

    const mainContainerBgImageElement = document.getElementById('main-container-bg-image');
    if (mainContainerBgImageElement) mainContainerBgImageElement.value = infoData.basic.mainContainerBgImage || '';
    
    const mainContainerBgColorElement = document.getElementById('main-container-bg-color');
    if (mainContainerBgColorElement) mainContainerBgColorElement.value = infoData.basic.mainContainerBgColor || '';

    const modalBgImageElement = document.getElementById('modal-bg-image');
    if (modalBgImageElement) modalBgImageElement.value = infoData.basic.modalBgImage || '';

    const modalBgColorElement = document.getElementById('modal-bg-color');
    if (modalBgColorElement) modalBgColorElement.value = infoData.basic.modalBgColor || '';

    // Load page inclusion settings
    const includeWorldElement = document.getElementById('include-world');
    if (includeWorldElement) {
        includeWorldElement.checked = infoData.basic.includedPages ? infoData.basic.includedPages.world !== false : true;
    }
    
    const includeCharactersElement = document.getElementById('include-characters');
    if (includeCharactersElement) {
        includeCharactersElement.checked = infoData.basic.includedPages ? infoData.basic.includedPages.characters !== false : true;
    }

    // Also sync the color pickers
    const overviewColorPicker = document.getElementById('overview-content-bg-color-picker');
    if (overviewColorPicker && infoData.basic.overviewContentBgColor && isValidHexColor(infoData.basic.overviewContentBgColor)) {
        overviewColorPicker.value = infoData.basic.overviewContentBgColor;
    }
    
    const mainContainerColorPicker = document.getElementById('main-container-bg-color-picker');
    if (mainContainerColorPicker && infoData.basic.mainContainerBgColor && isValidHexColor(infoData.basic.mainContainerBgColor)) {
        mainContainerColorPicker.value = infoData.basic.mainContainerBgColor;
    }

    // Sync site background color picker
    const backgroundColorPicker = document.getElementById('background-color-picker');
    if (backgroundColorPicker && infoData.basic.backgroundColor && isValidHexColor(infoData.basic.backgroundColor)) {
        backgroundColorPicker.value = infoData.basic.backgroundColor;
    }

    // Sync modal background color picker  
    const modalColorPicker = document.getElementById('modal-bg-color-picker');
    if (modalColorPicker && infoData.basic.modalBgColor && isValidHexColor(infoData.basic.modalBgColor)) {
        modalColorPicker.value = infoData.basic.modalBgColor;
    }

    // Load banner size setting
    if (infoData.appearance && infoData.appearance.bannerSize) {
        const bannerSizeSelect = document.getElementById('appearance-banner-size');
        if (bannerSizeSelect) {
            bannerSizeSelect.value = infoData.appearance.bannerSize;
        }
    } else {
        // Default to large if no setting exists
        const bannerSizeSelect = document.getElementById('appearance-banner-size');
        if (bannerSizeSelect) {
            bannerSizeSelect.value = 'large';
        }
    }

    // Reset title settings controls (use correct IDs)
    const titleShowCheckbox = document.getElementById('world-title-visibility');
    const titleAlignmentSelect = document.getElementById('world-title-alignment');
    const titlePositionSelect = document.getElementById('world-title-position');
    
    // Load font setting
    if (titleFontSelect && infoData.basic.titleSettings) {
        titleFontSelect.value = infoData.basic.titleSettings.font || 'theme';
    } else if (titleFontSelect) {
        titleFontSelect.value = 'theme'; // default
    }

    // Load color setting
    if (titleColorText && infoData.basic.titleSettings && infoData.basic.titleSettings.color) {
        titleColorText.value = infoData.basic.titleSettings.color;
    }
    if (titleColorPicker && infoData.basic.titleSettings && infoData.basic.titleSettings.color && isValidHexColor(infoData.basic.titleSettings.color)) {
        titleColorPicker.value = infoData.basic.titleSettings.color;
    }

    if (titleShowCheckbox && infoData.basic.titleSettings) {
        titleShowCheckbox.checked = infoData.basic.titleSettings.show !== false;
    } else if (titleShowCheckbox) {
        titleShowCheckbox.checked = true; // default
    }

    if (titleAlignmentSelect && infoData.basic.titleSettings) {
        titleAlignmentSelect.value = infoData.basic.titleSettings.alignment || 'left';
    } else if (titleAlignmentSelect) {
        titleAlignmentSelect.value = 'left'; // default
    }

    if (titlePositionSelect && infoData.basic.titleSettings) {
        titlePositionSelect.value = infoData.basic.titleSettings.position || 'bottom';
    } else if (titlePositionSelect) {
        titlePositionSelect.value = 'bottom'; // default
    }

    // Background settings
        // Load overview content background image
    const bgImageInput = document.getElementById('overview-content-bg-image');
    if (bgImageInput && infoData.basic && infoData.basic.overviewContentBgImage) {
        bgImageInput.value = infoData.basic.overviewContentBgImage;
    }
    
    // Load overview content background color
    const colorText = document.getElementById('overview-content-bg-color');
    const colorPicker = document.getElementById('overview-content-bg-color-picker');
    if (infoData.basic && infoData.basic.overviewContentBgColor) {
        if (colorText) {
            colorText.value = infoData.basic.overviewContentBgColor;
        }
        if (colorPicker && isValidHexColor(infoData.basic.overviewContentBgColor)) {
            colorPicker.value = infoData.basic.overviewContentBgColor;
        }
    }
    
    // Load opacity settings
    const opacitySlider = document.getElementById('overview-content-opacity-slider');
    const opacityNumber = document.getElementById('overview-content-opacity');
    const opacityValue = infoData.basic && infoData.basic.overviewContentOpacity !== undefined ? infoData.basic.overviewContentOpacity : 100;
    if (opacitySlider) {
        opacitySlider.value = opacityValue;
    }
    if (opacityNumber) {
        opacityNumber.value = opacityValue;
    }
    
    // Load blur settings
    const blurSlider = document.getElementById('overview-content-blur-slider');
    const blurNumber = document.getElementById('overview-content-blur');
    const blurValue = infoData.basic && infoData.basic.overviewContentBlur !== undefined ? infoData.basic.overviewContentBlur : 0;
    if (blurSlider) {
        blurSlider.value = blurValue;
    }
    if (blurNumber) {
        blurNumber.value = blurValue;
    }
    
    // Load page inclusion settings
    if (infoData.basic.includedPages) {
        document.getElementById('include-world').checked = infoData.basic.includedPages.world !== false;
        document.getElementById('include-characters').checked = infoData.basic.includedPages.characters !== false;
        document.getElementById('include-storylines').checked = infoData.basic.includedPages.storylines !== false;
        document.getElementById('include-plans').checked = infoData.basic.includedPages.plans !== false;
        document.getElementById('include-playlists').checked = infoData.basic.includedPages.playlists !== false;
    } else {
        // Default all to checked if no settings exist
        document.getElementById('include-world').checked = true;
        document.getElementById('include-characters').checked = true;
        document.getElementById('include-storylines').checked = true;
        document.getElementById('include-plans').checked = true;
        document.getElementById('include-playlists').checked = true;
    }

    // Update custom pages list
    if (typeof renderPagesList === 'function') {
        renderPagesList();
    }

    // Update appearance controls
    if (typeof window.populateAppearanceControls === 'function') {
        window.populateAppearanceControls();
    }

    // Load storylines options checkboxes
    if (infoData.storylinesOptions) {
        const tocCheckbox = document.getElementById('storylines-show-toc');
        const sectionsCheckbox = document.getElementById('storylines-show-sections');
        const subsectionsCheckbox = document.getElementById('storylines-show-subsections');
        
        if (tocCheckbox) {
            tocCheckbox.checked = infoData.storylinesOptions.showTOC ?? true;
        }
        if (sectionsCheckbox) {
            sectionsCheckbox.checked = infoData.storylinesOptions.showSections ?? true;
        }
        if (subsectionsCheckbox) {
            subsectionsCheckbox.checked = infoData.storylinesOptions.showSubsections ?? true;
        }
    }

    // Load characters options checkboxes
    if (infoData.charactersOptions) {
        const showByFactionCheckbox = document.getElementById('characters-show-by-faction');
        
        if (showByFactionCheckbox) {
            showByFactionCheckbox.checked = infoData.charactersOptions.showByFaction ?? true;
        }
    }

    // Load events options input field
    if (infoData.eventsOptions) {
        const eventsLabelInput = document.getElementById('events-custom-label');
        
        if (eventsLabelInput) {
            eventsLabelInput.value = infoData.eventsOptions.customLabel || 'Events';
        }
    }

    // Load culture options input field
    if (infoData.cultureOptions) {
        const cultureLabelInput = document.getElementById('culture-custom-label');
        
        if (cultureLabelInput) {
            cultureLabelInput.value = infoData.cultureOptions.customLabel || 'Culture';
        }
    }

    // Load cultivation options input field
    if (infoData.cultivationOptions) {
        const cultivationLabelInput = document.getElementById('cultivation-custom-label');
        
        if (cultivationLabelInput) {
            cultivationLabelInput.value = infoData.cultivationOptions.customLabel || 'Cultivation';
        }
    }

    // Load magic options input field
    if (infoData.magicOptions) {
        const magicLabelInput = document.getElementById('magic-custom-label');
        
        if (magicLabelInput) {
            magicLabelInput.value = infoData.magicOptions.customLabel || 'Magic';
        }
    }
    
    // Update all content lists
    updateContentList('characters');
    updateContentList('storylines');
    updateContentList('plans');
    updateContentList('playlists');
    updateContentList('general');  // Make sure this line exists
    updateContentList('locations');
    updateContentList('concepts');
    updateContentList('events');
    updateContentList('creatures');
    updateContentList('plants');
    updateContentList('items');
    updateContentList('factions');
    updateContentList('culture');
    updateContentList('cultivation');
    updateContentList('magic');
    
    // Update all item counts
    updateAllItemCounts();

    // Update category labels with custom names
    updateCategoryLabels(); 
    syncMobileCategoryOptions();
}

// Keyboard navigation for sidebar
function handleSidebarKeyboard(event) {
    if (!event.target.closest('.content-sidebar')) return;
    
    const sidebarItems = Array.from(document.querySelectorAll('.sidebar-item'));
    const activeItem = document.querySelector('.sidebar-item.active');
    const focusedItem = event.target.closest('.sidebar-item');
    const currentIndex = sidebarItems.indexOf(focusedItem || activeItem);
    
    let nextIndex = currentIndex;
    
    switch (event.key) {
        case 'ArrowUp':
            event.preventDefault();
            nextIndex = currentIndex > 0 ? currentIndex - 1 : sidebarItems.length - 1;
            break;
        case 'ArrowDown':
            event.preventDefault();
            nextIndex = currentIndex < sidebarItems.length - 1 ? currentIndex + 1 : 0;
            break;
        case 'Enter':
            event.preventDefault();
            if (activeItem) {
                activeItem.click();
            }
            break;
    }
    
    if (nextIndex !== currentIndex && sidebarItems[nextIndex]) {
        const category = sidebarItems[nextIndex].getAttribute('data-category');
        switchToCategory(category);
        sidebarItems[nextIndex].focus();
    }
}

// Initialize overview background controls with proper data saving

    window.updateContentList = updateContentList;
    window.updateAllContentLists = updateAllContentLists;

    return {
        handleSidebarKeyboard,
        initializeScrollIndicators,
        initializeSidebar,
        switchToCategory,
        updateAllContentLists,
        updateAllItemCounts,
        updateContentList,
        updateItemCount
    };
}
