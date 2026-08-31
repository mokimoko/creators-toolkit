// Lore Codex DOM legacy adapter: world
function extractWorldInfo(doc) {
    // Clear existing world data - now includes new categories
    infoData.world = {
        general: [],
        locations: [],
        concepts: [],
        events: [],
        creatures: [],
        plants: [],
        items: [],
        skills: [], 
        factions: [],
        culture: [],
        cultivation: [],
        magic: []
    };
    
    // Try to extract from embedded JavaScript data first (includes hidden items!)
    const scripts = doc.querySelectorAll('script');
    let worldDataFound = false;
    
    scripts.forEach(script => {
        const scriptContent = script.textContent;
        
        // Look for the full embedded data first
        const fullDataMatch = scriptContent.match(/var fullInfoData = (\{.*?\});/s);
        if (fullDataMatch) {
            try {
                const fullData = JSON.parse(fullDataMatch[1]);
                console.log('Found embedded full data including hidden items:', fullData);
                
                if (fullData.world) {
                    infoData.world = fullData.world;
                    worldDataFound = true;
                    console.log('Successfully restored world data with hidden items from embedded data');
                    return;
                }
            } catch (e) {
                console.log('Could not parse full data from script:', e);
            }
        }
    });
    
    if (worldDataFound) {
        console.log('Used embedded world data including hidden items');
        return;
    }
    
    console.log('No embedded data found, falling back to HTML parsing (hidden items will be lost)');
    
    // Fallback: Extract from visible HTML sections (will lose hidden items)
    const worldSections = doc.querySelectorAll('#world .world-section');
    
    worldSections.forEach(section => {
        const titleElement = section.querySelector('.section-title');
        if (!titleElement) return;
        
        const sectionTitle = titleElement.textContent.trim().toLowerCase();
        let category = '';
        
        // Map section titles to categories - including new ones
        switch (sectionTitle) {
            case 'general':
                category = 'general';
                break;
            case 'locations':
                category = 'locations';
                break;
            case 'concepts':
                category = 'concepts';
                break;
            case 'events':
                category = 'events';
                break;
            case 'creatures':
                category = 'creatures';
                break;
            case 'plants':
                category = 'plants';
                break;
            case 'items':
                category = 'items';
                break;
            case 'factions':
                category = 'factions';
                break;
            case 'culture':
                category = 'culture';
                break;
            case 'cultivation':
                category = 'cultivation';
                break;
            case 'magic':
                category = 'magic';
                break;
            default:
                return; // Skip unknown sections
        }
        
        // Extract items from this section
        const items = section.querySelectorAll('.world-item');
        items.forEach(itemElement => {
            const item = extractWorldItem(itemElement, category);
            if (item) {
                infoData.world[category].push(item);
            }
        });
    });
}

// Helper function to convert display status text back to internal value
function getStatusInternalValue(displayText) {
    const statusMap = {
        'Idea': 'idea',
        'Tentative': 'tentative', 
        'Brainstorm': 'brainstorm',
        'Draft': 'draft',
        'In Progress': 'in-progress',
        'Developing': 'developing',
        'Canon': 'canon',
        'Established': 'established',
        'Final': 'final',
        'Placeholder': 'placeholder',
        'Needs Work': 'needs-work',
        'Deprecated': 'deprecated',
        'Unused': 'unused',
        'Archived': 'archived'
    };
    
    return statusMap[displayText] || displayText.toLowerCase().replace(/\s+/g, '-');
}

function extractWorldItem(itemElement, category) {
    const item = {
        name: '',
        category: '',
        status: '',
        hidden: false,
        image: '',
        description: '',
        properties: '',
        connections: '',
        tags: []
    };
    
    // Get item name and status
    const nameElement = itemElement.querySelector('.item-name');
    if (nameElement) {
        // Look for the first span element containing the name
        const nameSpan = nameElement.querySelector('span:not(.status-badge)');
        if (nameSpan) {
            item.name = nameSpan.textContent.trim();
        } else {
            // Fallback: get all text but remove status badge text
            const statusBadge = nameElement.querySelector('.status-badge');
            if (statusBadge) {
                const nameText = nameElement.textContent.replace(statusBadge.textContent, '').trim();
                item.name = nameText;
            } else {
                item.name = nameElement.textContent.trim();
            }
        }
        
        // Extract status from status badge and convert to internal value
        const statusBadge = nameElement.querySelector('.status-badge');
        if (statusBadge) {
            const statusDisplayText = statusBadge.textContent.trim();
            item.status = getStatusInternalValue(statusDisplayText);
        }
    }
    
    // Get item type/category
    const typeElement = itemElement.querySelector('.item-type');
    if (typeElement) {
        let typeText = typeElement.textContent.trim();
        // Remove "Type: " prefix if it exists
        if (typeText.startsWith('Type: ')) {
            typeText = typeText.substring(6);
        }
        item.category = typeText;
    }
    
    // Get image
    const imageElement = itemElement.querySelector('.world-item-image');
    if (imageElement) {
        item.image = imageElement.getAttribute('src') || '';
    }
    
    // Get description
    const descElement = itemElement.querySelector('.item-description');
    if (descElement) {
        item.description = htmlToMarkdown(descElement.innerHTML);
    }
    
    // Get properties/features from info sections
    const infoSections = itemElement.querySelectorAll('.info-section');
    infoSections.forEach(section => {
        const labelElement = section.querySelector('.item-label');
        if (labelElement) {
            const labelText = labelElement.textContent.trim();
            const contentElement = section.querySelector('div:not(.item-label)');
            if (contentElement) {
                const content = htmlToMarkdown(contentElement.innerHTML);
                
                if (labelText.includes('Notable Features') || labelText.includes('Properties') || labelText.includes('Characteristics')) {
                    item.properties = content;
                } else if (labelText.includes('Related Information') || labelText.includes('Connections')) {
                    item.connections = content;
                }
            }
        }
    });
    
    // Handle location-specific fields
    if (category === 'locations') {
        // For locations, map properties to features and add type field
        if (item.properties) {
            item.features = item.properties;
            delete item.properties;
        }
        if (item.category) {
            item.type = item.category;
            delete item.category;
        }
    }
    
    return item.name ? item : null;
}

function htmlToMarkdown(html) {
    if (!html) return '';
    
    return html
        .replace(/<a\s+[^>]*href=(['"])(.*?)\1[^>]*>(.*?)<\/a>/gis, '[$3]($2)')
        .replace(/<h([1-6])\b[^>]*>(.*?)<\/h\1>/gis, (_match, level, content) => `${'#'.repeat(Number(level))} ${content}\n\n`)
        .replace(/<ul\b[^>]*>(.*?)<\/ul>/gis, (_match, content) => `${content.replace(/<li\b[^>]*>(.*?)<\/li>/gis, '- $1\n')}\n`)
        .replace(/<ol\b[^>]*>(.*?)<\/ol>/gis, (_match, content) => {
            let itemNumber = 0;
            return `${content.replace(/<li\b[^>]*>(.*?)<\/li>/gis, (_item, itemContent) => `${++itemNumber}. ${itemContent}\n`)}\n`;
        })
        .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
        .replace(/<em>(.*?)<\/em>/g, '*$1*')
        .replace(/<u>(.*?)<\/u>/g, '++$1++')
        .replace(/<span class="spoiler" onclick="toggleSpoiler\(this\)">(.*?)<\/span>/g, '<spoiler>$1</spoiler>')
        .replace(/<del>(.*?)<\/del>/g, '~~$1~~')
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<\/p><p>/g, '\n\n')
        .replace(/<\/?p>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}

// Export functions for JSON backup/restore (now includes appearance, notes, plans, character tags, subtitle, and overview fields)
