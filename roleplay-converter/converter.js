// Parsed project state is owned by modules/project-state.js.
const rpProjectState = window.RPArchiver.get('state').get();
const rpSecurity = window.RPArchiver.get('security');
let savedColors = JSON.parse(localStorage.getItem('savedColors') || '[]');

// Default colors for new characters
const defaultColors = ['#0366d6', '#d63603', '#2e7d32', '#9c27b0', '#ff5722', '#607d8b'];

// Drag and Drop functionality
let draggedElement = null;

function addDragListeners(element, container) {
    element.addEventListener('dragstart', function(e) {
        draggedElement = this;
        this.classList.add('dragging');
        container.classList.add('dragging');
        
        // Set drag effect
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.outerHTML);
    });

    element.addEventListener('dragend', function(e) {
        this.classList.remove('dragging');
        container.classList.remove('dragging');
        
        // Remove drag over indicators from all elements
        const allItems = container.querySelectorAll('.track-entry, .track-heading, .image-entry, .comment-entry, .comment-heading');
        allItems.forEach(item => item.classList.remove('drag-over'));
        
        draggedElement = null;
    });

    element.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // Remove drag-over class from all siblings
        const siblings = container.querySelectorAll('.track-entry, .track-heading, .image-entry, .comment-entry, .comment-heading');
        siblings.forEach(sibling => sibling.classList.remove('drag-over'));

        // Add drag-over class to current element if it's not the dragged element
        if (this !== draggedElement) {
            this.classList.add('drag-over');
        }
    });

    element.addEventListener('drop', function(e) {
        e.preventDefault();
        
        if (this !== draggedElement && draggedElement) {
            // Determine if we should insert before or after
            const rect = this.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            
            if (e.clientY < midpoint) {
                // Insert before this element
                container.insertBefore(draggedElement, this);
            } else {
                // Insert after this element
                container.insertBefore(draggedElement, this.nextSibling);
            }
        }
        
        // Clean up
        this.classList.remove('drag-over');
    });

    // Handle dragging over the container itself (for empty areas)
    container.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });

    container.addEventListener('drop', function(e) {
        e.preventDefault();
        
        // Only append if dropping in empty space
        if (e.target === container && draggedElement) {
            container.appendChild(draggedElement);
        }
    });
}

// Function to add a track entry
function addTrack(name = '', link = '') {
    const soundtrackContainer = document.getElementById('soundtrack-container');
    const trackEntry = document.createElement('div');
    trackEntry.className = 'track-entry';
    trackEntry.draggable = true;
    trackEntry.innerHTML = `
        <input type="text" class="track-name" aria-label="Track name" placeholder="Track name" value="${rpSecurity.escapeAttribute(name)}">
        <input type="text" class="track-link" aria-label="Track link" placeholder="https://youtube.com/..." value="${rpSecurity.escapeAttribute(link)}">
        <button type="button" class="remove-track fake-btn-remove" title="Remove track" aria-label="Remove track">×</button>
    `;
    
    // Add event listener to the remove button
    const removeBtn = trackEntry.querySelector('.remove-track');
    removeBtn.addEventListener('click', function() {
        trackEntry.remove();
    });
    
    // Add drag and drop event listeners
    addDragListeners(trackEntry, soundtrackContainer);
    
    soundtrackContainer.appendChild(trackEntry);
}

// Function to add a track heading
function addTrackHeading(title = '') {
    const soundtrackContainer = document.getElementById('soundtrack-container');
    const headingEntry = document.createElement('div');
    headingEntry.className = 'track-heading';
    headingEntry.draggable = true;
    headingEntry.innerHTML = `
        <input type="text" class="track-heading-title" aria-label="Soundtrack section title" placeholder="Section title" value="${rpSecurity.escapeAttribute(title)}">
        <button type="button" class="remove-heading fake-btn-remove" title="Remove heading" aria-label="Remove soundtrack heading">×</button>
    `;
    
    // Add event listener to the remove button
    const removeBtn = headingEntry.querySelector('.remove-heading');
    removeBtn.addEventListener('click', function() {
        headingEntry.remove();
    });
    
    // Add drag and drop event listeners
    addDragListeners(headingEntry, soundtrackContainer);
    
    soundtrackContainer.appendChild(headingEntry);
}

// Function to add a comment entry
function addComment(text = '') {
    const commentsContainer = document.getElementById('comments-container');
    const commentEntry = document.createElement('div');
    commentEntry.className = 'comment-entry';
    commentEntry.draggable = true;
    commentEntry.innerHTML = `
        <div class="comment-entry-body">
            <div class="comment-entry-row">
                <textarea class="comment-text" aria-label="Author comment" placeholder="comment: Your comment text here...">${rpSecurity.escapeHTML(text)}</textarea>
                <button type="button" class="remove-comment fake-btn-remove" title="Remove comment" aria-label="Remove comment">×</button>
            </div>
        </div>
    `;
    
    // Add event listener to the remove button
    const removeBtn = commentEntry.querySelector('.remove-comment');
    removeBtn.addEventListener('click', function() {
        commentEntry.remove();
    });
    
    // Add drag and drop event listeners
    addDragListeners(commentEntry, commentsContainer);
    
    commentsContainer.appendChild(commentEntry);
}

// Function to add a comment heading
function addCommentHeading(title = '') {
    const commentsContainer = document.getElementById('comments-container');
    const headingEntry = document.createElement('div');
    headingEntry.className = 'comment-heading';
    headingEntry.draggable = true;
    headingEntry.innerHTML = `
        <div class="comment-heading-row">
            <input type="text" class="comment-heading-title" aria-label="Comment section title" placeholder="Section title" value="${rpSecurity.escapeAttribute(title)}">
            <button type="button" class="remove-comment-heading fake-btn-remove" title="Remove heading" aria-label="Remove comment heading">×</button>
        </div>
    `;
    
    // Add event listener to the remove button
    const removeBtn = headingEntry.querySelector('.remove-comment-heading');
    removeBtn.addEventListener('click', function() {
        headingEntry.remove();
    });
    
    // Add drag and drop event listeners
    addDragListeners(headingEntry, commentsContainer);
    
    commentsContainer.appendChild(headingEntry);
}

// Function to generate soundtrack HTML
function generateSoundtrackHTML() {
    const trackEntries = document.querySelectorAll('.track-entry, .track-heading');
    if (trackEntries.length === 0) {
        return '';
    }
    
    let soundtrackHTML = '';
    let currentSection = null;
    let hasTracks = false;
    
    trackEntries.forEach((entry, index) => {
        if (entry.classList.contains('track-heading')) {
            // If we have an open section, close it
            if (currentSection) {
                soundtrackHTML += '\n            </div>';
            }
            
            // Get heading title
            const title = entry.querySelector('.track-heading-title').value.trim();
            if (title) {
                // Start a new section
                soundtrackHTML += `\n            <div class="soundtrack-section">
                <div class="soundtrack-section-title">${rpSecurity.escapeHTML(title)}</div>`;
                currentSection = title;
            } else {
                currentSection = null;
            }
        } else if (entry.classList.contains('track-entry')) {
            // If we don't have an open section and this is the first track, create a default section
            if (!currentSection && !hasTracks) {
                soundtrackHTML += `\n            <div class="soundtrack-section">
                <div class="soundtrack-section-title">Tracks</div>`;
                currentSection = 'Tracks';
            }
            
            // Get track info
            const name = entry.querySelector('.track-name').value.trim();
            const link = entry.querySelector('.track-link').value.trim();
            
            if (name && link) {
                const safeLink = rpSecurity.safeURL(link);
                if (!safeLink) return;
                soundtrackHTML += `\n                <div class="soundtrack-track">
                    <a href="${rpSecurity.escapeAttribute(safeLink)}" target="_blank" rel="noopener noreferrer">${rpSecurity.escapeHTML(name)}</a>
                </div>`;
                hasTracks = true;
            }
        }
    });
    
    // Close the last section if open
    if (currentSection) {
        soundtrackHTML += '\n            </div>';
    }
    
    return soundtrackHTML;
}

// Function to generate comments HTML
function generateCommentsHTML() {
    const commentEntries = document.querySelectorAll('.comment-entry, .comment-heading');
    if (commentEntries.length === 0) {
        return '';
    }
    
    window.RPLogger?.debug('Generating comments HTML for', commentEntries.length, 'entries');
    
    let commentsHTML = '';
    let currentSection = null;
    let hasComments = false;
    
    commentEntries.forEach((entry, index) => {
        window.RPLogger?.debug(`Processing comment entry ${index}:`, entry.className);
        
        if (entry.classList.contains('comment-heading')) {
            // If we have an open section, close it
            if (currentSection) {
                commentsHTML += '\n            </div>';
            }
            
            // Get heading title
            const title = entry.querySelector('.comment-heading-title').value.trim();
            window.RPLogger?.debug('Found comment heading:', title);
            
            if (title) {
                // Start a new section
                commentsHTML += `\n            <div class="comments-section">
                <div class="comments-section-title">${rpSecurity.escapeHTML(title)}</div>`;
                currentSection = title;
            } else {
                currentSection = null;
            }
        } else if (entry.classList.contains('comment-entry')) {
            // If we don't have an open section and this is the first comment, create a default section
            if (!currentSection && !hasComments) {
                commentsHTML += `\n            <div class="comments-section">
                <div class="comments-section-title">Comments</div>`;
                currentSection = 'Comments';
            }
            
            // Get comment text
            const commentTextArea = entry.querySelector('.comment-text');
            const commentText = commentTextArea ? commentTextArea.value.trim() : '';
            
            window.RPLogger?.debug('Found comment entry');
            
            if (commentText) {
                // Parse the comment format and create separate blocks for each "comment:" entry
                const lines = commentText.split('\n');
                let currentComment = '';
                
                window.RPLogger?.debug('Processing comment lines:', lines.length);
                
                for (let line of lines) {
                    line = line.trim();
                    if (line.toLowerCase().startsWith('comment:')) {
                        window.RPLogger?.debug('Found comment prefix');
                        
                        // If we have a previous comment, process it first
                        if (currentComment.trim()) {
                            const parsedComment = parseMarkdown(currentComment.trim());
                            window.RPLogger?.debug('Creating comment block');
                            commentsHTML += `\n                <div class="comment-block">
                    ${parsedComment}
                </div>`;
                            hasComments = true;
                        }
                        
                        // Start a new comment, removing the "comment:" prefix
                        currentComment = line.substring(8).trim();
                        if (currentComment) {
                            currentComment += '\n';
                        }
                    } else if (currentComment !== '') {
                        // Continue multiline comment only if we have started a comment
                        currentComment += line + '\n';
                    } else if (line.toLowerCase().includes('comment:')) {
                        // Handle cases where comment: might not be at the start
                        const commentIndex = line.toLowerCase().indexOf('comment:');
                        currentComment = line.substring(commentIndex + 8).trim() + '\n';
                        window.RPLogger?.debug('Found embedded comment prefix');
                    }
                }
                
                // Process the final comment if there is one
                if (currentComment.trim()) {
                    const parsedComment = parseMarkdown(currentComment.trim());
                    window.RPLogger?.debug('Creating final comment block');
                    commentsHTML += `\n                <div class="comment-block">
                    ${parsedComment}
                </div>`;
                    hasComments = true;
                }
            } else {
                window.RPLogger?.debug('Comment entry has no text content');
            }
        }
    });
    
    // Close the last section if open
    if (currentSection) {
        commentsHTML += '\n            </div>';
    }
    
    window.RPLogger?.debug('Generated comments HTML:', { hasComments });
    
    return commentsHTML;
}

// Function to add a glossary entry
function addGlossaryEntry(term = '', definition = '') {
    const glossaryContainer = document.getElementById('glossary-container');
    const entryDiv = document.createElement('div');
    entryDiv.className = 'glossary-entry';
    entryDiv.draggable = true;
    entryDiv.innerHTML = `
        <div class="glossary-entry-row">
            <input type="text" class="glossary-term" aria-label="Glossary term" placeholder="Term or phrase" value="${rpSecurity.escapeAttribute(term)}">
            <textarea class="glossary-definition" aria-label="Glossary definition" placeholder="Definition...">${rpSecurity.escapeHTML(definition)}</textarea>
            <button type="button" class="remove-glossary fake-btn-remove" title="Remove entry" aria-label="Remove glossary entry">×</button>
        </div>
    `;
    
    // Add event listener to the remove button
    const removeBtn = entryDiv.querySelector('.remove-glossary');
    removeBtn.addEventListener('click', function() {
        entryDiv.remove();
    });
    
    // Add drag and drop event listeners
    addDragListeners(entryDiv, glossaryContainer);
    
    glossaryContainer.appendChild(entryDiv);
}

// Function to generate glossary HTML
function generateGlossaryHTML() {
    const glossaryEntries = document.querySelectorAll('.glossary-entry');
    const firstOnly = document.getElementById('glossary-first-only')?.checked || false;
    const showTooltips = document.getElementById('glossary-show-tooltips')?.checked || false;
    const showSection = document.getElementById('glossary-show-section')?.checked || false;
    
    if (glossaryEntries.length === 0) {
        return { glossaryHTML: '', glossaryData: [], options: { firstOnly, showTooltips, showSection } };
    }
    
    // Collect glossary data
    const glossaryData = [];
    glossaryEntries.forEach((entry, index) => {
        const term = entry.querySelector('.glossary-term').value.trim();
        const definition = entry.querySelector('.glossary-definition').value.trim();
        
        if (term && definition) {
            glossaryData.push({
                id: `glossary-${index + 1}`,
                term: term,
                definition: definition
            });
        }
    });
    
    if (glossaryData.length === 0) {
        return { glossaryHTML: '', glossaryData: [], options: { firstOnly, showTooltips, showSection } };
    }
    
    // Generate glossary section HTML
    let glossaryHTML = '';
    if (showSection) {
        glossaryHTML = '\n    <div class="glossary-section">\n        <h3 class="glossary-title">Glossary</h3>\n        <div class="glossary-entries">';
        
        glossaryData.forEach(item => {
            glossaryHTML += `\n            <div class="glossary-item" id="${item.id}">
                <span class="glossary-return" onclick="returnToText()" title="Return to text">↑</span>
                <strong class="glossary-term-label">${rpSecurity.escapeHTML(item.term)}:</strong>
                <span class="glossary-definition-text">${rpSecurity.escapeHTML(item.definition)}</span>
            </div>`;
        });
        
        glossaryHTML += '\n        </div>\n    </div>';
    }
    
    return { glossaryHTML, glossaryData, options: { firstOnly, showTooltips, showSection } };
}

// Function to process content and add glossary links
function processGlossaryLinks(content, glossaryData, options, matchTracker = null) {
    if (!glossaryData || glossaryData.length === 0) {
        return content;
    }
    
    const { firstOnly, showTooltips } = options;
    
    // Initialize match tracker if not provided
    if (!matchTracker) {
        matchTracker = {};
        glossaryData.forEach(item => {
            matchTracker[item.id] = 0;
        });
    }
    
    // Sort glossary data by term length (longest first) to handle overlapping terms
    const sortedGlossary = [...glossaryData].sort((a, b) => b.term.length - a.term.length);
    
    // Process each glossary term
    sortedGlossary.forEach(item => {
        // Create a regex that matches the term (case-insensitive, whole word)
        const escapedTerm = rpSecurity.escapeRegExp(rpSecurity.escapeHTML(item.term));
        const regex = new RegExp(`\\b(${escapedTerm})\\b`, 'gi');
        
        // Find all matches in the content
        content = content.split(/(<[^>]+>)/g).map(fragment => {
            if (fragment.startsWith('<')) return fragment;
            return fragment.replace(regex, (match) => {
            // Increment match count for this term
            matchTracker[item.id]++;
            
            // If firstOnly is enabled and we've already matched this term, skip
            if (firstOnly && matchTracker[item.id] > 1) {
                return match;
            }
            
            // Build the glossary link
            const tooltipAttr = showTooltips ? ` data-glossary-tooltip="${rpSecurity.escapeAttribute(item.definition)}"` : '';
            return `<span class="glossary-link" data-glossary-id="${item.id}"${tooltipAttr} onclick="scrollToGlossary('${item.id}')">${match}</span>`;
            });
        }).join('');
    });
    
    return content;
}
