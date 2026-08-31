// Lore Codex DOM legacy adapter: plans
function extractPlans(doc) {
    // Clear existing plans
    infoData.plans = [];
    
    console.log('Extracting plans from HTML...');
    
    // Try to extract from JavaScript data first (includes full event data!)
    const scripts = doc.querySelectorAll('script');
    let plansData = null;
    
    scripts.forEach(script => {
        const scriptContent = script.textContent;
        
        // Try multiple patterns to find the plans data
        let match = scriptContent.match(/var plansData = (\[[\s\S]*?\]);/);
        if (!match) {
            // Try alternative pattern
            match = scriptContent.match(/plansData\s*=\s*(\[[\s\S]*?\]);/);
        }
        
        if (match) {
            try {
                plansData = JSON.parse(match[1]);
                console.log('Found embedded plans data with events:', plansData.map(p => ({title: p.title, events: p.events?.length || 0})));
            } catch (e) {
                console.log('Could not parse plans data from script:', e);
                console.log('Raw match was:', match[1].substring(0, 200) + '...');
            }
        }
    });
    
    if (plansData && Array.isArray(plansData)) {
        infoData.plans = plansData;
        console.log('Successfully restored plans data including events from embedded JavaScript');
    } else {
        // Fallback: extract from plan cards (limited data, events details will be lost)
        console.log('No embedded plans data found, parsing from HTML (event details will be lost)');
        const planCards = doc.querySelectorAll('.plan-card');
        console.log('Found plan cards:', planCards.length);
        
        planCards.forEach((card, index) => {
            const plan = extractPlanFromCard(card, doc, index);
            if (plan) {
                console.log('Extracted plan:', plan.title, 'with', plan.events.length, 'events');
                infoData.plans.push(plan);
            }
        });
    }
    
    console.log('Final plans extracted:', infoData.plans.length);
}

function extractPlanFromCard(card, doc, index) {
    const plan = {
        title: '',
        overview: '',
        characterTags: [],
        events: []
    };
    
    // Get title - prefer title attribute for accuracy
    const titleElement = card.querySelector('.plan-title');
    if (titleElement) {
        plan.title = titleElement.getAttribute('title') || titleElement.textContent.trim();
    }
    
    // Get character tags
    const characterTagsElement = card.querySelector('.plan-character-tags');
    if (characterTagsElement) {
        const tags = characterTagsElement.querySelectorAll('.character-tag');
        plan.characterTags = Array.from(tags).map(tag => tag.textContent.trim()).filter(tag => tag);
    }
    
    // Get overview - now extract from title attribute if available for better accuracy
    const overviewElement = card.querySelector('.plan-overview');
    if (overviewElement) {
        // Try to get from title attribute first (clean text), then fall back to innerHTML
        plan.overview = overviewElement.getAttribute('title') || htmlToMarkdown(overviewElement.innerHTML);
    }
    
    // Try to extract events from modal (limited data)
    const modal = doc.querySelector(`#planModal${index}`);
    if (modal) {
        const eventElements = modal.querySelectorAll('.plan-event');
        eventElements.forEach(eventElement => {
            const event = {
                title: '',
                type: 'rising',
                timing: '',
                notes: '',
                visible: true
            };
            
            // Extract event data (this part remains the same as before)
            const titleElement = eventElement.querySelector('.plan-event-title');
            if (titleElement) {
                event.title = titleElement.textContent.trim();
            }
            
            const typeElement = eventElement.querySelector('.plan-event-type');
            if (typeElement) {
                event.type = typeElement.textContent.toLowerCase().trim();
            }
            
            const timingElement = eventElement.querySelector('.plan-event-timing');
            if (timingElement) {
                event.timing = timingElement.textContent.trim();
            }
            
            const notesElement = eventElement.querySelector('.plan-event-notes');
            if (notesElement) {
                event.notes = htmlToMarkdown(notesElement.innerHTML);
            }
            
            if (event.title) {
                plan.events.push(event);
            }
        });
    }
    
    return plan.title ? plan : null;
}

function extractInfoSectionText(modal, sectionTitle) {
    const sections = modal.querySelectorAll('.info-section');
    for (const section of sections) {
        const titleElement = section.querySelector('.info-title');
        if (titleElement && titleElement.textContent.trim() === sectionTitle) {
            const contentDiv = section.querySelector('div:not(.info-title)');
            if (contentDiv) {
                // Use the existing htmlToMarkdown function for consistency
                return htmlToMarkdown(contentDiv.innerHTML);
            }
        }
    }
    return '';
}
