// Function to parse basic markdown
function parseMarkdown(text) {
    if (!text) return '';

    const security = window.RPArchiver.get('security');
    let parsed = security.escapeHTML(text.toString());
    const codeBlocks = [];

    // Protect fenced blocks before processing inline backticks and emphasis.
    parsed = parsed.replace(/```([\s\S]*?)```/g, (_, code) => {
        const token = `\u0000RP_CODE_${codeBlocks.length}\u0000`;
        codeBlocks.push(`<em>${code.trim()}</em>`);
        return token;
    });

    // Convert various dash patterns to em dashes
    // Handle spaced dash first (most specific)
    parsed = parsed.replace(/ - /g, ' — ');

    // Handle double dash
    parsed = parsed.replace(/--/g, '—');
    
    parsed = parsed.replace(/^#{1,6}\s+(.+)$/gm, '<strong>$1</strong>');
    
    // Process other markdown elements that we haven't handled yet
    
    // Horizontal rules -> em dash (since HR tags might not work well in roleplay)
    //parsed = parsed.replace(/^---+$/gm, '—————————————');
    //parsed = parsed.replace(/^\*\*\*+$/gm, '—————————————');
    
    parsed = parsed.replace(/`([^`]+)`/g, '<em>$1</em>');
    
    // Bold (keep our existing logic)
    parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    parsed = parsed.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Italic (keep our existing logic)
    parsed = parsed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    parsed = parsed.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Strikethrough (keep our existing logic)
    parsed = parsed.replace(/~~(.*?)~~/g, '<del>$1</del>');
    
    // Blockquotes -> use italics with a visual indicator
    parsed = parsed.replace(/^> (.+)$/gm, '<em>"$1"</em>');
    
    // Lists - convert to simple text with bullets
    // Unordered lists
    parsed = parsed.replace(/^\* (.+)$/gm, '• $1');
    parsed = parsed.replace(/^- (.+)$/gm, '• $1');
    parsed = parsed.replace(/^\+ (.+)$/gm, '• $1');
    
    // Ordered lists (convert to simple numbered format)
    parsed = parsed.replace(/^\d+\. (.+)$/gm, function(match, content, offset, string) {
        // Count how many numbered items we've seen so far
        const beforeThis = string.substring(0, offset);
        const numberedItems = (beforeThis.match(/^\d+\. /gm) || []).length;
        return `${numberedItems + 1}. ${content}`;
    });
    
    // Links - convert to just the link text with the URL in parentheses
    parsed = parsed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
    
    // Images - convert to just the alt text with a note
    parsed = parsed.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[Image: $1]');
    
    parsed = parsed.replace(/&quot;([\s\S]*?)&quot;/g, '<span class="dialogue">&quot;$1&quot;</span>');

    return parsed.replace(/\u0000RP_CODE_(\d+)\u0000/g, (_, index) => codeBlocks[Number(index)] || '');
}

function getCharacterCSSClass(character) {
    return window.RPArchiver.get('security').characterClass(character);
}

// Helper function to create CSS class for character
function createCharClass(character, characterData, characterId = '') {
    const charInfo = characterData.find(c =>
        (characterId && c.id === characterId) || c.name.toLowerCase() === character.toLowerCase()
    );
    if (charInfo) {
        const cssClass = getCharacterCSSClass(charInfo);
        return 'character-name ' + cssClass;
    }
    return 'character-name';
}

// Function to count words in text
function countWords(text, characterNames = null) {
    if (!text) return 0;
    
    // Make a copy of the text
    let processedText = text.toString();
    
    // Ensure we have consistent line breaks
    processedText = processedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Remove HTML tags
    processedText = processedText.replace(/<[^>]+>/g, ' ');
    
    // Remove special markers
    processedText = processedText.replace(/&&&PART&&&/g, ' ');
    
    const security = window.RPArchiver.get('security');
    const knownNames = Array.isArray(characterNames)
        ? characterNames
        : Array.from(document.querySelectorAll('.char-name')).map(input => input.value).filter(Boolean);
    const characterPrefix = knownNames.length
        ? new RegExp(`^(?:${knownNames.map(security.escapeRegExp).sort((a, b) => b.length - a.length).join('|')})\\s*:`, 'i')
        : null;

    // Remove a prefix only when it matches a configured character name.
    const lines = processedText.split('\n');
    let cleanedText = '';
    for (let line of lines) {
        cleanedText += ' ' + (characterPrefix ? line.replace(characterPrefix, '') : line);
    }
    
    // Remove markdown syntax
    cleanedText = cleanedText.replace(/\*\*(.*?)\*\*/g, '$1'); // Bold
    cleanedText = cleanedText.replace(/\*(.*?)\*/g, '$1');     // Italic
    cleanedText = cleanedText.replace(/~~(.*?)~~/g, '$1');     // Strikethrough
    cleanedText = cleanedText.replace(/__(.*?)__/g, '$1');     // Underscore bold
    
    // Normalize whitespace (replace all whitespace with single spaces)
    cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
    
    // Split by space and filter out empty strings
    const words = cleanedText.split(' ').filter(word => word.length > 0);
    
    return words.length;
}

// Function to calculate page count (based on 275 words per page)
function calculatePageCount(wordCount) {
    return Math.ceil(wordCount / 275);
}

// Function to parse roleplay text into structured data
function parseRoleplayText(text, characterData, options = {}) {
    const lines = text.split('\n');
    const entries = [];
    let currentEntry = null;
    let currentParagraph = '';
    let partIndex = 0;
    
    // Check if we should use part markers
    const usePartMarkers = typeof options.usePartMarkers === 'boolean'
        ? options.usePartMarkers
        : document.getElementById('use-part-markers').checked;
    const noCharacters = typeof options.noCharacters === 'boolean'
        ? options.noCharacters
        : document.getElementById('no-characters').checked;
    
    // Special marker for parts
    const PART_MARKER = '&&&PART&&&';
    
    // If no characters mode is enabled, treat all text as one big entry
    if (noCharacters) {
        let fullText = '';
        let hasPartBreaks = false;
        
        // Process line by line to handle part markers
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Check for part marker - only if part markers are enabled
            if (usePartMarkers && line === PART_MARKER) {
                // If we have accumulated text, create an entry
                if (fullText.trim() !== '') {
                    const paragraphs = fullText.trim().split(/\n\s*\n/).filter(p => p.trim() !== '');
                    entries.push({
                        type: 'character',
                        character: 'Narrator', // Use a default name for processing
                        paragraphs: paragraphs
                    });
                    fullText = '';
                }
                
                // Add part break if not the first one
                if (partIndex > 0 || entries.length > 0) {
                    partIndex++;
                    entries.push({ type: 'partBreak', partIndex });
                }
                hasPartBreaks = true;
                continue;
            }
            
            // Accumulate all other text
            fullText += line + '\n';
        }
        
        // Add the final text if there is any
        if (fullText.trim() !== '') {
            const paragraphs = fullText.trim().split(/\n\s*\n/).filter(p => p.trim() !== '');
            entries.push({
                type: 'character',
                character: 'Narrator', // Use a default name for processing
                paragraphs: paragraphs
            });
        }
        
        return entries;
    }
    
    // Original character-based parsing
    // Create regex patterns for each character
    const escapeRegExp = window.RPArchiver.get('security').escapeRegExp;
    const characterPatterns = characterData.map(char => ({
        id: char.id || '',
        name: char.name,
        pattern: new RegExp(`^${escapeRegExp(char.name)}\\s*:`, 'i')
    }));
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check for part marker - only if part markers are enabled
        if (usePartMarkers && line === PART_MARKER) {
            if (currentEntry) {
                if (currentParagraph.trim() !== '') {
                    currentEntry.paragraphs.push(currentParagraph.trim());
                    currentParagraph = '';
                }
                entries.push(currentEntry);
                currentEntry = null;
            }
            
            // Add a part break - only if not the first one (we already start with part 1)
            if (partIndex > 0 || entries.length > 0) {
                partIndex++;
                entries.push({ type: 'partBreak', partIndex });
            }
            continue;
        }
        
        // Check for character line
        let foundCharacter = null;
        
        for (const character of characterPatterns) {
            const { pattern } = character;
            if (pattern.test(line)) {
                foundCharacter = character;
                break;
            }
        }
        
        if (foundCharacter) {
            // If we were working on another entry, save it
            if (currentEntry && currentParagraph.trim() !== '') {
                currentEntry.paragraphs.push(currentParagraph.trim());
                currentParagraph = '';
            }
            
            // If we had a current entry, save it
            if (currentEntry) {
                entries.push(currentEntry);
            }
            
            // Start a new entry
            const contentStart = line.indexOf(':') + 1;
            const content = line.substring(contentStart).trim();
            
            currentEntry = {
                type: 'character',
                character: foundCharacter.name,
                characterId: foundCharacter.id,
                paragraphs: []
            };
            
            if (content) {
                currentParagraph = content;
            }
        } 
        // Empty line means end of paragraph
        else if (line === '' && currentParagraph.trim() !== '') {
            if (currentEntry) {
                currentEntry.paragraphs.push(currentParagraph.trim());
                currentParagraph = '';
            }
        }
        // Continue building current paragraph
        else if (currentEntry) {
            if (currentParagraph) {
                currentParagraph += ' ' + line;
            } else {
                currentParagraph = line;
            }
        }
    }
    
    // Add the final paragraph and entry if there is one
    if (currentEntry) {
        if (currentParagraph.trim() !== '') {
            currentEntry.paragraphs.push(currentParagraph.trim());
        }
        entries.push(currentEntry);
    }
    
    return entries;
}

function containsHTML(text) {
    return /<[a-z][\s\S]*>/i.test(text);
}

if (typeof module === 'object' && module.exports) {
    module.exports = { parseMarkdown, getCharacterCSSClass, createCharClass, countWords, parseRoleplayText, containsHTML };
}
