// Lore Codex DOM legacy adapter: appearance
function extractAppearanceInfo(doc) {
    // Initialize appearance settings with defaults if not present
    if (!infoData.appearance) {
        infoData.appearance = {
            overviewStyle: 'journal',      
            navigationStyle: 'journal', 
            colorScheme: 'current',
            fontSet: 'serif',
            storylineStyle: 'default',
            containerStyle: 'left-border',
            subcontainerStyle: 'soft-bg',
            infodisplayStyle: 'default',
            bannerSize: 'large',
            buttonStyle: 'rounded',
            siteWidth: 'standard' 
        };
    }

    // Migrate old template setting if needed
    if (infoData.appearance.template && (!infoData.appearance.overviewStyle || !infoData.appearance.navigationStyle)) {
        console.log('Migrating old template setting in import:', infoData.appearance.template);
        infoData.appearance.overviewStyle = infoData.appearance.template;
        infoData.appearance.navigationStyle = infoData.appearance.template;
        delete infoData.appearance.template;
    }
    
    // Try to extract from JavaScript data first (more reliable)
    const scripts = doc.querySelectorAll('script');
    let appearanceData = null;
    
    scripts.forEach(script => {
        const scriptContent = script.textContent;
        const match = scriptContent.match(/var appearanceData = (\{.*?\});/s);
        if (match) {
            try {
                appearanceData = JSON.parse(match[1]);
                console.log('Found embedded appearance data:', appearanceData);
            } catch (e) {
                console.log('Could not parse appearance data from script:', e);
            }
        }
    });
    
    if (appearanceData && typeof appearanceData === 'object') {
        // Migrate old template setting if needed
        appearanceData = migrateEmbeddedAppearanceData(appearanceData);
        
        // Use the embedded appearance data
        infoData.appearance = { ...infoData.appearance, ...appearanceData };
        
        // Also try to load it using the appearance system
        if (typeof loadAppearanceSettings === 'function') {
            loadAppearanceSettings(appearanceData);
        }
        return;
    }
    
    // Fallback: try to detect from CSS (less reliable)
    const styleTag = doc.querySelector('style');
    if (!styleTag) return;
    
    const cssContent = styleTag.textContent;
    
    // Try to detect template from CSS comment (legacy support)
    const templateMatch = cssContent.match(/\/\*\s*Info Page Styles - (\w+) Template\s*\*\//i);
    if (templateMatch) {
        const detectedTemplate = templateMatch[1].toLowerCase();
        if (['journal', 'modern', 'classic'].includes(detectedTemplate)) {
            // Convert old template to new split system
            if (!infoData.appearance.overviewStyle && !infoData.appearance.navigationStyle) {
                console.log('Migrating detected template from CSS:', detectedTemplate);
                infoData.appearance.overviewStyle = detectedTemplate;
                infoData.appearance.navigationStyle = detectedTemplate;
            }
        }
    }

    // Try to detect overview style from CSS patterns
    if (cssContent.includes('.overview-banner')) {
        if (cssContent.includes('background: rgba(') && cssContent.includes('.overview-banner')) {
            infoData.appearance.overviewStyle = 'modern';
        } else if (cssContent.includes('.overview-banner') && cssContent.includes('border-bottom:')) {
            infoData.appearance.overviewStyle = 'classic';
        } else {
            infoData.appearance.overviewStyle = 'journal';
        }
    }

    // Try to detect navigation style from CSS patterns  
    if (cssContent.includes('.nav-links')) {
        if (cssContent.includes('.nav-links a') && cssContent.includes('border-radius:') && cssContent.includes('padding: 12px')) {
            infoData.appearance.navigationStyle = 'modern';
        } else if (cssContent.includes('.nav-links') && cssContent.includes('text-decoration: underline')) {
            infoData.appearance.navigationStyle = 'classic';
        } else {
            infoData.appearance.navigationStyle = 'journal';
        }
    }

    // Try to detect card style from CSS patterns
    if (cssContent.includes('.character-card')) {
        if (cssContent.includes('.character-card') && cssContent.includes('box-shadow:') && cssContent.includes('border-radius: 12px')) {
            infoData.appearance.cardStyle = 'modern';
        } else if (cssContent.includes('.character-card') && cssContent.includes('border: 1px solid')) {
            infoData.appearance.cardStyle = 'minimal';
        } else if (cssContent.includes('.character-card') && cssContent.includes('box-shadow:') && cssContent.includes('transform:')) {
            infoData.appearance.cardStyle = 'detailed';
        } else {
            infoData.appearance.cardStyle = 'current';
        }
    }

    // Try to detect site width from CSS
    const siteWidthMatch = cssContent.match(/max-width:\s*(\d+)px/);
    if (siteWidthMatch) {
        const maxWidth = parseInt(siteWidthMatch[1]);
        if (maxWidth <= 800) {
            infoData.appearance.siteWidth = 'narrow';
        } else if (maxWidth >= 1000) {
            infoData.appearance.siteWidth = 'wide';  
        } else {
            infoData.appearance.siteWidth = 'standard';
        }
    }
    
    // Try to detect color scheme by checking for specific color values and patterns
    // Check for coffee theme first (most distinctive new one)
    if (cssContent.includes('bodyBg: \'#F5F1EB\'') || cssContent.includes('background: #F5F1EB') || 
        cssContent.includes('#F5F1EB') || cssContent.includes('#FBF8F2')) {
        infoData.appearance.colorScheme = 'coffee';
    }
    // Check for dark theme
    else if (cssContent.includes('bodyBg: \'#1a1a1a\'') || cssContent.includes('background: #1a1a1a') || 
        cssContent.includes('color: #f0f0f0') || cssContent.includes('#2d2d2d')) {
        infoData.appearance.colorScheme = 'dark';
    }
    // Check for minimalist theme
    else if (cssContent.includes('bodyBg: \'#fafafa\'') || cssContent.includes('background: #fafafa') || 
             cssContent.includes('color: #212529')) {
        infoData.appearance.colorScheme = 'minimalist';
    }
    // Check for imperial theme
    else if (cssContent.includes('bodyBg: \'#F9F5F0\'') || cssContent.includes('background: #F9F5F0') || 
             cssContent.includes('color: #3B2E26')) {
        infoData.appearance.colorScheme = 'imperialAutumn';
    }
    // Check for class trial theme
    else if (cssContent.includes('bodyBg: \'#1c1824\'') || cssContent.includes('background: #1c1824') || 
             cssContent.includes('color: #e5e5e5')) {
        infoData.appearance.colorScheme = 'classTrial';
    }
    // Check for elegant theme (pale pink and jade accents)
    else if (cssContent.includes('#f8f0f5') || cssContent.includes('#f0f4f1') || 
             cssContent.includes('color: #343a40')) {
        infoData.appearance.colorScheme = 'elegant';
    }
    // Default to current
    else {
        infoData.appearance.colorScheme = 'current';
    }
    
    // Try to detect font set by checking font-family declarations
    const bodyFontMatch = cssContent.match(/body\s*\{[^}]*font-family:\s*([^;]+);/i);
    if (bodyFontMatch) {
        const fontFamily = bodyFontMatch[1].toLowerCase();
        
        if (fontFamily.includes('helvetica') || fontFamily.includes('arial')) {
            // Check if it's mixed (UI fonts are different)
            if (cssContent.includes('font-family: \'Inter\'') || cssContent.includes('georgia')) {
                infoData.appearance.fontSet = 'mixed';
            } else {
                infoData.appearance.fontSet = 'sans';
            }
        } else if (fontFamily.includes('georgia')) {
            infoData.appearance.fontSet = 'serif';
        }
    }

    // Try to detect button style by checking button CSS patterns
    // Try to detect button style by checking button CSS patterns
    if (cssContent.includes('border-radius: 0') && cssContent.includes('.overview-link-btn')) {
        infoData.appearance.buttonStyle = 'sharp';
    } else if (cssContent.includes('border-radius: 20px') && cssContent.includes('.overview-link-btn')) {
        infoData.appearance.buttonStyle = 'pill';
    } else if (cssContent.includes('border-radius: 2px') && cssContent.includes('.overview-link-btn')) {
        infoData.appearance.buttonStyle = 'subtle';
    } else {
        infoData.appearance.buttonStyle = 'rounded'; // default
    }
    
    // Try to detect container style by checking world-item CSS patterns
    if (cssContent.includes('border-left: 4px solid') && cssContent.includes('.world-item')) {
        infoData.appearance.containerStyle = 'left-border';
    } else if (cssContent.includes('border: 2px solid') && cssContent.includes('.world-item') && cssContent.includes('border-radius: 8px')) {
        infoData.appearance.containerStyle = 'outlined';
    } else if (cssContent.includes('box-shadow: 0 6px 16px') && cssContent.includes('border-top: 5px solid')) {
        infoData.appearance.containerStyle = 'cards';
    } else if (cssContent.includes('background: transparent') && cssContent.includes('.world-item')) {
        infoData.appearance.containerStyle = 'minimal';
    } else if (cssContent.includes('border-radius: 8px') && cssContent.includes('background:') && cssContent.includes('.world-item.locations')) {
        infoData.appearance.containerStyle = 'outlined-bg';
    } else if (cssContent.includes('border-radius: 0') && cssContent.includes('border: none') && cssContent.includes('.world-item.locations')) {
        infoData.appearance.containerStyle = 'solid-bg';
    }
    
    // Try to detect subcontainer style by checking info-section CSS patterns
    if (cssContent.includes('border-radius: 30px') && cssContent.includes('.info-section')) {
        infoData.appearance.subcontainerStyle = 'pills';
    } else if (cssContent.includes('border-style: solid') && cssContent.includes('border-style: dashed') && cssContent.includes('.info-section')) {
        infoData.appearance.subcontainerStyle = 'outlined';
    } else if (cssContent.includes('border-left: 8px solid') && cssContent.includes('.info-section')) {
        infoData.appearance.subcontainerStyle = 'stripes';
    } else if (cssContent.includes('border-bottom: 1px dotted') && cssContent.includes('.info-section')) {
        infoData.appearance.subcontainerStyle = 'minimal';
    } else {
        infoData.appearance.subcontainerStyle = 'soft-bg';
    }
}

function migrateEmbeddedAppearanceData(appearanceData) {
    // Ensure all new properties exist with defaults
    if (!appearanceData.overviewStyle && !appearanceData.navigationStyle) {
        // If we have the old template, migrate it
        if (appearanceData.template) {
            appearanceData.overviewStyle = appearanceData.template;
            appearanceData.navigationStyle = appearanceData.template;
            delete appearanceData.template;
        }
    }
    if (!appearanceData.cardStyle) {
        appearanceData.cardStyle = 'current';
    }
    // If embedded data has old template but not new styles, migrate it
    if (appearanceData.template && (!appearanceData.overviewStyle || !appearanceData.navigationStyle)) {
        console.log('Migrating embedded appearance data template:', appearanceData.template);
        appearanceData.overviewStyle = appearanceData.template;
        appearanceData.navigationStyle = appearanceData.template;
        delete appearanceData.template;
    }
    
    if (!appearanceData.worldCategoriesHeader) {
        appearanceData.worldCategoriesHeader = 'default';
    }
    if (!appearanceData.pageHeader) {
        appearanceData.pageHeader = 'standard';
    }

    return appearanceData;
}

function migrateTemplateInAnyData(data) {
    if (data && data.appearance && data.appearance.template && (!data.appearance.overviewStyle || !data.appearance.navigationStyle)) {
        console.log('Migrating template setting:', data.appearance.template);
        data.appearance.overviewStyle = data.appearance.template;
        data.appearance.navigationStyle = data.appearance.template;
        delete data.appearance.template;
    }
    return data;
}
