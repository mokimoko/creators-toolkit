// Add this function to form-handlers.js to properly collect all image data
function getCompleteImageData() {
    const backgroundContainer = document.getElementById('background-image-display');
    const storyContainer = document.getElementById('images-container');
    
    // Get background - could be a file or existing image path
    const backgroundItem = backgroundContainer.querySelector('.file-item');
    const background = {
        file: backgroundItem?._file || null,
        path: backgroundItem?._imagePath || null,
        exists: backgroundItem?._exists || false
    };
    
    // Get all story items (both files and existing paths)
    const storyItems = Array.from(storyContainer.querySelectorAll('.file-item'));
    const storyData = storyItems.map(item => ({
        file: item._file || null,
        path: item._imagePath || null,
        exists: item._exists || false,
        filename: item._file ? item._file.name : (item._imagePath ? item._imagePath.split('/').pop() : null)
    }));
    
    return {
        background,
        story: storyData,
        hasExistingImages: (background.path && background.exists) || storyData.some(item => item.path && item.exists),
        hasNewFiles: background.file || storyData.some(item => item.file)
    };
}

// Add this helper function to properly generate image HTML that preserves existing paths
function generateImageHTML(imageData) {
    let backgroundImageCSS = '';
    let storyImagesHTML = '';
    
    // Handle background image
    if (imageData.background.file) {
        // New file - use placeholder that will be replaced by server
        backgroundImageCSS = `background-image: url('BACKGROUND_IMAGE_PLACEHOLDER');`;
    } else if (imageData.background.path && imageData.background.exists) {
        // Existing image - use the actual path
        backgroundImageCSS = `background-image: url('${imageData.background.path}');`;
    }
    
    // Handle story images
    const allStoryImages = [];
    
    // First, add existing images that should be preserved
    imageData.story.forEach((item, index) => {
        if (item.path && item.exists) {
            allStoryImages.push({
                type: 'existing',
                path: item.path,
                index: index
            });
        } else if (item.file) {
            allStoryImages.push({
                type: 'new',
                file: item.file,
                index: index
            });
        }
    });
    
    // Generate HTML for all story images
    if (allStoryImages.length > 0) {
        storyImagesHTML = '<div class="story-images-gallery">';
        allStoryImages.forEach((img, index) => {
            if (img.type === 'existing') {
                storyImagesHTML += `<img src="${img.path}" alt="Story Image" class="story-image">`;
            } else {
                storyImagesHTML += `<img src="STORY_IMAGE_${index}_PLACEHOLDER" alt="Story Image" class="story-image">`;
            }
        });
        storyImagesHTML += '</div>';
    }
    
    return {
        backgroundImageCSS,
        storyImagesHTML,
        existingImagePaths: {
            background: imageData.background.path && imageData.background.exists ? imageData.background.path : null,
            story: imageData.story.filter(item => item.path && item.exists).map(item => item.path)
        }
    };
}

// Function to add a new character
function addCharacter(name = '', color = '', characterId = '') {
    const charactersContainer = document.getElementById('characters-container');
    const index = charactersContainer.children.length;
    
    // Get default color if not provided
    if (!color) {
        color = defaultColors[index % defaultColors.length];
    }
    
    const editorDOM = window.RPArchiver.get('editorDOM');
    const security = window.RPArchiver.get('security');
    const characterDiv = editorDOM.create('div', { className: 'character-info' });
    characterDiv.dataset.characterId = security.createStableId('character', characterId);
    const nameField = editorDOM.field(`Character ${index + 1}:`, {
        className: 'char-name',
        attributes: { id: `char-name-${index}`, placeholder: 'Enter character name (can be multiple words)', type: 'text' },
        properties: { value: name }
    }, 'character-name-section');
    const colorField = editorDOM.field('Color:', {
        className: 'char-color',
        attributes: { id: `char-color-${index}`, type: 'color' },
        properties: { value: color }
    }, 'character-color-section');
    const mainRow = editorDOM.create('div', { className: 'character-main-row' }, [
        nameField.wrapper,
        colorField.wrapper
    ]);
    
    // Add remove button if not one of the first two characters
    if (index > 1) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-character-btn fake-btn-remove';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove character';
        removeBtn.setAttribute('aria-label', `Remove character ${index + 1}`);
        removeBtn.addEventListener('click', function() {
            characterDiv.remove();
            updateCharacterLabels();
        });
        mainRow.appendChild(removeBtn);
    }
    
    characterDiv.appendChild(mainRow);
    
    // Add event listeners
    const nameInput = mainRow.querySelector('.char-name');
    
    const colorInput = mainRow.querySelector('.char-color');
    colorInput.addEventListener('change', function() {
        saveColor(this.value);
    });
    
    // Show saved colors palette if we have any
    if (savedColors.length > 0) {
        const savedColorsDiv = document.createElement('div');
        savedColorsDiv.className = 'saved-colors';
        
        savedColors.forEach(savedColor => {
            const colorButton = document.createElement('button');
            colorButton.type = 'button';
            colorButton.className = 'saved-color';
            colorButton.style.backgroundColor = savedColor;
            colorButton.title = savedColor;
            colorButton.setAttribute('aria-label', `Use saved color ${savedColor}`);
            colorButton.addEventListener('click', function() {
                colorInput.value = savedColor;
            });
            savedColorsDiv.appendChild(colorButton);
        });
        
        characterDiv.appendChild(savedColorsDiv);
    }
    
    charactersContainer.appendChild(characterDiv);
}

// Function to update character labels when characters are added/removed
function updateCharacterLabels() {
    const characterDivs = document.querySelectorAll('.character-info');
    characterDivs.forEach((div, index) => {
        const label = div.querySelector('label[for^="char-name-"]');
        label.textContent = `Character ${index + 1}:`;
        label.setAttribute('for', `char-name-${index}`);
        
        const input = div.querySelector('.char-name');
        input.id = `char-name-${index}`;
        
        const colorLabel = div.querySelector('label[for^="char-color-"]');
        colorLabel.setAttribute('for', `char-color-${index}`);
        
        const colorInput = div.querySelector('.char-color');
        colorInput.id = `char-color-${index}`;
    });
}

// Function to update pairing based on character names (FIXED: only first two characters)
function updatePairing() {
    // Don't update pairing if no characters mode is enabled
    const noCharacters = document.getElementById('no-characters').checked;
    if (noCharacters) {
        document.getElementById('pairing').value = '';
        return;
    }
    
    const characterNameInputs = document.querySelectorAll('.char-name');
    const names = Array.from(characterNameInputs)
        .map(input => input.value)
        .filter(name => name.trim() !== '');
    
    if (names.length > 0) {
        // Only use the first two characters for pairing
        const pairingNames = names.slice(0, 2);
        document.getElementById('pairing').value = pairingNames.join('/');
    }
}

// Function to save a color to localStorage
function saveColor(color) {
    if (!savedColors.includes(color)) {
        savedColors.push(color);
        if (savedColors.length > 12) {
            savedColors.shift(); // Remove oldest color if we have more than 12
        }
        localStorage.setItem('savedColors', JSON.stringify(savedColors));
    }
}

// Function to add a new navigation link
function addNavigation(label = '', url = '') {
    const navigationContainer = document.getElementById('navigation-container');
    const navEntry = document.createElement('div');
    navEntry.className = 'nav-entry';
    navEntry.innerHTML = `
        <input type="text" class="nav-label" aria-label="Navigation link text" placeholder="Link text (e.g., Home)" value="${window.RPArchiver.get('security').escapeAttribute(label)}">
        <input type="text" class="nav-url" aria-label="Navigation link URL" placeholder="URL (e.g., ../index.html)" value="${window.RPArchiver.get('security').escapeAttribute(url)}">
        <button type="button" class="remove-nav fake-btn-remove" title="Remove navigation link" aria-label="Remove navigation link">×</button>
    `;
    
    // Add event listener to the remove button
    const removeBtn = navEntry.querySelector('.remove-nav');
    removeBtn.addEventListener('click', function() {
        navEntry.remove();
    });
    
    navigationContainer.appendChild(navEntry);
}

let rpPartIdCounter = 0;

function createPartId() {
    if (globalThis.crypto?.randomUUID) return `part-${globalThis.crypto.randomUUID()}`;
    rpPartIdCounter += 1;
    return `part-${Date.now().toString(36)}-${rpPartIdCounter.toString(36)}`;
}

function refreshPartEditorLabels() {
    const entries = Array.from(document.querySelectorAll('#parts-container .part-entry'));
    entries.forEach((entry, index) => {
        const number = index + 1;
        const label = entry.querySelector('.part-number');
        const title = entry.querySelector('.part-title');
        const content = entry.querySelector('.part-content');
        if (label) label.textContent = `Part ${number}`;
        if (title) {
            title.placeholder = `Part ${number} title`;
            title.setAttribute('aria-label', `Part ${number} title`);
        }
        if (content) content.setAttribute('aria-label', `Part ${number} roleplay text`);
        entry.querySelector('.move-part-up')?.toggleAttribute('disabled', index === 0);
        entry.querySelector('.move-part-down')?.toggleAttribute('disabled', index === entries.length - 1);
    });
}

function getStoryPartsFromEditor() {
    return Array.from(document.querySelectorAll('#parts-container .part-entry')).map((entry, index) => ({
        id: entry.dataset.partId || `part-${index + 1}`,
        title: entry.querySelector('.part-title')?.value || `Part ${index + 1}`,
        sourceText: entry.querySelector('.part-content')?.value || ''
    }));
}

function getPlainTextFromEditor(includeMarkers = true) {
    const parts = getStoryPartsFromEditor();
    const projectData = window.RPArchiver.get('projectData');
    if (projectData.sourceTextFromParts) return projectData.sourceTextFromParts(parts, { includeMarkers });
    return parts.map(part => part.sourceText).join(includeMarkers ? '\n\n&&&PART&&&\n\n' : '\n\n');
}

function syncLegacySourceField() {
    const source = document.getElementById('rp-text');
    const includeMarkers = document.getElementById('plain-text-include-markers')?.checked !== false;
    if (source) source.value = getPlainTextFromEditor(includeMarkers);
    const markerControl = document.getElementById('use-part-markers');
    if (markerControl) markerControl.checked = false;
}

function insertPartAfter(referenceEntry, title = '', sourceText = '', id = '') {
    return addPart(title, sourceText, id, { insertAfter: referenceEntry });
}

// Add a structured part editor. Marker-delimited text is now only a compatibility format.
function addPart(title = '', sourceText = '', id = '', options = {}) {
    const partsContainer = document.getElementById('parts-container');
    if (!partsContainer) return null;
    const partEntry = document.createElement('div');
    partEntry.className = 'part-entry';
    partEntry.dataset.partId = id || createPartId();

    const header = document.createElement('div');
    header.className = 'part-entry-header';

    const number = document.createElement('span');
    number.className = 'part-number';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'part-title';
    titleInput.value = title;

    const actions = document.createElement('div');
    actions.className = 'part-actions';
    const action = (className, label, text) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `part-action ${className}`;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.textContent = text;
        actions.appendChild(button);
        return button;
    };
    const moveUp = action('move-part-up', 'Move part up', '↑');
    const moveDown = action('move-part-down', 'Move part down', '↓');
    const expand = action('expand-part-btn', 'Expand this part editor', '↗');
    const remove = action('remove-part', 'Remove part', '×');

    header.append(number, titleInput, actions);

    const content = document.createElement('textarea');
    content.className = 'part-content';
    content.rows = 12;
    content.value = sourceText;
    content.placeholder = 'Character Name: Text goes here…';

    const footer = document.createElement('div');
    footer.className = 'part-entry-footer';
    const splitButton = document.createElement('button');
    splitButton.type = 'button';
    splitButton.className = 'insert-part-break';
    splitButton.textContent = 'Insert part break at cursor';
    splitButton.title = 'Split this text into two structured parts at the cursor';
    footer.appendChild(splitButton);

    partEntry.append(header, content, footer);

    const move = direction => {
        const sibling = direction < 0 ? partEntry.previousElementSibling : partEntry.nextElementSibling;
        if (!sibling) return;
        if (direction < 0) partsContainer.insertBefore(partEntry, sibling);
        else partsContainer.insertBefore(sibling, partEntry);
        refreshPartEditorLabels();
        syncLegacySourceField();
        if (typeof disableDownloadButton === 'function') disableDownloadButton();
    };
    moveUp.addEventListener('click', () => move(-1));
    moveDown.addEventListener('click', () => move(1));
    remove.addEventListener('click', () => {
        if (partsContainer.children.length === 1) {
            titleInput.value = '';
            content.value = '';
        } else {
            partEntry.remove();
        }
        refreshPartEditorLabels();
        syncLegacySourceField();
        updateWordCount();
        if (typeof disableDownloadButton === 'function') disableDownloadButton();
    });
    splitButton.addEventListener('click', () => {
        const splitAt = Number.isInteger(content.selectionStart) ? content.selectionStart : content.value.length;
        const before = content.value.slice(0, splitAt).replace(/\s+$/g, '');
        const after = content.value.slice(splitAt).replace(/^\s+/g, '');
        content.value = before;
        const created = insertPartAfter(partEntry, '', after);
        created?.querySelector('.part-title')?.focus();
        refreshPartEditorLabels();
        syncLegacySourceField();
        updateWordCount();
        if (typeof disableDownloadButton === 'function') disableDownloadButton();
    });
    [titleInput, content].forEach(input => input.addEventListener('input', () => {
        syncLegacySourceField();
        updateWordCount();
    }));

    if (options.insertAfter?.parentElement === partsContainer) {
        options.insertAfter.insertAdjacentElement('afterend', partEntry);
    } else {
        partsContainer.appendChild(partEntry);
    }
    refreshPartEditorLabels();
    syncLegacySourceField();
    return partEntry;
}

function loadLegacySourceIntoParts(sourceText, titles = [], singleStory = false) {
    const partsContainer = document.getElementById('parts-container');
    if (!partsContainer) return;
    const imported = singleStory
        ? [{ id: 'part-1', title: titles[0] || 'Story', sourceText, entries: [] }]
        : window.RPArchiver.get('projectData').partsFromLegacySource(sourceText, titles);
    const count = Math.max(imported.length, titles.length, 1);

    partsContainer.innerHTML = '';
    for (let index = 0; index < count; index++) {
        const part = imported[index] || {};
        addPart(part.title || titles[index] || `Part ${index + 1}`, part.sourceText || '', part.id || `part-${index + 1}`);
    }
    syncLegacySourceField();
    updateWordCount();
}

function loadProjectPartsIntoEditor(parts, singleStory = false) {
    const partsContainer = document.getElementById('parts-container');
    if (!partsContainer) return;
    const sourceParts = Array.isArray(parts) && parts.length
        ? parts
        : [{ id: 'part-1', title: singleStory ? 'Story' : 'Part 1', sourceText: '' }];
    partsContainer.innerHTML = '';
    sourceParts.forEach((part, index) => addPart(
        part.title || (singleStory ? 'Story' : `Part ${index + 1}`),
        typeof part.sourceText === 'string' ? part.sourceText : '',
        part.id || `part-${index + 1}`
    ));
    syncLegacySourceField();
    updateWordCount();
}

function normalizeLegacyMarkersInPartEditor() {
    const parts = getStoryPartsFromEditor();
    const expanded = [];
    let convertedBreaks = 0;
    parts.forEach(part => {
        const sources = window.RPArchiver.get('projectData').splitLegacySourceText(part.sourceText);
        expanded.push({ ...part, sourceText: sources[0] || '' });
        sources.slice(1).forEach(sourceText => {
            convertedBreaks += 1;
            expanded.push({ id: createPartId(), title: '', sourceText });
        });
    });
    if (!convertedBreaks) return 0;
    loadProjectPartsIntoEditor(expanded, false);
    const singleStory = document.getElementById('single-story');
    if (singleStory) {
        singleStory.checked = false;
        singleStory.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return convertedBreaks;
}

function initializePartEditor() {
    const container = document.getElementById('parts-container');
    if (!container || container.dataset.rpInitialized === 'true') return;
    container.dataset.rpInitialized = 'true';
    if (!container.querySelector('.part-entry')) addPart('Part 1');

    const singleStory = document.getElementById('single-story');
    const addButton = document.getElementById('add-part');
    const syncMode = () => {
        const isSingle = Boolean(singleStory?.checked);
        container.classList.toggle('single-story-mode', isSingle);
        if (addButton) addButton.disabled = isSingle;
    };
    singleStory?.addEventListener('change', syncMode);
    syncMode();

    document.getElementById('plain-text-include-markers')?.addEventListener('change', syncLegacySourceField);
    document.getElementById('convert-legacy-markers')?.addEventListener('click', () => {
        const count = normalizeLegacyMarkersInPartEditor();
        if (count) showStatus(`${count} legacy part break${count === 1 ? '' : 's'} converted to structured parts.`, 'success');
        else showStatus('No legacy part markers were found.', 'info');
    });
    document.getElementById('copy-plain-text')?.addEventListener('click', async () => {
        syncLegacySourceField();
        const source = document.getElementById('rp-text');
        try {
            await navigator.clipboard.writeText(source?.value || '');
            showStatus('Plain text copied.', 'success');
        } catch (error) {
            source?.select();
            showStatus('Select and copy the plain text manually.', 'info');
        }
    });
}

// Function to add an image file to display
function addImageFile(file, isBackground = false) {
    const container = isBackground ? 
        document.getElementById('background-image-display') : 
        document.getElementById('images-container');
    
    if (isBackground) {
        // Clear previous background image
        container.innerHTML = '';
        container.classList.add('has-file');
    }
    
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    
    const fileSize = formatFileSize(file.size);
    
    fileItem.innerHTML = `
        <div class="file-info">
            <div class="file-name">${window.RPArchiver.get('security').escapeHTML(file.name)}</div>
            <div class="file-size">${window.RPArchiver.get('security').escapeHTML(fileSize)}</div>
        </div>
        <button type="button" class="file-remove" title="Remove image">×</button>
    `;
    
    // Store file reference on the element
    fileItem._file = file;
    
    // Add remove functionality
    const removeBtn = fileItem.querySelector('.file-remove');
    removeBtn.addEventListener('click', function() {
        fileItem.remove();
        if (isBackground) {
            container.classList.remove('has-file');
            container.innerHTML = '<div class="file-display-empty">No background image selected</div>';
        }
        if (container.children.length === 0 && !isBackground) {
            container.innerHTML = '<div class="file-display-empty">No story images selected</div>';
        }
    });
    
    container.appendChild(fileItem);
    
    // Remove empty message if it exists
    const emptyMsg = container.querySelector('.file-display-empty');
    if (emptyMsg) {
        emptyMsg.remove();
    }
}

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper function to validate image file
function validateImageFile(file) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB
    
    if (!validTypes.includes(file.type)) {
        throw new Error(`Invalid file type: ${file.type}. Please select a valid image file.`);
    }
    
    if (file.size > maxSize) {
        throw new Error(`File too large: ${formatFileSize(file.size)}. Maximum size is 5MB.`);
    }
    
    return true;
}

// Function to get all selected image files (updated for import support)
function getSelectedImageFiles() {
    const backgroundContainer = document.getElementById('background-image-display');
    const storyContainer = document.getElementById('images-container');
    const bannerContainer = document.getElementById('banner-image-display');
    
    // Get background
    const backgroundItem = backgroundContainer.querySelector('.file-item');
    const backgroundFile = backgroundItem?._file || null;
    const backgroundPath = backgroundItem?._imagePath || null;
    const backgroundExists = backgroundItem?._exists || false;
    
    // Get banner
    const bannerItem = bannerContainer.querySelector('.file-item');
    const bannerFile = bannerItem?._file || null;
    const bannerPath = bannerItem?._imagePath || null;
    const bannerExists = bannerItem?._exists || false;
    
    // Get story files/paths
    const storyItems = Array.from(storyContainer.querySelectorAll('.file-item'));
    const storyFiles = storyItems.map(item => item._file).filter(file => file);
    const storyPaths = storyItems
        .filter(item => item._imagePath && item._exists)
        .map(item => item._imagePath);
    
    return {
        backgroundFile,
        backgroundPath,
        backgroundExists,
        bannerFile,        // ADD this
        bannerPath,        // ADD this  
        bannerExists,      // ADD this
        storyFiles,
        storyPaths,
        hasExistingImages: (backgroundPath && backgroundExists) || 
                          (bannerPath && bannerExists) ||           // ADD this
                          storyPaths.length > 0
    };
}

// Function to update word count display
function updateWordCount() {
    const text = typeof getPlainTextFromEditor === 'function'
        ? getPlainTextFromEditor(false)
        : document.getElementById('rp-text').value;
    const wordCount = countWords(text);
    const pageCount = calculatePageCount(wordCount);
    
    document.getElementById('word-count').textContent = `Words: ${wordCount}`;
    document.getElementById('page-count').textContent = `Pages: ${pageCount}`;
}

// Function to toggle collapsible sections
function toggleCollapsible(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.toggle-icon');
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        icon.classList.remove('collapsed');
    } else {
        content.classList.add('collapsed');
        icon.classList.add('collapsed');
    }
}

// BANNER stuff
// Function to add a banner image file to display
function addBannerImageFile(file) {
    const container = document.getElementById('banner-image-display');
    
    // Clear previous banner image
    container.innerHTML = '';
    container.classList.add('has-file');
    
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    
    const fileSize = formatFileSize(file.size);
    
    fileItem.innerHTML = `
        <div class="file-info">
            <div class="file-name">${window.RPArchiver.get('security').escapeHTML(file.name)}</div>
            <div class="file-size">${window.RPArchiver.get('security').escapeHTML(fileSize)}</div>
        </div>
        <button type="button" class="file-remove" title="Remove banner image">×</button>
    `;
    
    // Store file reference on the element
    fileItem._file = file;
    
    // Add remove functionality
    const removeBtn = fileItem.querySelector('.file-remove');
    removeBtn.addEventListener('click', function() {
        fileItem.remove();
        container.classList.remove('has-file');
        container.innerHTML = '<div class="file-display-empty">No banner image selected</div>';
    });
    
    container.appendChild(fileItem);
}

// Function to get selected banner image file
function getSelectedBannerImageFile() {
    const bannerContainer = document.getElementById('banner-image-display');
    const bannerItem = bannerContainer.querySelector('.file-item');
    
    return {
        bannerFile: bannerItem?._file || null,
        bannerPath: bannerItem?._imagePath || null,
        bannerExists: bannerItem?._exists || false
    };
}

// Function to display existing banner image placeholder (for import)
// Function to display existing banner image placeholder (for import)
function displayBannerImagePlaceholder(imagePath, exists) {
    const container = document.getElementById('banner-image-display');
    
    // Clear container
    container.innerHTML = '';
    
    // Add safety check for imagePath
    if (imagePath && typeof imagePath === 'string') {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item' + (exists ? '' : ' missing-file');
        
        const filename = imagePath.split('/').pop();
        const statusText = exists ? 'Existing file' : 'Missing file - will be removed on save';
        
        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-name">${window.RPArchiver.get('security').escapeHTML(filename)}</div>
                <div class="file-size">${window.RPArchiver.get('security').escapeHTML(statusText)}</div>
            </div>
            <button type="button" class="file-remove" title="Remove banner image">×</button>
        `;
        
        // Store image path info on the element
        fileItem._imagePath = imagePath;
        fileItem._exists = exists;
        
        // Add remove functionality
        const removeBtn = fileItem.querySelector('.file-remove');
        removeBtn.addEventListener('click', function() {
            fileItem.remove();
            container.classList.remove('has-file');
            container.innerHTML = '<div class="file-display-empty">No banner image selected</div>';
        });
        
        container.appendChild(fileItem);
        if (exists) {
            container.classList.add('has-file');
        }
    } else {
        // Handle null, undefined, or non-string imagePath
        window.RPLogger?.debug('Banner image path is invalid:', imagePath, typeof imagePath);
        container.innerHTML = '<div class="file-display-empty">No banner image selected</div>';
    }
}

// Function to handle SillyTavern chat file uploads
// Function to handle SillyTavern chat file uploads
function handleChatFileUpload(file) {
    window.RPLogger?.debug('Importing chat file:', file.name, file.type);
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        window.RPLogger?.debug('Chat file read:', e.target.result.length, 'characters');
        const content = e.target.result;
        let formattedText = '';
        
        try {
            window.RPLogger?.debug('Detecting chat file format:', file.name);
            
            if (file.name.endsWith('.txt')) {
                window.RPLogger?.debug('TXT chat file detected');
                // TXT files are already in correct format
                formattedText = content.trim();
                
                // Clean up any extra whitespace before colons
                formattedText = formattedText.replace(/(\S+)\s+:/g, '$1:');
                
            } else if (file.name.endsWith('.jsonl')) {
                window.RPLogger?.debug('JSONL chat file detected');
                // Parse JSONL - each line is a separate JSON object
                const lines = content.split('\n');
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    
                    const entry = JSON.parse(line);
                    
                    // Skip metadata/system entries
                    if (entry.is_system || !entry.name || !entry.mes) {
                        continue;
                    }
                    
                    // Just get the name and message as-is
                    const characterName = entry.name;
                    // Preserve line breaks, but normalize other whitespace
                    const message = entry.mes.trim().replace(/[ \t]+/g, ' ');
                    
                    // Format as "Name: message"
                    formattedText += characterName + ': ' + message + '\n\n';
                }
                
                // NOW clean up all the whitespace issues in one pass
                formattedText = formattedText.replace(/(\S+)\s+:/g, '$1:');
                
                formattedText = formattedText.trim();
            }
            
            if (!formattedText) {
                if (typeof showRPError === 'function') showRPError('No valid roleplay content was found in that file.');
                else showStatus('No valid roleplay content was found in that file.', 'error');
                return;
            }
            
            // Set text in textarea
            const rpTextArea = document.getElementById('rp-text');
            rpTextArea.value = formattedText;
            if (typeof loadLegacySourceIntoParts === 'function') {
                loadLegacySourceIntoParts(formattedText, [], document.getElementById('single-story')?.checked);
            }
            
            // Update word count
            if (typeof updateWordCount === 'function') {
                updateWordCount();
            }
            
            showStatus('Chat file imported successfully!', 'success');
            
        } catch (error) {
            if (typeof showRPError === 'function') showRPError(`Could not import the chat file: ${error.message}`);
            else showStatus(`Could not import the chat file: ${error.message}`, 'error');
            window.RPLogger?.error('Chat file import failed:', error);
        }
    };
    
    reader.onerror = function() {
        if (typeof showRPError === 'function') showRPError('Could not read the selected chat file.');
        else showStatus('Could not read the selected chat file.', 'error');
    };
    
    reader.readAsText(file);
}

// Helper function to show status messages (optional but nice to have)
function showStatus(message, type = 'info') {
    const statusContainer = document.getElementById('status-container');
    if (!statusContainer) {
        window.RPLogger?.debug(message);
        return;
    }
    
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-message status-${type}`;
    statusDiv.textContent = message;
    
    statusContainer.appendChild(statusDiv);
    
    // Remove after 3 seconds
    setTimeout(() => {
        statusDiv.remove();
    }, 3000);
}
