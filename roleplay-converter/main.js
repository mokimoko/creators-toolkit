// Main application bootstrap for RP Archiver.
let rpArchiverInitializationPromise = null;

document.addEventListener('DOMContentLoaded', () => {
    initializeRPArchiver();
}, { once: true });

function initializeRPArchiver() {
    if (rpArchiverInitializationPromise) return rpArchiverInitializationPromise;

    rpArchiverInitializationPromise = (async () => {
        await window.RPArchiver.get('generatedTemplate').initialize();
        const themePromise = window.RPArchiver.get('themeManager').initialize();
        const userSessionManager = await initializeUserSystem();

        initializeRPContextMenu();
        initializeEventListeners();
        initializeSidebar();
        initializeFormHandlers();
        window.RPArchiver.get('readThroughEditor').initialize();

        await window.RPArchiver.get('previewExport').loadCSSTemplates();
        await window.RPArchiver.get('about').initialize();
        if (typeof initializeConverter === 'function') initializeConverter();
        window.RPArchiver.get('notifications').initialize();
        window.RPArchiver.get('projectLoader').initialize(userSessionManager);
        window.RPArchiver.get('saveExport').scheduleLoreLinkRefresh(0);

        if (themePromise) await themePromise;
        window.RPLogger?.info('Initialization complete');
        return { userSessionManager };
    })().catch(error => {
        window.RPLogger?.error('Initialization failed:', error);
        if (window.RPArchiver?.has('previewExport')) {
            window.RPArchiver.get('previewExport').showStatus(`RP Archiver could not finish starting: ${error.message}`, 'error');
        }
        return null;
    }).finally(() => {
        // Never leave the page invisible if a theme or optional component fails.
        document.body.classList.add('theme-loaded');
    });

    return rpArchiverInitializationPromise;
}

// Initialize user system
async function initializeUserSystem() {
    try {
        // Initialize session manager
        const userSessionManager = initializeUserSession();
        
        // Initialize user session
        const hasValidUser = await userSessionManager.initializeUser();
        
        // Update UI with user info
        userSessionManager.updateUserDisplay();
        
        window.RPLogger?.debug('User system initialized');
        return userSessionManager;
    } catch (error) {
        window.RPLogger?.error('User system initialization failed:', error);
        // Continue with guest mode if something fails
        const userSessionManager = window.userSessionManager || initializeUserSession();
        if (userSessionManager) {
            userSessionManager.setGuestMode();
            userSessionManager.updateUserDisplay();
        }
        return userSessionManager;
    }
}

// Initialize avatar context menu for logout
function initializeRPContextMenu() {
    const navAvatarImg = document.getElementById('nav-avatar-img');
    const contextMenu = document.getElementById('rp-context-menu');
    const logoutOption = document.getElementById('rp-logout-option');

    if (!navAvatarImg || !contextMenu) return;
    if (contextMenu.dataset.rpInitialized === 'true') return;
    contextMenu.dataset.rpInitialized = 'true';

    // Show context menu on avatar click
    navAvatarImg.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Position menu below avatar
        const rect = navAvatarImg.getBoundingClientRect();
        contextMenu.style.left = `${rect.left - 60}px`;
        contextMenu.style.top = `${rect.bottom + 5}px`;
        contextMenu.style.display = 'block';
    });

    // Handle logout click
    logoutOption?.addEventListener('click', () => {
        contextMenu.style.display = 'none';
        
        // Clear session completely (don't use logout() because it sets guest mode)
        localStorage.removeItem('writingTools_session');
        localStorage.removeItem('writingTools_guestMode');
        
        // Navigate back to main app which will show login screen
        window.location.href = '../index.html';
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target) && e.target !== navAvatarImg) {
            contextMenu.style.display = 'none';
        }
    });

    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            contextMenu.style.display = 'none';
        }
    });
}

// Initialize basic event listeners
function initializeEventListeners() {
    if (document.body.dataset.rpCoreListenersInitialized === 'true') return;
    document.body.dataset.rpCoreListenersInitialized = 'true';

    // Import button and file handling - CLEAN VERSION
    const importBtn = document.getElementById('import-btn');
    const importFile = document.getElementById('import-file');

    if (importBtn && importFile) {
        importBtn.addEventListener('click', event => {
            event.preventDefault();
            openFilePicker(importFile);
        });

        importFile.addEventListener('change', async event => {
            const file = event.target.files?.[0];
            if (!file) return;

            try {
                await window.RPArchiver.get('importController').importRoleplayFile(file);
                window.RPArchiver.get('previewExport').showStatus(`Imported "${file.name}"`, 'success');
            } catch (error) {
                window.RPLogger?.error('File import failed:', error);
                showRPError(`Could not import "${file.name}": ${error.message}`);
            } finally {
                event.target.value = '';
            }
        });
    }
    
    const convertBtn = document.getElementById('convert-btn');
    if (convertBtn) {
        convertBtn.addEventListener('click', async event => {
            event.preventDefault();
            await window.RPArchiver.get('previewExport').convertToHTML();
        });
    }

    const copyBtn = document.getElementById('copy-btn');
    const saveProjectBtn = document.getElementById('save-project-btn');
    const updateLoreCopyBtn = document.getElementById('update-lore-copy-btn');
    const exportHTMLBtn = document.getElementById('export-html-btn');
    const downloadFallbackBtn = document.getElementById('download-fallback-btn');

    copyBtn?.addEventListener('click', event => {
        event.preventDefault();
        window.RPArchiver.get('previewExport').copyHTML();
    });

    saveProjectBtn?.addEventListener('click', async event => {
        event.preventDefault();
        await window.RPArchiver.get('saveExport').saveProject();
    });

    updateLoreCopyBtn?.addEventListener('click', async event => {
        event.preventDefault();
        await window.RPArchiver.get('saveExport').updateLoreCopies();
    });

    exportHTMLBtn?.addEventListener('click', event => {
        event.preventDefault();
        window.RPArchiver.get('saveExport').exportHTML();
    });

    downloadFallbackBtn?.addEventListener('click', event => {
        event.preventDefault();
        window.RPArchiver.get('saveExport').downloadFallback();
    });
    
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            switchTab(tabName);
        });

        tab.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

            const tabs = [...document.querySelectorAll('.tabs .tab')];
            const currentIndex = tabs.indexOf(event.currentTarget);
            const nextIndex = event.key === 'Home'
                ? 0
                : event.key === 'End'
                    ? tabs.length - 1
                    : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;

            event.preventDefault();
            tabs[nextIndex].focus();
            switchTab(tabs[nextIndex].getAttribute('data-tab'));
        });
    });
    
    window.RPLogger?.debug('Core event listeners initialized');
}

function showRPError(message) {
    if (window.RPArchiver.has('previewExport')) {
        window.RPArchiver.get('previewExport').showStatus(message, 'error');
    }

    if (window.RPArchiver.has('notifications')) window.RPArchiver.get('notifications').show('error', message);
    else window.RPLogger?.error(message);
}

function disableDownloadButton() {
    if (window.RPArchiver?.has('saveExport')) window.RPArchiver.get('saveExport').invalidate();
}

function openFilePicker(fileInput) {
    if (window.ToolkitFilePicker) {
        void window.ToolkitFilePicker.open(fileInput);
        return;
    }

    fileInput.click();
}

// Switch tabs (HTML/Preview)
async function switchTab(tabName) {
    document.querySelectorAll('.tabs .tab').forEach(tab => {
        const active = tab.getAttribute('data-tab') === tabName;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.setAttribute('tabindex', active ? '0' : '-1');
    });

    document.querySelectorAll('.tab-content').forEach(content => {
        const active = content.id === `${tabName}-content`;
        content.classList.toggle('active', active);
        content.hidden = !active;
    });

    // Update preview if switching to preview tab
    if (tabName === 'preview') {
        const html = document.getElementById('html-output').value;
        if (html) {
            window.RPLogger?.debug('Updating generated HTML preview');
            await window.RPArchiver.get('previewExport').updatePreview(html);
        } else {
            window.RPLogger?.debug('Preview skipped because no generated HTML is available');
            // Optional: show a message in the preview
            const iframe = document.getElementById('preview-frame');
            if (iframe) {
                iframe.srcdoc = '<!doctype html><html><body></body></html>';
            }
        }
    }
}

// Initialize form handlers
function initializeFormHandlers() {
    if (document.body.dataset.rpFormHandlersInitialized === 'true') return;
    document.body.dataset.rpFormHandlersInitialized = 'true';
    
    // Character management - FIXED VERSION
    const addCharacterBtn = document.getElementById('add-character');
    if (addCharacterBtn && typeof addCharacter === 'function') {
        addCharacterBtn.addEventListener('click', function(e) {
            e.preventDefault();
            addCharacter(); // Call with no parameters to use defaults
        });
    }
    
    // Track management  
    const addTrackBtn = document.getElementById('add-track');
    const addTrackHeadingBtn = document.getElementById('add-track-heading');
    
    if (addTrackBtn && typeof addTrack === 'function') {
        addTrackBtn.addEventListener('click', function(e) {
            e.preventDefault();
            addTrack(); // Call without parameters to use defaults
        });
    }

    if (addTrackHeadingBtn && typeof addTrackHeading === 'function') {
        addTrackHeadingBtn.addEventListener('click', function(e) {
            e.preventDefault();
            addTrackHeading(); // Call without parameters
        });
    }
        
    // Comments management
    const addCommentBtn = document.getElementById('add-comment');
    const addCommentHeadingBtn = document.getElementById('add-comment-heading');
    
    if (addCommentBtn && typeof addComment === 'function') {
        addCommentBtn.addEventListener('click', function(e) {
            e.preventDefault();
            addComment(); // Call without parameters
        });
    }

    if (addCommentHeadingBtn && typeof addCommentHeading === 'function') {
        addCommentHeadingBtn.addEventListener('click', function(e) {
            e.preventDefault();
            addCommentHeading(); // Call without parameters
        });
    }

    // Glossary management
    const addGlossaryBtn = document.getElementById('add-glossary-entry');
    if (addGlossaryBtn && typeof addGlossaryEntry === 'function') {
        addGlossaryBtn.addEventListener('click', function(e) {
            e.preventDefault();
            addGlossaryEntry();
        });
    }
    
    // Parts management - FIXED VERSION
    const addPartBtn = document.getElementById('add-part');
    if (addPartBtn && typeof addPart === 'function') {
        addPartBtn.addEventListener('click', function(e) {
            e.preventDefault();
            addPart(); // Call with no parameters to use defaults
        });
    }
    if (typeof initializePartEditor === 'function') initializePartEditor();
    
    // Images management
    // Images management - updated for file-based system
    const storyImagesBrowse = document.getElementById('story-images-browse');
    const storyImagesFile = document.getElementById('story-images-file');
    const backgroundImageBrowse = document.getElementById('background-image-browse');
    const backgroundImageFile = document.getElementById('background-image-file');

    if (storyImagesBrowse && storyImagesFile) {
        storyImagesBrowse.addEventListener('click', () => {
            openFilePicker(storyImagesFile);
        });
        
        storyImagesFile.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            
            files.forEach(file => {
                try {
                    validateImageFile(file);
                    addImageFile(file, false);
                } catch (error) {
                    showRPError(`Could not add "${file.name}": ${error.message}`);
                }
            });
            
            // Clear the input so same files can be selected again
            e.target.value = '';
        });
    }

    if (backgroundImageBrowse && backgroundImageFile) {
        backgroundImageBrowse.addEventListener('click', () => {
            openFilePicker(backgroundImageFile);
        });
        
        backgroundImageFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    validateImageFile(file);
                    addImageFile(file, true);
                } catch (error) {
                    showRPError(`Could not add the background image: ${error.message}`);
                }
            }
            
            // Clear the input
            e.target.value = '';
        });
    }

    // Initialize empty states
    const backgroundDisplay = document.getElementById('background-image-display');
    const imagesContainer = document.getElementById('images-container');

    if (backgroundDisplay) {
        backgroundDisplay.innerHTML = '<div class="file-display-empty">No background image selected</div>';
    }

    if (imagesContainer) {
        imagesContainer.innerHTML = '<div class="file-display-empty">No story images selected</div>';
    }

    // Any project-setting edit makes the generated document stale.
    const contentMain = document.querySelector('.content-main');
    const invalidateGeneratedDocument = event => {
        if (!event.target.matches('input, select, textarea')) return;
        if (event.target.id === 'html-output' || event.target.id === 'mobile-section-picker') return;
        disableDownloadButton();
        if (event.target.id === 'title' || event.target.id === 'universe') {
            window.RPArchiver.get('saveExport').scheduleLoreLinkRefresh();
        }
    };
    contentMain?.addEventListener('input', invalidateGeneratedDocument);
    contentMain?.addEventListener('change', invalidateGeneratedDocument);
    
    // Navigation management - FIXED VERSION
    const addNavigationBtn = document.getElementById('add-navigation');
    if (addNavigationBtn && typeof addNavigation === 'function') {
        addNavigationBtn.addEventListener('click', function(e) {
            e.preventDefault();
            addNavigation(); // Call with no parameters to use defaults
        });
    }
    
    // Word count updates
    const rpTextArea = document.getElementById('rp-text');
    if (rpTextArea && typeof updateWordCount === 'function') {
        rpTextArea.addEventListener('input', updateWordCount);
        // Initial count
        updateWordCount();
    }
    
    // Banner image management
    const bannerImageBrowse = document.getElementById('banner-image-browse');
    const bannerImageFile = document.getElementById('banner-image-file');

    if (bannerImageBrowse && bannerImageFile) {
        bannerImageBrowse.addEventListener('click', () => {
            openFilePicker(bannerImageFile);
        });
        
        bannerImageFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    validateImageFile(file);
                    addBannerImageFile(file);
                } catch (error) {
                    showRPError(`Could not add the banner image: ${error.message}`);
                }
            }
            
            // Clear the input
            e.target.value = '';
        });
    }

    // Initialize empty state for banner
    const bannerDisplay = document.getElementById('banner-image-display');
    if (bannerDisplay) {
        bannerDisplay.innerHTML = '<div class="file-display-empty">No banner image selected</div>';
    }

    // Chat file upload for roleplay text
    const chatUploadBtn = document.getElementById('chat-upload-btn');
    const chatFileUpload = document.getElementById('chat-file-upload');

    if (chatUploadBtn && chatFileUpload) {
        chatUploadBtn.addEventListener('click', () => {
            openFilePicker(chatFileUpload);
        });
        
        chatFileUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleChatFileUpload(file);
            }
            // Clear the input
            e.target.value = '';
        });
    }

    initializeTextEditorModal();
    
    window.RPLogger?.debug('Form handlers initialized');
}

// Initialize text editor modal functionality
function initializeTextEditorModal() {
    const partsContainer = document.getElementById('parts-container');
    const modal = document.getElementById('textEditorModal');
    const closeBtn = document.getElementById('closeTextEditor');
    const expandedTextarea = document.getElementById('expanded-rp-text');
    const modalWordCount = document.getElementById('modal-word-count');
    const modalPageCount = document.getElementById('modal-page-count');
    const modalTitle = modal?.querySelector('.text-editor-header h3');
    let activeTextarea = null;

    if (!partsContainer || !modal || !closeBtn || !expandedTextarea) {
        window.RPLogger?.debug('Text editor modal elements not found');
        return;
    }
    if (modal.dataset.rpInitialized === 'true') return;
    modal.dataset.rpInitialized = 'true';

    // Function to update modal word count
    function updateModalWordCount() {
        if (typeof countWords === 'function' && typeof calculatePageCount === 'function') {
            const text = expandedTextarea.value;
            const wordCount = countWords(text);
            const pageCount = calculatePageCount(wordCount);
            
            if (modalWordCount) modalWordCount.textContent = `Words: ${wordCount}`;
            if (modalPageCount) modalPageCount.textContent = `Pages: ${pageCount}`;
        }
    }

    // Open modal
    function openTextEditor(textarea) {
        activeTextarea = textarea;
        expandedTextarea.value = activeTextarea.value;
        const title = activeTextarea.closest('.part-entry')?.querySelector('.part-title')?.value.trim();
        if (modalTitle) modalTitle.textContent = title ? `Edit ${title}` : 'Edit story part';
        
        // Show modal
        modal.style.display = 'block';
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        // Focus the expanded textarea
        setTimeout(() => {
            expandedTextarea.focus();
        }, 100);
        
        // Update word count
        updateModalWordCount();
        
        // Prevent body scrolling
        document.body.style.overflow = 'hidden';
    }

    // Close modal
    function closeTextEditor() {
        if (activeTextarea) {
            activeTextarea.value = expandedTextarea.value;
            activeTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Update the main word count if the function exists
        if (typeof updateWordCount === 'function') {
            updateWordCount();
        }
        
        // Hide modal
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
        
        // Re-enable body scrolling
        document.body.style.overflow = '';
        activeTextarea = null;
    }

    // Event listeners
    partsContainer.addEventListener('click', function(e) {
        const expandBtn = e.target.closest('.expand-part-btn');
        if (!expandBtn) return;
        e.preventDefault();
        const textarea = expandBtn.closest('.part-entry')?.querySelector('.part-content');
        if (textarea) openTextEditor(textarea);
    });

    closeBtn.addEventListener('click', closeTextEditor);

    // Close when clicking outside the modal content
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeTextEditor();
        }
    });

    // Close with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            closeTextEditor();
        }
    });

    // Update word count as user types
    expandedTextarea.addEventListener('input', updateModalWordCount);

    window.RPLogger?.debug('Text editor modal initialized');
}

window.RPArchiver.define('debug', {
    userSession() {
        const userSessionManager = window.userSessionManager;
        if (!userSessionManager) {
            console.log('❌ User session manager not initialized');
            return null;
        }

        console.log('=== USER SESSION DEBUG ===');
        console.log('Session info:', userSessionManager.getSessionInfo());
        console.log('Current user:', userSessionManager.getCurrentUser());
        console.log('User context:', userSessionManager.getUserContext());
        console.log('Is guest:', userSessionManager.isGuest);
        console.log('Is logged in:', userSessionManager.isLoggedIn());
        return userSessionManager.getSessionInfo();
    }
});
