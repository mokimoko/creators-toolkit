// Plan reader rendering
function generateCardsView(data) {    
    // Collect all unique VISIBLE filter tags from plans (plan.tags, not characterTags)
    const allPlanTags = new Set();
    data.plans.forEach(plan => {
        if (plan.tags && plan.tags.length > 0) {
            const visibleTags = getVisibleTags(plan.tags);
            visibleTags.forEach(tag => allPlanTags.add(tag));
        }
    });
    const tagsArray = Array.from(allPlanTags).sort();

    let cardsHTML = '';
    
    // Always add filter navigation container, even with no tags
    cardsHTML += `
        <div class="character-navigation">
            <div class="character-nav-header" data-lore-action="toggle-plan-navigation">
                <span class="character-nav-title">Filter Plans</span>
                <span class="character-nav-toggle">▶</span>
            </div>
            <div class="character-nav-content collapsed">
                <div class="character-filter-controls">
                    <input type="text" class="character-search" id="plan-search" placeholder="Search plans...">
                    <div class="filter-mode-buttons">
                        <button class="filter-mode-option active" id="plan-filter-mode-any" data-lore-action="set-plan-filter-mode" data-mode="any">Any</button>
                        <button class="filter-mode-option" id="plan-filter-mode-all" data-lore-action="set-plan-filter-mode" data-mode="all">All</button>
                    </div>
                    <button class="clear-selected-btn" id="clear-plan-selected-btn" data-lore-action="clear-plan-tags">Clear</button>
                </div>`;

    // Only conditionally add tag links if tags exist
    if (tagsArray.length > 0) {
        cardsHTML += '<div class="character-tag-links">';
        tagsArray.forEach(tag => {
            const parsed = parseTagWithColor(tag);
            let styleAttr = '';
            if (parsed.bgColor) {
                const textColor = parsed.textColor || getContrastingTextColor(parsed.bgColor);
                const hoverColor = parsed.hoverColor || parsed.bgColor;
                styleAttr = ` style="background-color: ${parsed.bgColor}; color: ${textColor}; --hover-color: ${hoverColor};"`;
            }
            const escapedTag = window.LoreGenerationSecurity.escapeAttribute(tag);
            cardsHTML += `<div class="character-tag-link" data-lore-action="toggle-plan-tag" data-tag="${escapedTag}"${styleAttr}>${parsed.name}</div>`;
        });
        cardsHTML += '</div>';
    }

    cardsHTML += `
            </div>
        </div>`;

    cardsHTML += '<div class="plans-grid">';
    
    data.plans.forEach((plan, index) => {
        // Character tags display - show only visible character tags
        let characterTagsDisplay = '<span style="color: #999; font-style: italic;">No characters tagged</span>';
        if (plan.characterTags && plan.characterTags.length > 0) {
            const visibleCharacterTags = getVisibleTags(plan.characterTags);
            if (visibleCharacterTags.length > 0) {
                characterTagsDisplay = visibleCharacterTags.map(tag => `<span class="character-tag">${tag}</span>`).join('');
            }
        }
        
        const mainEvents = plan.events ? plan.events.filter(event => event.visible !== false) : [];
        const totalMainEvents = mainEvents.length;
        
        // Count subevents in main events
        let totalSubeventsMain = 0;
        mainEvents.forEach(event => {
            if (event.subevents && Array.isArray(event.subevents)) {
                totalSubeventsMain += event.subevents.length;
            }
        });
        
        let totalSubArcEvents = 0;
        let totalSubeventsSubArc = 0;
        const visibleSubArcs = plan.subArcs ? plan.subArcs.filter(subArc => subArc.visible !== false) : [];
        
        visibleSubArcs.forEach(subArc => {
            if (subArc.events) {
                const visibleSubArcEvents = subArc.events.filter(event => event.visible !== false);
                totalSubArcEvents += visibleSubArcEvents.length;
                
                visibleSubArcEvents.forEach(event => {
                    if (event.subevents && Array.isArray(event.subevents)) {
                        totalSubeventsSubArc += event.subevents.length;
                    }
                });
            }
        });
        
        const totalEvents = totalMainEvents + totalSubArcEvents;
        const totalSubevents = totalSubeventsMain + totalSubeventsSubArc;
        
        // Create data attributes for filtering - use plan.tags (stripped of "!")
        const tagsData = plan.tags ? plan.tags.map(stripHiddenPrefix).join(',') : '';
        const nameData = plan.title.toLowerCase();
        
        cardsHTML += `
            <div class="plan-card" 
                data-tags="${tagsData}" 
                data-name="${nameData}" 
                data-plan-color="${plan.color || '#3498db'}"
                data-lore-action="open-plan-modal" data-index="${index}">
                <div class="plan-header">
                    <div class="plan-title">${plan.title}</div>
                </div>
                <div class="plan-character-tags">
                    <strong>Characters:</strong> ${characterTagsDisplay}
                </div>
                <div class="plan-overview">${parseMarkdown(plan.overview || 'No overview provided.')}</div>
                <div class="plan-stats">
                    ${totalEvents} events • ${totalSubevents} moments • ${visibleSubArcs.length} sub-arcs
                </div>
            </div>`;
    });
    
    cardsHTML += '</div>';
    cardsHTML += `<button class="back-to-top" id="plan-back-to-top" title="Back to top"></button>`;
    
    return cardsHTML;
}

function getArcTypeDisplay(type) {
    const typeMap = {
        'main-plot': 'Main Plot',
        'romance': 'Romance',
        'side-quest': 'Side Quest',
        'backstory': 'Backstory',
        'worldbuilding': 'Worldbuilding',
        'character-dev': 'Character Development',
        'comedy': 'Comedy',
        'conflict': 'Conflict',
        'mystery': 'Mystery'
    };
    return typeMap[type] || type;
}
