// Custom-page list rendering
function renderPagesList() {
    const pagesList = document.getElementById('pages-list');
    if (!pagesList) return;
    
    if (!infoData.customPages || infoData.customPages.length === 0) {
        pagesList.innerHTML = '<div class="empty-state">No custom pages created yet</div>';
        return;
    }
    
    let html = '';
    infoData.customPages.forEach((page, index) => {
        const template = window.customPageTemplates?.getTemplate(page.template);
        const templateName = template ? template.name : 'Unknown Template';
        const elementCount = page.elements ? page.elements.length : 0;
        
        html += `
            <div class="page-item">
                <i class="fas fa-file-alt page-item-icon"></i>
                <div class="page-item-info">
                    <div class="page-item-header">
                        <div class="page-item-name">${escapeHtml(page.displayName || page.name)}</div>
                        <div class="page-item-details">${templateName} • ${elementCount} elements</div>
                    </div>
                    ${page.description ? `<div class="page-item-description">${escapeHtml(page.description)}</div>` : ''}
                </div>
                <div class="page-item-actions">
                    <button class="btn-icon btn-edit" onclick="editPage(${index})" title="Edit Page">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" onclick="deletePage(${index})" title="Delete Page">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
    });
    
    pagesList.innerHTML = html;
}

// Open create page modal
