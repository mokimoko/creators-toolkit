(function defineHTMLRenderer(root) {
    'use strict';

    const FOOTNOTE_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    const security = root.RPArchiver.get('security');
    const escapeHTML = security.escapeHTML;
    const escapeAttribute = security.escapeAttribute;

    function safeColor(value, fallback = '#000000') {
        return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
    }

    function safeNumber(value, minimum, maximum, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
    }

    function cssURL(value) {
        const safe = security.safeMediaURL(value);
        return safe ? safe.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : '';
    }

    function isFootnoteHeading(paragraph) {
        return paragraph
            .trim()
            .replace(/^#{1,6}\s*/, '')
            .replace(/^(?:\*\*|__)/, '')
            .replace(/(?:\*\*|__)$/, '')
            .replace(/:$/, '')
            .trim()
            .toLowerCase() === 'footnotes';
    }

    function parseFootnoteDefinition(paragraph) {
        const match = paragraph.trim().match(/^([⁰¹²³⁴⁵⁶⁷⁸⁹]+)(?:[.)])?\s+([\s\S]+)$/);
        if (!match) return null;

        const number = Array.from(match[1])
            .map(digit => FOOTNOTE_DIGITS.indexOf(digit))
            .join('');

        return { marker: match[1], number, body: match[2] };
    }

    function collectFootnotes(entries) {
        const footnotes = new Map();
        let foundHeading = false;

        entries.forEach(entry => {
            if (entry.type !== 'character') return;

            entry.paragraphs.forEach(paragraph => {
                if (isFootnoteHeading(paragraph)) {
                    foundHeading = true;
                    return;
                }

                if (!foundHeading) return;
                const definition = parseFootnoteDefinition(paragraph);
                if (definition && !footnotes.has(definition.marker)) {
                    footnotes.set(definition.marker, definition);
                }
            });
        });

        return footnotes;
    }

    function processFootnoteReferences(content, footnotes, referenceCounts) {
        if (!footnotes.size) return content;

        const markerPattern = Array.from(footnotes.keys())
            .sort((a, b) => b.length - a.length)
            .map(marker => marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|');
        const markerRegex = new RegExp(markerPattern, 'g');

        // Only touch visible text, never marker-like characters inside generated HTML tags.
        return content.split(/(<[^>]+>)/g).map(fragment => {
            if (fragment.startsWith('<')) return fragment;

            return fragment.replace(markerRegex, marker => {
                const footnote = footnotes.get(marker);
                const count = (referenceCounts.get(marker) || 0) + 1;
                referenceCounts.set(marker, count);
                const referenceId = `footnote-ref-${footnote.number}-${count}`;
                const footnoteId = `footnote-${footnote.number}`;

                return `<a class="rp-footnote-ref" id="${referenceId}" href="#${footnoteId}" role="doc-noteref" aria-label="Footnote ${footnote.number}" title="Go to footnote ${footnote.number}" onclick="openFootnote(event, '${footnoteId}', '${referenceId}')">${marker}</a>`;
            });
        }).join('');
    }

    // Function to generate HTML content for the roleplay with collapsible parts
    function generateRPContent(entries, parts, characterData, glossaryData = null, glossaryOptions = {}, structuredParts = null) {
        // Initialize match tracker for glossary (to track first instances across all paragraphs)
        let glossaryMatchTracker = null;
        if (glossaryData && glossaryData.length > 0 && glossaryOptions.firstOnly) {
            glossaryMatchTracker = {};
            glossaryData.forEach(item => {
                glossaryMatchTracker[item.id] = 0;
            });
        }

        const footnotes = collectFootnotes(entries);
        const footnoteReferenceCounts = new Map();
        let content = '';
        let readThroughAnchorCounter = 0;
        const nextReadThroughAnchor = () => `rp-block-${String(++readThroughAnchorCounter).padStart(5, '0')}`;

        const renderParagraphs = (paragraphs) => {
            let paragraphHTML = '';
            let footnoteSectionOpen = false;

            paragraphs.forEach(paragraph => {
                const trimmedParagraph = paragraph.trim();

                if (isFootnoteHeading(paragraph) && footnotes.size) {
                    if (footnoteSectionOpen) paragraphHTML += '\n                </section>';
                    paragraphHTML += `\n                <section class="rp-footnotes" role="doc-endnotes" aria-labelledby="rp-footnotes-title">
                        <p class="rp-footnotes-heading" id="rp-footnotes-title" data-rp-anchor="${nextReadThroughAnchor()}" data-original="${escapeAttribute(paragraph)}"><strong>Footnotes</strong></p>`;
                    footnoteSectionOpen = true;
                    return;
                }

                const definition = footnoteSectionOpen ? parseFootnoteDefinition(paragraph) : null;
                if (definition && footnotes.has(definition.marker)) {
                    const footnoteId = `footnote-${definition.number}`;
                    const defaultReferenceId = `footnote-ref-${definition.number}-1`;
                    let processedBody = parseMarkdown(definition.body);

                    if (glossaryData && glossaryData.length > 0) {
                        processedBody = processGlossaryLinks(processedBody, glossaryData, glossaryOptions, glossaryMatchTracker);
                    }

                    paragraphHTML += `\n                    <p class="rp-footnote-item" id="${footnoteId}" role="doc-endnote" data-rp-anchor="${nextReadThroughAnchor()}" data-original="${escapeAttribute(paragraph)}">
                            <a class="rp-footnote-backref" href="#${defaultReferenceId}" role="doc-backlink" aria-label="Return to footnote ${definition.number} in the story" title="Return to the story" onclick="returnFromFootnote(event, '${footnoteId}', '${defaultReferenceId}')">${definition.marker}</a>
                            <span class="rp-footnote-text">${processedBody}</span>
                        </p>`;
                    return;
                }

                if (trimmedParagraph.match(/^-{3,}$|^\*{3,}$/)) {
                    paragraphHTML += '\n                <span class="section-divider"></span>';
                } else if (document.getElementById('allow-raw-html')?.checked && containsHTML(paragraph)) {
                    paragraphHTML += '\n                <div class="html-content" data-rp-anchor="' + nextReadThroughAnchor() + '" data-original="' +
                            escapeAttribute(paragraph) + '">' + security.sanitizeRawHTML(paragraph) + '</div>';
                } else {
                    let processedParagraph = parseMarkdown(paragraph);

                    if (glossaryData && glossaryData.length > 0) {
                        processedParagraph = processGlossaryLinks(processedParagraph, glossaryData, glossaryOptions, glossaryMatchTracker);
                    }

                    processedParagraph = processFootnoteReferences(processedParagraph, footnotes, footnoteReferenceCounts);

                    paragraphHTML += '\n                <p data-rp-anchor="' + nextReadThroughAnchor() + '" data-original="' +
                            escapeAttribute(paragraph) + '">' + processedParagraph + '</p>';
                }
            });

            if (footnoteSectionOpen) paragraphHTML += '\n                </section>';
            return paragraphHTML;
        };

        // Check if single story mode is enabled
        const singleStory = document.getElementById('single-story').checked;
        const noCharacters = document.getElementById('no-characters').checked;

        // Variables to track current state
        let currentPartIndex = 0;
        let isFirstContainer = true;
        let openContainer = false;

        // If we aren't using part markers, just use the first part title for everything
        const usePartMarkers = document.getElementById('use-part-markers').checked;

        // Also generate part IDs and titles for table of contents
        const tocParts = [];

        const renderEntries = partEntries => {
            let html = '';
            partEntries.forEach(entry => {
                if (entry.type !== 'character') return;
                html += '\n            <div class="rp-entry">';
                if (!noCharacters) {
                    html += '\n                <div class="' +
                        createCharClass(entry.character, characterData, entry.characterId) + '">' + escapeHTML(entry.character) + ':</div>';
                }
                html += renderParagraphs(entry.paragraphs);
                html += '\n            </div>';
            });
            return html;
        };

        // Schema v2 edits and renders explicit part models. Empty parts and stable IDs are preserved.
        if (Array.isArray(structuredParts)) {
            const models = structuredParts.length
                ? structuredParts
                : [{ id: 'part-1', title: singleStory ? 'Story' : 'Part 1', entries: [] }];

            if (singleStory) {
                content += '\n        <div class="rp-container">';
                content += renderEntries(models.flatMap(part => part.entries || []));
                content += '\n        </div>';
                return { content, tocParts };
            }

            models.forEach((part, index) => {
                const fallbackId = `part-${index + 1}`;
                const partId = /^[A-Za-z][A-Za-z0-9_-]*$/.test(part.id || '') ? part.id : fallbackId;
                const partTitle = (part.title || '').trim() || `Part ${index + 1}`;
                tocParts.push({ id: partId, title: partTitle });
                content += `\n        <div id="header-${partId}" class="part-header" onclick="togglePart('${partId}')">
                <h2>${escapeHTML(partTitle)}</h2>
                <span class="part-toggle">▼</span>
            </div>

            <div id="${partId}-content" class="rp-container">`;
                content += renderEntries(part.entries || []);
                content += '\n        </div>';
            });
            return { content, tocParts };
        }

        if (!usePartMarkers || singleStory) {
            // Just use the first part title or default title
            let partTitle = 'Story';
            if (!singleStory && parts.length > 0) {
                partTitle = parts[0];
            }
            const partId = 'part-1';

            // Add to TOC only if not in single story mode
            if (!singleStory) {
                tocParts.push({ id: partId, title: partTitle });
            }

            // Generate content without part headers if single story mode
            if (singleStory) {
                content += '\n        <div class="rp-container">';
            } else {
                // Generate part header with toggle button
                content += `\n        <div id="header-${partId}" class="part-header" onclick="togglePart('${partId}')">
                <h2>${escapeHTML(partTitle)}</h2>
                <span class="part-toggle">▼</span>
            </div>

            <div id="${partId}-content" class="rp-container">`;
            }

            // Add all entries to this one part
            entries.forEach((entry) => {
                if (entry.type === 'character') {
                    content += '\n            <div class="rp-entry">';

                    // Add character name only if not in no-characters mode
                    if (!noCharacters) {
                        content += '\n                <div class="' +
                                createCharClass(entry.character, characterData, entry.characterId) + '">' + escapeHTML(entry.character) + ':</div>';
                    }

                    content += renderParagraphs(entry.paragraphs);

                    content += '\n            </div>';
                }
            });

            // Close the container
            content += '\n        </div>';

            return { content, tocParts };
        }

        // Using part markers - process parts normally
        // Process entries
        entries.forEach((entry, index) => {
            // Handle part breaks
            if (entry.type === 'partBreak') {
                // Close previous container if open
                if (openContainer) {
                    content += '\n        </div>';
                    openContainer = false;
                }

                // Get part title - make sure we don't go beyond the number of defined parts
                let partTitle = currentPartIndex < parts.length
                    ? parts[currentPartIndex]
                    : `Part ${currentPartIndex + 1}`;

                const partId = `part-${currentPartIndex + 1}`;

                // Add to TOC
                tocParts.push({ id: partId, title: partTitle });

                // Add part header with toggle button
                content += `\n        <div id="header-${partId}" class="part-header" onclick="togglePart('${partId}')">
                <h2>${escapeHTML(partTitle)}</h2>
                <span class="part-toggle">▼</span>
            </div>

            <div id="${partId}-content" class="rp-container">`;

                openContainer = true;
                currentPartIndex++;
                return;
            }

            // Character entry
            if (entry.type === 'character') {
                // If this is the first entry and no container is open yet
                if (isFirstContainer && !openContainer) {
                    // Get the first part title
                    let partTitle = parts.length > 0 ? parts[0] : 'Part One';
                    const partId = 'part-1';

                    // Add to TOC
                    tocParts.push({ id: partId, title: partTitle });

                    // Add part header with toggle button
                    content += `\n        <div id="header-${partId}" class="part-header" onclick="togglePart('${partId}')">
                <h2>${escapeHTML(partTitle)}</h2>
                <span class="part-toggle">▼</span>
            </div>

            <div id="${partId}-content" class="rp-container">`;

                    openContainer = true;
                    isFirstContainer = false;
                    currentPartIndex = 1;
                }

                // Add character entry
                content += '\n            <div class="rp-entry">';

                // Add character name only if not in no-characters mode
                if (!noCharacters) {
                    content += '\n                <div class="' +
                            createCharClass(entry.character, characterData, entry.characterId) + '">' + escapeHTML(entry.character) + ':</div>';
                }

                content += renderParagraphs(entry.paragraphs);

                content += '\n            </div>';
            }
        });

        // Close any open container
        if (openContainer) {
            content += '\n        </div>';
        }

        return { content, tocParts };
    }

    // Function to generate images HTML
    // Replace your generateImagesHTML() function in html-generator.js with this fixed version
    function generateImagesHTML() {
        const { storyFiles, storyPaths } = getSelectedImageFiles();

        window.RPLogger?.debug('Generating image HTML:', { storyFiles: storyFiles.length, storyPaths: storyPaths.length });

        let imagesHTML = '';

        // FIXED: Always include existing images first
        if (storyPaths.length > 0) {
            storyPaths.forEach((imagePath, index) => {
                window.RPLogger?.debug(`Using existing image path ${index}:`, imagePath);
                const safePath = security.safeMediaURL(imagePath);
                if (safePath) imagesHTML += `\n        <img src="${escapeAttribute(safePath)}" width="300" height="200" alt="Story Image">`;
            });
        }

        // FIXED: Then add new uploaded files (not mutually exclusive)
        if (storyFiles.length > 0) {
            storyFiles.forEach((file, index) => {
                const imagePath = `images/${getCleanTitle()}-image-${storyPaths.length + index + 1}.${getFileExtension(file.name)}`;
                window.RPLogger?.debug(`Generated image path for new file ${index}:`, imagePath);
                imagesHTML += `\n        <img src="${escapeAttribute(imagePath)}" width="300" height="200" alt="Story Image">`;
            });
        }

        window.RPLogger?.debug('Generated story image HTML');
        return imagesHTML;
    }

    // Helper function to get clean title for image naming
    function getCleanTitle() {
        const title = document.getElementById('title').value || 'untitled';
        return title.trim()
            .replace(/\s+/g, '-')
            .replace(/[<>:"/\\|?*',.()[\]{}]/g, '-')  // Replace problematic characters with hyphens
            .replace(/-+/g, '-')                       // Replace multiple consecutive hyphens with single hyphen
            .replace(/^-|-$/g, '')                     // Remove leading/trailing hyphens
            .toLowerCase();
    }

    // Helper function to get file extension
    function getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }

    // Function to generate navigation HTML
    function generateNavigationHTML() {
        const navElements = document.querySelectorAll('.nav-entry');
        if (navElements.length === 0) {
            // Return default navigation if no custom nav is defined
            return '<a href="../index.html">Home</a>';
        }

        let navHTML = '';
        navElements.forEach(entry => {
            const label = entry.querySelector('.nav-label').value.trim();
            const url = entry.querySelector('.nav-url').value.trim();

            if (label && url) {
                const safeURL = security.safeURL(url);
                if (safeURL) navHTML += `\n        <a href="${escapeAttribute(safeURL)}">${escapeHTML(label)}</a>`;
            }
        });

        // Always include at least a home link if nothing was provided
        if (navHTML === '') {
            navHTML = '<a href="../index.html">Home</a>';
        }

        return navHTML;
    }

    // Function to generate final HTML
    function generateHTML() {
        // Get input values with safe access
        const title = document.getElementById('title')?.value || 'Untitled Story';
        const subtitle = document.getElementById('subtitle')?.value || 'A Universe Story';
        const description = document.getElementById('description')?.value || '';
        const universe = document.getElementById('universe')?.value || 'Universe';
        const pairing = document.getElementById('pairing')?.value || 'Character/Character';
        const date = document.getElementById('date')?.value || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const status = document.getElementById('status')?.value || 'Ongoing';

        // Handle title font size (check both old and new locations)
        let titleFontSize = '32'; // default
        const bannerTitleFontSizeEl = document.getElementById('title-font-size-banner');
        const oldTitleFontSizeEl = document.getElementById('title-font-size');

        if (bannerTitleFontSizeEl) {
            titleFontSize = safeNumber(bannerTitleFontSizeEl.value, 16, 96, 32);
        } else if (oldTitleFontSizeEl) {
            titleFontSize = safeNumber(oldTitleFontSizeEl.value, 16, 96, 32);
        }

        // Generate fallback title styles and logic
        let fallbackTitleStyles = '';
        let showFallbackTitle = false;

        // Check if banner title is hidden
        const showTitleEl = document.getElementById('show-title');
        if (showTitleEl && !showTitleEl.checked) {
            showFallbackTitle = true;
            fallbackTitleStyles = `
                /* Fallback Title Styles */
                .fallback-title {
                    font-size: 1.4em;
                    font-weight: bold;
                    background-color: rgba(240, 240, 240, 0.7);
                    padding: 8px 12px;
                    border-radius: 4px;
                    margin-bottom: 12px;
                    text-align: center;
                }`;
        }

        // Get background image settings with safe access
        let backgroundFile = null;
        let backgroundPath = null;
        let backgroundExists = false;
        let bannerFile = null;
        let bannerPath = null;
        let bannerExists = false;

        // Safely get image files
        try {
            const imageData = getSelectedImageFiles();
            if (imageData) {
                backgroundFile = imageData.backgroundFile;
                backgroundPath = imageData.backgroundPath;
                backgroundExists = imageData.backgroundExists;
                bannerFile = imageData.bannerFile || null;
                bannerPath = imageData.bannerPath || null;
                bannerExists = imageData.bannerExists || false;
            }
        } catch (error) {
            window.RPLogger?.debug('Selected image files unavailable:', error);
        }

        const backgroundOpacity = safeNumber(document.getElementById('background-opacity')?.value, 0, 100, 20);
        const backgroundBlur = safeNumber(document.getElementById('background-blur')?.value, 0, 20, 5);

        // Determine background image path for HTML generation
        let backgroundImagePath = null;
        if (backgroundFile) {
            // New file selected - use the naming convention that will be applied by server
            const cleanTitle = getCleanTitle();
            const ext = getFileExtension(backgroundFile.name);
            backgroundImagePath = `images/${cleanTitle}-background.${ext}`;
        } else if (backgroundPath && backgroundExists) {
            // Existing file from import
            backgroundImagePath = security.safeMediaURL(backgroundPath);
        }

        // Get character data
        const characterData = [];
        const characterDivs = document.querySelectorAll('.character-info');
        characterDivs.forEach((div, index) => {
            const name = div.querySelector('.char-name').value;
            const color = div.querySelector('.char-color').value;

            if (name.trim() !== '') {
                characterData.push({
                    id: security.createStableId('character', div.dataset.characterId),
                    name: name,
                    color: safeColor(color)
                });
            }
        });

        // Get parts
        const partElements = document.querySelectorAll('.part-title');
        const parts = Array.from(partElements).map(el => el.value).filter(part => part.trim() !== '');

        // Generate character styles with fixed CSS class names for multi-word names
        let characterStyles = '';
        characterData.forEach(char => {
            const cssClass = getCharacterCSSClass(char);
            characterStyles += `\n        .${cssClass} {\n            color: ${char.color};\n        }`;
        });

        // Generate title font size styles
        let titleStyles = '';
        if (titleFontSize && titleFontSize !== '32') {
            titleStyles = `
            /* Custom Title Font Size */
            header h1 {
                font-size: ${titleFontSize}px;
            }`;
        }

        // Generate background image styles
        let backgroundStyles = '';
        if (backgroundImagePath) {
            backgroundStyles = `
                /* Background Image Styles */
                html {
                    background-color: transparent;
                }

                body::before {
                    content: '';
                    position: fixed;
                    top: -20px;           /* Extend beyond viewport */
                    left: -20px;          /* Extend beyond viewport */
                    width: calc(100% + 40px);  /* Make wider to compensate */
                    height: calc(100% + 40px); /* Make taller to compensate */
                    background-image: url('${cssURL(backgroundImagePath)}');
                    background-size: cover;
                    background-position: center;
                    background-repeat: no-repeat;
                    filter: blur(${backgroundBlur}px);
                    opacity: ${backgroundOpacity / 100};
                    z-index: -2;
                }

                body {
                    background-color: transparent;
                }

                /* Ensure content containers have proper background for readability */
                .content-wrapper,
                .rp-container {
                    background-color: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(2px);
                }

                /* Keep header with its original dark styling but add slight transparency */
                header {
                    background-color: rgba(51, 51, 51, 0.95);
                    backdrop-filter: blur(2px);
                }

                /* Style the navigation breadcrumbs for better visibility */
                nav {
                    background-color: rgba(51, 51, 51, 0.8);
                    padding: 10px 20px;
                    border-radius: 5px;
                    backdrop-filter: blur(2px);
                    margin-bottom: 20px;
                }

                nav a {
                    color: rgba(255, 255, 255, 0.9);
                    text-decoration: none;
                    margin-right: 15px;
                    transition: color 0.2s ease;
                }

                nav a:hover {
                    color: #ffffff;
                    text-decoration: underline;
                }

                .story-info {
                    background-color: rgba(224, 240, 255, 0.95);
                    backdrop-filter: blur(2px);
                }

                .soundtrack-panel, .comments-panel {
                    background-color: rgba(255, 255, 255, 0.98);
                    backdrop-filter: blur(3px);
                }`;
        }

        // Generate glossary data first
        const glossaryResult = generateGlossaryHTML();
        const glossaryHTML = glossaryResult.glossaryHTML;
        const glossaryData = glossaryResult.glossaryData;
        const glossaryOptions = glossaryResult.options;

        // Generate the content section and table of contents (pass glossary data)
        const { content, tocParts } = generateRPContent(
            rpProjectState.parsedEntries,
            parts,
            characterData,
            glossaryData,
            glossaryOptions,
            rpProjectState.parsedParts
        );

        // Generate table of contents if we have more than 1 part and not in single story mode
        let tableOfContents = '';
        const singleStory = document.getElementById('single-story').checked;
        if (tocParts.length > 1 && !singleStory) {
            tableOfContents = '<div class="table-of-contents">\n        <h3>Table of Contents</h3>\n        <ul>';
            tocParts.forEach(part => {
                // Fix the TOC links to point to the header elements
                tableOfContents += `\n            <li><a href="#header-${part.id}">${escapeHTML(part.title)}</a></li>`;
            });
            tableOfContents += '\n        </ul>\n    </div>';
        }

        // Generate images HTML
        const imagesHTML = generateImagesHTML();

        // Generate navigation HTML
        const navigationHTML = generateNavigationHTML();

        // Generate soundtrack HTML
        const soundtrackHTML = generateSoundtrackHTML();

        // Generate comments HTML
        const commentsHTML = generateCommentsHTML();

        // Get word count and page count
        const rpText = typeof getPlainTextFromEditor === 'function'
            ? getPlainTextFromEditor(false)
            : document.getElementById('rp-text').value;
        const wordCount = countWords(rpText);
        const pageCount = calculatePageCount(wordCount);

        const template = window.RPArchiver.get('generatedTemplate').get();

        // Process conditional sections for description, images, soundtrack, and comments
    // Process conditional sections for description, images, soundtrack, and comments
        const conditions = {
            DESCRIPTION: Boolean(description), FALLBACK_TITLE: showFallbackTitle,
            IMAGES: Boolean(imagesHTML), SOUNDTRACK: Boolean(soundtrackHTML),
            COMMENTS: Boolean(commentsHTML), GLOSSARY: Boolean(glossaryHTML)
        };
        const processedTemplate = template.replace(
            /{{#if ([A-Z_]+)}}([\s\S]*?){{\/if}}/g,
            (_, key, body) => conditions[key] ? body : ''
        );

        const replacements = {
            TITLE: escapeHTML(title), SUBTITLE: escapeHTML(subtitle), DESCRIPTION: escapeHTML(description),
            UNIVERSE: escapeHTML(universe), PAIRING: escapeHTML(pairing), DATE: escapeHTML(date), STATUS: escapeHTML(status),
            NAVIGATION: navigationHTML, IMAGES: imagesHTML, SOUNDTRACK: soundtrackHTML, COMMENTS: commentsHTML,
            GLOSSARY: glossaryHTML, WORD_COUNT: String(wordCount), PAGE_COUNT: String(pageCount),
            CSS_TEMPLATE: escapeAttribute(document.getElementById('css-template')?.value || 'generated.css'),
            CHARACTER_STYLES: characterStyles, BACKGROUND_STYLES: backgroundStyles, TITLE_STYLES: titleStyles,
            BANNER_STYLES: generateBannerStyles(), FALLBACK_TITLE_STYLES: fallbackTitleStyles,
            TABLE_OF_CONTENTS: tableOfContents, CONTENT: content
        };
        const html = processedTemplate.replace(/{{([A-Z_]+)}}/g, (_, key) => replacements[key] ?? '');

        const projectData = window.RPArchiver.get('projectData');
        const project = root.RPArchiver.get('formBinding').collectProject(document, {
            parsedEntries: rpProjectState.parsedEntries,
            parsedParts: rpProjectState.parsedParts,
            getSelectedImageFiles
        });
        return projectData.injectProjectData(root.RPArchiver.get('readThroughIntegration').inject(html), project);
    }

    // BANNER stuff
    function generateBannerStyles() {
        // Check if banner elements exist - if not, return empty styles
        const showTitleEl = document.getElementById('show-title');
        const showSubtitleEl = document.getElementById('show-subtitle');
        const titleFontSizeEl = document.getElementById('title-font-size-banner');
        const titleFontColorEl = document.getElementById('title-font-color');
        const subtitleFontColorEl = document.getElementById('subtitle-font-color');
        const bannerSizeEl = document.getElementById('banner-size');

        // If banner elements don't exist, return empty styles
        if (!showTitleEl || !showSubtitleEl || !titleFontSizeEl || !titleFontColorEl || !subtitleFontColorEl || !bannerSizeEl) {
            window.RPLogger?.debug('Banner elements not found; returning empty banner styles');
            return '';
        }

        const showTitle = showTitleEl.checked;
        const showSubtitle = showSubtitleEl.checked;
        const titleFontSize = safeNumber(titleFontSizeEl.value, 16, 96, 32);
        const titleFontColor = safeColor(titleFontColorEl.value, '#ffffff');
        const subtitleFontColor = safeColor(subtitleFontColorEl.value, '#cccccc');
        const bannerSize = bannerSizeEl.value;

        // Get banner image info (with null check)
        const bannerImageData = getSelectedBannerImageFile ? getSelectedBannerImageFile() : { bannerFile: null, bannerPath: null, bannerExists: false };
        const { bannerFile, bannerPath, bannerExists } = bannerImageData;

        // Determine banner image path for HTML generation
        let bannerImagePath = null;
        if (bannerFile) {
            // New file selected - use the naming convention
            const cleanTitle = getCleanTitle();
            const ext = getFileExtension(bannerFile.name);
            bannerImagePath = `images/${cleanTitle}-banner.${ext}`;
        } else if (bannerPath && bannerExists) {
            // Existing file from import
            bannerImagePath = security.safeMediaURL(bannerPath);
        }

        // Banner height mapping
        const bannerHeights = {
            'small': '80px',
            'medium': '120px',
            'large': '160px'
        };
        const bannerHeight = bannerHeights[bannerSize] || '120px';

        let bannerStyles = `
            /* Banner Styles */
            header {
                height: ${bannerHeight};
                position: relative;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
                overflow: hidden;`;

        // Add background image if available
        if (bannerImagePath) {
            bannerStyles += `
                background-image: url('${cssURL(bannerImagePath)}');
                background-size: cover;
                background-position: center;
                background-repeat: no-repeat;`;
        }

        bannerStyles += `
            }`;

        // Add title styles
        if (showTitle) {
            bannerStyles += `

            header h1 {
                font-size: ${titleFontSize}px;
                color: ${titleFontColor};
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.7);
                margin: 0 0 8px 0;
                z-index: 2;
                position: relative;
            }`;
        } else {
            bannerStyles += `

            header h1 {
                display: none;
            }`;
        }

        // Add subtitle styles
        if (showSubtitle) {
            bannerStyles += `

            header h2 {
                color: ${subtitleFontColor};
                text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.7);
                margin: 0;
                z-index: 2;
                position: relative;
            }`;
        } else {
            bannerStyles += `

            header h2 {
                display: none;
            }`;
        }

        // Add overlay for better text readability if banner image exists
        if (bannerImagePath) {
            bannerStyles += `

            header::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.2));
                z-index: 1;
            }`;
        }

        return bannerStyles;
    }

    root.RPArchiver.define('htmlRenderer', {
        getCleanTitle,
        render: generateHTML
    });
})(window);
