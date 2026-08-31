        // Image modal variables
        var currentImageIndex = 0;
        var galleryImages = [];
        
        // Initialize image modal functionality
        function initImageModal() {
            // Get all images in the gallery
            galleryImages = Array.from(document.querySelectorAll('.story-gallery img'));
            
            // Add click event listeners to all gallery images
            galleryImages.forEach((img, index) => {
                img.addEventListener('click', function() {
                    currentImageIndex = index;
                    openImageModal(this.src);
                });
                
                // Add keyboard navigation
                img.setAttribute('tabindex', '0');
                img.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        currentImageIndex = index;
                        openImageModal(this.src);
                    }
                });
            });
        }
        
        // Open image modal
        function openImageModal(imageSrc) {
            console.log('Opening modal with image:', imageSrc);
            const modal = document.getElementById('imageModal');
            const modalImage = document.getElementById('modalImage');
            const prevBtn = document.getElementById('prevBtn');
            const nextBtn = document.getElementById('nextBtn');
            
            if (!modal || !modalImage) {
                console.error('Modal elements not found');
                return;
            }
            
            modalImage.src = imageSrc;
            modal.classList.add('show');
            
            // Update navigation buttons
            if (prevBtn && nextBtn) {
                prevBtn.disabled = currentImageIndex === 0;
                nextBtn.disabled = currentImageIndex === galleryImages.length - 1;
                
                // Hide navigation buttons if there's only one image
                if (galleryImages.length <= 1) {
                    prevBtn.style.display = 'none';
                    nextBtn.style.display = 'none';
                } else {
                    prevBtn.style.display = 'flex';
                    nextBtn.style.display = 'flex';
                }
            }
            
            // Prevent body scrolling
            document.body.style.overflow = 'hidden';
        }
        
        // Close image modal
        function closeImageModal() {
            console.log('Closing modal'); // Debug log
            const modal = document.getElementById('imageModal');
            if (modal) {
                modal.classList.remove('show');
                
                // Wait for animation to complete before hiding
                setTimeout(() => {
                    modal.style.display = 'none';
                }, 300);
            }
            
            // Re-enable body scrolling
            document.body.style.overflow = '';
        }
        
        // Navigate to previous image
        function previousImage() {
            if (currentImageIndex > 0) {
                currentImageIndex--;
                const prevImageSrc = galleryImages[currentImageIndex].src;
                openImageModal(prevImageSrc);
            }
        }
        
        // Navigate to next image
        function nextImage() {
            if (currentImageIndex < galleryImages.length - 1) {
                currentImageIndex++;
                const nextImageSrc = galleryImages[currentImageIndex].src;
                openImageModal(nextImageSrc);
            }
        }
        
        // Function to toggle the gallery
        function toggleGallery() {
            const galleryHeader = document.querySelector('.gallery-header');
            const galleryContent = document.querySelector('.gallery-content');
            const icon = galleryHeader.querySelector('.toggle-icon');
            
            if (galleryContent.classList.contains('collapsed')) {
                galleryContent.classList.remove('collapsed');
                icon.classList.remove('collapsed');
                icon.textContent = '▼';
            } else {
                galleryContent.classList.add('collapsed');
                icon.classList.add('collapsed');
                icon.textContent = '▶';
            }
        }
        
        // Function to toggle a part
        function togglePart(partId) {
            const partHeader = document.getElementById('header-' + partId);
            const partContent = document.getElementById(partId + '-content');
            const icon = partHeader.querySelector('.part-toggle');
            
            if (partContent.classList.contains('collapsed')) {
                partContent.classList.remove('collapsed');
                icon.classList.remove('collapsed');
                icon.textContent = '▼';
            } else {
                partContent.classList.add('collapsed');
                icon.classList.add('collapsed');
                icon.textContent = '▶';
            }
        }
        
        // Initialize table of contents links to toggle parts
        document.addEventListener('DOMContentLoaded', function() {
            // Initialize image modal
            initImageModal();
            
            const tocLinks = document.querySelectorAll('.table-of-contents a');
            tocLinks.forEach(link => {
                link.addEventListener('click', function(e) {
                    e.preventDefault(); // Prevent default anchor behavior
                    const targetId = this.getAttribute('href').substring(1);
                    const targetHeader = document.getElementById(targetId);
                    const targetContent = document.getElementById(targetId + '-content');
                    
                    // If the target is collapsed, expand it
                    if (targetContent && targetContent.classList.contains('collapsed')) {
                        togglePart(targetId);
                    }
                    
                    // Scroll to the part header
                    if (targetHeader) {
                        targetHeader.scrollIntoView({ 
                            behavior: 'smooth',
                            block: 'start'
                        });
                    }
                });
            });
            
            // Scroll to top button functionality
            const scrollTopBtn = document.getElementById('scrollTopBtn');
            
            // Show/hide the button based on scroll position
            window.addEventListener('scroll', function() {
                if (window.pageYOffset > 300) {
                    scrollTopBtn.classList.add('visible');
                } else {
                    scrollTopBtn.classList.remove('visible');
                }
            });
            
            // Scroll to top when button is clicked
            scrollTopBtn.addEventListener('click', function() {
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            });
            
            // Soundtrack and Comments panel functionality
            const soundtrackToggle = document.getElementById('soundtrackToggle');
            const soundtrackPanel = document.getElementById('soundtrackPanel');
            const commentsToggle = document.getElementById('commentsToggle');
            const commentsPanel = document.getElementById('commentsPanel');
            
            // Function to close all panels
            function closeAllPanels() {
                if (soundtrackPanel) {
                    soundtrackPanel.classList.remove('open');
                    if (soundtrackToggle) {
                        soundtrackToggle.innerHTML = '♫';
                        soundtrackToggle.title = 'Open Soundtrack';
                        soundtrackToggle.style.opacity = '1';
                        soundtrackToggle.style.pointerEvents = 'auto';
                    }
                }
                if (commentsPanel) {
                    commentsPanel.classList.remove('open');
                    if (commentsToggle) {
                        commentsToggle.innerHTML = '💬';
                        commentsToggle.title = 'Open Comments';
                        commentsToggle.style.opacity = '1';
                        commentsToggle.style.pointerEvents = 'auto';
                    }
                }
            }
            
            // Soundtrack toggle functionality
            if (soundtrackToggle && soundtrackPanel) {
                soundtrackToggle.addEventListener('click', function() {
                    const isOpen = soundtrackPanel.classList.contains('open');
                    
                    // Close all panels first
                    closeAllPanels();
                    
                    // If it wasn't open, open it
                    if (!isOpen) {
                        soundtrackPanel.classList.add('open');
                        soundtrackToggle.innerHTML = '×';
                        soundtrackToggle.title = 'Close Soundtrack';
                        
                        // Hide the comments toggle
                        if (commentsToggle) {
                            commentsToggle.style.opacity = '0';
                            commentsToggle.style.pointerEvents = 'none';
                        }
                    }
                });
            }
            
            // Comments toggle functionality
            if (commentsToggle && commentsPanel) {
                commentsToggle.addEventListener('click', function() {
                    const isOpen = commentsPanel.classList.contains('open');
                    
                    // Close all panels first
                    closeAllPanels();
                    
                    // If it wasn't open, open it
                    if (!isOpen) {
                        commentsPanel.classList.add('open');
                        commentsToggle.innerHTML = '×';
                        commentsToggle.title = 'Close Comments';
                        
                        // Hide the soundtrack toggle
                        if (soundtrackToggle) {
                            soundtrackToggle.style.opacity = '0';
                            soundtrackToggle.style.pointerEvents = 'none';
                        }
                    }
                });
            }
            
            // Close panels when clicking outside them
            document.addEventListener('click', function(e) {
                const isClickInSoundtrack = soundtrackPanel && (soundtrackPanel.contains(e.target) || e.target === soundtrackToggle);
                const isClickInComments = commentsPanel && (commentsPanel.contains(e.target) || e.target === commentsToggle);
                
                if (!isClickInSoundtrack && !isClickInComments) {
                    closeAllPanels();
                }
            });
            
            // Modal keyboard navigation
            document.addEventListener('keydown', function(e) {
                const modal = document.getElementById('imageModal');
                if (modal.classList.contains('show')) {
                    switch(e.key) {
                        case 'Escape':
                            closeImageModal();
                            break;
                        case 'ArrowLeft':
                            e.preventDefault();
                            previousImage();
                            break;
                        case 'ArrowRight':
                            e.preventDefault();
                            nextImage();
                            break;
                    }
                }
            });
            
            // Close modal when clicking outside the image
            document.getElementById('imageModal').addEventListener('click', function(e) {
                if (e.target === this) {
                    closeImageModal();
                }
            });
        });
        
        // Function to export all text as a text file
        function exportText() {
            // Collect all text
            let allText = document.title + "\n\n";

            // Add story info (fixed to prevent duplicate description)
            const storyInfo = document.querySelector('.story-info');
            if (storyInfo) {
                const infoParagraphs = storyInfo.querySelectorAll('p');
                infoParagraphs.forEach(p => {
                    allText += p.textContent.trim() + "\n";
                });
                allText += "\n----------------------------\n\n";
            }

            // Helper function to process RP entries into text format
            const processEntries = (container) => {
                let contentText = "";
                const entries = container.querySelectorAll('.rp-entry');
                entries.forEach(entry => {
                    const charNameElement = entry.querySelector('.character-name');
                    const paragraphs = Array.from(entry.querySelectorAll('p'));

                    let currentEntryText = "";
                    if (charNameElement) {
                        currentEntryText += charNameElement.textContent + ": ";
                    }

                    if (paragraphs.length > 0) {
                        // Append first paragraph to the same line as the character name
                        currentEntryText += paragraphs[0].textContent.trim();
                        
                        // Append subsequent paragraphs, each separated by a blank line
                        if (paragraphs.length > 1) {
                            currentEntryText += '\n\n' + paragraphs.slice(1).map(p => p.textContent.trim()).join('\n\n');
                        }
                    }
                    
                    contentText += currentEntryText + "\n\n"; // Add two blank lines for spacing between entries
                });
                return contentText;
            };

            // Check if the story is structured with parts
            const parts = document.querySelectorAll('.part-header');
            
            if (parts.length > 0) {
                // Story has multiple parts, process each one
                parts.forEach((partHeader, index) => {
                    const partTitle = partHeader.querySelector('h2').textContent;
                    allText += partTitle + "\n\n";
                    
                    const partId = partHeader.id.replace('header-', '');
                    const partContent = document.getElementById(partId + '-content');
                    
                    if (partContent) {
                        allText += processEntries(partContent);
                    }
                    
                    // Add separator between parts, but not after the last one
                    if (index < parts.length - 1) {
                        allText += "----------------------------\n\n";
                    }
                });
            } else {
                // This is a single story (no parts), process the main content area
                const mainContent = document.querySelector('main');
                if (mainContent) {
                    allText += processEntries(mainContent);
                }
            }

            // Create and download the text file
            const filename = (document.title.split(' - ')[0] || 'story') + '.txt';
            const element = document.createElement('a');
            // Use trim() to remove any trailing whitespace before encoding
            element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(allText.trim()));
            element.setAttribute('download', filename);
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
        }

        // Glossary functionality
        function scrollToGlossary(glossaryId) {
            const element = document.getElementById(glossaryId);
            if (element) {
                // Store the current scroll position
                sessionStorage.setItem('returnScrollPos', window.pageYOffset);
                
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('glossary-highlight');
                setTimeout(() => {
                    element.classList.remove('glossary-highlight');
                }, 2000);
            }
        }

        function returnToText() {
            const scrollPos = sessionStorage.getItem('returnScrollPos');
            if (scrollPos) {
                window.scrollTo({ top: parseInt(scrollPos), behavior: 'smooth' });
                sessionStorage.removeItem('returnScrollPos');
            }
        }

        // Real anchors remain as a no-JavaScript fallback; these helpers add
        // smooth movement and return to the exact marker that was clicked.
        function openFootnote(event, footnoteId, referenceId) {
            const footnote = document.getElementById(footnoteId);
            if (!footnote) return;

            event.preventDefault();
            sessionStorage.setItem('rpFootnoteReturn:' + footnoteId, referenceId);
            footnote.scrollIntoView({ behavior: 'smooth', block: 'center' });
            footnote.classList.add('rp-footnote-jump');
            setTimeout(() => footnote.classList.remove('rp-footnote-jump'), 1800);
        }

        function returnFromFootnote(event, footnoteId, fallbackReferenceId) {
            const referenceId = sessionStorage.getItem('rpFootnoteReturn:' + footnoteId) || fallbackReferenceId;
            const reference = document.getElementById(referenceId);
            if (!reference) return;

            event.preventDefault();
            reference.scrollIntoView({ behavior: 'smooth', block: 'center' });
            reference.focus({ preventScroll: true });
            sessionStorage.removeItem('rpFootnoteReturn:' + footnoteId);
        }

        // Initialize glossary tooltips if enabled
        document.addEventListener('DOMContentLoaded', function() {
            const glossaryLinks = document.querySelectorAll('.glossary-link[data-glossary-tooltip]');
            
            if (glossaryLinks.length > 0) {
                // Create tooltip element - let CSS handle all styling
                const tooltip = document.createElement('div');
                tooltip.className = 'glossary-tooltip';
                document.body.appendChild(tooltip);
                
                glossaryLinks.forEach(link => {
                    link.addEventListener('mouseenter', function(e) {
                        const definition = this.getAttribute('data-glossary-tooltip');
                        tooltip.textContent = definition;
                        tooltip.style.display = 'block';
                        
                        // Position tooltip near mouse cursor
                        tooltip.style.left = (e.clientX + 10) + 'px';
                        tooltip.style.top = (e.clientY + 10) + 'px';
                    });

                    // Update position as mouse moves over the link
                    link.addEventListener('mousemove', function(e) {
                        if (tooltip.style.display === 'block') {
                            tooltip.style.left = (e.clientX + 10) + 'px';
                            tooltip.style.top = (e.clientY + 10) + 'px';
                        }
                    });
                    
                    link.addEventListener('mouseleave', function() {
                        tooltip.style.display = 'none';
                    });
                });
            }
        });
