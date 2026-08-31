// Generated plan reader runtime
function generatePlanFilteringJavaScript() {
    return `
        // Plan filtering state
        let selectedPlanTags = new Set();
        let planFilterMode = 'any';
        let currentPlanSearchFilter = '';

        // Initialize plan filtering (reusing character filter structure)
        function initializePlanFiltering() {
            const searchInput = document.getElementById('plan-search');
            if (searchInput) {
                searchInput.addEventListener('input', function() {
                    currentPlanSearchFilter = this.value.toLowerCase().trim();
                    applyPlanFilters();
                });
            }
        }

        function togglePlanNavigation() {
            const plansSection = document.getElementById('plans');
            if (!plansSection) return;
            
            const content = plansSection.querySelector('.character-nav-content');
            const toggle = plansSection.querySelector('.character-nav-toggle');
            
            if (content && toggle) {
                content.classList.toggle('collapsed');
                toggle.innerHTML = content.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
                
                // Update toggle state for proper styling
                if (content.classList.contains('collapsed')) {
                    toggle.classList.remove('expanded');
                } else {
                    toggle.classList.add('expanded');
                }
            }
        }

        function togglePlanTag(tag) {
            if (typeof selectedPlanTags === 'undefined') {
                window.selectedPlanTags = new Set();
            }
            
            if (selectedPlanTags.has(tag)) {
                selectedPlanTags.delete(tag);
            } else {
                selectedPlanTags.add(tag);
            }
            
            updatePlanTagStates();
            updatePlanClearButtonState();
            applyPlanFilters();
        }

        function updatePlanTagStates() {
            const plansSection = document.getElementById('plans');
            if (!plansSection) return;
            
            plansSection.querySelectorAll('.character-tag-link').forEach(link => {
                const fullTag = link.dataset.tag || link.textContent;
                const strippedTag = stripHiddenPrefix(fullTag);
                
                if (selectedPlanTags.has(strippedTag)) {
                    link.classList.add('selected');
                } else {
                    link.classList.remove('selected');
                }
            });
        }

        function updatePlanClearButtonState() {
            const clearBtn = document.getElementById('clear-plan-selected-btn');
            if (clearBtn) {
                if (selectedPlanTags.size > 0) {
                    clearBtn.classList.add('active');
                } else {
                    clearBtn.classList.remove('active');
                }
            }
        }

        function clearAllPlanTags() {
            selectedPlanTags.clear();
            updatePlanTagStates();
            updatePlanClearButtonState();
            applyPlanFilters();
        }

        function setPlanFilterMode(mode) {
            planFilterMode = mode;
            
            // Update UI
            document.querySelectorAll('#plan-filter-mode-any, #plan-filter-mode-all').forEach(option => {
                option.classList.remove('active');
            });
            document.getElementById(\`plan-filter-mode-\${mode}\`).classList.add('active');
            
            // Reapply filters
            applyPlanFilters();
        }

        function applyPlanFilters() {
            const planCards = document.querySelectorAll('.plan-card');
            
            planCards.forEach(card => {
                const cardTags = card.getAttribute('data-tags').toLowerCase().split(',').filter(tag => tag.trim());
                const cardName = card.getAttribute('data-name');
                
                // Search filter
                const matchesSearch = currentPlanSearchFilter === '' || cardName.includes(currentPlanSearchFilter);
                
                // Tag filter
                let matchesTags = true;
                
                if (selectedPlanTags.size > 0) {
                    const selectedTagsLower = Array.from(selectedPlanTags).map(tag => tag.toLowerCase());
                    
                    if (planFilterMode === 'all') {
                        // Plan must have ALL selected tags
                        matchesTags = selectedTagsLower.every(selectedTag => 
                            cardTags.some(cardTag => cardTag.includes(selectedTag))
                        );
                    } else {
                        // Plan must have ANY selected tag (default)
                        matchesTags = selectedTagsLower.some(selectedTag => 
                            cardTags.some(cardTag => cardTag.includes(selectedTag))
                        );
                    }
                }
                
                // Show/hide card (reusing existing hidden class)
                if (matchesSearch && matchesTags) {
                    card.classList.remove('hidden');
                } else {
                    card.classList.add('hidden');
                }
            });
            
            // Update results count (optional)
            updatePlanResultsCount();
        }

        function updatePlanResultsCount() {
            const visibleCards = document.querySelectorAll('.plan-card:not(.hidden)');
            const totalCards = document.querySelectorAll('.plan-card');
            
            // You can add a results counter display here if desired
        }

        // Function to apply plan colors to cards
        function applyPlanCardColors() {
            const planCards = document.querySelectorAll('.plan-card[data-plan-color]');
            
            planCards.forEach(card => {
                const planColor = card.getAttribute('data-plan-color');
                if (planColor) {
                    // Create a more subtle version of the color for the border
                    const subtleColor = addOpacityToHexColor(planColor, 0.4); // 40% opacity
                    card.style.setProperty('--plan-border-color', subtleColor);
                }
            });
        }

        // Helper function to add opacity to hex colors
        function addOpacityToHexColor(hex, opacity) {
            // Remove # if present
            hex = hex.replace('#', '');
            
            // Parse RGB
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            
            // Return rgba with opacity
            return \`rgba(\${r}, \${g}, \${b}, \${opacity})\`;
        }

        // Initialize plan filtering when the page loads
        document.addEventListener('DOMContentLoaded', function() {
            // Add a small delay to ensure elements are rendered
            setTimeout(() => {
                initializePlanFiltering();
                applyPlanCardColors(); 
                
            }, 100);
        });

        // MOVE THESE HERE (at the end, before the closing backtick):
        window.togglePlanNavigation = togglePlanNavigation;
        window.togglePlanTag = togglePlanTag;
        window.setPlanFilterMode = setPlanFilterMode;
        window.clearAllPlanTags = clearAllPlanTags;
        
        // Also add these:
        window.selectedPlanTags = selectedPlanTags;
        window.applyPlanFilters = applyPlanFilters;
        window.updatePlanTagStates = updatePlanTagStates;
        window.updatePlanClearButtonState = updatePlanClearButtonState;
    `;
}

// Main function to generate Plans content with Cards/Timeline tabs
function generatePlansContentWithTimeline(data) {
    let plansHTML = '<div id="plans" class="content">';
    
    if (data.plans && data.plans.length > 0) {
        // Header with tabs
        plansHTML += `
            <div class="plans-header-with-tabs">
                <h2 class="section-title">Story Plans</h2>
                <div class="plans-tabs">
                    <button class="plans-tab active" id="cards-tab" data-lore-action="switch-plans-view" data-view="cards">Cards</button>
                    <button class="plans-tab" id="timeline-tab" data-lore-action="switch-plans-view" data-view="timeline">Timeline</button>
                </div>
            </div>`;
        
        // Cards View (using your existing generateCardsView function)
        plansHTML += '<div id="cards-view" class="plans-view active">';
        plansHTML += generateCardsView(data);
        plansHTML += '</div>';
        
        // Timeline View (using your existing generateTimelineView function)
        plansHTML += '<div id="timeline-view" class="plans-view">';
        plansHTML += generateTimelineView(data);
        plansHTML += `<button class="back-to-top" id="timeline-back-to-top" title="Back to top"></button>`;
        plansHTML += generateEventNotesModal(); // Add modal
        plansHTML += '</div>';
        
    } else {
        plansHTML += `
            <h2 class="section-title">Story Plans</h2>
            <div class="empty-content">
                <h3>No Story Plans</h3>
                <p>No story arcs have been added yet.</p>
            </div>`;
    }
    
    plansHTML += '</div>';
    return plansHTML;
}

// ============================================================================
// EVENT DATE/TIME PICKER
// ============================================================================
