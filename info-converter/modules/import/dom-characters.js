// Lore Codex DOM legacy adapter: characters
function extractCharacters(doc) {
    // Clear existing characters
    infoData.characters = [];
    
    // Try to extract from JavaScript data first (includes notes and tags!)
    const scripts = doc.querySelectorAll('script');
    let charactersData = null;
    
    scripts.forEach(script => {
        const scriptContent = script.textContent;
        const match = scriptContent.match(/var charactersData = (\[.*?\]);/s);
        if (match) {
            try {
                charactersData = JSON.parse(match[1]);
                console.log('Found embedded characters data with notes and tags:', charactersData.map(c => ({
                    name: c.name, 
                    hasNotes: !!c.notes,
                    tagCount: c.tags ? c.tags.length : 0
                })));
            } catch (e) {
                console.log('Could not parse characters data from script');
            }
        }
    });
    
    if (charactersData && Array.isArray(charactersData)) {
        infoData.characters = charactersData;
        console.log('Successfully restored character data including notes and tags from embedded JavaScript');
    } else {
        // Fallback: extract from character cards (notes and most tags will be lost)
        console.log('No embedded character data found, parsing from HTML (notes and full tag lists will be lost)');
        const characterCards = doc.querySelectorAll('.character-card');
        characterCards.forEach((card, index) => {
            const character = extractCharacterFromCard(card, doc, index);
            if (character) {
                infoData.characters.push(character);
            }
        });
    }
}

function extractCharacterFromCard(card, doc, index) {
    const character = {
        name: '',
        fullName: '',
        title: '',
        age: '',
        image: '',
        tags: [], // Initialize tags array
        faction: '',
        basic: '',
        physical: '',
        personality: '',
        sexuality: '',
        fightingStyle: '',
        background: '',
        equipment: '',
        hobbies: '',
        quirks: '',
        relationships: '',
        notes: '', // Will be empty when parsing from HTML since notes aren't displayed
        gallery: []
    };
    
    // Get character name
    const nameElement = card.querySelector('.character-name');
    if (nameElement) {
        character.name = nameElement.textContent.trim();
    }
    
    // Get main image
    const imageElement = card.querySelector('.character-image');
    if (imageElement && imageElement.tagName === 'IMG') {
        character.image = imageElement.getAttribute('src') || '';
    }
    
    // Try to extract visible tags from character card
    const tagElements = card.querySelectorAll('.character-card-tag');
    if (tagElements.length > 0) {
        tagElements.forEach(tagEl => {
            const tagText = tagEl.textContent.trim();
            // Skip the "+X" tag that indicates more tags
            if (!tagText.startsWith('+')) {
                character.tags.push(tagText);
            }
        });
        console.log(`Extracted visible tags for ${character.name}:`, character.tags);
    }
    
    // Try to extract detailed info from modal
    const modal = doc.querySelector(`#characterModal${index}`);
    if (modal) {
        character.basic = extractInfoSectionText(modal, 'Basic Information');
        character.physical = extractInfoSectionText(modal, 'Physical Description');
        character.personality = extractInfoSectionText(modal, 'Personality');
        character.sexuality = extractInfoSectionText(modal, 'Sexuality');
        character.fightingStyle = extractInfoSectionText(modal, 'Fighting Style');
        character.background = extractInfoSectionText(modal, 'Background');
        character.equipment = extractInfoSectionText(modal, 'Weapons/Armor/Equipment');
        character.hobbies = extractInfoSectionText(modal, 'Hobbies/Pastimes');
        character.quirks = extractInfoSectionText(modal, 'Quirks/Mannerisms');
        character.relationships = extractInfoSectionText(modal, 'Relationships');
        
        // Note: Tags are no longer displayed in modals, only on character cards
        // Complete tag data can only be recovered from embedded JavaScript data
        
        // Note: Notes section is intentionally not extracted since it doesn't appear in generated HTML
        // Notes can only be recovered from embedded JavaScript data
        
        // Extract gallery images
        const galleryImages = modal.querySelectorAll('.gallery-image');
        character.gallery = Array.from(galleryImages).map(img => img.getAttribute('src')).filter(src => src);
    }
    
    return character.name ? character : null;
}
