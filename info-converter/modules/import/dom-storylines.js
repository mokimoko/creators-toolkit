// Lore Codex DOM legacy adapter: storylines
function extractStorylines(doc) {
    // Clear existing storylines
    infoData.storylines = [];
    
    // Extract from storyline cards
    const storylineCards = doc.querySelectorAll('.storyline-card');
    storylineCards.forEach(card => {
        const storyline = extractStorylineFromCard(card);
        if (storyline) {
            infoData.storylines.push(storyline);
        }
    });
}

function extractStorylineFromCard(card) {
    const storyline = {
        title: '',
        pairing: '',
        type: 'roleplay', // Default type
        wordcount: 0,
        description: '',
        lastUpdated: '',
        link: ''
    };
    
    // Get type from data attribute - this is the key addition
    const typeAttr = card.getAttribute('data-type');
    if (typeAttr) {
        storyline.type = typeAttr;
    }
    
    // Get title - prefer title attribute for accuracy
    const titleElement = card.querySelector('.storyline-title');
    if (titleElement) {
        storyline.title = titleElement.getAttribute('title') || titleElement.textContent.trim();
    }
    
    // Get pairing
    const pairingElement = card.querySelector('.storyline-pairing');
    if (pairingElement) {
        storyline.pairing = pairingElement.textContent.trim();
    }
    
    // Get wordcount
    const wordcountElement = card.querySelector('.storyline-wordcount');
    if (wordcountElement) {
        const wordcountText = wordcountElement.textContent.trim();
        // Extract numbers from text like "123,456 words"
        const wordcountMatch = wordcountText.match(/[\d,]+/);
        if (wordcountMatch) {
            storyline.wordcount = parseInt(wordcountMatch[0].replace(/,/g, '')) || 0;
        }
    }
    
    // Get description - prefer title attribute for full text
    const descElement = card.querySelector('.storyline-description');
    if (descElement) {
        // Try title attribute first (clean text), then fall back to innerHTML
        storyline.description = descElement.getAttribute('title') || htmlToMarkdown(descElement.innerHTML);
    }
    
    // Get last updated
    const updatedElement = card.querySelector('.storyline-updated');
    if (updatedElement) {
        const updatedText = updatedElement.textContent.trim();
        storyline.lastUpdated = updatedText.replace(/^Updated:\s*/, '');
    }
    
    // Get link - extract from onclick attribute
    const cardElement = card.closest ? card : card.parentElement;
    const onclickAttr = cardElement.getAttribute('onclick');
    if (onclickAttr) {
        const linkMatch = onclickAttr.match(/window\.location\.href='([^']+)'/);
        if (linkMatch) {
            storyline.link = linkMatch[1];
        }
    }
    
    // Auto-detect and migrate project links for backward compatibility
    if (!storyline.hasOwnProperty('isProjectLink')) {
        if (storyline.link) {
            // Auto-detect if it's a project link
            if (storyline.link.startsWith('roleplays/')) {
                storyline.isProjectLink = true;
                // Store just the filename, remove the roleplays/ prefix
                storyline.link = storyline.link.replace('roleplays/', '');
            } else if (storyline.link.match(/^[^\/\s]+\.html$/)) {
                // Looks like just a filename (no slashes, ends with .html)
                storyline.isProjectLink = true;
            } else {
                // Assume external URL
                storyline.isProjectLink = false;
            }
        } else {
            storyline.isProjectLink = false;
        }
    }

    return storyline.title ? storyline : null;
}

// Extract Plans from HTML
