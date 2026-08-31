// CoWriter About System
// Manages the CoWriter help guide modal

class CoWriterAbout {
    constructor() {
        this.aboutData = null;
        this.modalId = 'cowriter-about-modal';
        this.currentSection = null;
        this.isModalOpen = false;
    }

    // Initialize the about system
    async initialize() {
        await this.loadAboutData();
        this.setupEventListeners();
    }

    // Load about content from JSON
    async loadAboutData() {
        try {
            const response = await fetch('cowriter/cowriter-about.json');
            if (!response.ok) {
                throw new Error('Failed to load CoWriter about data');
            }
            this.aboutData = await response.json();
        } catch (error) {
            console.error('Error loading CoWriter about data:', error);
            // Fallback data
            this.aboutData = {
                title: "CoWriter Guide",
                sections: [
                    {
                        id: "error",
                        title: "Error",
                        content: "Could not load the CoWriter help guide. Please check your connection and try again."
                    }
                ]
            };
        }
    }

    // Set up event listeners
    setupEventListeners() {
        // About button click
        const aboutBtn = document.getElementById('cowriter-about-btn');
        if (aboutBtn) {
            aboutBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openModal();
            });
        }

        const modal = document.getElementById(this.modalId);
        if (!modal) return;
        modal.querySelector('#cowriter-about-close')?.addEventListener('click', () => this.closeModal());
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                this.closeModal();
                return;
            }
            const link = event.target.closest('.cowriter-toc-link, .cowriter-toc-sublink');
            if (link && modal.contains(link)) this.showSection(link.dataset.section);
        });
    }

    // Open the about modal
    openModal() {
        if (!this.aboutData || this.isModalOpen) return;

        this.createModal();
        this.isModalOpen = true;
    }

    // Close the about modal
    closeModal() {
        const modal = document.getElementById(this.modalId);
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
            this.isModalOpen = false;
            this.currentSection = null;
        }
    }

    // Create and show modal
    createModal() {
        const modal = document.getElementById(this.modalId);
        if (!modal) return;

        this.populateTableOfContents();
        
        // Show modal with animation
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);

        // Show first section by default
        if (this.aboutData.sections && this.aboutData.sections.length > 0) {
            this.showSection(this.aboutData.sections[0].id);
        }
    }

    // Generate table of contents
    populateTableOfContents() {
        const container = document.getElementById('cowriter-toc-container');
        if (!container || !this.aboutData.sections) return;

        let html = '<div class="cowriter-toc-list">';
        
        this.aboutData.sections.forEach(section => {
            html += `
                <div class="cowriter-toc-item">
                    <button type="button" class="cowriter-toc-link" data-section="${section.id}">
                        ${section.title}
                    </button>
                    ${section.subsections ? this.generateSubsectionTOC(section.subsections) : ''}
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }

    // Generate subsection table of contents
    generateSubsectionTOC(subsections) {
        let html = '<div class="cowriter-toc-subsections">';
        
        subsections.forEach(subsection => {
            html += `
                <button type="button" class="cowriter-toc-sublink" data-section="${subsection.id}">
                    ${subsection.title}
                </button>
            `;
        });
        
        html += '</div>';
        return html;
    }

    // Show a specific section
    showSection(sectionId) {
        const contentDiv = document.getElementById('cowriter-section-content');
        if (!contentDiv) return;

        // Find the section or subsection
        let section = this.findSectionById(sectionId);
        if (!section) return;

        // Update current section
        this.currentSection = sectionId;

        // Update active states in TOC
        const modal = document.getElementById(this.modalId);
        if (modal) {
            modal.querySelectorAll('.cowriter-toc-link, .cowriter-toc-sublink').forEach(link => {
                link.classList.remove('active');
            });
            
            const activeLink = modal.querySelector(`[data-section="${sectionId}"]`);
            if (activeLink) {
                activeLink.classList.add('active');
            }
        }

        // Generate and display content
        contentDiv.innerHTML = this.generateSectionHTML(section);
        contentDiv.scrollTop = 0;
    }

    // Find section by ID (including subsections)
    findSectionById(sectionId) {
        for (let section of this.aboutData.sections) {
            if (section.id === sectionId) {
                return section;
            }
            
            if (section.subsections) {
                for (let subsection of section.subsections) {
                    if (subsection.id === sectionId) {
                        return subsection;
                    }
                }
            }
        }
        return null;
    }

    // Generate HTML for a section
    generateSectionHTML(section) {
        let html = `<h2>${section.title}</h2>`;
        
        // Convert content with basic markdown-like formatting
        let content = section.content || '';
        content = content.replace(/\n\n/g, '</p><p>');
        content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        content = content.replace(/`(.*?)`/g, '<code>$1</code>');
        
        html += `<div class="cowriter-section-content"><p>${content}</p></div>`;
        
        // Add subsections if they exist
        if (section.subsections) {
            html += '<div class="subsections">';
            section.subsections.forEach(subsection => {
                let subContent = subsection.content || '';
                subContent = subContent.replace(/\n\n/g, '</p><p>');
                subContent = subContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                subContent = subContent.replace(/`(.*?)`/g, '<code>$1</code>');
                
                html += `
                    <div class="cowriter-subsection">
                        <h3>${subsection.title}</h3>
                        <div class="cowriter-subsection-content"><p>${subContent}</p></div>
                    </div>
                `;
            });
            html += '</div>';
        }
        
        return html;
    }

}

// Initialize the CoWriter about system
let coWriterAbout = null;

// Export for global use
window.initializeCoWriterAbout = async function() {
    if (!coWriterAbout) {
        coWriterAbout = new CoWriterAbout();
        await coWriterAbout.initialize();
    }
    return coWriterAbout;
};
