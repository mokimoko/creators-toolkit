import fontSets from './templates/font-sets.js';
import titleFonts from './templates/titlefonts.js';
import { assemblePublicDocument } from './modules/generation/document-shell.js';
import { addPreviewBaseHref, buildProjectPreviewBaseHref } from './modules/generation/preview-document.js';
import { assembleRuntimeFragments } from './modules/generation/runtime-assembly.js';
import { minifyPublicCss, minifyPublicRuntime } from './modules/generation/output-minifier.js';
import { performanceNow, recordPerformance } from './modules/app/performance-metrics.js';

const {
    escapeAttribute,
    escapeText,
    escapeUrl,
    renderMarkdown,
    renderMarkdownBlocks,
    sanitizeCssColor
} = window.LoreGenerationSecurity;

// Main HTML Generation Functions - Reduced size version
// CSS generation moved to css-generator.js
// Helper to format event timing for display
function formatEventTiming(timing) {
    // Handle legacy string format
    if (typeof timing === 'string') {
        return timing;
    }
    
    // Handle new object format
    if (timing && timing.date) {
        const timeSystemId = timing.timeSystemId || 'default';
        
        const timeSystem = getTimeSystemById(timeSystemId);

        if (!timeSystem) {
            console.error('Time system not found:', timeSystemId);
            return 'Time system not loaded';
        }

        // Validate the date
        if (!validateEventDate(timing.date, timeSystem)) {
            return 'Invalid date';
        }

        // Format the start date
        let formatted = formatDateWithFormat(timing.date, timeSystem.settings.dateFormat, timeSystem);
        
        // Add start time if present
        if (timing.time) {
            const timeFormat = timeSystem.settings.timeFormat;
            let timeStr = '';
            
            if (timeFormat === '12') {
                timeStr = ` ${timing.time.hour}:${String(timing.time.minute).padStart(2, '0')} ${timing.time.period}`;
            } else if (timeFormat === '24') {
                timeStr = ` ${String(timing.time.hour).padStart(2, '0')}:${String(timing.time.minute).padStart(2, '0')}`;
            } else if (timeFormat === 'custom') {
                const divName = timeSystem.timeDivisions.useDivisionNames && timeSystem.timeDivisions.divisionNames?.[timing.time.division]
                    ? timeSystem.timeDivisions.divisionNames[timing.time.division]
                    : `Division ${timing.time.division + 1}`;
                const subdivisionName = timeSystem.timeDivisions.subdivisionName || 'subdivision';
                timeStr = `, ${divName} ${timing.time.subdivision} ${subdivisionName}`;
            }
            
            formatted += timeStr;
        }

        // Add end date if present
        if (timing.endDate && validateEventDate(timing.endDate, timeSystem)) {
            let endFormatted = formatDateWithFormat(timing.endDate, timeSystem.settings.dateFormat, timeSystem);
            
            // Add end time if present
            if (timing.endTime) {
                const timeFormat = timeSystem.settings.timeFormat;
                let endTimeStr = '';
                
                if (timeFormat === '12') {
                    endTimeStr = ` ${timing.endTime.hour}:${String(timing.endTime.minute).padStart(2, '0')} ${timing.endTime.period}`;
                } else if (timeFormat === '24') {
                    endTimeStr = ` ${String(timing.endTime.hour).padStart(2, '0')}:${String(timing.endTime.minute).padStart(2, '0')}`;
                } else if (timeFormat === 'custom') {
                    const divName = timeSystem.timeDivisions.useDivisionNames && timeSystem.timeDivisions.divisionNames?.[timing.endTime.division]
                        ? timeSystem.timeDivisions.divisionNames[timing.endTime.division]
                        : `Division ${timing.endTime.division + 1}`;
                    const subdivisionName = timeSystem.timeDivisions.subdivisionName || 'subdivision';
                    endTimeStr = `, ${divName} ${timing.endTime.subdivision} ${subdivisionName}`;
                }
                
                endFormatted += endTimeStr;
            }
            
            formatted = `${formatted} → ${endFormatted}`;
        }
        
        return formatted;
    }
    
    return '';
}

// Helper function to get time system by ID
function getTimeSystemById(id) {
    return window.LoreDomainHelpers.getTimeSystemById(id);
}

function getRequiredStyleAssets(data) {
    const assets = [];
    
    // Get appearance settings
    const appearance = data.appearance || {};
    
    // Check if wuxia container style is being used
    if (appearance.containerStyle === 'wuxia') {
        assets.push({
            source: 'images/styles/cloudrecesses.png',
            destination: 'images/styles/cloudrecesses.png'
        });
    }
    
    // Check if wuxia subcontainer style is being used (for mist overlay)
    if (appearance.subcontainerStyle === 'wuxia') {
        assets.push({
            source: 'images/styles/mist.png',
            destination: 'images/styles/mist.png'
        });
    }
    
    // Check if wuxia overview style is being used (for both mist overlay and animated fog)
    if (appearance.overviewStyle === 'wuxia') {
        assets.push({
            source: 'images/styles/mist.png',
            destination: 'images/styles/mist.png'
        });
        assets.push({
            source: 'images/styles/fog.png',
            destination: 'images/styles/fog.png'
        });
    }
    
    return assets;
}

function generateGoogleFontLinks() {
    try {
        let allGoogleFonts = [];
        
        // Get fonts from appearance font set
        if (typeof getAppearanceSettings === 'function' && typeof fontSets !== 'undefined') {
            const appearance = getAppearanceSettings();
            const fontSet = fontSets[appearance.fontSet];
            if (fontSet && fontSet.googleFonts) {
                allGoogleFonts.push(...fontSet.googleFonts);
            }
        }
        
        // Get fonts from title font set
        if (typeof infoData !== 'undefined' && infoData.basic && infoData.basic.titleSettings) {
            const titleFontKey = infoData.basic.titleSettings.font;
            if (titleFontKey && titleFontKey !== 'theme' && typeof titleFonts !== 'undefined') {
                const titleFontSet = titleFonts[titleFontKey];
                if (titleFontSet && titleFontSet.googleFonts) {
                    allGoogleFonts.push(...titleFontSet.googleFonts);
                }
            }
        }
        
        // Remove duplicates and create URL
        if (allGoogleFonts.length > 0) {
            const uniqueFonts = [...new Set(allGoogleFonts)];
            const families = uniqueFonts.join('&family=');
            const googleFontsUrl = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
            return `    <link href="${googleFontsUrl}" rel="stylesheet">`;
        }
        
        return '';
    } catch (error) {
        console.error('Error generating Google Font links:', error);
        return '';
    }
}

// Helper function to find which category an item belongs to
function getCategoryForItem(itemName, worldData) {
    for (const category in worldData) {
        if (Array.isArray(worldData[category])) {
            const found = worldData[category].find(item => item.name === itemName);
            if (found) return category;
        }
    }
    return 'items'; // fallback
}

// Main HTML generation function - now uses external CSS generator
function generateHTML() {
    const generationStartedAt = performanceNow();
    // These initializers are synchronous and idempotent through the lifecycle.
    // Generation needs their populated defaults even when their tabs were never opened.
    void window.LoreFeatureLifecycle?.ensureFeature('appearance');
    void window.LoreFeatureLifecycle?.ensureFeature('customPages');
    console.log('🔄 Starting HTML generation...');
    
    // Collect the complete editable model, then render only its public projection.
    const authoringData = collectFormData();
    if (!window.LoreProjectContract) throw new Error('Lore project model is unavailable');
    const editableProject = window.LoreProjectContract.normalizeLoreProject(authoringData);
    const data = window.LoreProjectContract.createLorePublicSite(editableProject);
    window.currentLoreProject = editableProject;
    window.currentPublicSiteData = data;
    window.lastPublicProjectionSummary = window.LoreProjectContract.summarizePublicProjection(editableProject);

    // Generate Google Font links if needed (with error handling)
    let googleFontLinks = '';
    try {
        googleFontLinks = generateGoogleFontLinks();
    } catch (error) {
        console.error('Error with Google Font links:', error);
        googleFontLinks = ''; // fallback to empty string
    }

    // Add FontAwesome support
    const fontAwesomeLink = `    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">`;
    
    const rawCss = generateCSS(data);
    const rawRuntime = generateJavaScript(data);
    const css = minifyPublicCss(rawCss);
    const runtime = minifyPublicRuntime(rawRuntime);
    const html = assemblePublicDocument({
        title: escapeText(data.basic.title || 'World Information'),
        fontLinks: googleFontLinks,
        iconFontLink: fontAwesomeLink,
        css,
        header: generateHeader(data),
        navigation: generateNavigation(data),
        content: generateContent(data),
        siteNavigation: generateSiteNavigation(data),
        modals: generateModals(data),
        runtime
    });

    // Display in output
    document.getElementById('html-output').value = html;
    if (document.getElementById('preview-content-inner')?.classList.contains('active')) {
        window.updatePreview(html);
    }
    
    // Update state: HTML has been generated and data is now "clean"
    window.htmlGenerated = true;
    window.dataModified = false;
    window.LoreProjectState?.setStatus({ dirty: false, generated: true });

    window.updateQuickOpenState();
    updateSaveButtonState();

    recordPerformance('generation', performanceNow() - generationStartedAt, {
        outputCharacters: html.length,
        cssCharacters: css.length,
        runtimeCharacters: runtime.length,
        charactersSaved: (rawCss.length + rawRuntime.length) - (css.length + runtime.length)
    });

    return html;
}

// Function to update save button state
function updateSaveButtonState() {
    const saveToSitesBtn = document.getElementById('save-to-sites-btn');
    if (!saveToSitesBtn || !isLocal) {
        window.updateGitHubSyncUI?.();
        return;
    }
    
    const shouldEnable = window.htmlGenerated && !window.dataModified;
    
    saveToSitesBtn.disabled = !shouldEnable;
    
    // Update button appearance and tooltip
    if (shouldEnable) {
        saveToSitesBtn.title = 'Save Project';
        saveToSitesBtn.textContent = 'Save Project';
    } else {
        if (!window.htmlGenerated) {
            saveToSitesBtn.title = 'Create the public site before saving';
            saveToSitesBtn.textContent = 'Create Public Site First';
        } else if (window.dataModified) {
            saveToSitesBtn.title = 'Recreate the public site because project data changed';
            saveToSitesBtn.textContent = 'Recreate Public Site First';
        }
    }

    window.updateGitHubSyncUI?.();
}

// Function to mark data as modified
window.markDataAsModified = function() {
    window.LoreProjectState?.setStatus({ dirty: true, generated: false });
    if (window.htmlGenerated) {
        window.dataModified = true;
        window.currentPublicSiteData = null;
        window.lastPublicProjectionSummary = null;
        window.invalidateGitHubSyncSave?.();
        updateSaveButtonState();
    }
}

// Find the generateHeader function and update it:
function generateHeader(data) {
    const titleSettings = data.basic.titleSettings || { show: true, alignment: 'left', position: 'bottom' };
    const bannerSize = data.appearance?.bannerSize || 'large';
    const title = escapeText(data.basic.title || 'World Information');
    const subtitle = escapeText(data.basic.subtitle || '');
    const titleAlignment = escapeAttribute(titleSettings.alignment || 'left');
    const titlePosition = escapeAttribute(titleSettings.position || 'bottom');
    const bannerUrl = escapeUrl(data.basic.banner, { allowDataImage: true });
    
    // Generate banner content
    const bannerContent = bannerUrl
        ? `<img src="${bannerUrl}" alt="Banner" class="banner-image">`
        : `<div class="banner-placeholder">
               <span>${title}</span>
           </div>`;

    // Only generate title/subtitle HTML if show is true
    let titleOverlayContent = '';
    if (titleSettings.show) {
        const subtitleHTML = data.basic.subtitle 
            ? `<div class="main-subtitle">${subtitle}</div>`
            : '';
            
        titleOverlayContent = `
            <div class="title-overlay title-alignment-${titleAlignment} title-position-${titlePosition}">
                <h1 class="main-title">${title}</h1>
                ${subtitleHTML}
            </div>`;
    }

    // Generate banner navigation if location is 'banner'
    let bannerNavigationHTML = '';
    if (data.basic.customNavSettings && data.basic.customNavSettings.location === 'banner') {
        bannerNavigationHTML = generateCustomNavigationHTML(data);
    }

// HIDDEN MODE: No header at all, but show title if enabled
    if (bannerSize === 'hidden') {
        if (titleSettings.show) {
            const subtitleHTML = data.basic.subtitle 
                ? `<div class="main-subtitle">${subtitle}</div>`
                : '';
            return `
    <div class="standalone-title title-alignment-${titleAlignment}">
        <h1 class="main-title">${title}</h1>
        ${subtitleHTML}
    </div>`;
        } else {
            return ``;
        }
    }

    // SEPARATE MODE: Header outside container, then gap
    if (bannerSize === 'separate') {
        return `
    <header class="header header-separate">
        ${bannerContent}
        ${titleOverlayContent}
        ${bannerNavigationHTML}
    </header>
    <div class="header-gap"></div>`;
    }

    // NORMAL MODE: Header in its own container wrapper
    return `
    <div class="header-container">
        <header class="header">
            ${bannerContent}
            ${titleOverlayContent}
            ${bannerNavigationHTML}
        </header>
    </div>`;
}

function generateNavigation(data) {
    const includedPages = data.basic.includedPages || {};
    
    let navHTML = `
    <div class="nav-container">
        <nav class="nav-tabs">
            <button class="nav-tab active" id="overview-tab" data-page="overview" data-lore-action="show-tab">Overview</button>`;
    
    if (includedPages.world !== false) {
        navHTML += `<button class="nav-tab" id="world-tab" data-page="world" data-lore-action="show-tab">World</button>`;
    }
    if (includedPages.characters !== false) {
        navHTML += `<button class="nav-tab" id="characters-tab" data-page="characters" data-lore-action="show-tab">Characters</button>`;
    }
    if (includedPages.storylines !== false) {
        navHTML += `<button class="nav-tab" id="storylines-tab" data-page="storylines" data-lore-action="show-tab">Storylines</button>`;
    }
    if (includedPages.plans !== false) {
        navHTML += `<button class="nav-tab" id="plans-tab" data-page="plans" data-lore-action="show-tab">Plans</button>`;
    }
    if (includedPages.playlists !== false) {
        navHTML += `<button class="nav-tab" id="playlists-tab" data-page="playlists" data-lore-action="show-tab">Playlists</button>`;
    }
    
    navHTML += `
        </nav>
    </div>`;
    return navHTML;
}

function generateContent(data) {
    const includedPages = data.basic.includedPages || {};
    
    let contentHTML = generateOverviewContent(data); // Overview always included
    
    if (includedPages.world !== false) {
        contentHTML += generateWorldContent(data);
    }
    if (includedPages.characters !== false) {
        contentHTML += generateCharactersContent(data);
    }
    if (includedPages.storylines !== false) {
        contentHTML += generateStorylinesContent(data);
    }
    if (includedPages.plans !== false) {
        contentHTML += generatePlansContent(data);
    }
    if (includedPages.playlists !== false) {
        contentHTML += generatePlaylistsContent(data);
    }

    // Custom Pages Content
    // Custom Pages Content
    if (data.customPages && data.customPages.length > 0 && window.customPageTemplates) {
        data.customPages.forEach(page => {
            let pageHTML = window.customPageTemplates.generatePageHTML(page, data);
            // Make sure custom pages are hidden by default
            pageHTML = pageHTML.replace(
                `<div id="${page.name}" class="custom-page-content`,
                `<div id="${page.name}" class="custom-page-content" style="display: none"`
            );
            contentHTML += pageHTML;
        });
    }
    
    return contentHTML;
}

// Updated generateOverviewContent function with title and image support
function generateOverviewContent(data) {
    const overviewTitle = data.basic.overviewTitle || '';
    const overview = data.basic.overview || 'No overview provided for this world.';
    const overviewImage = data.basic.overviewImage || '';
    
    const formattedOverview = renderMarkdownBlocks(overview);
    
    // Generate overview links if they exist
    const overviewLinksHTML = generateOverviewLinksHTML(data);
    
    // Generate the title HTML if provided
    const titleHTML = overviewTitle ? `<h1 class="overview-title">${escapeText(overviewTitle)}</h1>` : '';
    
    // Generate the image HTML if provided
    const overviewImageUrl = escapeUrl(overviewImage, { allowDataImage: true });
    const imageHTML = overviewImageUrl ?
        `<div class="overview-image-container">
            <img src="${overviewImageUrl}" alt="Overview" class="overview-image" data-lore-action="open-image" data-image-alt="Overview Image">
        </div>` : '';
    
    return `
        <div id="overview" class="content active">
            ${overviewLinksHTML}
            <div class="overview-content">
                ${titleHTML}
                ${formattedOverview}
                ${imageHTML}
            </div>
        </div>`;
}

function generateOverviewLinksHTML(data) {
    if (!data.basic.overviewLinks || data.basic.overviewLinks.length === 0) {
        return '';
    }
    
    const validLinks = data.basic.overviewLinks.filter(link => 
        link.label && link.label.trim() && link.url && link.url.trim()
    );
    
    if (validLinks.length === 0) {
        return '';
    }
    
    const linksHTML = validLinks.map(link => {
        // Use custom colors if provided, otherwise use default styling
        const backgroundColor = sanitizeCssColor(link.color, '#B1B695');
        const fontColor = sanitizeCssColor(link.fontColor, '#ffffff');
        const customStyle = (link.color && link.color.trim()) || (link.fontColor && link.fontColor.trim())
            ? `style="--custom-bg: ${backgroundColor}; background-color: var(--custom-bg); color: ${fontColor};"`
            : '';
        
        return `<a href="${escapeUrl(link.url, { fallback: '#' })}" class="overview-link-btn" ${customStyle}>${escapeText(link.label)}</a>`;
    }).join('\n            ');
    
    return `
        <div class="overview-links-container">
            ${linksHTML}
        </div>`;
}

// Generate Custom Navigation HTML
function generateCustomNavigationHTML(data) {
    const customNavSettings = data.basic.customNavSettings;
    const customNavLinks = data.basic.customNavLinks;
    
    if (!customNavSettings || !customNavSettings.location || !customNavLinks || customNavLinks.length === 0) {
        return '';
    }
    
    const validLinks = customNavLinks.filter(link => 
        link.label && link.label.trim() && link.url && link.url.trim()
    );
    
    if (validLinks.length === 0) {
        return '';
    }
    
    const { location } = customNavSettings;
    
    // Generate the buttons HTML
    const linksHTML = validLinks.map(link => {
        const backgroundColor = sanitizeCssColor(link.color, '#B1B695');
        const fontColor = sanitizeCssColor(link.fontColor, '#ffffff');
        const customStyle = (link.color && link.color.trim()) || (link.fontColor && link.fontColor.trim())
            ? `style="background-color: ${backgroundColor}; color: ${fontColor};"`
            : '';
        
        return `<a href="${escapeUrl(link.url, { fallback: '#' })}" class="custom-nav-btn" ${customStyle}>${escapeText(link.label)}</a>`;
    }).join('\n            ');
    
    // Return HTML with appropriate container class
    const containerClass = `custom-nav-container ${escapeAttribute(location)}-nav`;
    
    return `
        <div class="${containerClass}">
            ${linksHTML}
        </div>`;
}

function generateSiteNavigation(data) {
    const customNavSettings = data.basic.customNavSettings;
    
    if (!customNavSettings || !customNavSettings.location) {
        return '';
    }
    
    // Only generate for site-left and site-right locations
    if (customNavSettings.location === 'site-left' || customNavSettings.location === 'site-right') {
        return generateCustomNavigationHTML(data);
    }
    
    return '';
}

// Helper function to filter out hidden tags (starting with "!")
function getVisibleTags(tags) {
    if (!Array.isArray(tags)) return [];
    return tags.filter(tag => !tag.startsWith('!'));
}

// Helper function to strip "!" prefix and color syntax for filtering comparisons
function stripHiddenPrefix(tag) {
    let cleaned = tag.startsWith('!') ? tag.substring(1) : tag;
    // Strip color syntax for filtering (now handles up to 3 colors separated by spaces)
    cleaned = cleaned.replace(/\\(#[0-9A-Fa-f]{6}(?:\\s+#[0-9A-Fa-f]{6})?(?:\\s+#[0-9A-Fa-f]{6})?\\)$/, '');
    return cleaned;
}

// Parse tag with color syntax: tagname(#color) or tagname(#bgcolor #textcolor) or tagname(#bgcolor #textcolor #hovercolor)
function parseTagWithColor(tag) {
    // First strip the hidden prefix if it exists
    const isHidden = tag.startsWith('!');
    const cleanTag = isHidden ? tag.substring(1) : tag;
    
    // Check for color syntax - now supports 3 colors separated by spaces
    const colorMatch = cleanTag.match(/^(.+?)\((#[0-9A-Fa-f]{6})(?:\s+(#[0-9A-Fa-f]{6}))?(?:\s+(#[0-9A-Fa-f]{6}))?\)$/);
    if (colorMatch) {
        return { 
            name: colorMatch[1], 
            bgColor: colorMatch[2],
            textColor: colorMatch[3] || null,
            hoverColor: colorMatch[4] || null,
            isHidden: isHidden
        };
    }
    return { 
        name: cleanTag, 
        bgColor: null,
        textColor: null,
        hoverColor: null,
        isHidden: isHidden
    };
}

// Calculate contrasting text color (black or white) for a given background color
function getContrastingTextColor(hexColor) {
    // Remove # if present
    const hex = hexColor.replace('#', '');
    
    // Convert to RGB
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Calculate relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return black for light backgrounds, white for dark backgrounds
    return luminance > 0.5 ? '#000000' : '#ffffff';
}

// Generate Plans content with Sub-Arcs support
function generatePlansContent(data) {
    return generatePlansContentWithTimeline(data);
}

function generateModals(data) {
    let modalsHTML = '';
    
    // Character modals - EXCLUDE NOTES FROM VISIBLE HTML but INCLUDE TAGS
    if (data.characters && data.characters.length > 0) {
        data.characters.forEach((character, index) => {
            modalsHTML += generateCharacterModal(character, index, data);
        });
    }
    
    // Plan modals with Sub-Arcs
    if (data.plans && data.plans.length > 0) {
        data.plans.forEach((plan, index) => {
            modalsHTML += generatePlanModal(plan, index, data);
        });
    }
    
    // Image modal
    modalsHTML += `
        <div id="imageModal" class="image-modal">
            <span class="image-close" data-lore-action="close-image">&times;</span>
            <div class="image-modal-content">
                <img id="modalImage" src="" alt="">
                <button class="image-nav image-prev" data-lore-action="previous-image" title="Previous image">&lt;</button>
                <button class="image-nav image-next" data-lore-action="next-image" title="Next image">&gt;</button>
            </div>
            <div class="image-counter" id="imageCounter"></div>
        </div>`;
    
    return modalsHTML;
}

function generateCharacterModal(character, index, data = {}) {
    const mainImage = character.image 
        ? `<div class="character-main-image">
               <img src="${character.image}" alt="${character.name}">
           </div>`
        : `<div class="character-main-image">No Image</div>`;

    // Check if Info-Display should be shown (default false)- Check both global AND per-character settings
    const globalShowInfoDisplay = data.charactersOptions?.showInfoDisplay ?? false;
    const characterShowInfoDisplay = character.showInfoDisplay !== false; // default true
    const showInfoDisplay = globalShowInfoDisplay && characterShowInfoDisplay; // BOTH must be true

    // Determine if this character should use Info-Display
    // (must have at least location, faction, or items with icons, in addition to the option being enabled)
    let useInfoDisplay = false;
    let itemsWithIcons = [];
    let hasFaction = false;
    let hasLocation = false;
    let skillsWithIcons = [];

    if (showInfoDisplay) {
        // Check for location
        hasLocation = character.location && character.location.trim() !== '';
        
        // Check for faction
        hasFaction = character.faction && character.faction.trim() !== '';
        
        // Check for items with icons
        if (character.items && character.items.length > 0 && data.world) {
            character.items.forEach(itemName => {
                Object.values(data.world).forEach(categoryArray => {
                    if (Array.isArray(categoryArray)) {
                        const foundItem = categoryArray.find(item => item.name === itemName);
                        if (foundItem && foundItem.icon) {
                            itemsWithIcons.push(foundItem);
                        }
                    }
                });
            });
        }

        if (character.skills && character.skills.length > 0 && data.world) {
            character.skills.forEach(skillName => {
                if (data.world.magic && Array.isArray(data.world.magic)) {
                    const foundMagic = data.world.magic.find(item => item.name === skillName);
                    if (foundMagic && foundMagic.icon) {
                        skillsWithIcons.push({ ...foundMagic, category: 'magic' });
                    }
                }
                
                if (data.world.cultivation && Array.isArray(data.world.cultivation)) {
                    const foundCultivation = data.world.cultivation.find(item => item.name === skillName);
                    if (foundCultivation && foundCultivation.icon) {
                        skillsWithIcons.push({ ...foundCultivation, category: 'cultivation' });
                    }
                }
            });
        }
        
        // Use Info-Display if character has location, faction, OR items with icons
        useInfoDisplay = hasLocation || hasFaction || itemsWithIcons.length > 0 || skillsWithIcons.length > 0;
    }
    
    // Generate Info-Display section
    let infoDisplayHTML = '';
    if (useInfoDisplay) {
        infoDisplayHTML = '<div class="character-info-display">';
        // Name (use fullName if available, otherwise use name)
        const displayName = character.fullName || character.name;
        infoDisplayHTML += `<div class="info-display-header"><span class="character-display-name">${displayName}</span></div>`;
        
        // Two-column layout for content
        infoDisplayHTML += '<div class="info-display-content-grid">';
        
        // LEFT COLUMN - Basic info
        infoDisplayHTML += '<div class="info-display-left">';
        
        // Title (only if it exists)
        if (character.title && character.title.trim()) {
            infoDisplayHTML += `
                <div class="info-display-row">
                    <span class="info-display-value character-display-name">${character.title}</span>
                </div>`;
        }

        // Get custom labels or use defaults
        const labels = data.charactersOptions?.infoDisplayLabels || {};
        const ageLabel = labels.age || 'Age';
        const originLabel = labels.origin || 'Origin';
        const factionLabel = labels.faction || 'Faction';
        const itemsLabel = labels.items || 'Special Items';
        
        // Age (only if it exists)
        if (character.age && character.age.trim()) {
            infoDisplayHTML += `
                <div class="info-display-row">
                    <span class="info-display-label">${ageLabel}:</span>
                    <span class="info-display-value">${character.age}</span>
                </div>`;
        }
        
        // Origin/Location (only if assigned)
        if (hasLocation) {
            let locationId = '';
            if (data.world && data.world.locations) {
                const locationEntry = data.world.locations.find(l => l.name === character.location);
                if (locationEntry) {
                    locationId = locationEntry.id || `locations_${character.location.toLowerCase().replace(/\s+/g, '-')}`;
                }
            }
            
            infoDisplayHTML += `
                <div class="info-display-row">
                    <span class="info-display-label">${originLabel}:</span>
                    <span class="info-display-value">
                        <a href="#" class="info-display-link" data-lore-action="scroll-world-item" data-world-item-id="${escapeAttribute(locationId)}">${character.location}</a>
                    </span>
                </div>`;
        }
        
        // Faction (only if assigned)
        if (hasFaction) {
            let factionId = '';
            if (data.world && data.world.factions) {
                const factionEntry = data.world.factions.find(f => f.name === character.faction);
                if (factionEntry) {
                    factionId = factionEntry.id || `factions_${character.faction.toLowerCase().replace(/\s+/g, '-')}`;
                }
            }
            
            infoDisplayHTML += `
                <div class="info-display-row">
                    <span class="info-display-label">${factionLabel}:</span>
                    <span class="info-display-value">
                        <a href="#" class="info-display-link" data-lore-action="scroll-world-item" data-world-item-id="${escapeAttribute(factionId)}">${character.faction}</a>
                    </span>
                </div>`;
        }
        
// Special Items section (if exist)
        if (itemsWithIcons.length > 0) {
            infoDisplayHTML += `
                <div class="info-display-row info-display-items">
                    <span class="info-display-label">${itemsLabel}:</span>
                    <button class="icons-carousel-nav prev ${itemsWithIcons.length > 4 ? 'visible' : ''}" 
                            data-lore-action="scroll-icons" data-direction="prev" data-carousel-type="items" data-character-index="${index}"
                            type="button">‹</button>
                    <div class="info-display-icons" data-carousel-id="items-${index}">`;
            
            // Show ALL items, no slicing
            itemsWithIcons.forEach(item => {
                let iconHTML = '';
                let outerBorderRadius = '0';
                
                if (item.icon.type === 'custom') {
                    iconHTML = `<img src="${item.icon.image}" alt="${item.name}" style="width: 28px; height: 28px; object-fit: contain;">`;
                } else if (item.icon.type === 'builder') {
                    const iconPath = `assets/world/items/icons/${item.id}.png`;
                    let borderCSS = 'none';
                    if (item.icon.borderStyle === 'thin') {
                        borderCSS = `2px solid ${item.icon.borderColor}`;
                    } else if (item.icon.borderStyle === 'thick') {
                        borderCSS = `4px solid ${item.icon.borderColor}`;
                    }
                    const borderRadius = item.icon.shape === 'circle' ? '50%' : '0';
                    outerBorderRadius = borderRadius;
                    
                    iconHTML = `
                        <div style="
                            width: 100%;
                            height: 100%;
                            background-color: ${item.icon.bgColor};
                            border: ${borderCSS};
                            border-radius: ${borderRadius};
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            box-sizing: border-box;
                        ">
                            <img src="${iconPath}" alt="${item.name}" style="width: 26px; height: 26px; image-rendering: pixelated;">
                        </div>`;
                }
                
                const itemDomId = item.id || `${getCategoryForItem(item.name, data.world)}_${item.name.toLowerCase().replace(/\s+/g, '-')}`;
                
                infoDisplayHTML += `
                    <div class="item-tooltip-container" data-tooltip="${item.name}">
                        <div class="info-display-icon" 
                            style="border-radius: ${outerBorderRadius};"
                            data-item-id="${escapeAttribute(itemDomId)}"
                            data-lore-action="scroll-world-item" data-world-item-id="${escapeAttribute(itemDomId)}">
                            ${iconHTML}
                        </div>
                    </div>`;
            });
            
            infoDisplayHTML += `
                    </div>
                    <button class="icons-carousel-nav next ${itemsWithIcons.length > 4 ? 'visible' : ''}" 
                            data-lore-action="scroll-icons" data-direction="next" data-carousel-type="items" data-character-index="${index}"
                            type="button">›</button>
                </div>`;
        }
        
        infoDisplayHTML += '</div>'; // Close left column
        
        // RIGHT COLUMN - Stats and Skills container
        infoDisplayHTML += '<div class="info-display-right">';
        
        // Stats display (if stats exist)
        if (character.stats && character.stats.entries && character.stats.entries.length > 0) {
            infoDisplayHTML += '<div class="info-display-stats">';
            
            character.stats.entries.forEach(stat => {
                const percentage = (stat.value / character.stats.range) * 100;
                infoDisplayHTML += `
                    <div class="stat-display-row">
                        <div class="stat-label">${stat.label}</div>
                        <div class="stat-bar-container">
                            <div class="stat-bar" style="width: ${percentage}%"></div>
                        </div>
                    </div>`;
            });
            
            infoDisplayHTML += '</div>'; // Close stats
        }
        
        // Skills section at bottom (if exist)
        if (skillsWithIcons.length > 0) {
            const maxVisibleIcons = 5;
            const visibleSkills = skillsWithIcons.slice(0, maxVisibleIcons);
            const remainingCount = skillsWithIcons.length - maxVisibleIcons;
            
            infoDisplayHTML += '<div class="info-display-skills-container">';
            infoDisplayHTML += '<div class="info-display-skills-icons">';
            
            visibleSkills.forEach(skill => {
                let iconHTML = '';
                let outerBorderRadius = '0';
                
                if (skill.icon.type === 'custom') {
                    iconHTML = `
                        <div style="
                            width: 100%;
                            height: 100%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        ">
                            <img src="${skill.icon.image}" alt="${skill.name}" style="width: 34px; height: 34px; object-fit: contain;">
                        </div>`;
                } else if (skill.icon.type === 'builder') {
                    const iconPath = `assets/world/${skill.category}/icons/${skill.id}.png`;
                    let borderCSS = 'none';
                    if (skill.icon.borderStyle === 'thin') {
                        borderCSS = `2px solid ${skill.icon.borderColor}`;
                    } else if (skill.icon.borderStyle === 'thick') {
                        borderCSS = `4px solid ${skill.icon.borderColor}`;
                    }
                    const borderRadius = skill.icon.shape === 'circle' ? '50%' : '0';
                    outerBorderRadius = borderRadius;
                    
                    iconHTML = `
                        <div style="
                            width: 100%;
                            height: 100%;
                            background-color: ${skill.icon.bgColor};
                            border: ${borderCSS};
                            border-radius: ${borderRadius};
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            box-sizing: border-box;
                        ">
                            <img src="${iconPath}" alt="${skill.name}" style="width: 30px; height: 30px; image-rendering: pixelated;">
                        </div>`;
                }
                
                const skillDomId = skill.id || `${skill.category}_${skill.name.toLowerCase().replace(/\s+/g, '-')}`;
                
                infoDisplayHTML += `
                    <div class="skills-tooltip-container" data-tooltip="${skill.name}">
                        <div class="info-display-skills-icon" 
                            style="border-radius: ${outerBorderRadius};"
                            data-item-id="${escapeAttribute(skillDomId)}"
                            data-lore-action="scroll-world-item" data-world-item-id="${escapeAttribute(skillDomId)}">
                            <span class="icon-corners-wrapper">${iconHTML}</span>
                        </div>
                    </div>`;
            });
            
            infoDisplayHTML += '</div>'; // Close icons
            infoDisplayHTML += '</div>'; // Close skills container
        }
        
        infoDisplayHTML += '</div>'; // Close right column
        infoDisplayHTML += '</div>'; // Close content grid
        infoDisplayHTML += '</div>'; // Close character-info-display
    }
    // Build the modal HTML
    let modalHTML = `
        <div id="characterModal${index}" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">${character.name}</h2>
                    <span class="close" data-lore-action="close-character-modal" data-index="${index}">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="character-modal-grid">
                        <div class="character-header-section">
                            <div class="character-image-area">
                                ${mainImage}
                            </div>`;
    
    // Add either Info-Display or Basic Info in header
    if (useInfoDisplay) {
        modalHTML += `
                            ${infoDisplayHTML}`;
    } else {
        // Default: Basic Info in header
        modalHTML += `
                            <div class="character-basic-info">`;
        if (character.basic) {
            modalHTML += `
                                <div class="info-section">
                                    <div class="info-title">Basic Information</div>
                                    <div class="info-content">${parseMarkdown(character.basic)}</div>
                                </div>`;
        }
        modalHTML += `
                            </div>`;
    }
    
    modalHTML += `
                        </div>
                        <div class="character-detailed-sections">
                            <div class="character-info">`;
    
    // If using Info-Display, Basic Info goes here in detailed sections
    if (useInfoDisplay && character.basic) {
        modalHTML += `
                                <div class="info-section">
                                    <div class="info-title">Basic Information</div>
                                    <div class="info-content">${parseMarkdown(character.basic)}</div>
                                </div>`;
    }
    
    // Rest of the sections (same as before)
    if (character.physical) {
        modalHTML += `
                                <div class="info-section">
                                    <div class="info-title">Physical Description</div>
                                    <div class="info-content">${parseMarkdown(character.physical)}</div>
                                </div>`;
    }
    
    if (character.personality) {
        modalHTML += `
                                <div class="info-section">
                                    <div class="info-title">Personality</div>
                                    <div class="info-content">${parseMarkdown(character.personality)}</div>
                                </div>`;
    }
    
    if (character.sexuality) {
        modalHTML += `
                                <div class="info-section">
                                    <div class="info-title">Sexuality</div>
                                    <div class="info-content">${parseMarkdown(character.sexuality)}</div>
                                </div>`;
    }
    
    if (character.fightingStyle) {
        modalHTML += `
                                <div class="info-section">
                                    <div class="info-title">Fighting Style</div>
                                    <div class="info-content">${parseMarkdown(character.fightingStyle)}</div>
                                </div>`;
    }
    
    if (character.background) {
        modalHTML += `
                                <div class="info-section">
                                    <div class="info-title">Background</div>
                                    <div class="info-content">${parseMarkdown(character.background)}</div>
                                </div>`;
    }
    
    if (character.equipment) {
        modalHTML += `
                                <div class="info-section">
                                    <div class="info-title">Weapons/Armor/Equipment</div>
                                    <div class="info-content">${parseMarkdown(character.equipment)}</div>
                                </div>`;
    }
    
    if (character.hobbies) {
        modalHTML += `
                                <div class="info-section">
                                    <div class="info-title">Hobbies/Pastimes</div>
                                    <div class="info-content">${parseMarkdown(character.hobbies)}</div>
                                </div>`;
    }
    
    if (character.quirks) {
        modalHTML += `
                                <div class="info-section">
                                    <div class="info-title">Quirks/Mannerisms</div>
                                    <div class="info-content">${parseMarkdown(character.quirks)}</div>
                                </div>`;
    }
    
    if (character.relationships) {
        modalHTML += `
                                <div class="info-section">
                                    <div class="info-title">Relationships</div>
                                    <div class="info-content">${parseMarkdown(character.relationships)}</div>
                                </div>`;
    }
    
    modalHTML += `
                            </div>
                        </div>
                    </div>`;
    
    // Add gallery if there are gallery images
    if (character.gallery && character.gallery.length > 0) {
        modalHTML += `
                    <div class="character-gallery" data-character-index="${index}">
                        <div class="gallery-title">Gallery</div>`;
        
        character.gallery.forEach((imagePath, imgIndex) => {
            modalHTML += `<img src="${imagePath}" alt="Gallery image" class="gallery-image" data-lore-action="open-character-gallery-image" data-image-index="${imgIndex}">`;
        });
        
        modalHTML += `</div>`;
    }
    
    modalHTML += `
                </div>
            </div>
        </div>`;
    
    return modalHTML;
}

// Generate Plan Modal with Sub-Arcs and Collapsible Notes
function generatePlanModal(plan, index, data = {}) {
    let characterTagsDisplay = '<span style="color: #999; font-style: italic;">No characters tagged</span>';
    if (plan.characterTags && plan.characterTags.length > 0) {
        const visibleCharacterTags = getVisibleTags(plan.characterTags);
        if (visibleCharacterTags.length > 0) {
            characterTagsDisplay = visibleCharacterTags.map(tag => `<span class="character-tag">${tag}</span>`).join('');
        }
    }
    
    let modalHTML = `
        <div id="planModal${index}" class="modal">
            <div class="modal-content plan-modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">${plan.title}${plan.type && plan.type !== '' ? `<span class="arc-type-badge" style="background-color: ${plan.color || '#3498db'}">${getArcTypeDisplay(plan.type)}</span>` : ''}</h2>
                    <span class="close" data-lore-action="close-plan-modal" data-index="${index}">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="plan-character-tags" style="margin-bottom: 15px;">
                        <strong>Characters:</strong> ${characterTagsDisplay}
                    </div>
                    
                    <div class="plan-overview" style="margin-bottom: 20px;">
                        <strong>Overview:</strong><br>
                        ${parseMarkdown(plan.overview || 'No overview provided.')}
                    </div>`;
    
    // Add main events list if there are any
    if (plan.events && plan.events.length > 0) {
        const visibleMainEvents = plan.events.filter(event => event.visible !== false);
        
        if (visibleMainEvents.length > 0) {
            modalHTML += `
                    <div class="plan-events-list">
                        <h3 class="plan-events-title">Main Events</h3>`;
            
            visibleMainEvents.forEach((event, eventIndex) => {
                modalHTML += generatePlanEvent(event, eventIndex, data.storylines || [], 'main', index);
            });
            
            modalHTML += `</div>`;
        }
    }
    
    // Add sub-arcs list if there are any
    if (plan.subArcs && plan.subArcs.length > 0) {
        const visibleSubArcs = plan.subArcs.filter(subArc => subArc.visible !== false);
        
        if (visibleSubArcs.length > 0) {
            modalHTML += `
                    <div class="plan-subarcs-list">
                        <h3 class="plan-subarcs-title">Sub-Arcs</h3>`;
            
            visibleSubArcs.forEach((subArc, subArcIndex) => {
                modalHTML += generatePlanSubArc(subArc, subArcIndex, index, data);
            });
            
            modalHTML += `</div>`;
        }
    }
    
    modalHTML += `
                </div>
            </div>
        </div>`;
    
    return modalHTML;
}

// Generate Plan Sub-Arc with collapsible events
function generatePlanSubArc(subArc, subArcIndex, planIndex, data) {
    let characterTagsDisplay = '';
    if (subArc.characterTags && subArc.characterTags.length > 0) {
        const visibleCharacterTags = getVisibleTags(subArc.characterTags);
        if (visibleCharacterTags.length > 0) {
            const characterTags = visibleCharacterTags.map(tag => `<span class="character-tag">${tag}</span>`).join('');
            characterTagsDisplay = `Characters: ${characterTags}`;
        }
    }
    
    let subArcHTML = `
        <div class="plan-subarc ${subArc.visible === false ? 'hidden-subarc' : ''}">
            <div class="plan-subarc-header" data-lore-action="toggle-sub-arc" data-plan-index="${planIndex}" data-sub-arc-index="${subArcIndex}">
                <div class="plan-subarc-header-left">
                    <div class="plan-subarc-title">${subArc.title || 'Untitled Sub-Arc'}${subArc.type && subArc.type !== '' ? `<span class="subarc-type-badge" style="background-color: ${subArc.color}">${getArcTypeDisplay(subArc.type)}</span>` : ''}</div>
                    <div class="plan-subarc-description">${subArc.description || ''}</div>
                    <div class="plan-subarc-character-tags">${characterTagsDisplay}</div>
                </div>
                <span class="plan-subarc-toggle">▶</span>
            </div>
            <div class="plan-subarc-content collapsed">
                <div class="plan-subarc-events">`;
    
    // Add sub-arc events
    if (subArc.events && subArc.events.length > 0) {
        const visibleEvents = subArc.events.filter(event => event.visible !== false);
        
        if (visibleEvents.length > 0) {
            const storylinesData = data?.storylines || [];
            visibleEvents.forEach((event, eventIndex) => {
                subArcHTML += generatePlanEvent(event, eventIndex, storylinesData, `subarc-${subArcIndex}`, planIndex);
            });
        } else {
            subArcHTML += `<div style="color: #999; font-style: italic; text-align: center; padding: 20px;">All events are hidden</div>`;
        }
    } else {
        subArcHTML += `<div style="color: #999; font-style: italic; text-align: center; padding: 20px;">No events in this sub-arc</div>`;
    }
    
    subArcHTML += `
                </div>
            </div>
        </div>`;
    
    return subArcHTML;
}

// Move timing from header to bottom section alongside Notes
// generatePlanEvent function with working storyline links
function generatePlanEvent(event, eventIndex, storylinesData = [], context = 'main', planIndex = 0) {
    const eventClass = event.visible === false ? 'plan-event hidden-event' : 'plan-event';
    const hasNotes = event.notes && event.notes.trim();
    const hasTiming = event.timing && (typeof event.timing === 'string' ? event.timing.trim() : event.timing.date);
    const hasSubevents = event.subevents && event.subevents.length > 0;
    
    // Character tags display - show only visible tags
    let characterTagsDisplay = '';
    if (event.characterTags && event.characterTags.length > 0) {
        const visibleCharacterTags = getVisibleTags(event.characterTags);
        if (visibleCharacterTags.length > 0) {
            const characterTags = visibleCharacterTags.map(tag => `<span class="character-tag">${tag}</span>`).join('');
            characterTagsDisplay = `<div class="plan-event-characters"><span class="characters-label">Characters:</span> ${characterTags}</div>`;
        }
    }
    
    // Storylines display with proper link generation
    let storylinesDisplay = '';
    if (event.storylineLinks && event.storylineLinks.length > 0) {
        const storylineLinks = event.storylineLinks
            .filter(storylineTitle => storylineTitle && storylineTitle.trim())
            .map(storylineTitle => {
                const storyline = storylinesData.find(s => s.title === storylineTitle);
                if (storyline && storyline.link) {
                    // Use the same logic as storyline cards
                    let finalLink = '';
                    if (storyline.isProjectLink) {
                        finalLink = `roleplays/${storyline.link}`;
                    } else {
                        finalLink = storyline.link;
                    }
                    const safeLink = escapeUrl(finalLink);
                    return safeLink
                        ? `<a class="plan-storyline-link" href="${safeLink}" title="Open storyline">${storyline.title}</a>`
                        : `<span class="plan-storyline-link-inactive" title="Invalid link">${storyline.title}</span>`;
                } else if (storyline) {
                    // Storyline exists but has no link
                    return `<span class="plan-storyline-link-inactive" title="No link available">${storyline.title}</span>`;
                } else {
                    // Storyline not found
                    return `<span class="plan-storyline-link-inactive" title="Storyline not found">${storylineTitle}</span>`;
                }
            })
            .join('');
        
        if (storylineLinks) {
            storylinesDisplay = `<div class="plan-event-storylines">Storylines: ${storylineLinks}</div>`;
        }
    }
    
    // Subevents display with visible character tags only
    let subeventsDisplay = '';
    if (hasSubevents) {
        const uniqueId = `p${planIndex}-${context}-e${eventIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        subeventsDisplay = `
            <div class="plan-event-subevents">
                <div class="plan-event-subevents-toggle" data-lore-action="toggle-event-subevents" data-event-id="${escapeAttribute(uniqueId)}">
                    <span class="plan-event-subevents-toggle-icon" id="subevents-toggle-${uniqueId}">▶</span>
                    Character Moments (${event.subevents.length})
                </div>
                <div class="plan-event-subevents-content collapsed" id="subevents-content-${uniqueId}">`;
        
        event.subevents.forEach((subevent, subIndex) => {
            let subeventCharTags = '<span class="no-tags">No characters</span>';
            if (subevent.characterTags && subevent.characterTags.length > 0) {
                const visibleSubeventTags = getVisibleTags(subevent.characterTags);
                if (visibleSubeventTags.length > 0) {
                    subeventCharTags = visibleSubeventTags.map(tag => `<span class="character-tag small">${tag}</span>`).join(' ');
                }
            }
            
            subeventsDisplay += `
                <div class="plan-subevent-item">
                    <div class="subevent-description">${subevent.description || 'Untitled moment'}</div>
                    <div class="subevent-character-tags">${subeventCharTags}</div>
                </div>`;
        });
        
        subeventsDisplay += `
                </div>
            </div>`;
    }
    
    const seasonalBg = typeof setSeasonalBackgroundForPlanEvent === 'function' 
        ? setSeasonalBackgroundForPlanEvent(event) 
        : '';
    
    return `
        <div class="${eventClass}" ${seasonalBg}>
            <div class="plan-event-header">
                <span class="plan-event-type ${event.type || 'none'}">${event.type || 'none'}</span>
                <div class="plan-event-title">${event.title || 'Untitled Event'}</div>
            </div>
            ${characterTagsDisplay}
            ${storylinesDisplay}
            ${subeventsDisplay}
            <div class="plan-event-bottom">
                ${hasNotes ? `
                    <div class="plan-event-notes-toggle" data-lore-action="toggle-event-notes">
                        <span class="plan-event-notes-toggle-icon">▶</span>
                        Notes
                    </div>
                ` : ''}
                ${hasTiming ? `<div class="plan-event-timing">${formatEventTiming(event.timing)}</div>` : ''}
            </div>
            ${hasNotes ? `
                <div class="plan-event-notes collapsed">
                    <div class="plan-event-notes-content">${parseMarkdown(event.notes)}</div>
                </div>
            ` : ''}
        </div>`;
}

function toggleEventSubevents(eventIndex) {
    const content = document.getElementById(`subevents-content-${eventIndex}`);
    const toggle = document.getElementById(`subevents-toggle-${eventIndex}`);
    
    if (content && toggle) {
        if (content.classList.contains('collapsed')) {
            content.classList.remove('collapsed');
            toggle.innerHTML = '&#9660;';
        } else {
            content.classList.add('collapsed');
            toggle.innerHTML = '&#9654;';
        }
    }
}

// Make sure the function is globally available
if (typeof window !== 'undefined') {
    window.toggleEventSubevents = toggleEventSubevents;
}

function setSeasonalBackgroundForPlanEvent(event) {
    // Try to extract date from various timing formats
    let month = null;
    let day = null;
    let timeSystemId = 'default';
    
    // Check if event has parsedTiming (from timeline)
    if (event.parsedTiming?.month !== undefined && event.parsedTiming?.month !== null) {
        month = event.parsedTiming.month;
        day = event.parsedTiming.day || 1;
    } 
    // Check if event has new structured timing format
    else if (event.timing && typeof event.timing === 'object' && event.timing.date) {
        month = event.timing.date.month;
        day = event.timing.date.day || 1;
        timeSystemId = event.timing.timeSystemId || 'default';
    }
    // Check if event has legacy string timing
    else if (event.timing && typeof event.timing === 'string') {
        const timing = event.timing;
        
        // Try to match number patterns like "Month 3" or "Day 15 Month 3"
        const monthMatch = timing.match(/month\s+(\d+)|(\d+)\s*(?:st|nd|rd|th)?\s*month/i);
        if (monthMatch) {
            month = parseInt(monthMatch[1] || monthMatch[2]) - 1; // Convert to 0-indexed
        }
        
        const dayMatch = timing.match(/day\s+(\d+)|(\d+)\s*(?:st|nd|rd|th)?\s*day/i);
        if (dayMatch) {
            day = parseInt(dayMatch[1] || dayMatch[2]);
        }
    }
    
    // If we have a month, find which season it belongs to
    if (month !== null) {
        const timeSystem = getTimeSystemById(timeSystemId);
        
        if (timeSystem && timeSystem.seasons && timeSystem.seasons.length > 0) {
            const seasonColor = getSeasonColorForDate(month, day || 1, timeSystem);
            if (seasonColor) {
                return `style="--seasonal-bg: ${seasonColor}"`;
            }
        }
    }
    
    // Fallback to default container background
    const colors = getColorScheme();
    return `style="--seasonal-bg: ${colors.containerBg}"`;
}

// Helper function to determine which season a date falls into
function getSeasonColorForDate(month, day, timeSystem) {
    return window.LoreDomainHelpers.getSeasonColorForDate(month, day, timeSystem);
}

function generateJavaScript(data) {
    const appearanceToEmbed = data.appearance || {
        overviewStyle: 'journal',     
        navigationStyle: 'journal', 
        colorScheme: 'current',
        fontSet: 'serif',
        containerStyle: 'left-border',
        subcontainerStyle: 'soft-bg',
        infodisplayStyle: 'default'
    };
    
    const fullDataToEmbed = data;
    const serializeForHtml = window.LoreProjectContract?.serializeJsonForHtml || JSON.stringify;
    const featureRuntime = assembleRuntimeFragments([
        generateStorylinesJavaScript(),
        generateTimelineJavaScript(),
        generateTimelineFilteringJavaScript(),
        generatePlanFilteringJavaScript(),
        generatePlaylistJavaScript(),
        generateCharactersFilteringJavaScript(),
        generateWorldFilteringJavascript(),
        generateWorldImageJavascript(),
        generateGlobalFilterJavaScript()
    ]);
    
    return `
        <script>
            var charactersData = ${serializeForHtml(data.characters)};
            var plansData = ${serializeForHtml(data.plans)};
            var appearanceData = ${serializeForHtml(appearanceToEmbed)};
            var fullInfoData = ${serializeForHtml(fullDataToEmbed)};
            
            // Image modal cycling functionality
            let currentImages = [];
            let currentImageIndex = 0;
            let currentImageContext = '';
            
            // Developer console commands for hidden items
            let devMode = false;
            
            // Compact character filtering state
            let selectedCharacterTags = new Set();
            let characterFilterMode = 'any'; // 'any' or 'all'
            let currentSearchFilter = '';

            function stripHiddenPrefix(tag) {
                let cleaned = tag.startsWith('!') ? tag.substring(1) : tag;
                // Strip color syntax for filtering (now handles up to 3 colors separated by spaces)
                cleaned = cleaned.replace(/\\(#[0-9A-Fa-f]{6}(?:\\s+#[0-9A-Fa-f]{6})?(?:\\s+#[0-9A-Fa-f]{6})?\\)$/, '');
                return cleaned;
            }
            
            // Hidden items console functions for the generated HTML
            window.showHidden = function() {
                if (!fullInfoData || !fullInfoData.world) {
                    console.error('âš ï¸ No world data available');
                    return 0;
                }
                
                let count = 0;
                const worldItems = document.querySelectorAll('.world-item');
                
                // This is just for visual feedback in generated HTML
                // The actual data modification would require regenerating
                console.log('â„¹ï¸ showHidden() in generated HTML is read-only');
                console.log('To actually modify hidden status, use the converter interface');
                
                return count;
            };
            
            window.listHidden = function() {
                if (!fullInfoData || !fullInfoData.world) {
                    console.error('âš ï¸ No world data available');
                    return [];
                }
                
                const hiddenItems = [];
                
                Object.keys(fullInfoData.world).forEach(category => {
                    if (Array.isArray(fullInfoData.world[category])) {
                        fullInfoData.world[category].forEach(item => {
                            if (item.hidden) {
                                hiddenItems.push({
                                    name: item.name,
                                    category: category,
                                    type: item.category || item.type || 'Unknown'
                                });
                            }
                        });
                    }
                });
                
                if (hiddenItems.length === 0) {
                    console.log('âœ… No hidden items found');
                    return [];
                }
                
                console.log(\`ðŸ™ˆ Found \${hiddenItems.length} hidden item(s):\`);
                console.table(hiddenItems);
                
                console.log('\\nðŸ’¡ These items are hidden from this page but preserved in the data.');
                console.log('To modify hidden status, use the converter interface and regenerate.');
                
                return hiddenItems;
            };
            
            window.hideItem = function(itemName) {
                console.log('â„¹ï¸ hideItem() in generated HTML is read-only');
                console.log('To hide items, use the converter interface and regenerate the HTML');
                if (itemName) {
                    console.log(\`Searched for: "\${itemName}"\`);
                }
                return false;
            };
            
            window.showItem = function(itemName) {
                console.log('â„¹ï¸ showItem() in generated HTML is read-only');
                console.log('To show items, use the converter interface and regenerate the HTML');
                if (itemName) {
                    console.log(\`Searched for: "\${itemName}"\`);
                }
                return false;
            };
            
            window.hideCategory = function(categoryName) {
                console.log('â„¹ï¸ hideCategory() in generated HTML is read-only');
                console.log('To hide categories, use the converter interface and regenerate the HTML');
                if (categoryName) {
                    console.log(\`Category: "\${categoryName}"\`);
                }
                return false;
            };
            
            window.showCategory = function(categoryName) {
                console.log('â„¹ï¸ showCategory() in generated HTML is read-only');
                console.log('To show categories, use the converter interface and regenerate the HTML');
                if (categoryName) {
                    console.log(\`Category: "\${categoryName}"\`);
                }
                return false;
            };
            
            window.debugHiddenItems = function() {
                if (!fullInfoData || !fullInfoData.world) {
                    console.error('âš ï¸ No world data available');
                    return 0;
                }
                
                console.log('=== HIDDEN ITEMS DEBUG (Generated HTML) ===');
                let totalHidden = 0;
                
                Object.keys(fullInfoData.world).forEach(category => {
                    if (Array.isArray(fullInfoData.world[category])) {
                        const hidden = fullInfoData.world[category].filter(item => item.hidden);
                        if (hidden.length > 0) {
                            console.log(\`\${category}: \${hidden.length} hidden items\`);
                            hidden.forEach(item => {
                                console.log(\`  - \${item.name} (hidden: \${item.hidden})\`);
                                totalHidden++;
                            });
                        }
                    }
                });
                
                if (totalHidden === 0) {
                    console.log('No hidden items found in any category');
                } else {
                    console.log(\`Total hidden items: \${totalHidden}\`);
                }
                
                console.log('=======================================');
                
                return totalHidden;
            };
            
            window.toggleDevMode = function() {
                console.log('â„¹ï¸ toggleDevMode() is not available in generated HTML');
                console.log('Hidden items are embedded in the data but not visually shown');
                console.log('Use listHidden() to see what items are hidden');
                console.log('Use the converter interface to modify hidden status');
                return false;
            };
                        
            function showTab(tabName) {
                // Hide all content
                document.querySelectorAll('.content').forEach(content => {
                    content.classList.remove('active');
                });
                
                // Hide all custom pages when switching to regular tabs
                document.querySelectorAll('.custom-page-content').forEach(page => {
                    page.style.display = 'none';
                });
                
                // Remove active class from all tabs
                document.querySelectorAll('.nav-tab').forEach(tab => {
                    tab.classList.remove('active');
                });
                
                // Show selected content
                const targetContent = document.getElementById(tabName);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
                
                // Activate the corresponding tab button
                const targetTab = document.getElementById(tabName + '-tab');
                if (targetTab) {
                    targetTab.classList.add('active');
                }
            }

            // Lorebook download functionality  
            function downloadLinkedLorebook() {
                
                if (fullInfoData && fullInfoData.linkedLorebook) {
                    try {
                        console.log('Found linked lorebook:', fullInfoData.linkedLorebook.filename);
                        
                        // Create blob from lorebook data
                        const lorebookData = fullInfoData.linkedLorebook.data;
                        const jsonString = JSON.stringify(lorebookData, null, 2);
                        const blob = new Blob([jsonString], {
                            type: 'application/json;charset=utf-8'
                        });
                        
                        // Create download link
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = fullInfoData.linkedLorebook.filename;
                        link.style.display = 'none';
                        
                        // Trigger download
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        
                        // Clean up
                        URL.revokeObjectURL(url);
                        
                        console.log('Lorebook downloaded:', fullInfoData.linkedLorebook.filename);
                    } catch (error) {
                        console.error('Error downloading lorebook:', error);
                        alert('Error downloading lorebook file: ' + error.message);
                    }
                } else {
                    console.warn('No linked lorebook found in fullInfoData');
                    console.log('Available data keys:', fullInfoData ? Object.keys(fullInfoData) : 'fullInfoData is null');
                    alert('No linked lorebook available to download.');
                }
            }
            
            function openCharacterGalleryImage(imageIndex) {
                // Find the currently open character modal to get the character data
                    const openModal = document.querySelector('.modal.active');                if (openModal) {
                    const gallery = openModal.querySelector('.character-gallery');
                    if (gallery) {
                        const characterIndex = gallery.getAttribute('data-character-index');
                        const character = charactersData[characterIndex];
                        if (character && character.gallery) {
                            openImageModal(character.gallery[imageIndex], character.name, character.gallery, imageIndex);
                        }
                    }
                }
            }
            
            function openCharacterModal(index) {
                const modal = document.getElementById('characterModal' + index);
                if (modal) {
                    modal.classList.add('active'); // Use flexbox class instead
                    document.body.style.overflow = 'hidden';
                }
            }

            function closeCharacterModal(index) {
                const modal = document.getElementById('characterModal' + index);
                if (modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            }

            function openPlanModal(index) {
                const modal = document.getElementById('planModal' + index);
                if (modal) {
                    modal.classList.add('active');
                    document.body.style.overflow = 'hidden';
                }
            }

            function closePlanModal(index) {
                const modal = document.getElementById('planModal' + index);
                if (modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            }

            function scrollToWorldItem(itemId) {
                // Close any open character modal first
                const openModals = document.querySelectorAll('.modal.active');
                openModals.forEach(modal => {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                });
                
                // Switch to world tab
                showTab('world');
                
                // Wait for tab switch, then find and scroll to the item
                setTimeout(() => {
                    const itemElement = document.getElementById(itemId);
                    if (itemElement) {
                        // Find which category section this item is in
                        const categorySection = itemElement.closest('.world-section');
                        if (categorySection) {
                            // Make sure the category is visible
                            categorySection.style.display = 'block';
                            
                            // If there's a tab system, activate the correct tab
                            const categoryId = categorySection.id;
                            if (categoryId) {
                                const categoryTab = document.getElementById(\`\${categoryId}-tab\`);
                                if (categoryTab) {
                                    // Remove active from all tabs
                                    document.querySelectorAll('.world-tab').forEach(tab => tab.classList.remove('active'));
                                    // Activate this tab
                                    categoryTab.classList.add('active');
                                }
                            }
                        }
                        
                        // Scroll to the item
                        itemElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        
                        // Add highlight effect
                        itemElement.style.transition = 'box-shadow 0.3s ease';
                        const highlightColor = getComputedStyle(document.documentElement).getPropertyValue('--link-color').trim();
                        itemElement.style.boxShadow = \`0 0 20px \${highlightColor}\`;
                        
                        setTimeout(() => {
                            itemElement.style.boxShadow = '';
                        }, 2000);
                    }
                }, 300);
            }
            
            // Toggle sub-arc expansion
            function toggleSubArc(planIndex, subArcIndex) {
                const planModal = document.getElementById('planModal' + planIndex);
                if (!planModal) return;
                
                const subArcs = planModal.querySelectorAll('.plan-subarc');
                const subArc = subArcs[subArcIndex];
                
                if (subArc) {
                    const content = subArc.querySelector('.plan-subarc-content');
                    const toggle = subArc.querySelector('.plan-subarc-toggle');
                    
                    if (content.classList.contains('collapsed')) {
                        content.classList.remove('collapsed');
                        toggle.classList.add('expanded');
                        toggle.innerHTML = '&#9660;';
                    } else {
                        content.classList.add('collapsed');
                        toggle.classList.remove('expanded');
                        toggle.innerHTML = '&#9654;';
                    }
                }
            }
            
            // Toggle event notes using DOM traversal (fixes indexing issues with mixed main/sub-arc events)
            function toggleEventNotesLocal(toggleElement) {
                const toggle = toggleElement;
                const icon = toggle.querySelector('.plan-event-notes-toggle-icon');
                
                // Find the notes element correctly - it's a sibling of the parent bottom container
                const bottomContainer = toggle.closest('.plan-event-bottom');
                const notes = bottomContainer ? bottomContainer.nextElementSibling : null;
                
                if (notes && notes.classList.contains('plan-event-notes')) {
                    if (notes.classList.contains('collapsed')) {
                        notes.classList.remove('collapsed');
                        toggle.classList.add('expanded');
                        icon.innerHTML = '&#9660;';
                    } else {
                        notes.classList.add('collapsed');
                        toggle.classList.remove('expanded');
                        icon.innerHTML = '&#9654;';
                    }
                } else {
                    console.error('Could not find notes element for toggle', toggle);
                }
            }
            
            // Legacy function for backwards compatibility (though we shouldn't need it anymore)
            function toggleEventNotes(eventIndex) {
                console.warn('toggleEventNotes with index is deprecated, using DOM traversal instead');
                // This function is kept for backwards compatibility but shouldn't be used
                const toggles = document.querySelectorAll('.plan-event-notes-toggle');
                const notes = document.querySelectorAll('.plan-event-notes');
                
                if (toggles[eventIndex] && notes[eventIndex]) {
                    toggleEventNotesLocal(toggles[eventIndex]);
                }
            }        
            
            function openImageModal(imageSrc, altText, imageArray, index) {
                const modal = document.getElementById('imageModal');
                const modalImg = document.getElementById('modalImage');
                const prevBtn = document.querySelector('.image-prev');
                const nextBtn = document.querySelector('.image-next');
                const counter = document.getElementById('imageCounter');
                
                if (modal && modalImg) {
                    // Handle both single images and image arrays
                    if (Array.isArray(imageArray) && imageArray.length > 0) {
                        currentImages = imageArray;
                        currentImageIndex = index || 0;
                        currentImageContext = altText;
                        
                        // Show navigation if there are multiple images
                        if (currentImages.length > 1) {
                            prevBtn.classList.add('visible');
                            nextBtn.classList.add('visible');
                            counter.classList.add('visible');
                            counter.textContent = \`\${currentImageIndex + 1} / \${currentImages.length}\`;
                        } else {
                            prevBtn.classList.remove('visible');
                            nextBtn.classList.remove('visible');
                            counter.classList.remove('visible');
                        }
                        
                        modalImg.src = currentImages[currentImageIndex];
                        modalImg.alt = \`\${currentImageContext} - Image \${currentImageIndex + 1}\`;
                    } else {
                        // Single image mode
                        currentImages = [imageSrc];
                        currentImageIndex = 0;
                        currentImageContext = altText;
                        
                        prevBtn.classList.remove('visible');
                        nextBtn.classList.remove('visible');
                        counter.classList.remove('visible');
                        
                        modalImg.src = imageSrc;
                        modalImg.alt = altText;
                    }
                    
                    modal.style.display = 'block';
                    document.body.style.overflow = 'hidden';
                }
            }
            
            function nextImage() {
                if (currentImages.length > 1) {
                    currentImageIndex = (currentImageIndex + 1) % currentImages.length;
                    updateModalImage();
                }
            }
            
            function previousImage() {
                if (currentImages.length > 1) {
                    currentImageIndex = currentImageIndex === 0 ? currentImages.length - 1 : currentImageIndex - 1;
                    updateModalImage();
                }
            }
            
            function updateModalImage() {
                const modalImg = document.getElementById('modalImage');
                const counter = document.getElementById('imageCounter');
                
                if (modalImg) {
                    modalImg.src = currentImages[currentImageIndex];
                    modalImg.alt = \`\${currentImageContext} - Image \${currentImageIndex + 1}\`;
                }
                
                if (counter) {
                    counter.textContent = \`\${currentImageIndex + 1} / \${currentImages.length}\`;
                }
            }
            
            function closeImageModal() {
                const modal = document.getElementById('imageModal');
                if (modal) {
                    modal.style.display = 'none';
                    document.body.style.overflow = '';
                }
            }
            
            function toggleSpoiler(element) {
                element.classList.toggle('revealed');
            }

            // Generated controls declare intent with data attributes. One delegated
            // listener keeps behavior out of markup and also covers dynamic sections.
            function handleLoreAction(event) {
                const actionElement = event.target.closest('[data-lore-action]');
                if (!actionElement) return;

                const action = actionElement.dataset.loreAction;
                switch (action) {
                    case 'show-tab':
                        showTab(actionElement.dataset.page);
                        break;
                    case 'open-image':
                        openImageModal(
                            actionElement.currentSrc || actionElement.src,
                            actionElement.dataset.imageAlt || actionElement.alt || 'Image'
                        );
                        break;
                    case 'close-image':
                        closeImageModal();
                        break;
                    case 'previous-image':
                        previousImage();
                        break;
                    case 'next-image':
                        nextImage();
                        break;
                    case 'scroll-world-item':
                        event.preventDefault();
                        scrollToWorldItem(actionElement.dataset.worldItemId);
                        break;
                    case 'scroll-icons':
                        scrollIcons(
                            actionElement,
                            actionElement.dataset.direction,
                            actionElement.dataset.carouselType,
                            Number(actionElement.dataset.characterIndex)
                        );
                        break;
                    case 'open-character-modal':
                        openCharacterModal(Number(actionElement.dataset.index));
                        break;
                    case 'close-character-modal':
                        closeCharacterModal(Number(actionElement.dataset.index));
                        break;
                    case 'open-character-gallery-image':
                        openCharacterGalleryImage(Number(actionElement.dataset.imageIndex));
                        break;
                    case 'open-plan-modal':
                        openPlanModal(Number(actionElement.dataset.index));
                        break;
                    case 'close-plan-modal':
                        closePlanModal(Number(actionElement.dataset.index));
                        break;
                    case 'toggle-sub-arc':
                        toggleSubArc(
                            Number(actionElement.dataset.planIndex),
                            Number(actionElement.dataset.subArcIndex)
                        );
                        break;
                    case 'toggle-event-subevents':
                        toggleEventSubevents(actionElement.dataset.eventId);
                        break;
                    case 'toggle-event-notes':
                        toggleEventNotesLocal(actionElement);
                        break;
                    case 'toggle-character-navigation':
                        toggleCharacterNavigation();
                        break;
                    case 'set-character-filter-mode':
                        setFilterMode(actionElement.dataset.mode);
                        break;
                    case 'clear-character-tags':
                        clearAllCharacterTags();
                        break;
                    case 'toggle-character-tag':
                        toggleCharacterTag(actionElement.dataset.tag);
                        break;
                    case 'download-character-card':
                        downloadCharacterCard();
                        break;
                    case 'download-linked-lorebook':
                        downloadLinkedLorebook();
                        break;
                    case 'switch-world-category':
                        switchWorldCategory(actionElement.dataset.category);
                        break;
                    case 'toggle-world-navigation':
                        toggleWorldNavigation();
                        break;
                    case 'set-world-filter-mode':
                        setWorldFilterMode(actionElement.dataset.mode);
                        break;
                    case 'clear-world-tags':
                        clearAllWorldTags();
                        break;
                    case 'toggle-world-tag':
                        toggleWorldTag(actionElement.dataset.tag);
                        break;
                    case 'toggle-plan-navigation':
                        togglePlanNavigation();
                        break;
                    case 'set-plan-filter-mode':
                        setPlanFilterMode(actionElement.dataset.mode);
                        break;
                    case 'clear-plan-tags':
                        clearAllPlanTags();
                        break;
                    case 'toggle-plan-tag':
                        togglePlanTag(actionElement.dataset.tag);
                        break;
                    case 'switch-plans-view':
                        switchPlansView(actionElement.dataset.view);
                        break;
                    case 'switch-storylines-view':
                        switchStorylinesView(actionElement.dataset.view);
                        break;
                    case 'toggle-storylines-navigation':
                        toggleStorylinesNavigation(actionElement.dataset.viewType);
                        break;
                    case 'set-storylines-filter-mode':
                        setStorylinesFilterMode(
                            actionElement.dataset.mode,
                            actionElement.dataset.viewType
                        );
                        break;
                    case 'clear-storylines-tags':
                        clearAllStorylinesTags(actionElement.dataset.viewType);
                        break;
                    case 'toggle-storylines-tag':
                        toggleStorylinesTag(
                            actionElement.dataset.tag,
                            actionElement.dataset.viewType
                        );
                        break;
                    case 'toggle-storyline-toc':
                        toggleStorylineTOC(actionElement.dataset.filterType);
                        break;
                    case 'scroll-storyline-section':
                        event.preventDefault();
                        scrollToStorylineSection(actionElement.dataset.sectionAnchor);
                        break;
                    case 'toggle-playlist-navigation':
                        togglePlaylistNavigation();
                        break;
                    case 'set-playlist-filter-mode':
                        setPlaylistFilterMode(actionElement.dataset.mode);
                        break;
                    case 'clear-playlist-tags':
                        clearAllPlaylistTags();
                        break;
                    case 'toggle-playlist-tag':
                        togglePlaylistTag(actionElement.dataset.tag);
                        break;
                    case 'toggle-timeline-navigation':
                        toggleTimelineNavigation();
                        break;
                    case 'set-timeline-filter-mode':
                        setTimelineFilterMode(actionElement.dataset.mode);
                        break;
                    case 'clear-timeline-tags':
                        clearAllTimelineTags();
                        break;
                    case 'toggle-timeline-tag':
                        toggleTimelineTag(actionElement.dataset.tag);
                        break;
                    case 'show-event-notes':
                        showEventNotesModal(actionElement.dataset.eventId);
                        break;
                    case 'open-plan-from-timeline':
                        openPlanModalFromTimeline(actionElement.dataset.arcTitle);
                        break;
                    case 'hide-event-notes':
                        if (actionElement === event.target) hideEventNotesModal();
                        break;
                    case 'open-custom-gallery-image':
                        openCustomPageGalleryImage(
                            actionElement.dataset.elementId,
                            Number(actionElement.dataset.imageIndex)
                        );
                        break;
                    case 'navigate':
                        window.location.href = actionElement.dataset.url;
                        break;
                    case 'toggle-spoiler':
                        toggleSpoiler(actionElement);
                        break;
                }
            }

            document.addEventListener('click', handleLoreAction);
            document.addEventListener('contextmenu', function(event) {
                const card = event.target.closest('[data-character-card-path]');
                if (!card) return;
                event.preventDefault();
                showCharacterCardContextMenu(event, card.dataset.characterCardPath);
            });
            
            // Close modals when clicking outside them
            window.addEventListener('click', function(event) {
                if (event.target.classList.contains('modal') || event.target.classList.contains('image-modal')) {
                    event.target.classList.remove('active');
                    event.target.style.display = 'none'; // Keep for image modal
                    document.body.style.overflow = '';
                }
            });
            
            // Keyboard navigation
            document.addEventListener('keydown', function(event) {
                const modal = document.getElementById('imageModal');
                const isModalOpen = modal && modal.style.display === 'block';
                
                if (isModalOpen) {
                    switch(event.key) {
                        case 'Escape':
                            closeImageModal();
                            break;
                        case 'ArrowLeft':
                            event.preventDefault();
                            previousImage();
                            break;
                        case 'ArrowRight':
                            event.preventDefault();
                            nextImage();
                            break;
                    }
                } else if (event.key === 'Escape') {
                    // Close other modals on Escape
                    document.querySelectorAll('.modal').forEach(modal => {
                        modal.style.display = 'none';
                    });
                    document.body.style.overflow = '';
                }
            });
            
            function initializeWorldFeatures() {
                // Search and filter functionality
                const searchInput = document.getElementById('world-search');
                const statusFilter = document.getElementById('status-filter');
            
                
                if (searchInput) {
                    searchInput.addEventListener('input', filterWorldItems);
                }
                
                if (statusFilter) {
                    statusFilter.addEventListener('change', filterWorldItems);
                }

                initializeGalleryMode();
                
                // Smooth scrolling for navigation links
                const navLinks = document.querySelectorAll('.world-nav-link');
                navLinks.forEach(link => {
                    link.addEventListener('click', function(e) {
                        e.preventDefault();
                        
                        // Expand navigation if collapsed
                        const navContent = document.querySelector('.world-nav-content');
                        const navToggle = document.querySelector('.world-nav-toggle');
                        if (navContent && navContent.classList.contains('collapsed')) {
                            navContent.classList.remove('collapsed');
                            if (navToggle) {
                                navToggle.classList.add('expanded');
                                navToggle.innerHTML = '&#9660;';
                            }
                        }
                        
                        const targetId = this.getAttribute('href').substring(1);
                        const targetElement = document.getElementById(targetId);
                        if (targetElement) {
                            targetElement.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start'
                            });
                        }
                    });
                });
            }
            
            function initializeCharacterFeatures() {
                // Character search functionality
                const searchInput = document.getElementById('character-search');
                
                if (searchInput) {
                    searchInput.addEventListener('input', function() {
                        currentSearchFilter = this.value.toLowerCase().trim();
                        applyCharacterFilters();
                    });
                }
                
                // Initialize display
                updateCharacterTagStates();
                updateClearButtonState();
                
            }

            function initializeBackToTopControls() {
                const buttons = Array.from(document.querySelectorAll('.back-to-top'));
                if (!buttons.length) return;

                const updateVisibility = () => {
                    const visible = window.pageYOffset > 300;
                    buttons.forEach(button => button.classList.toggle('visible', visible));
                };
                window.addEventListener('scroll', updateVisibility, { passive: true });
                document.addEventListener('click', event => {
                    if (!event.target.closest('.back-to-top')) return;
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
                updateVisibility();
            }
            
            // Ensure Overview tab is active by default
            document.addEventListener('DOMContentLoaded', function() {
                const itemContainers = document.querySelectorAll('.item-tooltip-container[data-tooltip]');
    
                itemContainers.forEach(container => {
                    let tooltip = null;
                    
                    container.addEventListener('mouseenter', function(e) {
                        const tooltipText = this.getAttribute('data-tooltip');
                        if (!tooltipText) return;
                        
                        // Create tooltip element
                        tooltip = document.createElement('div');
                        tooltip.className = 'item-tooltip-fixed';
                        tooltip.textContent = tooltipText;
                        tooltip.style.cssText = \`
                            position: fixed;
                            background: transparent;
                            color: rgba(0, 0, 0, 0.5);
                            padding: 4px 8px;
                            border-radius: 4px;
                            font-size: 0.75em;
                            white-space: nowrap;
                            z-index: 100000;
                            pointer-events: none;
                        \`;
                        document.body.appendChild(tooltip);
                        
                        // Position tooltip
                        const rect = this.getBoundingClientRect();
                        const tooltipRect = tooltip.getBoundingClientRect();
                        tooltip.style.left = (rect.left + rect.width / 2 - tooltipRect.width / 2) + 'px';
                        tooltip.style.top = (rect.bottom + 5) + 'px';
                    });
                    
                    container.addEventListener('mouseleave', function() {
                        if (tooltip) {
                            tooltip.remove();
                            tooltip = null;
                        }
                    });
                });
                // showTab('overview'); 

                // Handle direct tab linking via URL hash
                function handleTabFromURL() {
                    const hash = window.location.hash.substring(1); // Remove the #
                    const validTabs = ['overview', 'world', 'characters', 'storylines', 'plans', 'playlists'];
                    
                    // Check if it's a custom page
                    const customPageElement = document.getElementById(hash);
                    if (customPageElement && customPageElement.classList.contains('custom-page-content')) {
                        showCustomPage(hash);
                        return;
                    }
                    
                    if (hash && validTabs.includes(hash)) {
                        showTab(hash);
                    } else {
                        showTab('overview'); // Default tab
                    }
                }

                // Show custom page function
                function showCustomPage(pageName) {
                    // Hide all regular content sections
                    document.querySelectorAll('.content').forEach(content => {
                        content.classList.remove('active');
                    });
                    
                    // Hide all custom pages
                    document.querySelectorAll('.custom-page-content').forEach(page => {
                        page.style.display = 'none';
                    });
                    
                    // Show the specific custom page
                    const targetPage = document.getElementById(pageName);
                    if (targetPage) {
                        targetPage.style.display = 'block';
                    }
                    
                    // Remove active class from all nav tabs
                    document.querySelectorAll('.nav-tab').forEach(tab => {
                        tab.classList.remove('active');
                    });
                    
                    // No nav tab gets active state for custom pages since they're accessed directly
                }

                // Initialize custom page navigation handlers
                function initializeCustomPageNavigation() {
                    // Find all navigation links that point to hash URLs
                    const hashLinks = document.querySelectorAll('a[href^="#"]');
                    
                    hashLinks.forEach(link => {
                        link.addEventListener('click', function(e) {
                            const targetHash = this.getAttribute('href').substring(1);
                            
                            // Check if it's a custom page
                            const customPageElement = document.getElementById(targetHash);
                            if (customPageElement && customPageElement.classList.contains('custom-page-content')) {
                                // Prevent default navigation
                                e.preventDefault();
                                
                                // Force show the custom page
                                showCustomPage(targetHash);
                                
                                // Update the URL hash
                                window.history.replaceState(null, null, '#' + targetHash);
                            }
                        });
                    });
                }

                // Call it on page load
                handleTabFromURL();

                // Also handle hash changes (if someone changes the URL while on the page)
                window.addEventListener('hashchange', handleTabFromURL);

                // Handle custom page navigation buttons
                initializeCustomPageNavigation();
                initializeBackToTopControls();
                
                // Initialize world section functionality
                initializeWorldFeatures();
                
                // Initialize character section functionality
                initializeCharacterFeatures();

                // Initialize playlist section functionality
                initializePlaylistFeatures();

                // Initialize timeline features
                initializeTimelineFeatures();
                
                // Initialize global filter system
                initializeGlobalFilterSystem();
                
                // Auto-run debug if there are hidden items
                setTimeout(() => {
                    const hiddenCount = debugHiddenItems();
                    if (hiddenCount > 0) {
                        console.log(\`\\nâœ… This page has \${hiddenCount} hidden items preserved in the data\`);
                    }
                }, 500);
            });

            // Storylines view switching function
            function switchStorylinesView(viewType) {
                // Remove active class from all tabs and views
                document.querySelectorAll('.storylines-tab').forEach(tab => tab.classList.remove('active'));
                document.querySelectorAll('.storylines-view').forEach(view => view.classList.remove('active'));
                
                // Add active class to selected tab and view
                const activeTab = document.getElementById(viewType + '-tab');
                const activeView = document.getElementById(viewType + '-view');
                
                if (activeTab && activeView) {
                    activeTab.classList.add('active');
                    activeView.classList.add('active');
                }
            }

            // Helper function to escape HTML for safe tooltips
            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            // Icon carousel navigation
            function scrollIcons(button, direction, type, characterIndex) {
                const container = button.parentElement.querySelector(\`[data-carousel-id="\${type}-\${characterIndex}"]\`);
                if (!container) return;
                
                const iconWidth = type === 'items' ? 38 : 54; // icon width + gap
                const scrollAmount = iconWidth * 2; // Scroll 2 icons at a time
                
                if (direction === 'next') {
                    container.scrollLeft += scrollAmount;
                } else {
                    container.scrollLeft -= scrollAmount;
                }
            }

            window.scrollIcons = scrollIcons;

            // Make storylines functions globally available
            window.switchStorylinesView = switchStorylinesView;
            window.escapeHtml = escapeHtml;
            
            // Make plan modal functions globally available
            window.openPlanModal = openPlanModal;
            window.closePlanModal = closePlanModal;
            
            // Make sub-arc and notes functions globally available
            window.toggleSubArc = toggleSubArc;
            window.toggleEventNotes = toggleEventNotes;
            window.toggleEventNotesLocal = toggleEventNotesLocal;

            ${featureRuntime}
        </script>
    </div>`;
}

// Basic markdown parsing for descriptions
window.parseMarkdown = function(text) {
    return renderMarkdown(text);
}

// Update preview
window.updatePreview = function(html) {
    const iframe = document.getElementById('preview-frame');
    const previewContainer = document.querySelector('.preview-container');
    if (!iframe) return;

    const userContext = window.userSessionManager?.getUserContext?.();
    const previewBaseHref = buildProjectPreviewBaseHref(window.currentProject, userContext);
    const previewHtml = addPreviewBaseHref(html, previewBaseHref);

    iframe.title = 'Public Lore Codex preview';
    iframe.setAttribute('sandbox', 'allow-scripts allow-downloads');
    iframe.srcdoc = previewHtml;
    
    // Add 'has-content' class to hide the empty state placeholder
    if (previewContainer && html && html.trim()) {
        previewContainer.classList.add('has-content');
    } else if (previewContainer) {
        previewContainer.classList.remove('has-content');
    }
}

// Export functions globally when loaded as module
window.parseTagWithColor = parseTagWithColor;
window.getContrastingTextColor = getContrastingTextColor;
window.generateHTML = generateHTML;
window.updateSaveButtonState = updateSaveButtonState;
window.getVisibleTags = getVisibleTags;
window.stripHiddenPrefix = stripHiddenPrefix;
