// Lore Codex form domain: character controller
function openCharacterModal(characterData = null) {
    const modalTitle = document.getElementById('character-modal-title');
    editingIndex = characterData ? infoData.characters.indexOf(characterData) : -1;
    editingType = 'character';
    
    populateFactionDropdown();
    populateLocationDropdown();
    populateItemsDropdown();
    populateSkillsDropdown();
    
    if (characterData) {
        modalTitle.textContent = 'Edit Character';
        populateCharacterModal(characterData);
    } else {
        modalTitle.textContent = 'Add Character';
        clearModalFields('characterModal');
        document.getElementById('char-color').value = '#6c757d';
        document.getElementById('char-color-picker').value = '#6c757d';
        document.getElementById('char-show-info-display').checked = true;
    }
    
    const globalShowInfoDisplay = infoData.charactersOptions?.showInfoDisplay ?? false;
    const charInfoDisplayCheckbox = document.getElementById('char-show-info-display');
    if (charInfoDisplayCheckbox) {
        charInfoDisplayCheckbox.disabled = !globalShowInfoDisplay;
        if (!globalShowInfoDisplay) {
            charInfoDisplayCheckbox.checked = false;
        }
    }
    
    openModal('characterModal');
    setupCharacterColorInputs();
    initializeStatListeners();
}

function populateCharacterModal(character) {
    document.getElementById('char-name').value = character.name || '';
    document.getElementById('char-full-name').value = character.fullName || '';
    document.getElementById('char-title').value = character.title || '';
    document.getElementById('char-age').value = character.age || '';
    document.getElementById('char-image').value = character.image || '';
    document.getElementById('char-tags').value = (character.tags || []).join(', ');
    document.getElementById('char-color').value = character.color || '#6c757d';
    document.getElementById('char-color-picker').value = character.color || '#6c757d';
    document.getElementById('char-location').value = character.location || ''; 
    document.getElementById('char-faction').value = character.faction || '';
    // Populate stats
    const defaultStats = ['Strength', 'Constitution', 'Agility', 'Technique', 'Defense', 'Charisma'];
    
    if (character.stats) {
        document.getElementById('char-stat-range').value = character.stats.range || 100;
        
        // Populate the 6 stat fields
        for (let i = 1; i <= 6; i++) {
            const stat = character.stats.entries && character.stats.entries[i - 1];
            document.getElementById(`char-stat-${i}-label`).value = stat ? stat.label : defaultStats[i - 1];
            document.getElementById(`char-stat-${i}-value`).value = stat ? stat.value : 0;
        }
    } else {
        // Use defaults for new characters
        document.getElementById('char-stat-range').value = 100;
        for (let i = 1; i <= 6; i++) {
            document.getElementById(`char-stat-${i}-label`).value = defaultStats[i - 1];
            document.getElementById(`char-stat-${i}-value`).value = 0;
        }
    }
    
    // Update max ranges
    updateStatRanges();
    document.getElementById('char-basic').value = character.basic || '';
    document.getElementById('char-physical').value = character.physical || '';
    document.getElementById('char-personality').value = character.personality || '';
    document.getElementById('char-sexuality').value = character.sexuality || '';
    document.getElementById('char-fighting-style').value = character.fightingStyle || '';
    document.getElementById('char-background').value = character.background || '';
    document.getElementById('char-equipment').value = character.equipment || '';
    // Populate items checkboxes
    const itemsDropdown = document.getElementById('char-items-dropdown');
    if (itemsDropdown) {
        const checkboxes = itemsDropdown.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = character.items && character.items.includes(checkbox.value);
        });
        updateItemsDisplay();
    }
    // Populate skills checkboxes
    const skillsDropdown = document.getElementById('char-skills-dropdown');
    if (skillsDropdown) {
        const checkboxes = skillsDropdown.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = character.skills && character.skills.includes(checkbox.value);
        });
        updateSkillsDisplay();
    }
    document.getElementById('char-show-info-display').checked = character.showInfoDisplay !== false; // default true
    document.getElementById('char-hobbies').value = character.hobbies || '';
    document.getElementById('char-quirks').value = character.quirks || '';
    document.getElementById('char-relationships').value = character.relationships || '';
    document.getElementById('char-card-enabled').checked = character.cardEnabled || false;
    document.getElementById('char-card-path').value = character.cardPath || '';
    document.getElementById('char-notes').value = character.notes || '';
    document.getElementById('char-gallery').value = (character.gallery || []).join('\n');
}

// MODIFY YOUR form-handlers.js file
function saveCharacter() {
    // Collect stats
    const stats = {
        range: parseInt(document.getElementById('char-stat-range').value) || 100,
        entries: []
    };
    
    // Collect all 6 stats
    for (let i = 1; i <= 6; i++) {
        const label = document.getElementById(`char-stat-${i}-label`).value.trim();
        const value = document.getElementById(`char-stat-${i}-value`).value.trim();
        
        // Only add stat if it has a label (allows users to leave some empty)
        if (label) {
            stats.entries.push({
                label: label,
                value: parseInt(value) || 0
            });
        }
    }
    
    const characterData = {
        name: document.getElementById('char-name').value.trim(),
        fullName: document.getElementById('char-full-name').value.trim(),
        title: document.getElementById('char-title').value.trim(),
        age: document.getElementById('char-age').value.trim(),
        image: document.getElementById('char-image').value.trim(),
        tags: document.getElementById('char-tags').value
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag),
        color: document.getElementById('char-color').value || '#6c757d',
        location: document.getElementById('char-location').value.trim(),
        faction: document.getElementById('char-faction').value.trim(),
        stats: stats,
        basic: document.getElementById('char-basic').value.trim(),
        physical: document.getElementById('char-physical').value.trim(),
        personality: document.getElementById('char-personality').value.trim(),
        sexuality: document.getElementById('char-sexuality').value.trim(),
        fightingStyle: document.getElementById('char-fighting-style').value.trim(),
        background: document.getElementById('char-background').value.trim(),
        equipment: document.getElementById('char-equipment').value.trim(),
        items: Array.from(document.getElementById('char-items-dropdown').querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value),
        skills: Array.from(document.getElementById('char-skills-dropdown').querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value),
        showInfoDisplay: document.getElementById('char-show-info-display').checked,
        hobbies: document.getElementById('char-hobbies').value.trim(),
        quirks: document.getElementById('char-quirks').value.trim(),
        relationships: document.getElementById('char-relationships').value.trim(),
        cardEnabled: document.getElementById('char-card-enabled').checked,
        cardPath: document.getElementById('char-card-path').value.trim(),       
        notes: document.getElementById('char-notes').value.trim(),
        gallery: document.getElementById('char-gallery').value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line),
        
        id: (editingIndex >= 0 && editingType === 'character') ?
            infoData.characters[editingIndex].id || generateNextCharacterId() : 
            generateNextCharacterId()
    };

    // Validation
    if (!characterData.name) {
        window.notifyLoreUser('Character name is required!');
        return;
    }

    if (editingIndex >= 0 && editingType === 'character') {
        infoData.characters[editingIndex] = characterData;
    } else {
        infoData.characters.push(characterData);
    }

    updateContentList('characters');
    closeModal('characterModal');
    markDataAsModified();
}

function generateNextCharacterId() {
    // Get existing character IDs
    const existingIds = infoData.characters
        ?.filter(char => char.id)
        .map(char => parseInt(char.id.replace('char_', '')))
        .filter(id => !isNaN(id)) || [];
    
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    return `char_${String(maxId + 1).padStart(3, '0')}`;
}

// Storyline modal functions
