// Custom-page element rendering and ordering
function renderPageElements(page) {
    const elementsList = document.getElementById('page-elements-list');
    if (!elementsList) return;
    
    if (!page.elements || page.elements.length === 0) {
        elementsList.innerHTML = '<div class="empty-state">No elements added yet</div>';
        return;
    }
    
    // Sort elements by order
    const sortedElements = [...page.elements].sort((a, b) => a.order - b.order);
    
    let html = '';
    sortedElements.forEach((element, index) => {
        const preview = getElementPreview(element);
        
        html += `
            <div class="page-element-item" draggable="true" data-element-index="${index}">
                <i class="fas fa-grip-vertical page-element-grip"></i>
                <span class="page-element-type">${getElementTypeName(element.type)}</span>
                <span class="page-element-preview">${preview}</span>
                <div class="page-element-actions">
                    <button class="btn-icon btn-edit" onclick="editPageElement(${index})" title="Edit Element">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" onclick="deletePageElement(${index})" title="Delete Element">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
    });
    
    elementsList.innerHTML = html;
    
    // Initialize drag and drop for elements
    initializeElementDragAndDrop();
    
    // Update element count
    updateElementCountDisplay();
}

// Get element type display name
function getElementTypeName(type) {
    const typeNames = {
        'title': 'Page Title',
        'single-image': 'Single Image',
        'image-set': 'Image Set',
        'gallery': 'Image Gallery',
        'paragraph': 'Paragraph',
        'subcontainer': 'Subcontainer',
        'image-text-right': 'Image/Text (Right)',
        'image-text-left': 'Image/Text (Left)'
    };
    
    return typeNames[type] || type;
}

// Get element preview text
function getElementPreview(element) {
    if (element.content && element.content.trim()) {
        const preview = element.content.trim();
        return preview.length > 50 ? preview.substring(0, 50) + '...' : preview;
    }

    if (element.type === 'single-image') {
        return element.image && element.image.trim() ? 'Has image' : 'No image';
    }

    if (element.type === 'image-set') {
        const imageCount = element.images ? element.images.filter(img => img && img.trim()).length : 0;
        return imageCount > 0 ? `${imageCount} image(s)` : 'No images';
    }

    if (element.type === 'gallery') {
        const imageCount = element.images ? element.images.filter(img => img && img.trim()).length : 0;
        return imageCount > 0 ? `${imageCount} images (${element.columns || 5} cols)` : 'No images';
    }
    
    return 'Empty';
}

// Initialize drag and drop for page elements
function initializeElementDragAndDrop() {
    const elementItems = document.querySelectorAll('.page-element-item');
    
    elementItems.forEach(item => {
        item.addEventListener('dragstart', handleElementDragStart);
        item.addEventListener('dragover', handleElementDragOver);
        item.addEventListener('drop', handleElementDrop);
        item.addEventListener('dragend', handleElementDragEnd);
    });
}

// Drag and drop handlers for elements
function handleElementDragStart(e) {
    customPagesDraggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleElementDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    this.classList.add('drag-over');
    return false;
}

function handleElementDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    
    if (customPagesDraggedElement !== this) {
        const draggedIndex = parseInt(customPagesDraggedElement.dataset.elementIndex);
        const targetIndex = parseInt(this.dataset.elementIndex);
        
        reorderPageElements(draggedIndex, targetIndex);
    }
    
    this.classList.remove('drag-over');
    return false;
}

function handleElementDragEnd() {
    this.classList.remove('dragging');
    document.querySelectorAll('.page-element-item').forEach(item => {
        item.classList.remove('drag-over');
    });
    customPagesDraggedElement = null;
}

// Reorder page elements
function reorderPageElements(draggedIndex, targetIndex) {
    if (editingPageIndex < 0) return;
    
    const page = infoData.customPages[editingPageIndex];
    if (!page.elements) return;
    
    const sortedElements = [...page.elements].sort((a, b) => a.order - b.order);
    const draggedElement = sortedElements[draggedIndex];
    
    // Remove dragged element and insert at new position
    sortedElements.splice(draggedIndex, 1);
    sortedElements.splice(targetIndex, 0, draggedElement);
    
    // Update order values
    sortedElements.forEach((element, index) => {
        element.order = index;
    });
    
    // Mark as modified
    page.modified = new Date().toISOString();
    if (typeof dataModified !== 'undefined') {
        dataModified = true;
    }
    
    // Re-render
    renderPageElements(page);
}

// Edit page element
function editPageElement(index) {
    if (editingPageIndex < 0) return;
    
    const page = infoData.customPages[editingPageIndex];
    const sortedElements = [...page.elements].sort((a, b) => a.order - b.order);
    const element = sortedElements[index];
    
    if (!element) return;
    
    // Set the editing element index
    editingElementIndex = index;
    
    // Open the element edit modal
    openElementEditModal(element);
}

// Delete page element
function deletePageElement(index) {
    if (editingPageIndex < 0) return;
    
    const page = infoData.customPages[editingPageIndex];
    const sortedElements = [...page.elements].sort((a, b) => a.order - b.order);
    const element = sortedElements[index];
    
    if (!element) return;
    
    if (confirm(`Delete this ${getElementTypeName(element.type)}?`)) {
        // Find the element in the original array and remove it
        const elementIndex = page.elements.findIndex(el => el.id === element.id);
        if (elementIndex >= 0) {
            page.elements.splice(elementIndex, 1);
            
            // Reorder remaining elements
            page.elements.forEach((el, idx) => {
                el.order = idx;
            });
            
            page.modified = new Date().toISOString();
            if (typeof dataModified !== 'undefined') {
                dataModified = true;
            }
            
            renderPageElements(page);
            onElementTypeChange(); // Update add button state
        }
    }
}

// Close edit page modal
