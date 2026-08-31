// Notebook note-linking controller

class NoteLinkingManager {
    constructor(notebookManager) {
        this.notebook = notebookManager;
        this.initializeNoteLinking();
    }

    // Initialize note linking functionality
    initializeNoteLinking() {
        this.setupNoteLinkModal();
        this.enhanceNotebookPreview();
        console.log('🔗 Note linking initialized');
    }

    // Enhance the notebook's preview functionality
    enhanceNotebookPreview() {
        // Store original updatePreview method
        const originalUpdatePreview = this.notebook.updatePreview.bind(this.notebook);
        
        // Override with enhanced version
        this.notebook.updatePreview = () => {
            originalUpdatePreview();
            this.setupNoteLinkHandlers();
        };

        this.notebook.showNoteLinkHelper = () => {
            this.showNoteLinkModal();
        };
    }

    // Setup click handlers for note links in preview
    setupNoteLinkHandlers() {
        const previewContent = document.getElementById('preview-content');
        if (!previewContent) return;
        
        previewContent.querySelectorAll('.note-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const noteName = e.target.dataset.noteName;
                
                if (link.classList.contains('broken')) {
                    // Offer to create new note
                    this.handleBrokenNoteLink(noteName);
                } else {
                    // Load existing note
                    this.loadNoteByName(noteName);
                }
            });
        });
    }

    // Load note by name instead of ID
    async loadNoteByName(noteName) {
        try {
            // Find note by name (case insensitive)
            const note = this.notebook.savedNotes.find(n => 
                n.name.toLowerCase() === noteName.toLowerCase()
            );
            
            if (!note) {
                this.notebook.showToast('Note not found', 'error');
                return;
            }

            // Load the note using the notebook's loadNote method
            await this.notebook.loadNote(note.id);
            
        } catch (error) {
            console.error('Error loading linked note:', error);
            this.notebook.showToast('Failed to load linked note', 'error');
        }
    }

    // Handle broken note links (offer to create new note)
    async handleBrokenNoteLink(noteName) {
        const discardWarning = this.notebook.isDirty
            ? ' Your current note has unsaved changes and will be discarded.'
            : '';
        const confirmed = await this.notebook.confirmAction({
            title: 'Create linked note?',
            message: `“${noteName}” does not exist.${discardWarning}`,
            icon: 'fas fa-link',
            confirmLabel: 'Create note',
            danger: this.notebook.isDirty
        });
        if (confirmed) this.createLinkedNote(noteName);
    }

    // Create new note from broken link
    createLinkedNote(noteName) {
        this.notebook.beginEditorSession({
            id: this.notebook.generateNoteId(),
            name: noteName,
            content: `# ${noteName}\n\n`,
            collection: '',
            created: Date.now(),
            lastModified: Date.now()
        });

        // Update the editor
        const editor = this.notebook.getTextEditor();
        const titleInput = document.getElementById('note-title-input');
        
        if (editor) {
            if (editor.tagName === 'TEXTAREA') {
                editor.value = this.notebook.currentNote.content;
            } else {
                editor.textContent = this.notebook.currentNote.content;
            }
        }
        
        if (titleInput) {
            titleInput.value = this.notebook.currentNote.name;
        }
        
        this.notebook.editorRevision += 1;
        this.notebook.isDirty = true;
        this.notebook.updateStatus();
        this.notebook.updatePreview();
        this.notebook.renderCollectionsTree();

        this.notebook.showToast(`Created new note: "${noteName}"`, 'success');
        
        // Focus editor and position cursor at end
        if (editor) {
            editor.focus();
            if (editor.tagName === 'TEXTAREA') {
                editor.setSelectionRange(editor.value.length, editor.value.length);
            } else {
                this.setCursorToEnd(editor);
            }
        }
    }

    // Setup note link insertion modal
    setupNoteLinkModal() {
        // The modal will be created dynamically when needed
        console.log('🔗 Note link modal setup ready');
    }

    // Show note link insertion modal
    showNoteLinkModal() {
        // Remove existing modal if any
        const existingModal = document.getElementById('note-link-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'note-link-modal';
        modal.className = 'modal-overlay notebook-modal-overlay';
        
        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px solid var(--border-primary); box-shadow: var(--shadow-xl); max-width: 500px; width: 90%; max-height: 80vh; overflow: hidden;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-md) var(--space-lg); border-bottom: 1px solid var(--border-primary); background: var(--bg-tertiary);">
                    <h3 id="note-link-modal-title" style="margin: 0; color: var(--text-primary);">Insert Note Link</h3>
                    <button type="button" class="close-btn" aria-label="Close note link dialog" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: var(--font-size-sm); padding: var(--space-xs); border-radius: var(--radius-sm);">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding: var(--space-lg);">
                    <div class="form-group" style="margin-bottom: var(--space-md);">
                        <label style="display: block; margin-bottom: var(--space-xs); color: var(--text-primary); font-weight: 500;">Find Note:</label>
                        <input type="text" id="note-link-search" placeholder="Type to search notes..." style="width: 100%; padding: var(--space-sm); background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); color: var(--text-inputs); margin-bottom: var(--space-md);">
                        <div class="helper-text" style="font-size: var(--font-size-xs); color: var(--text-tertiary);">Or type a new note name to create a link</div>
                    </div>
                    
                    <div class="note-list" id="note-link-list" style="max-height: 300px; overflow-y: auto; background: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); padding: var(--space-sm);">
                        <!-- Note list will be populated here -->
                    </div>
                    
                    <div class="modal-actions" style="display: flex; gap: var(--space-sm); justify-content: flex-end; margin-top: var(--space-lg);">
                        <button type="button" id="insert-note-link-btn" class="btn-primary" disabled>
                            <i class="fas fa-link"></i> Insert Link
                        </button>
                        <button type="button" class="btn-secondary cancel-btn">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;

        window.ToolkitDialogs?.enhance(modal, { labelledBy: 'note-link-modal-title' });

        document.body.appendChild(modal);
        
        // Setup functionality
        this.setupNoteLinkModalHandlers(modal);
        
        // Focus search input
        const searchInput = document.getElementById('note-link-search');
        if (searchInput) {
            searchInput.focus();
        }
    }

    // Setup note link modal handlers
    setupNoteLinkModalHandlers(modal) {
        const searchInput = document.getElementById('note-link-search');
        const noteList = document.getElementById('note-link-list');
        const insertBtn = document.getElementById('insert-note-link-btn');
        
        let selectedNoteName = '';
        let ignoreNextInput = false;
        
        // Search functionality
        searchInput.addEventListener('input', () => {
            if (ignoreNextInput) {
                ignoreNextInput = false;
                return;
            }
            
            const searchTerm = searchInput.value.toLowerCase();
            this.filterNotesForLinking(searchTerm, noteList, (noteName) => {
                selectedNoteName = noteName;
                insertBtn.disabled = false;
            });
            
            // Enable insert button if there's text
            if (searchInput.value.trim()) {
                selectedNoteName = searchInput.value.trim();
                insertBtn.disabled = false;
            } else {
                selectedNoteName = '';
                insertBtn.disabled = true;
            }
        });
        
        // Initial population
        this.filterNotesForLinking('', noteList, (noteName) => {
            selectedNoteName = noteName;
            insertBtn.disabled = false;
        });
        
        // Insert button handler
        insertBtn.addEventListener('click', () => {
            if (selectedNoteName) {
                this.insertNoteLinkAtCursor(selectedNoteName);
                modal.remove();
            }
        });
        
        // Store the ignore flag function
        this._setSearchValueWithoutTrigger = (value) => {
            ignoreNextInput = true;
            searchInput.value = value;
        };
        
        // Close modal handlers
        modal.querySelector('.close-btn').addEventListener('click', () => {
            modal.remove();
        });
        modal.querySelector('.cancel-btn').addEventListener('click', () => modal.remove());
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        // Close on ESC
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    // Filter and display notes for linking
    filterNotesForLinking(searchTerm, container, onSelectCallback) {
        // Filter out current note and apply search
        const filteredNotes = this.notebook.savedNotes.filter(note =>
            note.name.toLowerCase().includes(searchTerm) &&
            note.id !== this.notebook.currentNote.id // Exclude current note
        );
        
        container.innerHTML = '';
        
        if (filteredNotes.length === 0) {
            container.innerHTML = `
                <div style="padding: var(--space-md); text-align: center; color: var(--text-tertiary);">
                    ${searchTerm ? 'No notes found' : 'No other notes available'}
                </div>
            `;
            return;
        }
        
        filteredNotes.forEach(note => {
            const noteItem = document.createElement('button');
            noteItem.type = 'button';
            noteItem.className = 'note-link-item';
            
            noteItem.innerHTML = `
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-xs);">${this.escapeHtml(note.name)}</div>
                <div style="font-size: 12px; color: var(--text-tertiary);">${note.collection || 'Uncategorized'} • ${this.countWords(note.content)} words</div>
            `;
            
            // Hover effects
            noteItem.addEventListener('mouseenter', () => {
                if (!noteItem.classList.contains('selected')) {
                    noteItem.style.backgroundColor = 'var(--bg-quaternary)';
                    noteItem.style.borderColor = 'var(--border-secondary)';
                }
            });
            
            noteItem.addEventListener('mouseleave', () => {
                if (!noteItem.classList.contains('selected')) {
                    noteItem.style.backgroundColor = 'transparent';
                    noteItem.style.borderColor = 'transparent';
                }
            });
            
            // Click to select
            noteItem.addEventListener('click', () => {
                // Update search input WITHOUT triggering rebuild
                if (this._setSearchValueWithoutTrigger) {
                    this._setSearchValueWithoutTrigger(note.name);
                } else {
                    document.getElementById('note-link-search').value = note.name;
                }
                
                // Clear previous selections
                container.querySelectorAll('.note-link-item').forEach(item => {
                    item.classList.remove('selected');
                    item.style.backgroundColor = 'transparent';
                    item.style.borderColor = 'transparent';
                    item.style.color = '';
                });
                
                // Highlight selected
                noteItem.classList.add('selected');
                noteItem.style.backgroundColor = 'var(--accent-primary)';
                noteItem.style.color = 'var(--bg-primary)';
                
                // Trigger callback
                if (onSelectCallback) {
                    onSelectCallback(note.name);
                }
            });
            
            container.appendChild(noteItem);
        });
    }

    // Insert note link at cursor position
    insertNoteLinkAtCursor(noteName) {
        const editor = this.notebook.getTextEditor();
        if (!editor) {
            this.notebook.showToast('No active editor found', 'error');
            return;
        }

        const linkText = `[[${noteName}]]`;
        
        if (editor.tagName === 'TEXTAREA') {
            // Textarea method
            const cursorPos = editor.selectionStart;
            const currentValue = editor.value;
            const newValue = currentValue.slice(0, cursorPos) + linkText + currentValue.slice(cursorPos);
            editor.value = newValue;
            
            // Update cursor position
            const newCursorPos = cursorPos + linkText.length;
            editor.setSelectionRange(newCursorPos, newCursorPos);
        } else {
            // ContentEditable method (fallback)
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(linkText));
                range.collapse(false);
            }
        }
        
        this.notebook.onContentChange();
        this.notebook.showToast(`Inserted link to "${noteName}"`, 'success');
        
        // Focus back on editor
        editor.focus();
    }

    // Utility methods
    setCursorToEnd(element) {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    countWords(text) {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }
}

// Make available globally for initialization
window.NoteLinkingManager = NoteLinkingManager;
