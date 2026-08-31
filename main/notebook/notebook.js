// Notebook editor controller

class NotebookManager {
    constructor() {
        this.currentNote = {
            id: null,
            name: 'Untitled Note',
            content: '',
            collection: '',
            created: null,
            lastModified: null
        };
        this.currentNotebookId = 'default';
        this.workspaceManager = null; 
        this.savedNotes = [];
        this.snippets = [];
        this.collectionsArray = [''];
        this.collectionsManager = null; 
        this.isPreviewMode = false;
        this.isDirty = false;
        this.autoSaveTimer = null;
        this.wordCountTimer = null;
        this.editorRevision = 0;
        this.lastSavedRevision = 0;
        this.editorSession = 0;
        this.dataLoadToken = 0;
        this.isActive = false;
        this.client = new NotebookClient(() => this.getUserContext());
        this.integrationController = new NotebookIntegrationController(this);
        this.noteSaveQueue = new NotebookSaveQueue(({ noteData, notebookId }) => (
            this.saveNoteToServer(noteData, notebookId)
        ));
        
        this.initializeNotebook();
    }

    // Initialize Notebook functionality
    async initializeNotebook() {
        this.setupEventListeners();
        this.setupAutoSave();
        this.setupWordCounter();
        this.integrationController.activate();
        this.isActive = true;

        // Initialize collection state and rendering.
        if (window.CollectionsManager) {
            this.collectionsManager = new CollectionsManager(this);
        }

        // Initialize export manager
        this.exportManager = new NotebookExportManager(this);

        // Initialize note linking
        if (window.NoteLinkingManager) {
            this.noteLinking = new NoteLinkingManager(this);
        }

        // Link with workspace manager
        if (window.notebookWorkspaceManager) {
            this.workspaceManager = window.notebookWorkspaceManager;
            this.workspaceManager.setNotebookManager(this);
            this.currentNotebookId = this.workspaceManager.currentNotebookId;
            
            // If workspace manager hasn't finished loading notebooks yet, wait for it
            if (!this.workspaceManager.isInitialized) {
                // Don't load user data yet - workspace manager will trigger it when ready
                return;
            }
        }

        await this.loadUserData();        
        console.log('📒 Notebook initialized');
    }

    // Setup event listeners
    setupEventListeners() {
        // Sidebar buttons
        document.getElementById('new-note-btn')?.addEventListener('click', () => {
            void this.createNewNote();
            this.setSidebarOpen(false);
        });

        document.getElementById('save-note-btn')?.addEventListener('click', () => {
            this.saveCurrentNote().catch(() => {});
        });

        document.getElementById('snippets-btn')?.addEventListener('click', () => {
            this.openSnippetBrowser();
        });

        document.getElementById('link-notes-btn')?.addEventListener('click', () => {
            this.showNoteLinkHelper();
        });

        // Note title input
        const titleInput = document.getElementById('note-title-input');
        if (titleInput) {
            titleInput.addEventListener('input', () => {
                this.currentNote.name = titleInput.value || 'Untitled Note';
                this.onContentChange();
            });
        }

        // THE ACTUAL TEXT EDITOR - Use textarea, not contentEditable
        const textarea = this.getTextEditor();
        if (textarea) {
            textarea.addEventListener('input', () => {
                this.onContentChange();
            });

            // Handle tab key for indentation
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    this.insertText('    '); // 4 spaces
                }
            });
        }

        // Formatting toolbar
        document.querySelectorAll('.format-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const format = btn.dataset.format;
                if (format) {
                    this.applyFormatting(format);
                }
            });
        });

        // Preview toggle
        document.getElementById('toggle-preview')?.addEventListener('click', () => {
            this.togglePreview();
        });

        // Double-click preview to return to edit mode
        document.addEventListener('dblclick', (e) => {
            if (this.isPreviewMode && e.target.closest('#preview-content')) {
                this.togglePreview();
            }
        });

        // Search functionality
        const searchInput = document.getElementById('notes-search');
        const searchClear = document.getElementById('search-clear');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        }
        searchClear?.addEventListener('click', () => {
            if (!searchInput) return;
            searchInput.value = '';
            this.handleSearch('');
            searchInput.focus();
        });

        document.getElementById('notebook-sidebar-toggle')?.addEventListener('click', () => {
            const container = document.querySelector('.notebook-container');
            this.setSidebarOpen(!container?.classList.contains('sidebar-open'));
        });
        document.querySelector('.notebook-sidebar-scrim')?.addEventListener('click', () => {
            this.setSidebarOpen(false);
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') this.setSidebarOpen(false);
        });
        this.setupSidebarResize();

        // Snippets panel
        document.getElementById('close-snippets-btn')?.addEventListener('click', () => {
            this.closeSnippetsPanel();
        });

        // Close snippets panel when clicking outside
        this.snippetsPanelClickHandler = (e) => {
            if (e.target.closest('.modal-overlay')) {
                return;
            }
            
            const snippetsPanel = document.querySelector('.snippets-panel');
            const snippetsBtn = document.getElementById('snippets-btn');
            
            if (snippetsPanel && snippetsPanel.classList.contains('open')) {
                if (!snippetsPanel.contains(e.target) && !snippetsBtn.contains(e.target)) {
                    this.closeSnippetsPanel();
                }
            }
        };

        // Remove old listener if exists
        if (this._snippetsPanelListenerAttached) {
            document.removeEventListener('click', this.snippetsPanelClickHandler);
        }

        document.addEventListener('click', this.snippetsPanelClickHandler);
        this._snippetsPanelListenerAttached = true;

        // Snippets search
        const snippetsSearchInput = document.getElementById('snippets-search');
        if (snippetsSearchInput) {
            snippetsSearchInput.addEventListener('input', (e) => {
                this.filterSnippets(e.target.value);
            });
        }

        // Clear tag filter button
        document.getElementById('clear-tag-filter')?.addEventListener('click', () => {
            this.clearTagFilter();
        });

    }

    setSidebarOpen(isOpen) {
        const container = document.querySelector('.notebook-container');
        const toggle = document.getElementById('notebook-sidebar-toggle');
        container?.classList.toggle('sidebar-open', Boolean(isOpen));
        toggle?.setAttribute('aria-expanded', String(Boolean(isOpen)));
    }

    async confirmAction(options) {
        const dialogs = window.ToolkitDialogs || window.CoWriterDialogs;
        if (dialogs?.confirm) {
            return dialogs.confirm(options);
        }

        return false;
    }

    setupSidebarResize() {
        const handle = document.querySelector('.sidebar-resize-handle');
        const sidebar = document.querySelector('.notebook-sidebar');
        if (!handle || !sidebar) return;

        const minWidth = 250;
        const maxWidth = 500;
        const setWidth = value => {
            const width = Math.min(maxWidth, Math.max(minWidth, Math.round(value)));
            sidebar.style.width = `${width}px`;
            handle.setAttribute('aria-valuemin', String(minWidth));
            handle.setAttribute('aria-valuemax', String(maxWidth));
            handle.setAttribute('aria-valuenow', String(width));
        };

        handle.addEventListener('pointerdown', event => {
            if (window.matchMedia('(max-width: 768px)').matches) return;
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = sidebar.getBoundingClientRect().width;

            const move = moveEvent => setWidth(startWidth + moveEvent.clientX - startX);
            const stop = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', stop);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };

            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', stop, { once: true });
        });

        handle.addEventListener('keydown', event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            setWidth(sidebar.getBoundingClientRect().width + direction * 16);
        });

        setWidth(sidebar.getBoundingClientRect().width || 300);
    }

    // Get the actual text editor element
    getTextEditor() {
        // Try the new editor first, fall back to old one
        return document.getElementById('markdown-editor') ||
               document.getElementById('notebook-textarea') ||
               document.querySelector('.editor-content[contenteditable]') ||
               document.querySelector('textarea[placeholder*="Start writing"]');
    }

    // Create new note
    async createNewNote({ skipUnsavedCheck = false, silent = false } = {}) {
        if (!skipUnsavedCheck && this.isDirty) {
            const confirmed = await this.confirmAction({
                title: 'Create a new note?',
                message: 'Your current note has unsaved changes. Creating a new note will discard them.',
                icon: 'fas fa-file-circle-plus',
                confirmLabel: 'Discard and create',
                danger: true
            });
            if (!confirmed) {
                return;
            }
        }

        this.beginEditorSession({
            id: null,
            name: 'Untitled Note',
            content: '',
            collection: '',
            created: null,
            lastModified: null
        });

        const editor = this.getTextEditor();
        const titleInput = document.getElementById('note-title-input');
        
        if (editor) {
            if (editor.tagName === 'TEXTAREA') {
                editor.value = '';
            } else {
                editor.textContent = '';
            }
        }
        
        if (titleInput) {
            titleInput.value = this.currentNote.name;
        }
        
        this.updateStatus();
        this.updatePreview();
        this.updateWordCount();
        this.updateNoteBreadcrumb();
        this._forceRebuild = true;
        this.renderCollectionsTree();

        if (!silent) {
            this.showToast('New note created', 'info');
        }
    }

    // Handle content changes
    onContentChange() {
        const editor = this.getTextEditor();
        if (!editor) return;
        
        // Get content based on editor type
        if (editor.tagName === 'TEXTAREA') {
            this.currentNote.content = editor.value;
        } else {
            this.currentNote.content = editor.textContent || '';
        }
        
        this.editorRevision += 1;
        this.isDirty = true;
        this.updateStatus();
        
        // Update preview if in preview mode
        if (this.isPreviewMode) {
            this.updatePreview();
        }

        this.updateWordCount();
        this.resetAutoSave();
    }

    // Apply formatting
    applyFormatting(format) {
        const editor = this.getTextEditor();
        if (!editor) return;

        let selectedText = '';
        let startPos = 0;
        let endPos = 0;

        // Get selection based on editor type
        if (editor.tagName === 'TEXTAREA') {
            startPos = editor.selectionStart;
            endPos = editor.selectionEnd;
            selectedText = editor.value.substring(startPos, endPos);
        } else {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                selectedText = selection.toString();
            }
        }

        let replacement = '';
        
        switch (format) {
            case 'bold':
                replacement = `**${selectedText}**`;
                break;
            case 'italic':
                replacement = `*${selectedText}*`;
                break;
            case 'code':
                replacement = `\`${selectedText}\``;
                break;
            case 'h1':
                replacement = `# ${selectedText}`;
                break;
            case 'h2':
                replacement = `## ${selectedText}`;
                break;
            case 'h3':
                replacement = `### ${selectedText}`;
                break;
            case 'quote':
                replacement = `> ${selectedText}`;
                break;
        }

        if (replacement) {
            if (editor.tagName === 'TEXTAREA') {
                // Textarea method
                const newValue = editor.value.substring(0, startPos) + replacement + editor.value.substring(endPos);
                editor.value = newValue;
                editor.setSelectionRange(startPos + replacement.length, startPos + replacement.length);
                editor.focus();
            } else {
                // ContentEditable method
                this.insertText(replacement);
            }
            this.onContentChange();
        }
    }

    // Insert text
    insertText(text) {
        const editor = this.getTextEditor();
        if (!editor) return;

        if (editor.tagName === 'TEXTAREA') {
            // Textarea method
            const start = editor.selectionStart;
            editor.setRangeText(text);
            editor.setSelectionRange(start + text.length, start + text.length);
            editor.focus();
        } else {
            // ContentEditable method
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }

        this.onContentChange();
    }

    // Open the snippet editor.
    openSnippetModal(selectedText = '', source = {}) {
        // Remove existing modal if any
        const existingModal = document.getElementById('snippet-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'snippet-modal';
        modal.className = 'modal-overlay notebook-modal-overlay';
        
        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px solid var(--border-primary); box-shadow: var(--shadow-xl); max-width: 500px; width: 90%; max-height: 80vh; overflow: hidden;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-md) var(--space-lg); border-bottom: 1px solid var(--border-primary); background: var(--bg-tertiary);">
                    <h3 id="snippet-modal-title" style="margin: 0; color: var(--text-primary);">Create Snippet</h3>
                    <button type="button" class="close-btn" id="close-snippet-modal" aria-label="Close snippet dialog" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: var(--font-size-sm); padding: var(--space-xs); border-radius: var(--radius-sm);">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding: var(--space-lg);">
                    <div class="form-group" style="margin-bottom: var(--space-md);">
                        <label style="display: block; margin-bottom: var(--space-xs); color: var(--text-primary); font-weight: 500;">Title:</label>
                        <input type="text" id="snippet-title" placeholder="Enter snippet title..." style="width: 100%; padding: var(--space-sm); background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); color: var(--text-inputs);">
                    </div>
                    <div class="form-group" style="margin-bottom: var(--space-md);">
                        <label style="display: block; margin-bottom: var(--space-xs); color: var(--text-primary); font-weight: 500;">Tags (comma-separated):</label>
                        <input type="text" id="snippet-tags" placeholder="worldbuilding, character, plot..." style="width: 100%; padding: var(--space-sm); background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); color: var(--text-inputs);">
                    </div>
                    <div class="form-group" style="margin-bottom: var(--space-lg);">
                        <label style="display: block; margin-bottom: var(--space-xs); color: var(--text-primary); font-weight: 500;">Content:</label>
                        <textarea id="snippet-content" rows="6" placeholder="Snippet content..." style="width: 100%; padding: var(--space-sm); background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); color: var(--text-inputs); resize: vertical;"></textarea>
                    </div>
                    <div class="modal-actions" style="display: flex; gap: var(--space-sm); justify-content: flex-end;">
                        <button type="button" id="save-snippet-btn" class="btn-primary">
                            <i class="fas fa-save"></i> Save Snippet
                        </button>
                        <button type="button" id="cancel-snippet-btn" class="btn-secondary">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.querySelector('#snippet-content').value = selectedText;
        modal.dataset.sourceType = source.sourceType === 'cowriter' ? 'cowriter' : 'manual';
        if (source.chatSessionId) modal.dataset.chatSessionId = source.chatSessionId;
        window.ToolkitDialogs?.enhance(modal, { labelledBy: 'snippet-modal-title' });

        document.body.appendChild(modal);
        
        // Focus title input
        const titleInput = document.getElementById('snippet-title');
        if (titleInput) {
            titleInput.focus();
        }

        // Add event listeners
        document.getElementById('close-snippet-modal')?.addEventListener('click', () => {
            modal.remove();
        });

        document.getElementById('save-snippet-btn')?.addEventListener('click', () => {
            this.saveSnippet();
        });

        document.getElementById('cancel-snippet-btn')?.addEventListener('click', () => {
            modal.remove();
        });

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });        
    }

    // Save a new snippet.
    async saveSnippet() {
        const titleInput = document.getElementById('snippet-title');
        const tagsInput = document.getElementById('snippet-tags');
        const contentTextarea = document.getElementById('snippet-content');
        const modal = document.getElementById('snippet-modal');
        
        const title = titleInput?.value.trim();
        const content = contentTextarea?.value.trim();
        const tags = tagsInput?.value.split(',').map(t => t.trim()).filter(t => t);
        
        if (!title) {
            this.showToast('Please enter a title for the snippet', 'warning');
            titleInput?.focus();
            return;
        }

        if (!content) {
            this.showToast('Please enter content for the snippet', 'warning');
            contentTextarea?.focus();
            return;
        }

        if (!this.isUserLoggedIn()) {
            this.showToast('Please log in to save snippets', 'warning');
            return;
        }

        const snippetData = {
            id: this.generateSnippetId(),
            title: title,
            content: content,
            tags: tags,
            created: Date.now(),
            lastModified: Date.now(),
            chatSessionId: modal?.dataset.chatSessionId || null,
            sourceType: modal?.dataset.sourceType || 'manual'
        };

        try {
            const savedSnippet = await this.saveSnippetToServer(snippetData);
            this.snippets.push(savedSnippet);
            
            // Close modal
            const modal = document.getElementById('snippet-modal');
            if (modal) {
                modal.remove();
            }            
        } catch (error) {
            this.showToast('Failed to save snippet', 'error');
            console.error('❌ Error saving snippet:', error);
        }
    }

    // Insert a snippet at the editor selection.
    insertSnippet(snippet) {
        const editor = this.getTextEditor();
        if (!editor) {
            this.showToast('No active editor found', 'error');
            return;
        }
        
        // Create snippet markup
        const snippetMarkup = `\n<div class="snippet-highlight">\n${snippet.content}\n<span class="snippet-tag">${snippet.tags[0] || 'snippet'}</span>\n</div>\n`;
        if (editor.tagName === 'TEXTAREA') {
            // Textarea method
            const cursorPos = editor.selectionStart;
            const currentValue = editor.value;
            const newValue = currentValue.slice(0, cursorPos) + snippetMarkup + currentValue.slice(cursorPos);
            editor.value = newValue;
            
            // Update cursor position
            const newCursorPos = cursorPos + snippetMarkup.length;
            editor.setSelectionRange(newCursorPos, newCursorPos);
        } else {
            // ContentEditable method
            this.insertText(snippetMarkup);
        }
        
        this.onContentChange();
        this.closeSnippetsPanel();
        this.showToast(`Inserted snippet: ${snippet.title}`, 'success');
        
        // Focus back on editor
        editor.focus();
    }

    // Render the collection tree and its notes.
    renderCollectionsTree() {
        const container = document.getElementById('collections-tree');
        if (!container) return;

        // Only rebuild if something actually changed
        const currentNoteIds = this.savedNotes.map(n => n.id).sort().join(',');
        if (this._lastRenderedNoteIds === currentNoteIds && !this._forceRebuild) {
            return; // Skip rebuild
        }
        this._lastRenderedNoteIds = currentNoteIds;
        this._forceRebuild = false;

        if (this._lazyLoadObservers) {
            this._lazyLoadObservers.forEach(observer => {
                try {
                    observer.disconnect();
                } catch (e) {
                    // Observer might already be disconnected
                }
            });
            this._lazyLoadObservers = [];
        }

        container.innerHTML = '';

        // Use collections manager if available
        if (this.collectionsManager) {
            // Rebuild collections from current notes
            this.collectionsManager.rebuildFromNotes(this.savedNotes);
            
            // Render each collection
            const collections = this.collectionsManager.getAllCollections();
            
            // Sort collections: Uncategorized first, then alphabetical
            collections.sort((a, b) => {
                if (a.key === '') return -1; // Uncategorized first
                if (b.key === '') return 1;
                
                // Sort by hierarchy, then alphabetically
                const aLevel = a.level || 1;
                const bLevel = b.level || 1;
                
                if (aLevel !== bLevel) {
                    return aLevel - bLevel;
                }
                
                return a.name.localeCompare(b.name);
            });

            collections.forEach(collection => {
                // Skip rendering if ANY ancestor is collapsed (not just immediate parent)
                let ancestor = collection.parent;
                let shouldSkip = false;
                while (ancestor) {
                    if (this.collectionsManager.collapsedCollections.has(ancestor)) {
                        shouldSkip = true;
                        break;
                    }
                    // Get parent's parent
                    const ancestorCollection = this.collectionsManager.getCollection(ancestor);
                    ancestor = ancestorCollection?.parent;
                }
                
                if (shouldSkip) {
                    return; // Don't render this collection at all
                }
                
                const collectionDiv = this.createCollectionElement(collection);
                container.appendChild(collectionDiv);
            });
        } else {
            // Fallback to simple grouping by collection property
            this.renderSimpleCollections();
        }

        this.updateStats();
    }

    // CREATE NEW METHOD: Create collection element
    createCollectionElement(collection) {
        const collectionDiv = document.createElement('div');
        collectionDiv.className = 'collection-group';
        collectionDiv.dataset.collectionKey = collection.key;
        collectionDiv.dataset.level = collection.level || 1;
        
        // Calculate indentation based on level
        const indentLevel = (collection.level || 1) - 1;
        const indentPx = indentLevel * 20; // 20px per level
        
        // Check if collection is collapsed
        const isCollapsed = this.collectionsManager && this.collectionsManager.collapsedCollections.has(collection.key);
        
        // Check if collection has children
        const hasChildren = this.collectionsManager && this.collectionsManager.hasChildren(collection.key);
        
        // Collection header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'collection-header';
        headerDiv.style.borderLeftColor = collection.color || '#b1b695';
        headerDiv.style.marginLeft = `${indentPx}px`;
        headerDiv.tabIndex = 0;
        headerDiv.setAttribute('role', 'button');
        headerDiv.setAttribute('aria-expanded', String(!isCollapsed));
        
        const displayName = collection.name || 'Uncategorized';
        
        headerDiv.innerHTML = `
            <span class="collection-toggle ${isCollapsed ? '' : 'expanded'}" data-collection-key="${collection.key}"
                style="${!hasChildren && collection.notes.length === 0 ? 'visibility: hidden;' : ''}">
                <i class="fas fa-chevron-right"></i>
            </span>
            <span class="collection-icon" style="color: ${collection.color || '#b1b695'};">
                <i class="fas fa-folder${isCollapsed ? '' : '-open'}"></i>
            </span>
            <span class="collection-name">${this.escapeHtml(displayName)}</span>
            <span class="collection-count">${collection.notes.length}</span>
            ${collection.key !== '' ? `
                <div class="collection-actions" style="opacity: 0; transition: opacity var(--transition-normal); margin-left: var(--space-xs);">
                    ${(collection.level || 1) < 4 ? `
                        <button type="button" class="collection-action-btn" data-action="add-sub" title="Add Subcollection" aria-label="Add nested collection" style="background: none; border: none; color: var(--text-tertiary); cursor: pointer; padding: 2px 4px; border-radius: var(--radius-sm); font-size: 9px; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-plus" aria-hidden="true"></i>
                        </button>
                    ` : ''}
                    <button type="button" class="collection-action-btn" data-action="edit" title="Edit Collection" aria-label="Edit collection" style="background: none; border: none; color: var(--text-tertiary); cursor: pointer; padding: 2px 4px; border-radius: var(--radius-sm); font-size: 9px; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-edit" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="collection-action-btn" data-action="delete" title="Delete Collection" aria-label="Delete collection" style="background: none; border: none; color: var(--text-tertiary); cursor: pointer; padding: 2px 4px; border-radius: var(--radius-sm); font-size: 9px; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
                </div>
            ` : ''}
        `;
        
        // Toggle collapse functionality
        const toggleBtn = headerDiv.querySelector('.collection-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();                
                if (this.collectionsManager) {
                    this.collectionsManager.toggleCollectionCollapse(collection.key);
                    
                    // Update icon immediately
                    const icon = headerDiv.querySelector('.collection-icon i');
                    const isNowCollapsed = this.collectionsManager.collapsedCollections.has(collection.key);
                    
                    toggleBtn.classList.toggle('expanded', !isNowCollapsed);
                    headerDiv.setAttribute('aria-expanded', String(!isNowCollapsed));
                    if (icon) {
                        icon.className = `fas fa-folder${isNowCollapsed ? '' : '-open'}`;
                    }
                    
                    // Toggle notes list
                    const notesList = collectionDiv.querySelector('.notes-list');
                    if (notesList) {
                        notesList.style.display = isNowCollapsed ? 'none' : 'block';
                    }
                }
            });
        }

        // Make entire header clickable (except action buttons)
        headerDiv.addEventListener('click', (e) => {
            // Don't toggle if clicking on action buttons
            if (e.target.closest('.collection-action-btn') || e.target.closest('.collection-toggle')) {
                return;
            }            
            
            if (this.collectionsManager) {
                this.collectionsManager.toggleCollectionCollapse(collection.key);
                
                // Update icon immediately
                const icon = headerDiv.querySelector('.collection-icon i');
                const toggleBtn = headerDiv.querySelector('.collection-toggle');
                const isNowCollapsed = this.collectionsManager.collapsedCollections.has(collection.key);
                
                if (toggleBtn) {
                    toggleBtn.classList.toggle('expanded', !isNowCollapsed);
                }
                headerDiv.setAttribute('aria-expanded', String(!isNowCollapsed));
                if (icon) {
                    icon.className = `fas fa-folder${isNowCollapsed ? '' : '-open'}`;
                }
                
                // Toggle notes list
                const notesList = collectionDiv.querySelector('.notes-list');
                if (notesList) {
                    notesList.style.display = isNowCollapsed ? 'none' : 'block';
                }
            }
        });
        
        headerDiv.addEventListener('keydown', event => {
            if (event.target !== headerDiv || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            headerDiv.click();
        });

        // Show actions on hover
        headerDiv.addEventListener('mouseenter', () => {
            const actions = headerDiv.querySelector('.collection-actions');
            if (actions) actions.style.opacity = '1';
        });
        
        headerDiv.addEventListener('mouseleave', () => {
            const actions = headerDiv.querySelector('.collection-actions');
            if (actions) actions.style.opacity = '0';
        });
        headerDiv.addEventListener('focusin', () => {
            const actions = headerDiv.querySelector('.collection-actions');
            if (actions) actions.style.opacity = '1';
        });
        headerDiv.addEventListener('focusout', event => {
            if (headerDiv.contains(event.relatedTarget)) return;
            const actions = headerDiv.querySelector('.collection-actions');
            if (actions) actions.style.opacity = '0';
        });
        
        // Add subcollection button handler
        const addSubBtn = headerDiv.querySelector('[data-action="add-sub"]');
        if (addSubBtn) {
            addSubBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.collectionsManager.showCreateCollectionModal(collection.key);
            });
        }
        
        // Delete collection handler
        const deleteBtn = headerDiv.querySelector('[data-action="delete"]');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.collectionsManager.deleteCollection(collection.key);
            });
        }
        
        // Edit collection handler
        const editBtn = headerDiv.querySelector('[data-action="edit"]');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.collectionsManager.editCollection(collection.key);
            });
        }

        collectionDiv.appendChild(headerDiv);
        
        // Notes list with proper indentation
        const notesDiv = document.createElement('div');
        notesDiv.className = 'notes-list';
        notesDiv.style.display = isCollapsed ? 'none' : 'block';
        notesDiv.style.marginLeft = `${indentPx + 24}px`; // Extra indent for notes under collections
        
        // Get actual note objects
        const notes = collection.notes
            .map(noteId => this.savedNotes.find(n => n.id === noteId))
            .filter(note => note) // Remove undefined notes
            .sort((a, b) => b.lastModified - a.lastModified); // Sort by last modified
        
        const INITIAL_NOTE_DISPLAY = 30;
        const notesToShow = notes.slice(0, INITIAL_NOTE_DISPLAY);
        const remainingNotes = notes.slice(INITIAL_NOTE_DISPLAY); // Mutable array for lazy loading

        // Render initial batch
        notesToShow.forEach(note => {
            const noteItem = this.createNoteItem(note);
            notesDiv.appendChild(noteItem);
        });

        // Setup lazy loading if there are more notes
        if (remainingNotes.length > 0) {
            // Create loading sentinel
            const sentinel = document.createElement('div');
            sentinel.className = 'notes-loading-sentinel';
            sentinel.innerHTML = `<i class="fas fa-ellipsis-h"></i> ${remainingNotes.length} more note${remainingNotes.length !== 1 ? 's' : ''}`;
            notesDiv.appendChild(sentinel);
            
            // Setup intersection observer for lazy loading
            this.setupLazyNoteLoading(notesDiv, remainingNotes, sentinel);
        }
        
        collectionDiv.appendChild(notesDiv);
        
        return collectionDiv;
    }

    // Setup lazy loading for note lists using Intersection Observer
    setupLazyNoteLoading(notesDiv, remainingNotes, sentinel) {
        // Observer to load more when sentinel is visible
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && remainingNotes.length > 0) {
                    // Load next batch
                    const BATCH_SIZE = 30;
                    const batch = remainingNotes.splice(0, BATCH_SIZE);
                    
                    batch.forEach(note => {
                        const noteItem = this.createNoteItem(note);
                        notesDiv.insertBefore(noteItem, sentinel);
                    });
                    
                    // Update or remove sentinel
                    if (remainingNotes.length === 0) {
                        observer.disconnect();
                        sentinel.remove();
                    } else {
                        // Update loading indicator
                        sentinel.innerHTML = `<i class="fas fa-spinner fa-pulse"></i> Loading more notes...`;
                    }
                }
            });
        }, {
            root: document.getElementById('collections-tree'),
            rootMargin: '150px', // Start loading 150px before sentinel is visible
            threshold: 0
        });
        
        observer.observe(sentinel);
        
        // Store observer for cleanup
        if (!this._lazyLoadObservers) {
            this._lazyLoadObservers = [];
        }
        this._lazyLoadObservers.push(observer);
    }

    // Fallback simple collections rendering
    renderSimpleCollections() {
        const container = document.getElementById('collections-tree');
        const processedNotes = new Set();
        
        // Group notes by collection
        const notesByCollection = new Map();
        notesByCollection.set('', []); // Uncategorized
        
        this.savedNotes.forEach(note => {
            if (processedNotes.has(note.id)) return;
            processedNotes.add(note.id);
            
            const collection = note.collection || '';
            if (!notesByCollection.has(collection)) {
                notesByCollection.set(collection, []);
            }
            notesByCollection.get(collection).push(note);
        });

        // Render each collection
        for (const [collectionName, notes] of notesByCollection) {
            // Always show Uncategorized, skip other empty collections
            if (notes.length === 0 && collectionName !== '') continue;
            
            const collectionDiv = document.createElement('div');
            collectionDiv.className = 'collection-group';
            
            const headerDiv = document.createElement('div');
            headerDiv.className = 'collection-header';
            headerDiv.innerHTML = `
                <span class="collection-toggle expanded">
                    <i class="fas fa-chevron-right"></i>
                </span>
                <span class="collection-icon">
                    <i class="fas fa-folder-open"></i>
                </span>
                <span class="collection-name">${this.escapeHtml(collectionName || 'Uncategorized')}</span>
                <span class="collection-count">${notes.length}</span>
            `;
            
            collectionDiv.appendChild(headerDiv);
            
            const notesDiv = document.createElement('div');
            notesDiv.className = 'notes-list';
            
            notes.forEach(note => {
                const noteItem = this.createNoteItem(note);
                notesDiv.appendChild(noteItem);
            });
            
            collectionDiv.appendChild(notesDiv);
            container.appendChild(collectionDiv);
        }
    }

    // Create note item - NO DUPLICATES
    createNoteItem(note) {
        const noteDiv = document.createElement('div');
        noteDiv.className = 'note-item';
        noteDiv.dataset.noteId = note.id;
        noteDiv.tabIndex = 0;
        noteDiv.setAttribute('role', 'button');
        noteDiv.setAttribute('aria-label', `Open note ${note.name}`);
        
        if (note.id === this.currentNote.id) {
            noteDiv.classList.add('active');
        }

        noteDiv.innerHTML = `
            <span class="note-icon">
                <i class="fas fa-file-alt"></i>
            </span>
            <span class="note-name">${this.escapeHtml(note.name)}</span>
            <div class="note-actions">
                <button type="button" class="note-action-btn" data-action="export" title="Export as Markdown" aria-label="Export note as Markdown">
                    <i class="fas fa-download" aria-hidden="true"></i>
                </button>
                <button type="button" class="note-action-btn" data-action="move" title="Move to Collection" aria-label="Move note to another collection">
                    <i class="fas fa-arrows-alt" aria-hidden="true"></i>
                </button>
                <button type="button" class="note-action-btn" data-action="delete" title="Delete" aria-label="Delete note">
                    <i class="fas fa-trash" aria-hidden="true"></i>
                </button>
            </div>
        `;

        // Click anywhere on the note to load it
        noteDiv.addEventListener('click', (e) => {
            if (!e.target.closest('.note-action-btn')) {
                this.loadNote(note.id);
                this.setSidebarOpen(false);
            }
        });
        noteDiv.addEventListener('keydown', event => {
            if (event.target !== noteDiv || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            this.loadNote(note.id);
            this.setSidebarOpen(false);
        });

        // Only delete button needed
        const deleteBtn = noteDiv.querySelector('[data-action="delete"]');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteNote(note.id);
            });
        }

        // Export button
        const exportBtn = noteDiv.querySelector('[data-action="export"]');
        if (exportBtn) {
            exportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.exportManager.exportNote(note.id);
            });
        }

        // Move button
        const moveBtn = noteDiv.querySelector('[data-action="move"]');
        if (moveBtn) {
            moveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showMoveNoteModal(note);
            });
        }

        return noteDiv;
    }

    // Show move note modal
    showMoveNoteModal(note) {
        if (!this.collectionsManager) {
            this.showToast('Collections not available', 'error');
            return;
        }

        // Remove existing modal if any
        const existingModal = document.getElementById('move-note-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'move-note-modal';
        modal.className = 'modal-overlay notebook-modal-overlay';
        
        // Get all collections
        const collections = this.collectionsManager.getAllCollections();
        const currentCollection = note.collection || '';
        
        const collectionsOptions = collections
            .map(collection => {
                const isSelected = collection.key === currentCollection ? 'selected' : '';
                // Use the full path instead of just the name
                const displayName = collection.key === '' ? 'Uncategorized' : 
                    this.collectionsManager.getCollectionPath(collection.key);
                return `<option value="${collection.key}" ${isSelected}>${this.escapeHtml(displayName)}</option>`;
            })
            .join('');
        
        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px solid var(--border-primary); box-shadow: var(--shadow-xl); max-width: 400px; width: 90%; overflow: hidden;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-md) var(--space-lg); border-bottom: 1px solid var(--border-primary); background: var(--bg-tertiary);">
                    <h3 id="move-note-modal-title" style="margin: 0; color: var(--text-primary);">Move Note</h3>
                    <button type="button" class="close-btn" aria-label="Close move note dialog" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: var(--font-size-sm); padding: var(--space-xs); border-radius: var(--radius-sm);">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding: var(--space-lg);">
                    <p style="margin-bottom: var(--space-md); color: var(--text-secondary);">Move "${this.escapeHtml(note.name)}" to:</p>
                    <div class="form-group" style="margin-bottom: var(--space-lg);">
                        <select id="target-collection" style="width: 100%; padding: var(--space-sm); background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); color: var(--text-inputs);">
                            ${collectionsOptions}
                        </select>
                    </div>
                    <div class="modal-actions" style="display: flex; gap: var(--space-sm); justify-content: flex-end;">
                        <button type="button" id="move-note-btn" class="btn-primary">
                            <i class="fas fa-arrows-alt"></i> Move Note
                        </button>
                        <button type="button" class="btn-secondary cancel-btn">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;

        window.ToolkitDialogs?.enhance(modal, { labelledBy: 'move-note-modal-title' });

        document.body.appendChild(modal);
        
        // Setup functionality
        document.getElementById('move-note-btn').addEventListener('click', () => {
            this.moveNoteToCollection(note, modal);
        });
        
        modal.querySelector('.close-btn').addEventListener('click', () => {
            modal.remove();
        });
        modal.querySelector('.cancel-btn').addEventListener('click', () => modal.remove());
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // Move note to collection
    async moveNoteToCollection(note, modal) {
        const targetSelect = document.getElementById('target-collection');
        const targetCollection = targetSelect.value;
        
        if (targetCollection === note.collection) {
            this.showToast('Note is already in that collection', 'info');
            modal.remove();
            return;
        }
        
        const oldCollection = note.collection || '';
        const movingCurrentNote = this.currentNote.id === note.id;
        let collectionMoved = false;

        try {
            let savedNote = { ...note, collection: targetCollection, lastModified: Date.now() };

            if (this.isUserLoggedIn()) {
                if (movingCurrentNote) {
                    this.currentNote.collection = targetCollection;
                    this.editorRevision += 1;
                    this.isDirty = true;
                    this.updateStatus();

                    const context = this.getCurrentSaveContext();
                    const revision = this.editorRevision;
                    const snapshot = this.createCurrentNoteSnapshot();
                    const result = await this.persistNoteRevision(snapshot, revision, context);
                    savedNote = result.note;
                    this.applySavedNote(result);
                } else {
                    savedNote = await this.saveNoteToServer(savedNote, this.currentNotebookId);
                }
            }

            if (this.collectionsManager) {
                this.collectionsManager.moveNote(note.id, oldCollection, targetCollection);
                collectionMoved = true;
                if (this.isUserLoggedIn()) {
                    await this.collectionsManager.saveCollectionsToServer();
                }
            }

            const noteIndex = this.savedNotes.findIndex(saved => saved.id === note.id);
            if (noteIndex !== -1) {
                this.savedNotes[noteIndex] = savedNote;
            }

            if (movingCurrentNote) {
                this.updateNoteBreadcrumb();
            }
            
            // Refresh UI
            this._forceRebuild = true;
            this.renderCollectionsTree();
            
            const targetCollectionName = this.collectionsManager.getCollection(targetCollection)?.name || 'Uncategorized';
            this.showToast(`Moved "${note.name}" to ${targetCollectionName}`, 'success');
            
            modal.remove();
            
        } catch (error) {
            if (collectionMoved && this.collectionsManager) {
                this.collectionsManager.moveNote(note.id, targetCollection, oldCollection);
            }
            if (movingCurrentNote && this.currentNote.id === note.id && this.currentNote.collection === targetCollection) {
                this.currentNote.collection = oldCollection;
                this.editorRevision += 1;
                this.isDirty = true;
                this.updateStatus();
                this.updateNoteBreadcrumb();
            }
            console.error('Error moving note:', error);
            this.showToast('Failed to move note', 'error');
        }
    }

    // Add this new method to NotebookManager class:
    updateNoteBreadcrumb() {
        const breadcrumbEl = document.getElementById('note-breadcrumb');
        if (!breadcrumbEl) return;
        
        const collectionKey = this.currentNote.collection || '';
        let breadcrumbText = 'Uncategorized';
        let breadcrumbColor = '#666666';
        
        if (collectionKey && this.collectionsManager) {
            const collection = this.collectionsManager.getCollection(collectionKey);
            if (collection) {
                breadcrumbText = this.collectionsManager.getCollectionPath(collectionKey);
                breadcrumbColor = collection.color || '#b1b695';
            }
        }
        
        breadcrumbEl.innerHTML = `
            <i class="fas fa-folder" style="color: ${breadcrumbColor};"></i>
            <span>${this.escapeHtml(breadcrumbText)}</span>
        `;
    }

    beginEditorSession(note) {
        this.currentNote = { ...note };
        this.editorSession += 1;
        this.editorRevision = 0;
        this.lastSavedRevision = 0;
        this.isDirty = false;
    }

    getCurrentSaveContext() {
        const userContext = this.getUserContext();
        return {
            editorSession: this.editorSession,
            notebookId: this.currentNotebookId,
            userId: userContext?.userId || null
        };
    }

    createCurrentNoteSnapshot(name = this.currentNote.name) {
        if (!this.currentNote.id) {
            this.currentNote.id = this.generateNoteId();
        }
        if (!this.currentNote.created) {
            this.currentNote.created = Date.now();
        }

        return {
            ...this.currentNote,
            id: this.currentNote.id,
            name,
            content: this.currentNote.content || '',
            collection: this.currentNote.collection || '',
            created: this.currentNote.created,
            lastModified: Date.now()
        };
    }

    async persistNoteRevision(noteData, revision, context) {
        const saveKey = [
            context.userId,
            context.notebookId,
            noteData.id,
            context.editorSession
        ].join(':');
        const result = await this.noteSaveQueue.save(saveKey, revision, {
            noteData,
            notebookId: context.notebookId
        });

        return {
            note: result.value,
            revision: result.revision,
            context
        };
    }

    applySavedNote({ note, revision, context }) {
        const currentUserId = this.getUserContext()?.userId || null;
        const sameNotebook = this.currentNotebookId === context.notebookId
            && currentUserId === context.userId;

        if (!sameNotebook) {
            return false;
        }

        const index = this.savedNotes.findIndex(savedNote => savedNote.id === note.id);
        if (index !== -1) {
            this.savedNotes[index] = note;
        } else {
            this.savedNotes.push(note);
        }

        this._forceRebuild = true;

        const sameEditor = this.editorSession === context.editorSession
            && this.currentNote.id === note.id;
        if (!sameEditor) {
            this.renderCollectionsTree();
            return false;
        }

        this.lastSavedRevision = Math.max(this.lastSavedRevision, revision);
        const savedCurrentRevision = revision === this.editorRevision;

        if (savedCurrentRevision) {
            this.currentNote = { ...note };
            this.isDirty = false;
        } else {
            this.isDirty = true;
        }

        this.updateStatus();
        this.renderCollectionsTree();
        return savedCurrentRevision;
    }

    // Load note
    async loadNote(noteId, { skipUnsavedCheck = false } = {}) {
        if (!skipUnsavedCheck && this.isDirty) {
            const confirmed = await this.confirmAction({
                title: 'Open another note?',
                message: 'Your current note has unsaved changes. Opening another note will discard them.',
                icon: 'fas fa-file-arrow-down',
                confirmLabel: 'Discard and open',
                danger: true
            });
            if (!confirmed) return false;
        }

        try {
            const note = await this.loadNoteFromServer(noteId);
            this.beginEditorSession(note);
            
            const editor = this.getTextEditor();
            const titleInput = document.getElementById('note-title-input');
            
            if (editor) {
                if (editor.tagName === 'TEXTAREA') {
                    editor.value = note.content;
                } else {
                    editor.textContent = note.content;
                }
            }
            
            if (titleInput) {
                titleInput.value = note.name;
            }
            
            this.updateStatus();
            this.updatePreview();
            this.updateWordCount();
            this.updateNoteBreadcrumb();
            this._forceRebuild = true;
            this.renderCollectionsTree(); // Update active state            
            return true;
        } catch (error) {
            this.showToast('Failed to load note', 'error');
            return false;
        }
    }

    async saveCurrentNote({ showSuccess = true } = {}) {
        const saveBtn = document.getElementById('save-note-btn');
        const titleInput = document.getElementById('note-title-input');
        const name = (titleInput?.value || this.currentNote.name || 'Untitled Note').trim();
        
        if (!name) {
            this.showToast('Please enter a name for this note', 'warning');
            titleInput?.focus();
            throw new Error('A note name is required');
        }

        if (!this.isUserLoggedIn()) {
            this.showToast('Please log in to save notes', 'warning');
            throw new Error('A signed-in user is required to save notes');
        }

        // Add visual feedback - button becomes active
        if (saveBtn) {
            saveBtn.classList.add('active');
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        try {
            const context = this.getCurrentSaveContext();
            this.currentNote.name = name;
            let savedNote = null;

            while (this.editorSession === context.editorSession) {
                const revision = this.editorRevision;
                const noteData = this.createCurrentNoteSnapshot(this.currentNote.name || name);
                const result = await this.persistNoteRevision(noteData, revision, context);
                savedNote = result.note;
                const savedCurrentRevision = this.applySavedNote(result);

                if (this.editorSession !== context.editorSession || savedCurrentRevision) {
                    break;
                }
            }

            if (showSuccess && this.editorSession === context.editorSession && !this.isDirty) {
                this.showToast('Note saved successfully!', 'success');
            }

            return savedNote;
        } catch (error) {
            this.showToast('Failed to save note', 'error');
            console.error('Error saving note:', error);
            throw error;
        } finally {
            // Remove active state after a brief moment
            if (saveBtn) {
                setTimeout(() => {
                    saveBtn.classList.remove('active');
                    saveBtn.innerHTML = '<i class="fas fa-save"></i>';
                }, 600);
            }
        }
    }

    // Update word count
    updateWordCount() {
        const content = this.currentNote.content || '';
        const words = this.countWords(content);
        const chars = content.length;

        const wordCountEl = document.getElementById('word-count');
        if (wordCountEl) wordCountEl.textContent = `${words} words`;
        
        const charCountEl = document.getElementById('char-count');
        if (charCountEl) charCountEl.textContent = `${chars} characters`;
    }

    // Update stats
    updateStats() {
        const notesCount = this.savedNotes.length;
        const totalWords = this.savedNotes.reduce((total, note) => total + this.countWords(note.content || ''), 0);

        const notesCountEl = document.getElementById('notes-count');
        if (notesCountEl) notesCountEl.textContent = `${notesCount} note${notesCount !== 1 ? 's' : ''}`;
        
        const wordsCountEl = document.getElementById('words-count');
        if (wordsCountEl) wordsCountEl.textContent = `${totalWords} words`;
    }

    // Toggle preview
    togglePreview() {
        const previewOverlay = document.getElementById('preview-overlay');
        const toggleBtn = document.getElementById('toggle-preview');
        
        if (!previewOverlay || !toggleBtn) return;

        this.isPreviewMode = !this.isPreviewMode;
        
        if (this.isPreviewMode) {
            previewOverlay.style.display = 'block';
            toggleBtn.classList.add('active');
            toggleBtn.setAttribute('aria-pressed', 'true');
            this.updatePreview();
        } else {
            previewOverlay.style.display = 'none';
            toggleBtn.classList.remove('active');
            toggleBtn.setAttribute('aria-pressed', 'false');
        }
    }

    // Update preview
    updatePreview() {
        if (!this.isPreviewMode) return;
        
        const previewContent = document.getElementById('preview-content');
        if (!previewContent) return;
        
        const content = this.currentNote.content || '';
        const processedContent = this.processNoteLinks(content);
        const renderedContent = this.renderMarkdown(processedContent);
        previewContent.innerHTML = renderedContent;
    }

    // Process note links
    // Process note links
    processNoteLinks(content) {
        // Enhanced syntax: (display text)[[note name]] or [[note name]]
        // Made more restrictive to avoid matching across snippet boundaries
        return content.replace(/(\(([^)\n]+)\))?\[\[([^\]]+)\]\]/g, (match, displayGroup, displayText, noteName) => {
            const noteExists = this.savedNotes.some(note => 
                note.name.toLowerCase() === noteName.trim().toLowerCase()
            );
            
            const className = noteExists ? 'note-link' : 'note-link broken';
            const linkText = displayText ? displayText.trim() : noteName.trim();
            
            return `<a href="#" class="${className}" data-note-name="${this.escapeHtml(noteName.trim())}">${this.escapeHtml(linkText)}</a>`;
        });
    }

    // Render markdown
    renderMarkdown(content) {
        try {
            if (typeof marked !== 'undefined') {
                // Pre-process custom syntax BEFORE marked.js
                let processedContent = content
                    .replace(/==(.*?)==/g, '<mark>$1</mark>')
                    .replace(/!~(.*?)~!/g, '<u>$1</u>');

                const renderer = new marked.Renderer();
                const options = {
                    breaks: true,
                    gfm: true,
                    smartLists: true,
                    smartypants: false,
                    pedantic: false,
                    headerIds: false,
                    mangle: false,
                    renderer
                };

                return this.sanitizeMarkdownHtml(marked.parse(processedContent, options));
            } else {
                return this.sanitizeMarkdownHtml(this.basicMarkdownRender(content));
            }
        } catch (error) {
            console.error('Markdown parsing error:', error);
            return this.escapeHtml(content);
        }
    }

    sanitizeMarkdownHtml(html) {
        if (typeof NotebookMarkdownSecurity === 'undefined') {
            throw new Error('Notebook Markdown security module is unavailable');
        }

        return NotebookMarkdownSecurity.sanitizeHtml(html, window.DOMPurify);
    }

    // Basic markdown rendering fallback
    basicMarkdownRender(content) {
        return this.escapeHtml(content)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            // ADD THESE:
            .replace(/==(.*?)==/g, '<mark>$1</mark>')
            .replace(/!~(.*?)~!/g, '<u>$1</u>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/\n/g, '<br>');
    }

    // Snippet panel
    openSnippetBrowser(focusSearch = false) {
        const panel = document.querySelector('.snippets-panel');
        if (!panel) return;

        panel.classList.add('open');
        this.loadSnippetsIntoPanel();
        
        if (focusSearch) {
            const searchInput = document.getElementById('snippets-search');
            if (searchInput) {
                setTimeout(() => searchInput.focus(), 100);
            }
        }
    }

    closeSnippetsPanel() {
        const panel = document.querySelector('.snippets-panel');
        if (panel) {
            panel.classList.remove('open');
        }
    }

    async loadSnippetsIntoPanel() {
        if (this.snippets.length === 0 && this.isUserLoggedIn()) {
            await this.loadSnippetsFromServer();
        }
        this.renderSnippetsList();
        this.renderTagFilterChips(); // Add this line
    }

    renderSnippetsList() {
        const container = document.getElementById('snippets-list');
        if (!container) return;

        if (this.snippets.length === 0) {
            container.innerHTML = `
                <div class="snippets-empty" style="text-align: center; padding: var(--space-xl); color: var(--text-tertiary);">
                    <i class="fas fa-puzzle-piece" style="font-size: 2rem; margin-bottom: var(--space-md);"></i>
                    <p>No snippets yet</p>
                    <small>Right-click text in CoWriter to create snippets</small>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        this.snippets.forEach(snippet => {
            const snippetEl = this.createSnippetElement(snippet);
            container.appendChild(snippetEl);
        });

        this.renderTagFilterChips();
    }

    createSnippetElement(snippet) {
        const div = document.createElement('div');
        div.className = 'snippet-item';
        
        const contentPreview = snippet.content.substring(0, 100) + (snippet.content.length > 100 ? '...' : '');
        
        div.innerHTML = `
            <div class="snippet-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-xs);">
                <span class="snippet-title" style="font-weight: 600; color: var(--text-primary);">${this.escapeHtml(snippet.title)}</span>
                <div class="snippet-actions">
                    <button type="button" class="snippet-action-btn btn-icon" data-action="insert" title="Insert" aria-label="Insert snippet">
                        <i class="fas fa-plus"></i>
                    </button>
                    <button type="button" class="snippet-action-btn btn-icon" data-action="edit" title="Edit" aria-label="Edit snippet">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="snippet-action-btn btn-icon" data-action="delete" title="Delete" aria-label="Delete snippet">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="snippet-content" style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-xs);">${this.escapeHtml(contentPreview)}</div>
            <div class="snippet-tags" style="display: flex; gap: var(--space-xs);">
                ${snippet.tags.map(tag => `<span class="snippet-tag" style="background: var(--bg-quaternary); color: var(--text-tertiary); padding: 2px 6px; border-radius: var(--radius-sm); font-size: 10px;">${this.escapeHtml(tag)}</span>`).join('')}
            </div>
        `;

        // Hover effects
        div.addEventListener('mouseenter', () => {
            div.style.background = 'var(--bg-quaternary)';
            div.style.borderColor = 'var(--accent-primary)';
        });
        
        div.addEventListener('mouseleave', () => {
            div.style.background = 'var(--bg-tertiary)';
            div.style.borderColor = 'var(--border-primary)';
        });

        // Action buttons
        const insertBtn = div.querySelector('[data-action="insert"]');
        const deleteBtn = div.querySelector('[data-action="delete"]');
        
        if (insertBtn) {
            insertBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.insertSnippet(snippet);
            });
        }
        
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteSnippet(snippet);
            });
        }

        const editBtn = div.querySelector('[data-action="edit"]');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editSnippet(snippet);
            });
        }

        return div;
    }

    showNoteLinkHelper() {
        if (this.noteLinking) {
            this.noteLinking.showNoteLinkModal();
        } else {
            this.showToast('Note linking not available', 'warning');
        }
    }

    handleSearch(query) {
        const clearButton = document.getElementById('search-clear');
        if (clearButton) clearButton.style.display = query.trim() ? 'flex' : 'none';

        if (query.trim()) {
            this.filterNotesBySearch(query);
        } else {
            this.renderCollectionsTree();
        }
    }

    filterNotesBySearch(query) {
        const lowerQuery = query.toLowerCase();
        const matchingNotes = this.savedNotes.filter(note => 
            note.name.toLowerCase().includes(lowerQuery) ||
            note.content.toLowerCase().includes(lowerQuery)
        );

        const container = document.getElementById('collections-tree');
        if (!container) return;

        container.innerHTML = '';

        if (matchingNotes.length === 0) {
            container.innerHTML = `
                <div class="search-no-results" style="text-align: center; padding: var(--space-xl); color: var(--text-tertiary);">
                    <i class="fas fa-search"></i>
                    <p>No notes found for "${this.escapeHtml(query)}"</p>
                </div>
            `;
            return;
        }

        // Show search results
        const resultsDiv = document.createElement('div');
        resultsDiv.className = 'search-results';
        
        matchingNotes.forEach(note => {
            const noteItem = this.createNoteItem(note);
            resultsDiv.appendChild(noteItem);
        });
        
        container.appendChild(resultsDiv);
    }

    // Filter snippets by search term
    filterSnippets(searchTerm) {
        const container = document.getElementById('snippets-list');
        if (!container) return;
        
        if (!searchTerm.trim()) {
            this.renderSnippetsList(); // Show all snippets
            return;
        }
        
        const lowerSearch = searchTerm.toLowerCase();
        const filteredSnippets = this.snippets.filter(snippet => 
            snippet.title.toLowerCase().includes(lowerSearch) ||
            snippet.content.toLowerCase().includes(lowerSearch) ||
            snippet.tags.some(tag => tag.toLowerCase().includes(lowerSearch))
        );
        
        container.innerHTML = '';
        
        if (filteredSnippets.length === 0) {
            container.innerHTML = `
                <div class="snippets-empty" style="text-align: center; padding: var(--space-xl); color: var(--text-tertiary);">
                    <i class="fas fa-search"></i>
                    <p>No snippets found for "${this.escapeHtml(searchTerm)}"</p>
                </div>
            `;
            return;
        }
        
        filteredSnippets.forEach(snippet => {
            const snippetEl = this.createSnippetElement(snippet);
            container.appendChild(snippetEl);
        });
    }

    // Get all unique tags from snippets
    getAllSnippetTags() {
        const allTags = new Set();
        this.snippets.forEach(snippet => {
            snippet.tags.forEach(tag => {
                if (tag.trim()) {
                    allTags.add(tag.trim().toLowerCase());
                }
            });
        });
        return Array.from(allTags).sort();
    }

    // Get tag usage count
    getTagUsageCount() {
        const tagCounts = new Map();
        this.snippets.forEach(snippet => {
            snippet.tags.forEach(tag => {
                if (tag.trim()) {
                    const normalizedTag = tag.trim().toLowerCase();
                    tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) || 0) + 1);
                }
            });
        });
        return tagCounts;
    }

    // Render tag filter chips
    renderTagFilterChips() {
        const container = document.getElementById('tags-filter-chips');
        const filterSection = document.getElementById('snippets-tags-filter');
        
        if (!container || !filterSection) return;
        
        const tags = this.getAllSnippetTags();
        const tagCounts = this.getTagUsageCount();
        
        if (tags.length === 0) {
            filterSection.style.display = 'none';
            return;
        }
        
        filterSection.style.display = 'block';
        container.innerHTML = '';
        
        // Sort tags by usage count (most used first)
        const sortedTags = tags.sort((a, b) => (tagCounts.get(b) || 0) - (tagCounts.get(a) || 0));
        
        sortedTags.forEach(tag => {
            const count = tagCounts.get(tag) || 0;
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'tag-filter-chip';
            chip.dataset.tag = tag;
            
            chip.innerHTML = `
                <span>${this.escapeHtml(tag)}</span>
                <span class="tag-filter-count">${count}</span>
            `;
            
            // Click handler
            chip.addEventListener('click', () => {
                this.filterSnippetsByTag(tag);
                this.highlightActiveTagChip(tag);
            });
            
            // Hover effects
            chip.addEventListener('mouseenter', () => {
                chip.style.background = 'var(--accent-primary)';
                chip.style.color = 'var(--bg-primary)';
                chip.style.borderColor = 'var(--accent-primary)';
            });
            
            chip.addEventListener('mouseleave', () => {
                if (!chip.classList.contains('active')) {
                    chip.style.background = 'var(--bg-tertiary)';
                    chip.style.color = 'var(--text-secondary)';
                    chip.style.borderColor = 'var(--border-primary)';
                }
            });
            
            container.appendChild(chip);
        });
    }

    // Filter snippets by tag
    filterSnippetsByTag(selectedTag) {
        const container = document.getElementById('snippets-list');
        if (!container) return;
        
        const filteredSnippets = this.snippets.filter(snippet =>
            snippet.tags.some(tag => tag.toLowerCase() === selectedTag.toLowerCase())
        );
        
        container.innerHTML = '';
        
        if (filteredSnippets.length === 0) {
            container.innerHTML = `
                <div class="snippets-empty" style="text-align: center; padding: var(--space-xl); color: var(--text-tertiary);">
                    <i class="fas fa-tag"></i>
                    <p>No snippets with tag "${this.escapeHtml(selectedTag)}"</p>
                </div>
            `;
            return;
        }
        
        filteredSnippets.forEach(snippet => {
            const snippetEl = this.createSnippetElement(snippet);
            container.appendChild(snippetEl);
        });
        
        // Clear search input since we're filtering by tag
        const searchInput = document.getElementById('snippets-search');
        if (searchInput) {
            searchInput.value = '';
        }
    }

    // Highlight active tag chip
    highlightActiveTagChip(activeTag) {
        document.querySelectorAll('.tag-filter-chip').forEach(chip => {
            if (chip.dataset.tag === activeTag.toLowerCase()) {
                chip.classList.add('active');
                chip.style.background = 'var(--accent-primary)';
                chip.style.color = 'var(--bg-primary)';
                chip.style.borderColor = 'var(--accent-primary)';
            } else {
                chip.classList.remove('active');
                chip.style.background = 'var(--bg-tertiary)';
                chip.style.color = 'var(--text-secondary)';
                chip.style.borderColor = 'var(--border-primary)';
            }
        });
    }

    // Clear tag filter
    clearTagFilter() {
        // Remove active state from all chips
        document.querySelectorAll('.tag-filter-chip').forEach(chip => {
            chip.classList.remove('active');
            chip.style.background = 'var(--bg-tertiary)';
            chip.style.color = 'var(--text-secondary)';
            chip.style.borderColor = 'var(--border-primary)';
        });
        
        // Show all snippets
        this.renderSnippetsList();
    }

    // Edit existing snippet
    editSnippet(snippet) {        
        // Remove existing modal if any
        const existingModal = document.getElementById('snippet-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'snippet-modal';
        modal.className = 'modal-overlay notebook-modal-overlay';
        
        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px solid var(--border-primary); box-shadow: var(--shadow-xl); max-width: 500px; width: 90%; max-height: 80vh; overflow: hidden;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-md) var(--space-lg); border-bottom: 1px solid var(--border-primary); background: var(--bg-tertiary);">
                    <h3 id="snippet-modal-title" style="margin: 0; color: var(--text-primary);">Edit Snippet</h3>
                    <button type="button" class="close-btn" id="close-snippet-modal" aria-label="Close snippet dialog" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: var(--font-size-sm); padding: var(--space-xs); border-radius: var(--radius-sm);">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding: var(--space-lg);">
                    <div class="form-group" style="margin-bottom: var(--space-md);">
                        <label style="display: block; margin-bottom: var(--space-xs); color: var(--text-primary); font-weight: 500;">Title:</label>
                        <input type="text" id="snippet-title" placeholder="Enter snippet title..." style="width: 100%; padding: var(--space-sm); background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); color: var(--text-inputs);">
                    </div>
                    <div class="form-group" style="margin-bottom: var(--space-md);">
                        <label style="display: block; margin-bottom: var(--space-xs); color: var(--text-primary); font-weight: 500;">Tags (comma-separated):</label>
                        <input type="text" id="snippet-tags" placeholder="worldbuilding, character, plot..." style="width: 100%; padding: var(--space-sm); background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); color: var(--text-inputs);">
                    </div>
                    <div class="form-group" style="margin-bottom: var(--space-lg);">
                        <label style="display: block; margin-bottom: var(--space-xs); color: var(--text-primary); font-weight: 500;">Content:</label>
                        <textarea id="snippet-content" rows="6" placeholder="Snippet content..." style="width: 100%; padding: var(--space-sm); background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); color: var(--text-inputs); resize: vertical;"></textarea>
                    </div>
                    <div class="modal-actions" style="display: flex; gap: var(--space-sm); justify-content: flex-end;">
                        <button type="button" id="update-snippet-btn" class="btn-primary">
                            <i class="fas fa-save"></i> Update Snippet
                        </button>
                        <button type="button" id="cancel-snippet-btn" class="btn-secondary">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.querySelector('#snippet-title').value = snippet.title || '';
        modal.querySelector('#snippet-tags').value = Array.isArray(snippet.tags) ? snippet.tags.join(', ') : '';
        modal.querySelector('#snippet-content').value = snippet.content || '';
        window.ToolkitDialogs?.enhance(modal, { labelledBy: 'snippet-modal-title' });

        document.body.appendChild(modal);
        
        // Focus title input
        const titleInput = document.getElementById('snippet-title');
        if (titleInput) {
            titleInput.focus();
            titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
        }

        // Add event listeners
        document.getElementById('close-snippet-modal')?.addEventListener('click', () => {
            modal.remove();
        });

        document.getElementById('update-snippet-btn')?.addEventListener('click', () => {
            this.updateSnippet(snippet);
        });

        document.getElementById('cancel-snippet-btn')?.addEventListener('click', () => {
            modal.remove();
        });

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });        
    }

    // Update existing snippet
    async updateSnippet(originalSnippet) {
        const titleInput = document.getElementById('snippet-title');
        const tagsInput = document.getElementById('snippet-tags');
        const contentTextarea = document.getElementById('snippet-content');
        
        const title = titleInput?.value.trim();
        const content = contentTextarea?.value.trim();
        const tags = tagsInput?.value.split(',').map(t => t.trim()).filter(t => t);
        
        if (!title) {
            this.showToast('Please enter a title for the snippet', 'warning');
            titleInput?.focus();
            return;
        }

        if (!content) {
            this.showToast('Please enter content for the snippet', 'warning');
            contentTextarea?.focus();
            return;
        }

        if (!this.isUserLoggedIn()) {
            this.showToast('Please log in to update snippets', 'warning');
            return;
        }

        const updatedSnippetData = {
            ...originalSnippet,
            title: title,
            content: content,
            tags: tags,
            lastModified: Date.now()
        };

        try {
            const savedSnippet = await this.saveSnippetToServer(updatedSnippetData);
            
            // Update in local array
            const snippetIndex = this.snippets.findIndex(s => s.id === originalSnippet.id);
            if (snippetIndex !== -1) {
                this.snippets[snippetIndex] = savedSnippet;
            }
            
            // Refresh snippets display
            this.renderSnippetsList();
            
            // Close modal
            const modal = document.getElementById('snippet-modal');
            if (modal) {
                modal.remove();
            }            
        } catch (error) {
            this.showToast('Failed to update snippet', 'error');
            console.error('❌ Error updating snippet:', error);
        }
    }

    async deleteSnippet(snippet) {
        const confirmed = await this.confirmAction({
            title: 'Delete snippet?',
            message: `Delete “${snippet.title}”? This cannot be undone.`,
            icon: 'fas fa-trash',
            confirmLabel: 'Delete snippet',
            danger: true
        });
        if (!confirmed) return;

        try {
            await this.deleteSnippetFromServer(snippet.id);
            this.snippets = this.snippets.filter(s => s.id !== snippet.id);
            this.renderSnippetsList();
        } catch (error) {
            this.showToast('Failed to delete snippet', 'error');
        }
    }

    async deleteNote(noteId) {
        const note = this.savedNotes.find(n => n.id === noteId);
        if (!note) return;

        const confirmed = await this.confirmAction({
            title: 'Delete note?',
            message: `Delete “${note.name}”? This cannot be undone.`,
            icon: 'fas fa-trash',
            confirmLabel: 'Delete note',
            danger: true
        });
        if (!confirmed) return;

        try {
            await this.deleteNoteFromServer(noteId);
            this.savedNotes = this.savedNotes.filter(n => n.id !== noteId);

            if (this.currentNote.id === noteId) {
                await this.createNewNote({ skipUnsavedCheck: true, silent: true });
            }

            this.renderCollectionsTree();
        } catch (error) {
            this.showToast('Failed to delete note', 'error');
        }
    }

    // Auto-save functionality
    setupAutoSave() {
        // Clear any existing interval
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        
        this.autoSaveInterval = setInterval(() => {
            if (this.isDirty && this.currentNote.id && this.isUserLoggedIn()) {
                this.autoSaveNote();
            }
        }, 30000);
    }

    async autoSaveNote() {
        try {
            const context = this.getCurrentSaveContext();
            const revision = this.editorRevision;
            const noteData = this.createCurrentNoteSnapshot();
            const result = await this.persistNoteRevision(noteData, revision, context);

            if (this.applySavedNote(result)) {
                this.updateStatus('Auto-saved');
            }
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    }

    resetAutoSave() {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        this.autoSaveTimer = setTimeout(() => {
            if (this.isDirty && this.currentNote.id && this.isUserLoggedIn()) {
                this.autoSaveNote();
            }
        }, 5000);
    }

    setupWordCounter() {
        // Clear any existing interval
        if (this.wordCountInterval) {
            clearInterval(this.wordCountInterval);
        }
        
        this.wordCountInterval = setInterval(() => {
            this.updateWordCount();
        }, 1000);
    }

    updateStatus(message = null) {
        const statusElement = document.querySelector('#save-status span');
        if (!statusElement) return;
        
        if (message) {
            statusElement.textContent = message;
            setTimeout(() => {
                this.updateStatus(); // Reset to default after 3 seconds
            }, 3000);
        } else if (this.isDirty) {
            statusElement.textContent = 'Unsaved changes';
        } else if (this.currentNote.lastModified) {
            const lastSaved = new Date(this.currentNote.lastModified);
            statusElement.textContent = `Saved ${lastSaved.toLocaleTimeString()}`;
        } else {
            statusElement.textContent = 'Not saved';
        }
    }

    // Utility functions
    countWords(text) {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    generateNoteId() {
        return 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    generateSnippetId() {
        return 'snippet_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    showToast(message, type = 'info') {
        if (window.authManager && window.authManager.showToast) {
            window.authManager.showToast(message, type);
        } else {
            // Fallback: create a simple toast if authManager isn't available
            console.log(`Toast (${type}): ${message}`);
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
            toast.textContent = message;
            (document.getElementById('toast-container') || document.body).appendChild(toast);
            
            setTimeout(() => {
                toast.classList.add('fade-out');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
    }

    isUserLoggedIn() {
        const currentUser = window.authManager && window.authManager.getCurrentUser();
        return currentUser && !currentUser.isGuest;
    }

    getUserContext() {
        if (window.authManager) {
            return window.authManager.getUserContext();
        }
        return { isGuest: true };
    }

    // Coordinate user-scoped Notebook data loads.
    async loadUserData() {
        const loadToken = ++this.dataLoadToken;
        if (!this.isUserLoggedIn()) {
            this.savedNotes = [];
            this.snippets = [];
            this.renderCollectionsTree();
            this.updateStats();
            return;
        }

        const userContext = this.getUserContext();
        const notebookId = this.currentNotebookId;
        const isCurrentLoad = () => (
            loadToken === this.dataLoadToken
            && this.isUserLoggedIn()
            && this.getUserContext()?.userId === userContext.userId
            && this.currentNotebookId === notebookId
        );

        try {
            await Promise.all([
                this.loadNotesFromServer({ userContext, notebookId, isCurrentLoad }),
                this.loadSnippetsFromServer({ userContext, notebookId, isCurrentLoad }),
                this.collectionsManager
                    ? this.collectionsManager.loadCollectionsFromServer({ userContext, notebookId, isCurrentLoad })
                    : Promise.resolve()
            ]);

            if (!isCurrentLoad()) return;
            
            this.renderCollectionsTree();
            this.updateStats();
            
        } catch (error) {
            console.error('Error loading notebook data:', error);
        }
    }

    async loadNotesFromServer({
        userContext = this.getUserContext(),
        notebookId = this.currentNotebookId,
        isCurrentLoad = null
    } = {}) {
        const shouldApply = isCurrentLoad || (() => (
            this.isUserLoggedIn()
            && this.getUserContext()?.userId === userContext?.userId
            && this.currentNotebookId === notebookId
        ));

        try {
            const notes = await this.client.loadNotes(notebookId, userContext);
            if (shouldApply()) this.savedNotes = notes;
        } catch (error) {
            console.error('Error loading notes from server:', error);
            if (shouldApply()) this.savedNotes = [];
        }
    }

    async loadSnippetsFromServer({
        userContext = this.getUserContext(),
        notebookId = this.currentNotebookId,
        isCurrentLoad = null
    } = {}) {
        const shouldApply = isCurrentLoad || (() => (
            this.isUserLoggedIn()
            && this.getUserContext()?.userId === userContext?.userId
            && this.currentNotebookId === notebookId
        ));

        try {
            const snippets = await this.client.loadSnippets(notebookId, userContext);
            if (shouldApply()) this.snippets = snippets;
        } catch (error) {
            console.error('Error loading snippets from server:', error);
            if (shouldApply()) this.snippets = [];
        }
    }

    saveNoteToServer(noteData, notebookId = this.currentNotebookId) {
        return this.client.saveNote(noteData, notebookId);
    }

    loadNoteFromServer(noteId) {
        return this.client.loadNote(noteId, this.currentNotebookId);
    }

    deleteNoteFromServer(noteId) {
        return this.client.deleteNote(noteId, this.currentNotebookId);
    }

    saveSnippetToServer(snippetData) {
        return this.client.saveSnippet(snippetData, this.currentNotebookId);
    }

    deleteSnippetFromServer(snippetId) {
        return this.client.deleteSnippet(snippetId, this.currentNotebookId);
    }


    // Public methods for integration
    async onUserLoggedIn() {
        console.log('Notebook: User logged in, refreshing data');
        return this.activate();
    }

    onUserLoggedOut() {
        console.log('Notebook: User logged out, clearing data');
        this.deactivate();
    }

    async activate() {
        if (!this.isActive) {
            this.setupAutoSave();
            this.setupWordCounter();
            this.integrationController.activate();

            if (this.snippetsPanelClickHandler && !this._snippetsPanelListenerAttached) {
                document.addEventListener('click', this.snippetsPanelClickHandler);
                this._snippetsPanelListenerAttached = true;
            }

            this.isActive = true;
        }

        return this.loadUserData();
    }

    deactivate() {
        this.dataLoadToken += 1;
        this.cleanup();

        this.savedNotes = [];
        this.snippets = [];
        this.collectionsArray = [''];

        if (this.collectionsManager) {
            this.collectionsManager.collections.clear();
            this.collectionsManager.initializeCollections();
        }

        this.currentNotebookId = 'default';
        this.createNewNote({ skipUnsavedCheck: true, silent: true });
        this.integrationController.hideMenu();
        document.querySelector('.snippets-panel')?.classList.remove('open');
        [
            'snippet-modal',
            'note-link-modal',
            'move-note-modal',
            'create-collection-modal',
            'edit-collection-modal',
            'create-notebook-modal',
            'edit-notebook-modal',
            'manage-notebooks-modal'
        ].forEach(id => document.getElementById(id)?.remove());

        this.renderCollectionsTree();
        this.updateStats();
    }

    clearUserData() {
        this.deactivate();
    }

    cleanup() {
        console.log('🧹 Cleaning up Notebook Manager...');
        
        // Clear timers
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
        
        if (this.wordCountInterval) {
            clearInterval(this.wordCountInterval);
            this.wordCountInterval = null;
        }
        
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
        
        if (this.wordCountTimer) {
            clearTimeout(this.wordCountTimer);
            this.wordCountTimer = null;
        }
        
        this.integrationController.deactivate();
        
        if (this.snippetsPanelClickHandler) {
            document.removeEventListener('click', this.snippetsPanelClickHandler);
            this._snippetsPanelListenerAttached = false;
        }

        // Cleanup lazy load observers
        if (this._lazyLoadObservers) {
            this._lazyLoadObservers.forEach(observer => {
                try {
                    observer.disconnect();
                } catch (e) {
                    // Observer might already be disconnected
                }
            });
            this._lazyLoadObservers = [];
        }

        this.isActive = false;
        
        console.log('✅ Notebook Manager cleanup complete');
    }
}

window.ToolkitModules = window.ToolkitModules || {};
window.ToolkitModules.NotebookManager = NotebookManager;
