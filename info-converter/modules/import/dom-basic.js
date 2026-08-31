// Lore Codex DOM legacy adapter: basic
function extractBasicInfo(doc) {
    // Extract title
    const title = doc.title || '';
    const worldTitleElement = document.getElementById('world-title');
    if (worldTitleElement) {
        worldTitleElement.value = title;
    }
    infoData.basic.title = title;
    
    // Extract subtitle from the title overlay
    const subtitleEl = doc.querySelector('.title-overlay .main-subtitle');
    if (subtitleEl) {
        const subtitle = subtitleEl.textContent.trim();
        const worldSubtitleElement = document.getElementById('world-subtitle');
        if (worldSubtitleElement) {
            worldSubtitleElement.value = subtitle;
        }
        infoData.basic.subtitle = subtitle;
    }
    
    // Extract banner image
    const bannerImg = doc.querySelector('.banner-image');
    if (bannerImg) {
        const bannerSrc = bannerImg.getAttribute('src') || '';
        const bannerImageElement = document.getElementById('banner-image');
        if (bannerImageElement) {
            bannerImageElement.value = bannerSrc;
        }
        infoData.basic.banner = bannerSrc;
    }
    
    // Extract overview title
    const overviewTitleEl = doc.querySelector('#overview .overview-title');
    if (overviewTitleEl) {
        const overviewTitle = overviewTitleEl.textContent.trim();
        const overviewTitleElement = document.getElementById('overview-title');
        if (overviewTitleElement) {
            overviewTitleElement.value = overviewTitle;
        }
        infoData.basic.overviewTitle = overviewTitle;
    }
    
    // Extract overview from the overview content
    const overviewContent = doc.querySelector('#overview .overview-content');
    if (overviewContent) {
        // Clone the content to avoid modifying the original
        const clonedContent = overviewContent.cloneNode(true);
        
        // Remove the title and image elements to get just the text content
        const titleElement = clonedContent.querySelector('.overview-title');
        const imageContainer = clonedContent.querySelector('.overview-image-container');
        
        if (titleElement) {
            titleElement.remove();
        }
        if (imageContainer) {
            imageContainer.remove();
        }
        
        // Use the remaining content for the overview text
        let overviewText = clonedContent.innerHTML;
        overviewText = htmlToMarkdown(overviewText);
        
        const overviewTextElement = document.getElementById('overview-text');
        if (overviewTextElement) {
            overviewTextElement.value = overviewText;
        }
        infoData.basic.overview = overviewText;
    }
    
    // Extract overview image
    const overviewImg = doc.querySelector('#overview .overview-image');
    if (overviewImg) {
        const overviewImgSrc = overviewImg.getAttribute('src') || '';
        const overviewImageElement = document.getElementById('overview-image');
        if (overviewImageElement) {
            overviewImageElement.value = overviewImgSrc;
        }
        infoData.basic.overviewImage = overviewImgSrc;
    }
    
    // Extract background settings from CSS in style tag
    const styleTag = doc.querySelector('style');
    if (styleTag) {
        const cssContent = styleTag.textContent;
        
        // Look for body CSS rule
        const bodyRuleMatch = cssContent.match(/body\s*\{([^}]+)\}/i);
        if (bodyRuleMatch) {
            const bodyCSS = bodyRuleMatch[1];
            
            // Try to extract background image first
            const bgImageMatch = bodyCSS.match(/background[^:]*:\s*url\(['"]?([^'")]+)['"]?\)/i);
            if (bgImageMatch) {
                const bgImage = bgImageMatch[1];
                const backgroundImageElement = document.getElementById('background-image');
                if (backgroundImageElement) {
                    backgroundImageElement.value = bgImage;
                }
                infoData.basic.backgroundImage = bgImage;
            } else {
                // Try to extract background color if no image
                const bgColorMatch = bodyCSS.match(/background[^:]*:\s*([^;]+)/i);
                if (bgColorMatch) {
                    const bgColor = bgColorMatch[1].trim();
                    // Don't set default color and filter out any remaining url() references
                    if (bgColor !== '#f5f5f5' && !bgColor.includes('url(')) {
                        const backgroundColorElement = document.getElementById('background-color');
                        if (backgroundColorElement) {
                            backgroundColorElement.value = bgColor;
                        }
                        infoData.basic.backgroundColor = bgColor;
                    }
                }
            }
        }
        
        // Extract main container color from .container rule
        const containerRuleMatch = cssContent.match(/\.container\s*\{([^}]+)\}/i);
        if (containerRuleMatch) {
            const containerCSS = containerRuleMatch[1];
            const containerBgMatch = containerCSS.match(/background[^:]*:\s*([^;]+)/i);
            if (containerBgMatch) {
                const containerBg = containerBgMatch[1].trim();
                // Only extract if it's not a variable reference and not a default theme color
                if (!containerBg.includes('${') && !containerBg.includes('var(') && containerBg !== '#ffffff' && containerBg !== 'white') {
                    const mainContainerColorElement = document.getElementById('main-container-color');
                    if (mainContainerColorElement) {
                        mainContainerColorElement.value = containerBg;
                    }
                    infoData.basic.mainContainerColor = containerBg;
                }
            }
        }
        // Extract modal background from modal CSS rules
        const modalContentRuleMatch = cssContent.match(/\.modal-content[^{]*\{([^}]+)\}/i);
        if (modalContentRuleMatch) {
            const modalCSS = modalContentRuleMatch[1];
            const modalBgImageMatch = modalCSS.match(/background[^:]*:[^;]*url\(['"]?([^'")]+)['"]?\)/i);
            if (modalBgImageMatch) {
                const modalBgImage = modalBgImageMatch[1];
                const modalBgImageElement = document.getElementById('modal-bg-image');
                if (modalBgImageElement) {
                    modalBgImageElement.value = modalBgImage;
                }
                infoData.basic.modalBgImage = modalBgImage;
            } else {
                // Try to extract modal background color if no image
                const modalBgColorMatch = modalCSS.match(/background[^:]*:\s*([^;]+)/i);
                if (modalBgColorMatch) {
                    const modalBgColor = modalBgColorMatch[1].trim();
                    if (!modalBgColor.includes('${') && !modalBgColor.includes('var(') && modalBgColor !== 'white') {
                        const modalBgColorElement = document.getElementById('modal-bg-color');
                        if (modalBgColorElement) {
                            modalBgColorElement.value = modalBgColor;
                        }
                        infoData.basic.modalBgColor = modalBgColor;
                    }
                }
            }
        }
    }
}
