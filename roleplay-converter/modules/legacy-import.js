(function defineLegacyImport(root) {
    'use strict';

    const mediaAssets = root.RPArchiver.get('mediaAssets');

    function extractTemplateInfo(htmlContent) {
        let detectedTemplate = 'generated.css'; // default
        
        window.RPLogger?.debug('Extracting template info from imported HTML');
        
        try {
            // Look for the meta tag we added - try multiple patterns anywhere in the document
            const patterns = [
                /<meta\s+name="rp-archiver-template"\s+content="([^"]+)"/i,
                /<meta\s+content="([^"]+)"\s+name="rp-archiver-template"/i,
                /<meta[^>]*rp-archiver-template[^>]*content="([^"]+)"/i
            ];
            
            for (const pattern of patterns) {
                const match = htmlContent.match(pattern);
                if (match) {
                    detectedTemplate = match[1];
                    window.RPLogger?.debug('Found template marker:', pattern.source);
                    window.RPLogger?.debug('Detected template:', detectedTemplate);
                    return detectedTemplate;
                }
            }
            
            window.RPLogger?.debug('No template marker found; using default');
            
            // Debug: Show first part of document to see structure
            window.RPLogger?.debug('Imported document has no template metadata');
            
        } catch (error) {
            window.RPLogger?.warn('Error extracting template info:', error);
        }
        
        return detectedTemplate;
    }
    
    function findImportedRPStyle(doc) {
        const markedStyle = doc.querySelector('#rp-archiver-generated-styles');
        if (markedStyle) {
            return markedStyle;
        }
    
        const candidateStyles = Array.from(doc.querySelectorAll('style'))
            .filter(style => style.id !== 'rp-read-through-styles');
    
        if (candidateStyles.length <= 1) {
            return candidateStyles[0] || null;
        }
    
        const characterClasses = new Set();
        doc.querySelectorAll('.character-name').forEach(element => {
            element.classList.forEach(className => {
                if (className !== 'character-name') characterClasses.add(className);
            });
        });
    
        const characterStyle = candidateStyles.find(style => {
            const styleText = style.textContent;
            return Array.from(characterClasses).some(className => {
                const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return new RegExp(`\\.${escapedClass}\\s*\\{[^}]*\\bcolor\\s*:`, 'i').test(styleText);
            });
        });
    
        return characterStyle || candidateStyles[candidateStyles.length - 1];
    }

    function extractHexColor(declarations) {
        const match = String(declarations || '').match(/(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\s*(?:!important\s*)?(?:;|$)/i);
        if (!match) return '';
        const color = match[1].toLowerCase();
        return color.length === 4
            ? `#${color.slice(1).split('').map(value => value + value).join('')}`
            : color;
    }

    // Legacy character identity lives in the imported markup, not in the current
    // characterClass() algorithm. Read the classes that are actually on each label
    // so old name-based classes survive migrations to stable character IDs.
    function extractLegacyCharacters(doc, styleElement) {
        const elements = Array.from(doc.querySelectorAll('.character-name'));
        const classColors = new Map();
        const styleText = styleElement?.textContent || '';
        const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
        let ruleMatch;

        while ((ruleMatch = rulePattern.exec(styleText)) !== null) {
            const color = extractHexColor(ruleMatch[2]);
            if (!color) continue;

            ruleMatch[1].split(',').forEach(selector => {
                const classPattern = /\.([_a-zA-Z][\w-]*)/g;
                let classMatch;
                while ((classMatch = classPattern.exec(selector)) !== null) {
                    classColors.set(classMatch[1], color);
                }
            });
        }

        const characters = new Map();
        elements.forEach(element => {
            const name = String(element.textContent || '').replace(/:\s*$/, '').trim();
            if (!name) return;

            const classes = Array.from(element.classList || []).filter(className => className !== 'character-name');
            const inlineColor = extractHexColor(element.getAttribute?.('style'));
            const color = inlineColor
                || classes.map(className => classColors.get(className)).find(Boolean)
                || classColors.get('character-name')
                || '';

            const existing = characters.get(name);
            if (!existing) {
                characters.set(name, { name, color });
            } else if (!existing.color && color) {
                existing.color = color;
            }
        });

        return Array.from(characters.values());
    }
    
    // Function to parse imported HTML and extract data
    function parseImportedHTML(htmlContent, importContext = {}) {
        // Create a temporary DOM element to parse the HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
    
        // Restore Shared Read-Through linking, document identity, and cached threads.
        document.dispatchEvent(new CustomEvent('rp-read-through-import', { detail: { doc } }));
        
    
        // Extract title and universe from document title (format: "Title - Universe")
        const documentTitle = doc.title || '';
        const titleParts = documentTitle.split(' - ');
        const title = titleParts[0] || '';
        const universe = titleParts[1] || '';
    
        document.getElementById('title').value = title;
        document.getElementById('universe').value = universe;
        
        // Extract story info from the .story-info section
        const storyInfoParagraphs = doc.querySelectorAll('.story-info p');
        
        // Initialize variables
        let pairing = '';
        let date = '';
        let status = '';
        
        // Parse each paragraph to extract the correct information
        storyInfoParagraphs.forEach(p => {
            const text = p.textContent.trim();
            if (text.startsWith('Pairing:')) {
                pairing = text.replace('Pairing:', '').trim();
            } else if (text.startsWith('Last Updated:')) {
                date = text.replace('Last Updated:', '').trim();
            } else if (text.startsWith('Status:')) {
                status = text.replace('Status:', '').trim();
            }
        });
        
        // Set the extracted values
        document.getElementById('pairing').value = pairing;
        document.getElementById('date').value = date;
        
        // Set the status dropdown to the correct value
        const statusSelect = document.getElementById('status');
        // Check if the status value exists in the dropdown options
        const statusOptions = Array.from(statusSelect.options).map(option => option.value);
        if (statusOptions.includes(status)) {
            statusSelect.value = status;
        } else {
            // If the exact status isn't found, try to match common variations
            const statusLower = status.toLowerCase();
            if (statusLower.includes('complete') || statusLower.includes('finished')) {
                statusSelect.value = 'Complete';
            } else if (statusLower.includes('ongoing') || statusLower.includes('in progress')) {
                statusSelect.value = 'Ongoing';
            } else if (statusLower.includes('hiatus') || statusLower.includes('paused')) {
                statusSelect.value = 'Hiatus';
            }
        }
        
        // Extract description
        const descriptionElement = doc.querySelector('.story-description p');
        if (descriptionElement) {
            const descriptionText = descriptionElement.textContent;
            const description = descriptionText.replace('Description:', '').trim();
            document.getElementById('description').value = description;
        }
        
        // Extract navigation links
        const navLinks = doc.querySelectorAll('nav a');
        const navigationContainer = document.getElementById('navigation-container');
        navigationContainer.innerHTML = ''; // Clear existing navigation
        
        navLinks.forEach(link => {
            const label = link.textContent.trim();
            const url = link.getAttribute('href');
            if (label && url) {
                addNavigation(label, url);
            }
        });
        
        // Extract images using new system
        const imageInfo = mediaAssets.extractImageInfo(htmlContent);
        const allImagePaths = [
            ...(imageInfo.backgroundImage ? [imageInfo.backgroundImage] : []),
            ...(imageInfo.bannerImage ? [imageInfo.bannerImage] : []),  // ADD this
            ...imageInfo.storyImages
        ];
    
        window.RPLogger?.debug('Extracted image info:', imageInfo);
        window.RPLogger?.debug('Imported image paths:', allImagePaths);
    
        // Check which images actually exist on the server
        if (allImagePaths.length > 0) {
            // Organized projects use their real storage folder. Legacy title metadata
            // can describe a pairing or setting that does not match that folder name.
            const universeFromForm = importContext.storageUniverse
                || document.getElementById('universe').value
                || 'Universe';
            
            window.RPLogger?.debug('Detected universe:', universeFromForm);
            
            // Actually check if images exist
            mediaAssets.checkImagesExistAndDisplay(universeFromForm, imageInfo, allImagePaths);
        }
    
        // Clear the old images container and remove the old add button functionality
        const oldImagesContainer = document.getElementById('images-container');
        const oldAddImageBtn = document.getElementById('add-image');
        if (oldAddImageBtn) {
            oldAddImageBtn.style.display = 'none'; // Hide old button if it exists
        }
        
        // Extract parts and detect single story mode
        const partHeaders = doc.querySelectorAll('.part-header h2');
        const tableOfContents = doc.querySelector('.table-of-contents');
        const partsContainer = document.getElementById('parts-container');
        partsContainer.innerHTML = ''; // Clear existing parts
        
        // Detect if this was generated as a single story (no parts, no TOC)
        const isSingleStory = partHeaders.length === 0 && !tableOfContents;
        const singleStoryCheckbox = document.getElementById('single-story');
        const usePartMarkersCheckbox = document.getElementById('use-part-markers');
        
        if (isSingleStory) {
            singleStoryCheckbox.checked = true;
            usePartMarkersCheckbox.checked = false;
            usePartMarkersCheckbox.disabled = true;
        } else {
            singleStoryCheckbox.checked = false;
            usePartMarkersCheckbox.checked = false;
            usePartMarkersCheckbox.disabled = true;
            
            partHeaders.forEach(header => {
                const partTitle = header.textContent.trim();
                addPart(partTitle);
            });
        }
        
        // Check if this was generated with "No Characters" mode and set checkbox accordingly
        const hasCharacterNames = doc.querySelector('.character-name') !== null;
        const noCharactersCheckbox = document.getElementById('no-characters');
        const charactersContainer = document.getElementById('characters-container');
        const addCharacterBtn = document.getElementById('add-character');
        
        if (!hasCharacterNames) {
            // This file was generated with "No Characters" mode
            noCharactersCheckbox.checked = true;
            charactersContainer.style.display = 'none';
            addCharacterBtn.style.display = 'none';
        } else {
            // This file has character names
            noCharactersCheckbox.checked = false;
            charactersContainer.style.display = 'block';
            addCharacterBtn.style.display = 'inline-block';
        }
        
        // Extract appearance values from CSS
        const styleElement = findImportedRPStyle(doc);
        if (styleElement) {
            const styleText = styleElement.textContent;
            
            // Extract background image settings (note: actual background image extraction is handled elsewhere now)
            const backgroundOpacityMatch = styleText.match(/opacity:\s*([\d.]+)/);
            const backgroundBlurMatch = styleText.match(/filter:\s*blur\((\d+)px\)/);
            
            // Handle background image opacity and blur settings (values only, image itself handled by new system)
            if (backgroundOpacityMatch) {
                const opacityPercent = Math.round(parseFloat(backgroundOpacityMatch[1]) * 100);
                document.getElementById('background-opacity').value = opacityPercent;
                document.getElementById('opacity-value').textContent = opacityPercent + '%';
            }
            if (backgroundBlurMatch) {
                document.getElementById('background-blur').value = backgroundBlurMatch[1];
                document.getElementById('blur-value').textContent = backgroundBlurMatch[1] + 'px';
            }
    
            // Extract banner settings - ONLY if banner section exists
            const bannerSizeSelect = document.getElementById('banner-size');
            if (bannerSizeSelect) {
                // Extract banner size
                const bannerHeightMatch = styleText.match(/header\s*{[^}]*height:\s*(\d+)px/);
                if (bannerHeightMatch) {
                    const height = parseInt(bannerHeightMatch[1]);
                    if (height <= 90) {
                        bannerSizeSelect.value = 'small';
                    } else if (height <= 140) {
                        bannerSizeSelect.value = 'medium';
                    } else {
                        bannerSizeSelect.value = 'large';
                    }
                }
                
                // Extract title display settings
                const titleDisplayMatch = styleText.match(/header h1\s*{[^}]*display:\s*none/);
                const showTitleCheckbox = document.getElementById('show-title');
                if (showTitleCheckbox) {
                    showTitleCheckbox.checked = !titleDisplayMatch;
                }
                
                const subtitleDisplayMatch = styleText.match(/header h2\s*{[^}]*display:\s*none/);
                const showSubtitleCheckbox = document.getElementById('show-subtitle');
                if (showSubtitleCheckbox) {
                    showSubtitleCheckbox.checked = !subtitleDisplayMatch;
                }
                
                // Extract title color
                const titleColorMatch = styleText.match(/header\s+h1\s*{[^}]*color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})/);
                if (titleColorMatch) {
                    const titleColorInput = document.getElementById('title-font-color');
                    if (titleColorInput) {
                        titleColorInput.value = titleColorMatch[1];
                    }
                }
                
                // Extract subtitle color
                const subtitleColorMatch = styleText.match(/header\s+h2\s*{[^}]*color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})/);
                if (subtitleColorMatch) {
                    const subtitleColorInput = document.getElementById('subtitle-font-color');
                    if (subtitleColorInput) {
                        subtitleColorInput.value = subtitleColorMatch[1];
                    }
                }
            } else {
                window.RPLogger?.debug('Banner section not found; skipping banner settings');
            }
    
            // Extract title font size - try multiple patterns (KEEP THIS DECLARATION!)
            let titleFontSizeMatch = styleText.match(/header\s+h1\s*\{\s*font-size:\s*(\d+)px\s*;?\s*\}/);
            if (!titleFontSizeMatch) {
                // Try alternative patterns
                titleFontSizeMatch = styleText.match(/header\s+h1[^}]*font-size:\s*(\d+)px/);
            }
            if (!titleFontSizeMatch) {
                // Try even more flexible pattern
                titleFontSizeMatch = styleText.match(/h1[^}]*font-size:\s*(\d+)px/);
            }
    
            // Handle the title font size (UPDATED to use banner inputs)
            if (titleFontSizeMatch) {
                const fontSize = titleFontSizeMatch[1];
                
                // Try new banner location first
                const bannerFontSizeInput = document.getElementById('title-font-size-banner');
                const bannerFontSizeValue = document.getElementById('title-font-size-banner-value');
                
                if (bannerFontSizeInput && bannerFontSizeValue) {
                    // Banner section exists - use it
                    bannerFontSizeInput.value = fontSize;
                    bannerFontSizeValue.textContent = fontSize + 'px';
                } else {
                    // Fallback to old location if it still exists
                    const oldFontSizeInput = document.getElementById('title-font-size');
                    const oldFontSizeValue = document.getElementById('title-font-size-value');
                    
                    if (oldFontSizeInput && oldFontSizeValue) {
                        oldFontSizeInput.value = fontSize;
                        oldFontSizeValue.textContent = fontSize + 'px';
                    }
                }
            } else {
                // Reset to default if no custom font size found
                const bannerFontSizeInput = document.getElementById('title-font-size-banner');
                const bannerFontSizeValue = document.getElementById('title-font-size-banner-value');
                
                if (bannerFontSizeInput && bannerFontSizeValue) {
                    bannerFontSizeInput.value = 32;
                    bannerFontSizeValue.textContent = '32px';
                } else {
                    // Fallback to old elements
                    const oldFontSizeInput = document.getElementById('title-font-size');
                    const oldFontSizeValue = document.getElementById('title-font-size-value');
                    
                    if (oldFontSizeInput && oldFontSizeValue) {
                        oldFontSizeInput.value = 32;
                        oldFontSizeValue.textContent = '32px';
                    }
                }
            }
            
        }

        const importedCharacters = extractLegacyCharacters(doc, styleElement);
        charactersContainer.innerHTML = '';
        if (hasCharacterNames) {
            importedCharacters.forEach((character, index) => {
                addCharacter(character.name, character.color || defaultColors[index % defaultColors.length]);
            });
        }
        
        // Try to extract soundtrack data if the container exists
        try {
            const soundtrackContainer = document.getElementById('soundtrack-container');
            if (soundtrackContainer) {
                soundtrackContainer.innerHTML = ''; // Clear existing soundtrack entries
                
                // Find soundtrack section in imported HTML
                const soundtrackContent = doc.querySelector('.soundtrack-content');
                if (soundtrackContent) {
                    // Extract sections and tracks
                    const sections = soundtrackContent.querySelectorAll('.soundtrack-section');
                    
                    if (sections.length > 0) {
                        sections.forEach(section => {
                            // Get section title
                            const titleElement = section.querySelector('.soundtrack-section-title');
                            if (titleElement) {
                                const title = titleElement.textContent.trim();
                                addTrackHeading(title);
                            }
                            
                            // Get tracks in this section
                            const tracks = section.querySelectorAll('.soundtrack-track');
                            tracks.forEach(track => {
                                const link = track.querySelector('a');
                                if (link) {
                                    const trackName = link.textContent.trim();
                                    // Remove the music note emoji if present
                                    const cleanName = trackName.replace(/🎵\s*/, '').trim();
                                    const trackUrl = link.getAttribute('href');
                                    addTrack(cleanName, trackUrl);
                                }
                            });
                        });
                    } else {
                        // If we have no sections but direct tracks (possible in older files)
                        const directTracks = soundtrackContent.querySelectorAll('.soundtrack-track');
                        directTracks.forEach(track => {
                            const link = track.querySelector('a');
                            if (link) {
                                const trackName = link.textContent.trim();
                                // Remove the music note emoji if present
                                const cleanName = trackName.replace(/🎵\s*/, '').trim();
                                const trackUrl = link.getAttribute('href');
                                addTrack(cleanName, trackUrl);
                            }
                        });
                    }
                }
            }
        } catch (error) {
            window.RPLogger?.warn('Error importing soundtrack data:', error);
            // Continue with import even if soundtrack import fails
        }
        
        // Try to extract comments data if the container exists
        try {
            const commentsContainer = document.getElementById('comments-container');
            if (commentsContainer) {
                commentsContainer.innerHTML = ''; // Clear existing comment entries
                
                // Find comments section in imported HTML
                const commentsContent = doc.querySelector('.comments-content');
                if (commentsContent) {
                    // Extract sections and comments
                    const sections = commentsContent.querySelectorAll('.comments-section');
                    
                    if (sections.length > 0) {
                        sections.forEach(section => {
                            // Get section title
                            const titleElement = section.querySelector('.comments-section-title');
                            if (titleElement) {
                                const title = titleElement.textContent.trim();
                                addCommentHeading(title);
                            }
                            
                            // Get comments in this section
                            const commentBlocks = section.querySelectorAll('.comment-block');
                            commentBlocks.forEach(commentBlock => {
                                // Extract the text content and convert back to comment format
                                let commentText = commentBlock.innerHTML.trim();
                                
                                // Simple conversion from HTML back to markdown
                                commentText = commentText
                                    .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
                                    .replace(/<em>(.*?)<\/em>/g, '*$1*')
                                    .replace(/<del>(.*?)<\/del>/g, '~~$1~~')
                                    .replace(/<br\s*\/?>/g, '\n')
                                    .replace(/<\/p><p>/g, '\n\n')
                                    .replace(/<\/?p>/g, '');
                                
                                // Add the comment: prefix back
                                const formattedComment = 'comment: ' + commentText;
                                addComment(formattedComment);
                            });
                        });
                    } else {
                        // If we have no sections but direct comments (possible in older files)
                        const directComments = commentsContent.querySelectorAll('.comment-block');
                        directComments.forEach(commentBlock => {
                            let commentText = commentBlock.innerHTML.trim();
                            
                            // Simple conversion from HTML back to markdown
                            commentText = commentText
                                .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
                                .replace(/<em>(.*?)<\/em>/g, '*$1*')
                                .replace(/<del>(.*?)<\/del>/g, '~~$1~~')
                                .replace(/<br\s*\/?>/g, '\n')
                                .replace(/<\/p><p>/g, '\n\n')
                                .replace(/<\/?p>/g, '');
                            
                            const formattedComment = 'comment: ' + commentText;
                            addComment(formattedComment);
                        });
                    }
                }
            }
        } catch (error) {
            window.RPLogger?.warn('Error importing comments data:', error);
            // Continue with import even if comments import fails
        }
    
        // Try to extract glossary data if it exists
        try {
            const glossaryContainer = document.getElementById('glossary-container');
            if (glossaryContainer) {
                glossaryContainer.innerHTML = ''; // Clear existing entries
                
                // Find glossary section in imported HTML
                const glossarySection = doc.querySelector('.glossary-section');
                if (glossarySection) {
                    const glossaryItems = glossarySection.querySelectorAll('.glossary-item');
                    
                    glossaryItems.forEach(item => {
                        const termLabel = item.querySelector('.glossary-term-label');
                        const definitionText = item.querySelector('.glossary-definition-text');
                        
                        if (termLabel && definitionText) {
                            const term = termLabel.textContent.replace(':', '').trim();
                            const definition = definitionText.textContent.trim();
                            addGlossaryEntry(term, definition);
                        }
                    });
                    
                    // Try to detect checkbox settings from content
                    const hasGlossaryLinks = doc.querySelectorAll('.glossary-link').length > 0;
                    const hasTooltips = doc.querySelector('.glossary-link[data-glossary-tooltip]') !== null;
    
                    // Detect "first instance only" by checking if terms appear multiple times but only linked once
                    let firstInstanceOnly = false;
                    if (glossaryItems.length > 0) {
                        for (const item of glossaryItems) {
                            const termLabel = item.querySelector('.glossary-term-label');
                            if (termLabel) {
                                const term = termLabel.textContent.replace(':', '').trim();
                                
                                // Get all text content from the document
                                const allText = doc.querySelector('main')?.textContent || '';
                                
                                // Count how many times the term appears in total (case-insensitive)
                                const termRegex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
                                const totalMatches = (allText.match(termRegex) || []).length;
                                
                                // Count how many times it appears with glossary-link class
                                const linkedMatches = doc.querySelectorAll(`.glossary-link[data-glossary-id="${item.id}"]`).length;
                                
                                // If term appears multiple times but only linked once, firstInstanceOnly was used
                                if (totalMatches > 1 && linkedMatches === 1) {
                                    firstInstanceOnly = true;
                                    break;
                                }
                            }
                        }
                    }
    
                    // Set checkboxes
                    const showSectionCheckbox = document.getElementById('glossary-show-section');
                    const showTooltipsCheckbox = document.getElementById('glossary-show-tooltips');
                    const firstOnlyCheckbox = document.getElementById('glossary-first-only');
    
                    if (showSectionCheckbox) showSectionCheckbox.checked = true;
                    if (showTooltipsCheckbox) showTooltipsCheckbox.checked = hasTooltips;
                    if (firstOnlyCheckbox) firstOnlyCheckbox.checked = firstInstanceOnly;
                }
            }
        } catch (error) {
            window.RPLogger?.warn('Error importing glossary data:', error);
        }
        
    // Extract roleplay text - this is the most complex part
    const rpEntries = doc.querySelectorAll('.rp-entry');
    let rpText = '';
    
    // Track if we're in a new part
    let currentPartId = '';
    
    rpEntries.forEach(entry => {
        // Check if this entry is in a different part container than the previous one
        const partContainer = entry.closest('.rp-container');
        if (partContainer) {
            const partId = partContainer.id;
            if (partId !== currentPartId) {
                // Add part marker if this isn't the first part
                if (currentPartId !== '') {
                    rpText += '\n&&&PART&&&\n\n';
                }
                currentPartId = partId;
            }
        }
        
        if (hasCharacterNames) {
            // Original logic for files with character names
            const characterElement = entry.querySelector('.character-name');
            if (characterElement) {
                const character = characterElement.textContent.replace(':', '').trim();
                rpText += character + ': ';
                
                // Get all child nodes (paragraphs AND dividers) in order
                const allNodes = entry.querySelectorAll('p, .html-content, .section-divider');
                allNodes.forEach((node, index) => {
                    if (node.classList.contains('section-divider')) {
                        rpText += '\n\n---\n\n';
                    } else {
                        // Try to get original markdown from data attribute
                        const originalText = node.getAttribute('data-original') || node.textContent.trim();
                        rpText += originalText;
                        // Add a blank line between paragraphs if not followed by a divider
                        if (index < allNodes.length - 1 && !allNodes[index + 1].classList.contains('section-divider')) {
                            rpText += '\n\n';
                        }
                    }
                });
                
                // Add two blank lines between different characters
                rpText += '\n\n';
            }
        } else {
            // Handle files generated with "No Characters" mode
            // Get all child nodes (paragraphs AND dividers) in order
            const allNodes = entry.querySelectorAll('p, .html-content, .section-divider');
            allNodes.forEach((node, index) => {
                if (node.classList.contains('section-divider')) {
                    rpText += '\n\n---\n\n';
                } else {
                    // Try to get original markdown from data attribute
                    const originalText = node.getAttribute('data-original') || node.textContent.trim();
                    rpText += originalText;
                    // Add two blank lines between paragraphs if not followed by a divider
                    if (index < allNodes.length - 1 && !allNodes[index + 1].classList.contains('section-divider')) {
                        rpText += '\n\n';
                    }
                }
            });
            
            // Add extra spacing between entries
            rpText += '\n\n';
        }
    });
        
        // Convert legacy marker-delimited text into structured part editors in memory.
        const legacySourceText = rpText.trim();
        const rawHtmlControl = document.getElementById('allow-raw-html');
        if (rawHtmlControl) rawHtmlControl.checked = /<[a-z][\s\S]*>/i.test(legacySourceText);
        const importedPartTitles = Array.from(document.querySelectorAll('.part-title')).map(input => input.value);
        if (typeof loadLegacySourceIntoParts === 'function') {
            loadLegacySourceIntoParts(legacySourceText, importedPartTitles, isSingleStory);
        } else {
            document.getElementById('rp-text').value = legacySourceText;
        }
        singleStoryCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        
    // Extract and set CSS template
        try {
            const detectedTemplate = extractTemplateInfo(htmlContent);
            window.RPLogger?.debug('Setting CSS template to:', detectedTemplate);
            
            const cssTemplateSelect = document.getElementById('css-template');
            if (cssTemplateSelect) {
                // Set the dropdown to the detected template
                cssTemplateSelect.value = detectedTemplate;
                
                // Verify it was set correctly
                const actualValue = cssTemplateSelect.value;
                if (actualValue === detectedTemplate) {
                    window.RPLogger?.debug('CSS template set:', actualValue);
                } else {
                    window.RPLogger?.warn('CSS template not found in dropdown options:', detectedTemplate);
                    window.RPLogger?.debug('Available templates:', Array.from(cssTemplateSelect.options).map(o => o.value));
                    
                    // Fallback to default
                    cssTemplateSelect.value = 'generated.css';
                    window.RPLogger?.debug('Falling back to default template');
                }
            } else {
                window.RPLogger?.warn('CSS template dropdown not found');
            }
        } catch (templateError) {
            window.RPLogger?.error('Error setting CSS template during import:', templateError);
        }
    
        // Extract subtitle separately (it's just whatever the subtitle is)
        const universeElement = doc.querySelector('header h2');
        if (universeElement) {
            const subtitle = universeElement.textContent.trim();
            document.getElementById('subtitle').value = subtitle;
        }
    
        // Update word count
        updateWordCount();
    }

    root.RPArchiver.define('legacyImport', {
        extractLegacyCharacters,
        extractTemplateInfo,
        findImportedRPStyle,
        importHTML: parseImportedHTML
    });
})(window);
