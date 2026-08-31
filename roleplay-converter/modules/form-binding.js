(function defineFormBinding(root) {
    'use strict';

    const mediaAssets = root.RPArchiver.get('mediaAssets');

    const projectData = root.RPArchiver.get('projectData');
    const array = value => Array.isArray(value) ? value : [];

    function cleanTitle(title) {
        return String(title || 'untitled').trim()
            .replace(/\s+/g, '-')
            .replace(/[<>:"/\\|?*',.()[\]{}]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase() || 'untitled';
    }

    function extension(filename) {
        const pieces = String(filename || '').split('.');
        return pieces.length > 1 ? pieces.pop().toLowerCase() : '';
    }

    function sourceTextFromEntries(entries) {
        return array(entries).map(entry => {
            if (entry?.type !== 'character') return '';
            const prefix = entry.character ? `${entry.character}: ` : '';
            return prefix + array(entry.paragraphs).join('\n\n');
        }).filter(Boolean).join('\n\n');
    }

    function splitEntriesIntoParts(entries, titles, singleStory) {
        const parts = [];
        let current = { id: 'part-1', title: singleStory ? 'Story' : (titles[0] || 'Part One'), entries: [] };
        parts.push(current);
        array(entries).forEach(entry => {
            if (entry?.type === 'partBreak') {
                const index = parts.length;
                current = { id: `part-${index + 1}`, title: titles[index] || `Part ${index + 1}`, entries: [] };
                parts.push(current);
            } else if (entry?.type === 'character') {
                current.entries.push({
                    type: 'character',
                    character: String(entry.character || ''),
                    characterId: String(entry.characterId || ''),
                    paragraphs: array(entry.paragraphs).map(item => String(item || ''))
                });
            }
        });
        return parts;
    }

    function collectOrdered(container, selectors) {
        return Array.from(container?.children || []).map(element => {
            if (element.matches(selectors.heading.selector)) {
                return { type: 'heading', title: element.querySelector(selectors.heading.input)?.value || '' };
            }
            if (element.matches(selectors.item.selector)) {
                const result = { type: selectors.item.type };
                Object.entries(selectors.item.inputs).forEach(([key, selector]) => {
                    result[key] = element.querySelector(selector)?.value || '';
                });
                return result;
            }
            return null;
        }).filter(Boolean);
    }

    function collectProject(doc, options = {}) {
        const value = id => doc.getElementById(id)?.value || '';
        const checked = id => Boolean(doc.getElementById(id)?.checked);
        const characterElements = Array.from(doc.querySelectorAll('.character-info'));
        const formParts = Array.from(doc.querySelectorAll('.part-entry')).map((element, index) => ({
            id: element.dataset.partId || `part-${index + 1}`,
            title: element.querySelector('.part-title')?.value || `Part ${index + 1}`,
            sourceText: element.querySelector('.part-content')?.value || ''
        }));
        const singleStory = checked('single-story');
        const selectedImages = typeof options.getSelectedImageFiles === 'function'
            ? options.getSelectedImageFiles() : {};
        const titleSlug = cleanTitle(value('title'));
        const background = selectedImages.backgroundPath || (selectedImages.backgroundFile
            ? `images/${titleSlug}-background.${extension(selectedImages.backgroundFile.name)}` : '');
        const banner = selectedImages.bannerPath || (selectedImages.bannerFile
            ? `images/${titleSlug}-banner.${extension(selectedImages.bannerFile.name)}` : '');
        const storyImages = [
            ...array(selectedImages.storyPaths),
            ...array(selectedImages.storyFiles).map((file, index) => (
                `images/${titleSlug}-image-${array(selectedImages.storyPaths).length + index + 1}.${extension(file.name)}`
            ))
        ];

        const project = projectData.createDefaultProject();
        project.story = {
            title: value('title'), subtitle: value('subtitle'), description: value('description'),
            universe: value('universe'), pairing: value('pairing'), updated: value('date'),
            status: value('status') || 'Ongoing'
        };
        const security = root.RPArchiver.get('security');
        project.characters = characterElements.map((element) => ({
            id: security.createStableId('character', element.dataset.characterId),
            name: element.querySelector('.char-name')?.value || '',
            color: element.querySelector('.char-color')?.value || '#000000'
        })).filter(character => character.name.trim());
        if (formParts.length) {
            project.parts = formParts.map((part, index) => ({
                ...part,
                entries: array(options.parsedParts)[index]?.entries || []
            }));
        } else {
            const titles = Array.from(doc.querySelectorAll('.part-title')).map(element => element.value);
            project.parts = splitEntriesIntoParts(options.parsedEntries, titles, singleStory).map(part => ({
                ...part,
                sourceText: sourceTextFromEntries(part.entries)
            }));
        }
        const sourceText = projectData.sourceTextFromParts(project.parts);
        project.editor = {
            sourceText,
            singleStory,
            usePartMarkers: false,
            noCharacters: checked('no-characters'),
            allowRawHtml: checked('allow-raw-html')
        };
        project.media = { background, banner, storyImages };
        project.soundtrack = collectOrdered(doc.getElementById('soundtrack-container'), {
            heading: { selector: '.track-heading', input: '.track-heading-title' },
            item: { selector: '.track-entry', type: 'track', inputs: { name: '.track-name', url: '.track-link' } }
        });
        project.navigation = Array.from(doc.querySelectorAll('.nav-entry')).map(element => ({
            label: element.querySelector('.nav-label')?.value || '',
            url: element.querySelector('.nav-url')?.value || ''
        })).filter(item => item.label || item.url);
        project.glossary = Array.from(doc.querySelectorAll('.glossary-entry')).map((element, index) => ({
            id: `glossary-${index + 1}`,
            term: element.querySelector('.glossary-term')?.value || '',
            definition: element.querySelector('.glossary-definition')?.value || ''
        })).filter(item => item.term || item.definition);
        project.glossaryOptions = {
            firstOnly: checked('glossary-first-only'),
            showTooltips: checked('glossary-show-tooltips'),
            showSection: checked('glossary-show-section')
        };
        project.comments = collectOrdered(doc.getElementById('comments-container'), {
            heading: { selector: '.comment-heading', input: '.comment-heading-title' },
            item: { selector: '.comment-entry', type: 'comment', inputs: { text: '.comment-text' } }
        });
        const cachedThreads = (() => {
            try { return JSON.parse(value('read-through-cache-data') || '[]'); }
            catch (error) { return []; }
        })();
        project.readThrough = {
            enabled: checked('read-through-enabled'),
            documentId: value('read-through-document-id'),
            hostedUrl: value('read-through-linked-url'),
            endpoint: value('read-through-endpoint') || '/api/read-through/comments',
            cachedThreads: array(cachedThreads)
        };
        project.appearance = {
            template: value('css-template') || 'generated.css',
            backgroundOpacity: Number(value('background-opacity') || 20),
            backgroundBlur: Number(value('background-blur') || 5),
            banner: {
                size: value('banner-size') || 'medium',
                showTitle: checked('show-title'),
                showSubtitle: checked('show-subtitle'),
                titleFontSize: Number(value('title-font-size-banner') || 32),
                titleColor: value('title-font-color') || '#ffffff',
                subtitleColor: value('subtitle-font-color') || '#cccccc'
            }
        };
        return projectData.normalizeProject(project);
    }


    function setImportedValue(id, value) {
        const element = document.getElementById(id);
        if (element) element.value = value ?? '';
    }
    
    function setImportedChecked(id, value) {
        const element = document.getElementById(id);
        if (element) element.checked = Boolean(value);
    }
    
    function restoreOrderedProjectItems(containerId, items, handlers) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        (items || []).forEach(item => {
            const handler = handlers[item.type];
            if (handler) handler(item);
        });
    }
    
    function applyStructuredProject(project, sourceDocument, importContext = {}) {
        const story = project.story;
        setImportedValue('title', story.title);
        setImportedValue('subtitle', story.subtitle);
        setImportedValue('description', story.description);
        setImportedValue('universe', story.universe);
        setImportedValue('pairing', story.pairing);
        setImportedValue('date', story.updated);
        setImportedValue('status', story.status);
    
        const editor = project.editor;
        setImportedChecked('single-story', editor.singleStory);
        setImportedChecked('use-part-markers', editor.usePartMarkers);
        setImportedChecked('no-characters', editor.noCharacters);
        setImportedChecked('allow-raw-html', editor.allowRawHtml);
        const markerControl = document.getElementById('use-part-markers');
        if (markerControl) markerControl.disabled = editor.singleStory;
        document.getElementById('single-story')?.dispatchEvent(new Event('change', { bubbles: true }));
    
        const charactersContainer = document.getElementById('characters-container');
        const addCharacterButton = document.getElementById('add-character');
        if (charactersContainer) {
            charactersContainer.innerHTML = '';
            charactersContainer.style.display = editor.noCharacters ? 'none' : 'block';
        }
        if (addCharacterButton) addCharacterButton.style.display = editor.noCharacters ? 'none' : 'inline-block';
        if (!editor.noCharacters) {
            project.characters.forEach(character => addCharacter(character.name, character.color, character.id));
        }
    
        const partsContainer = document.getElementById('parts-container');
        if (typeof loadProjectPartsIntoEditor === 'function') {
            loadProjectPartsIntoEditor(project.parts, editor.singleStory);
        } else {
            if (partsContainer) partsContainer.innerHTML = '';
            project.parts.forEach(part => addPart(part.title, part.sourceText, part.id));
        }
    
        restoreOrderedProjectItems('soundtrack-container', project.soundtrack, {
            heading: item => addTrackHeading(item.title),
            track: item => addTrack(item.name, item.url)
        });
        restoreOrderedProjectItems('comments-container', project.comments, {
            heading: item => addCommentHeading(item.title),
            comment: item => addComment(item.text)
        });
    
        const navigationContainer = document.getElementById('navigation-container');
        if (navigationContainer) navigationContainer.innerHTML = '';
        project.navigation.forEach(item => addNavigation(item.label, item.url));
    
        const glossaryContainer = document.getElementById('glossary-container');
        if (glossaryContainer) glossaryContainer.innerHTML = '';
        project.glossary.forEach(item => addGlossaryEntry(item.term, item.definition));
        setImportedChecked('glossary-first-only', project.glossaryOptions.firstOnly);
        setImportedChecked('glossary-show-tooltips', project.glossaryOptions.showTooltips);
        setImportedChecked('glossary-show-section', project.glossaryOptions.showSection);
    
        const appearance = project.appearance;
        setImportedValue('css-template', appearance.template);
        setImportedValue('background-opacity', appearance.backgroundOpacity);
        setImportedValue('background-blur', appearance.backgroundBlur);
        setImportedValue('banner-size', appearance.banner.size);
        setImportedChecked('show-title', appearance.banner.showTitle);
        setImportedChecked('show-subtitle', appearance.banner.showSubtitle);
        setImportedValue('title-font-size-banner', appearance.banner.titleFontSize);
        setImportedValue('title-font-color', appearance.banner.titleColor);
        setImportedValue('title-font-color-picker', appearance.banner.titleColor);
        setImportedValue('subtitle-font-color', appearance.banner.subtitleColor);
        setImportedValue('subtitle-font-color-picker', appearance.banner.subtitleColor);
        const opacityValue = document.getElementById('opacity-value');
        const blurValue = document.getElementById('blur-value');
        const titleSizeValue = document.getElementById('title-font-size-banner-value');
        if (opacityValue) opacityValue.textContent = `${appearance.backgroundOpacity}%`;
        if (blurValue) blurValue.textContent = `${appearance.backgroundBlur}px`;
        if (titleSizeValue) titleSizeValue.textContent = `${appearance.banner.titleFontSize}px`;
    
        const sourceText = editor.sourceText || projectData.sourceTextFromParts(project.parts);
        setImportedValue('rp-text', sourceText);
    
        const imageInfo = {
            backgroundImage: project.media.background || null,
            bannerImage: project.media.banner || null,
            storyImages: project.media.storyImages || []
        };
        const allImagePaths = [
            ...(imageInfo.backgroundImage ? [imageInfo.backgroundImage] : []),
            ...(imageInfo.bannerImage ? [imageInfo.bannerImage] : []),
            ...imageInfo.storyImages
        ];
        if (allImagePaths.length) {
            const imageUniverse = importContext.storageUniverse || story.universe || 'Universe';
            mediaAssets.checkImagesExistAndDisplay(imageUniverse, imageInfo, allImagePaths);
        } else {
            mediaAssets.displayExistingImages(null, null, [], { existingImages: [], missingImages: [] });
        }
    
        document.dispatchEvent(new CustomEvent('rp-read-through-import', {
            detail: { project, doc: sourceDocument }
        }));
        updateWordCount();
    }

    root.RPArchiver.define('formBinding', {
        applyStructuredProject,
        collectProject,
        restoreOrderedProjectItems,
        setImportedChecked,
        setImportedValue
    });
})(window);
