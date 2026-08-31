// My Sites functionality - Updated for File-Based Auth System with Loading

class MySitesManager {
    constructor(authManager = null, navigation = null, preferencesClient = null) {
        this.authManager = authManager;
        this.navigation = navigation;
        this.preferencesClient = preferencesClient;
        this.sites = [];
        this.currentSort = 'lastModified';
        this.isLoading = false;
        this.showingFavoritesOnly = false;
        this.favorites = new Set();
        this.tags = {};
        this.selectedTags = new Set();
        this.tagFilterMode = 'any';
        this.siteById = new Map();
        this.catalogWarnings = [];
        this.pendingIdentityMigration = false;
        this.refreshController = null;
        this.refreshSessionKey = null;
        this.refreshPromise = null;
        
        this.initializeEventListeners();
    }

    getUserContext() {
        return this.authManager?.getUserContext?.() || { isGuest: true };
    }

    // Check if user is logged in (updated for new auth system)
    isUserLoggedIn() {
        const currentUser = this.authManager?.getCurrentUser?.();
        return Boolean(currentUser && !currentUser.isGuest);
    }

    // Initialize event listeners
    initializeEventListeners() {
        // Existing sort dropdown code...
        const sortSelect = document.getElementById('sites-sort');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.currentSort = e.target.value;
                this.sortAndRenderSites();
            });
        }

        // Existing favorites button code...
        const favoritesBtn = document.getElementById('favorites-filter-btn');
        if (favoritesBtn) {
            favoritesBtn.addEventListener('click', () => {
                this.toggleFavoritesFilter();
            });
        }

        // NEW: Tags modal event listeners
        const closeTagsModal = document.getElementById('close-tags-modal');
        if (closeTagsModal) {
            closeTagsModal.addEventListener('click', () => {
                this.closeTagsModal();
            });
        }

        const saveTagsBtn = document.getElementById('save-tags');
        if (saveTagsBtn) {
            saveTagsBtn.addEventListener('click', () => {
                this.saveTagsFromModal();
            });
        }

        const cancelTagsBtn = document.getElementById('cancel-tags');
        if (cancelTagsBtn) {
            cancelTagsBtn.addEventListener('click', () => {
                this.closeTagsModal();
            });
        }

        // Tags label click for ANY/ALL toggle
        const tagsLabel = document.getElementById('tags-label');
        if (tagsLabel) {
            tagsLabel.addEventListener('click', () => {
                this.toggleTagFilterMode();
            });
            tagsLabel.style.cursor = 'pointer';
        }

        // Close modal when clicking outside
        const tagsModal = document.getElementById('tags-modal');
        if (tagsModal) {
            tagsModal.addEventListener('click', (e) => {
                if (e.target === tagsModal) {
                    this.closeTagsModal();
                }
            });
        }

        const retryButton = document.getElementById('sites-retry');
        retryButton?.addEventListener('click', () => this.refresh({ force: true }));

        const grid = document.getElementById('sites-grid');
        grid?.addEventListener('click', event => this.handleGridClick(event));
    }

    getSessionKey() {
        const user = this.authManager?.getCurrentUser?.();
        if (!user || user.isGuest) return null;
        return String(user.id || user.userId || user.username);
    }

    async loadUserSites(signal) {
        const response = await fetch('/api/user-sites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: '{}'
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Failed to load sites');
        return Array.isArray(result) ? { sites: result, warnings: [] } : result;
    }

    // Show loading state
    showLoadingState() {
        const loading = document.getElementById('sites-loading');
        const empty = document.getElementById('sites-empty');
        const grid = document.getElementById('sites-grid');

        if (loading) loading.style.display = 'flex';
        if (empty) empty.style.display = 'none';
        if (grid) grid.style.display = 'none';
        this.updateCatalogWarning([]);
    }

    // Show empty state
    showEmptyState(message = null) {
        const loading = document.getElementById('sites-loading');
        const empty = document.getElementById('sites-empty');
        const grid = document.getElementById('sites-grid');
        const retry = document.getElementById('sites-retry');
        const tools = empty?.querySelector('[data-tab-target="tools"]');

        if (loading) loading.style.display = 'none';
        if (empty) {
            empty.style.display = 'flex';
            if (message) {
                // Update both title and message for better UX
                const title = empty.querySelector('#empty-state-title');
                const p = empty.querySelector('#empty-state-message');
                
                if (message.includes('log in')) {
                    if (title) title.textContent = 'Login Required';
                    if (p) p.textContent = message;
                } else if (message.includes('No sites found')) {
                    if (title) title.textContent = 'No Sites Found';
                    if (p) p.textContent = message;
                } else {
                    if (title) title.textContent = message.includes('match') ? 'No Matching Sites' : 'Sites Unavailable';
                    if (p) p.textContent = message;
                }
            }
        }
        const isFailure = Boolean(message?.includes('try again'));
        if (retry) retry.hidden = !isFailure;
        if (tools) tools.hidden = isFailure || Boolean(message?.includes('match'));
        if (grid) grid.style.display = 'none';
    }

    updateCatalogWarning(warnings = []) {
        const warning = document.getElementById('sites-warning');
        if (!warning) return;
        warning.hidden = warnings.length === 0;
        warning.textContent = warnings.length
            ? `${warnings.length} project${warnings.length === 1 ? '' : 's'} could not be fully cataloged. Other sites are still available.`
            : '';
    }

    sortAndRenderSites() {
        if (!this.sites || this.sites.length === 0) {
            this.showEmptyState();
            return;
        }

        // Filter for favorites if needed
        let sitesToShow = this.showingFavoritesOnly 
            ? this.sites.filter(site => this.isFavorited(site.projectId))
            : this.sites;

        // Filter for tags if any are selected
        if (this.selectedTags.size > 0) {
            sitesToShow = sitesToShow.filter(site => {
                const siteTags = this.getProjectTags(site.projectId);
                const selectedTagsArray = Array.from(this.selectedTags);
                
                if (this.tagFilterMode === 'all') {
                    // ALL mode: site must have ALL selected tags
                    return selectedTagsArray.every(tag => siteTags.includes(tag));
                } else {
                    // ANY mode: site must have at least one selected tag
                    return selectedTagsArray.some(tag => siteTags.includes(tag));
                }
            });
        }

        // Check if showing favorites but none exist, automatically switch back to all sites
        if (this.showingFavoritesOnly && sitesToShow.length === 0 && this.sites.some(site => this.isFavorited(site.projectId))) {
            // Only switch back if we actually have favorites but they're filtered out by tags
            // Don't switch if we genuinely have no favorites
            const allFavorites = this.sites.filter(site => this.isFavorited(site.projectId));
            if (allFavorites.length > 0) {
                this.showingFavoritesOnly = false;
                this.updateFavoriteButton();
                sitesToShow = this.sites;
                
                // Re-apply tag filtering
                if (this.selectedTags.size > 0) {
                    sitesToShow = sitesToShow.filter(site => {
                        const siteTags = this.getProjectTags(site.projectId);
                        const selectedTagsArray = Array.from(this.selectedTags);
                        
                        if (this.tagFilterMode === 'all') {
                            return selectedTagsArray.every(tag => siteTags.includes(tag));
                        } else {
                            return selectedTagsArray.some(tag => siteTags.includes(tag));
                        }
                    });
                }
            }
        }

        // Sort sites based on current sort option
        const sortedSites = [...sitesToShow].sort((a, b) => {
            switch (this.currentSort) {
                case 'title':
                    return a.title.localeCompare(b.title);
                case 'created':
                    return new Date(b.created || b.lastModified) - new Date(a.created || a.lastModified);
                case 'lastModified':
                default:
                    return new Date(b.lastModified) - new Date(a.lastModified);
            }
        });

        if (sortedSites.length === 0) {
            this.showEmptyState('No sites match the current filters.');
            return;
        }
        this.renderSites(sortedSites);
    }

    // Render sites grid
    renderSites(sites) {
        const loading = document.getElementById('sites-loading');
        const empty = document.getElementById('sites-empty');
        const grid = document.getElementById('sites-grid');

        if (loading) loading.style.display = 'none';
        if (empty) empty.style.display = 'none';
        if (grid) {
            grid.style.display = 'grid';
            grid.innerHTML = '';

            sites.forEach(site => {
                const siteCard = this.createSiteCard(site);
                grid.appendChild(siteCard);
            });
        }
        this.updateCatalogWarning(this.catalogWarnings);
    }

    // Create individual site card
    createSiteCard(site) {
        const card = document.createElement('article');
        card.className = 'site-card';
        card.dataset.siteId = site.projectId;

        const link = document.createElement('a');
        link.className = 'site-open-link';
        link.href = site.openUrl;
        link.dataset.action = 'open';
        link.setAttribute('aria-label', `Open ${site.title}`);

        const preview = document.createElement('div');
        preview.className = 'site-preview';
        const placeholder = this.createPlaceholderPreview(site);
        if (site.bannerExists && site.bannerUrl) {
            const image = document.createElement('img');
            image.src = site.bannerUrl;
            image.alt = '';
            image.className = 'site-preview-image';
            image.addEventListener('error', () => {
                image.hidden = true;
                placeholder.hidden = false;
            }, { once: true });
            preview.append(image);
            placeholder.hidden = true;
        }
        preview.append(placeholder);
        const overlay = document.createElement('div');
        overlay.className = 'site-preview-overlay';
        preview.append(overlay);
        if (this.isRecentlyUpdated(site.lastModified)) {
            const badge = document.createElement('div');
            badge.className = 'recently-updated-badge';
            badge.textContent = 'Recently Updated';
            preview.append(badge);
        }

        const info = document.createElement('div');
        info.className = 'site-info';
        const title = document.createElement('h3');
        title.className = 'site-title';
        title.textContent = site.title;
        const meta = document.createElement('p');
        meta.className = 'site-meta';
        meta.textContent = `Updated ${this.formatDate(site.lastModified)}`;
        info.append(title, meta);
        link.append(preview, info);

        const actions = document.createElement('div');
        actions.className = 'site-actions';
        actions.append(
            this.createActionButton('tags', 'Manage tags', 'fas fa-tags'),
            this.createActionButton('export', 'Export project', 'fas fa-download'),
            this.createActionButton('favorite', this.isFavorited(site.projectId) ? 'Remove from favorites' : 'Add to favorites',
                `${this.isFavorited(site.projectId) ? 'fas favorited' : 'far'} fa-star`)
        );
        card.append(link, actions);

        return card;
    }

    createActionButton(action, label, iconClass) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `site-action site-action-${action}`;
        button.dataset.action = action;
        button.title = label;
        button.setAttribute('aria-label', label);
        const icon = document.createElement('i');
        icon.className = iconClass;
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon);
        return button;
    }

    handleGridClick(event) {
        const target = event.target.closest('[data-action]');
        const card = target?.closest('.site-card');
        const site = card ? this.siteById.get(card.dataset.siteId) : null;
        if (!target || !site) return;
        if (target.dataset.action === 'open') {
            event.preventDefault();
            this.openSiteWithLoading(site);
        } else if (target.dataset.action === 'favorite') {
            this.toggleFavorite(site.projectId, event, target);
        } else if (target.dataset.action === 'tags') {
            this.openTagsModal(site.projectId, event);
        } else if (target.dataset.action === 'export') {
            this.exportProject(site.projectId, event, target);
        }
    }

    // NEW: Open site with loading animation
    async openSiteWithLoading(site) {
        const siteUrl = this.getSiteUrl(site);
        if (this.navigation) {
            return this.navigation.navigate(siteUrl, {
                message: `Loading ${site.title}...`,
                icon: 'fas fa-globe'
            });
        }
        window.location.assign(siteUrl);
    }

    // Original open site method (now called by openSiteWithLoading)
    openSite(site) {
        window.location.assign(this.getSiteUrl(site));
    }

    getSiteUrl(site) {
        return site.openUrl;
    }

    // Create placeholder preview
    createPlaceholderPreview(site) {
        const placeholder = document.createElement('div');
        placeholder.className = 'site-placeholder';
        const icon = document.createElement('i');
        icon.className = 'fas fa-globe';
        icon.setAttribute('aria-hidden', 'true');
        const title = document.createElement('div');
        title.className = 'site-placeholder-title';
        title.textContent = site.title;
        placeholder.append(icon, title);
        return placeholder;
    }

    // Get site banner URL
    getSiteBannerUrl(site) {
        return site.bannerUrl || '';
    }

    // Check if site was updated recently (within 7 days)
    isRecentlyUpdated(lastModified) {
        const now = new Date();
        const updated = new Date(lastModified);
        const diffTime = Math.abs(now - updated);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
    }

    // Format date for display
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            return 'Today';
        } else if (diffDays === 2) {
            return 'Yesterday';
        } else if (diffDays <= 7) {
            return `${diffDays - 1} days ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    async loadFavorites(preferences = null) {
        const userContext = this.getUserContext();
        if (userContext.isGuest) {
            this.favorites = new Set();
            return;
        }

        try {
            const current = preferences || (await this.preferencesClient.get()).preferences;
            this.favorites = new Set(current?.favorites || []);
        } catch (error) {
            console.error('Error loading favorites; preserving current state:', error);
        }
    }

    // Enhanced saveFavorites with detailed logging
    async saveFavorites() {        
        const userContext = this.getUserContext();        
        if (userContext.isGuest) {
            console.log('   - Guest user, skipping save');
            return;
        }        
        const favoritesToSave = Array.from(this.favorites);        
        try {
            await this.preferencesClient.patch('sites', { favorites: favoritesToSave });
            this.pendingIdentityMigration = false;
            return true;
        } catch (error) {
            console.error('🚨 Error saving favorites:', error);
            this.showToast('Could not update favorite', 'error');
            return false;
        }
    }

    // Toggle favorite status
    async toggleFavorite(projectId, event, button = null) {
        event.stopPropagation(); // Prevent site card click
        button?.setAttribute('aria-busy', 'true');
        if (button) button.disabled = true;

        const wasFavorited = this.favorites.has(projectId);
        if (wasFavorited) {
            this.favorites.delete(projectId);
        } else {
            this.favorites.add(projectId);
        }
        const saved = await this.saveFavorites();
        if (!saved) {
            wasFavorited ? this.favorites.add(projectId) : this.favorites.delete(projectId);
        }
        
        // If we just unfavorited the last site while viewing favorites, switch back to all sites
        if (this.showingFavoritesOnly && this.favorites.size === 0) {
            this.showingFavoritesOnly = false;
        }
        
        this.sortAndRenderSites();
        this.updateFavoriteButton();
    }

    // Check if site is favorited
    isFavorited(projectId) {
        return this.favorites.has(projectId);
    }

    // Toggle favorites filter
    toggleFavoritesFilter() {
        this.showingFavoritesOnly = !this.showingFavoritesOnly;
        this.updateFavoriteButton();
        this.sortAndRenderSites();
    }

    // Update favorites button appearance
    updateFavoriteButton() {
        const btn = document.getElementById('favorites-filter-btn');
        if (!btn) return;
        
        const span = btn.querySelector('span');
        const favCount = this.favorites.size;
        
        if (this.showingFavoritesOnly) {
            btn.classList.add('active');
            span.textContent = favCount > 0 ? `Favorites (${favCount})` : 'Favorites';
        } else {
            btn.classList.remove('active');
            span.textContent = favCount > 0 ? `Favorites (${favCount})` : 'Favorites';
        }
    }

    async loadTags(preferences = null) {
        const userContext = this.getUserContext();
        if (userContext.isGuest) {
            this.tags = {};
            return;
        }

        try {
            const current = preferences || (await this.preferencesClient.get()).preferences;
            this.tags = current?.tags || {};
        } catch (error) {
            console.error('Error loading tags; preserving current state:', error);
        }
    }

    // Save tags to user preferences API
    async saveTags() {
        const userContext = this.getUserContext();
        if (userContext.isGuest) return;
        
        try {
            await this.preferencesClient.patch('sites', { tags: this.tags });
            this.pendingIdentityMigration = false;
            return true;
        } catch (error) {
            console.error('Error saving tags:', error);
            this.showToast('Could not save tags', 'error');
            return false;
        }
    }

    // Get all unique tags across all projects
    getAllTags() {
        const allTags = new Set();
        Object.values(this.tags).forEach(projectTags => {
            projectTags.forEach(tag => allTags.add(tag));
        });
        return Array.from(allTags).sort();
    }

    // Get tags for a specific project
    getProjectTags(projectId) {
        return this.tags[projectId] || [];
    }

    // Generate consistent color for a tag
    // Generate consistent color for a tag
    getTagColor(tag) {
        // Simple hash function to generate consistent colors
        let hash = 0;
        for (let i = 0; i < tag.length; i++) {
            hash = tag.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Generate HSL color with higher lightness for dark backgrounds
        const hue = hash % 360;
        return `hsl(${hue}, 65%, 70%)`; // Increased lightness from 45% to 70%
    }

    // Open tags editing modal
    openTagsModal(projectId, event) {
        event.stopPropagation();
        
        const modal = document.getElementById('tags-modal');
        const title = document.getElementById('tags-modal-title');
        const input = document.getElementById('tags-input');
        
        const site = this.siteById.get(projectId);
        this.currentEditingProject = projectId;
        title.textContent = `Manage Tags - ${site?.title || 'Site'}`;
        
        // Populate current tags
        const currentTags = this.getProjectTags(projectId);
        input.value = currentTags.join(', ');
        
        // Populate existing tags chips
        this.populateExistingTagsChips();
        
        modal.style.display = 'flex';
    }

    // Populate existing tags chips in modal
    populateExistingTagsChips() {
        const container = document.getElementById('existing-tags-chips');
        const allTags = this.getAllTags();
        
        container.innerHTML = '';
        
        allTags.forEach(tag => {
            const chip = document.createElement('span');
            chip.className = 'existing-tag-chip';
            chip.style.color = this.getTagColor(tag);
            chip.textContent = tag;
            chip.addEventListener('click', () => this.addTagToInput(tag));
            container.appendChild(chip);
        });
        
        if (allTags.length === 0) {
            container.innerHTML = '<span class="no-tags">No existing tags</span>';
        }
    }

    // Add tag to input field
    addTagToInput(tag) {
        const input = document.getElementById('tags-input');
        const currentTags = input.value.split(',').map(t => t.trim()).filter(t => t);
        
        if (!currentTags.includes(tag)) {
            currentTags.push(tag);
            input.value = currentTags.join(', ');
        }
    }

    // Save tags from modal
    async saveTagsFromModal() {
        const input = document.getElementById('tags-input');
        const projectId = this.currentEditingProject;
        
        if (!projectId) return;
        
        // Parse tags from input
        const tagStrings = input.value.split(',').map(t => t.trim()).filter(t => t);
        
        // Update tags
        if (tagStrings.length > 0) {
            this.tags[projectId] = tagStrings;
        } else {
            delete this.tags[projectId];
        }
        
        if (!await this.saveTags()) return;
        this.closeTagsModal();
        this.updateTagsDisplay();
        this.sortAndRenderSites();
    }

    // Close tags modal
    closeTagsModal() {
        const modal = document.getElementById('tags-modal');
        modal.style.display = 'none';
        this.currentEditingProject = null;
    }

    // Update tags display in top controls
    updateTagsDisplay() {
        const container = document.getElementById('tags-chips');
        const expandBtn = document.getElementById('tags-expand-btn');
        const allTags = this.getAllTags();

        if (!container || !expandBtn) return;
        
        container.innerHTML = '';
        
        if (allTags.length === 0) {
            expandBtn.style.display = 'none';
            return;
        }
        
        // Show most common tags first (up to 5)
        const tagCounts = {};
        Object.values(this.tags).forEach(projectTags => {
            projectTags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        });
        
        const sortedTags = allTags.sort((a, b) => (tagCounts[b] || 0) - (tagCounts[a] || 0));
        const visibleTags = sortedTags.slice(0, 5);
        const hiddenTags = sortedTags.slice(5);
        
        // Create visible tag chips
        visibleTags.forEach(tag => {
            const chip = this.createTagChip(tag);
            container.appendChild(chip);
        });
        
        // Show expand button if there are hidden tags
        if (hiddenTags.length > 0) {
            expandBtn.style.display = 'block';
            expandBtn.addEventListener('click', () => this.toggleTagsDropdown(), { once: true });
        } else {
            expandBtn.style.display = 'none';
        }
    }

    // Create a clickable tag chip
    createTagChip(tag) {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.style.color = this.getTagColor(tag);
        chip.textContent = tag;
        
        if (this.selectedTags.has(tag)) {
            chip.classList.add('selected');
        }
        
        chip.addEventListener('click', () => this.toggleTagFilter(tag));
        
        return chip;
    }

    // Toggle tag filter
    toggleTagFilter(tag) {
        if (this.selectedTags.has(tag)) {
            this.selectedTags.delete(tag);
        } else {
            this.selectedTags.add(tag);
        }
        
        this.updateTagsDisplay();
        this.sortAndRenderSites();
    }

    // Toggle between ANY and ALL tag filtering
    toggleTagFilterMode() {
        this.tagFilterMode = this.tagFilterMode === 'any' ? 'all' : 'any';
        
        const label = document.getElementById('tags-label');
        if (this.tagFilterMode === 'all') {
            label.style.color = 'var(--accent-warning)'; // Different color for ALL mode
        } else {
            label.style.color = 'var(--text-secondary)'; // Normal color for ANY mode
        }
        
        this.sortAndRenderSites();
    }

    // Toggle tags expansion dropdown
    toggleTagsDropdown() {
        const dropdown = document.getElementById('tags-dropdown');
        const expandBtn = document.getElementById('tags-expand-btn');
        
        if (dropdown.style.display === 'none' || !dropdown.style.display) {
            // Show dropdown with all tags
            const allTags = this.getAllTags();
            // Only look for chips in the main container, not the dropdown
            const mainContainer = document.getElementById('tags-chips');
            const visibleTags = Array.from(mainContainer.querySelectorAll('.tag-chip')).map(chip => chip.textContent);
            const hiddenTags = allTags.filter(tag => !visibleTags.includes(tag));
            
            // Don't show dropdown if there are no hidden tags
            if (hiddenTags.length === 0) {
                return;
            }
            
            dropdown.innerHTML = '';
            hiddenTags.forEach(tag => {
                const chip = this.createTagChip(tag);
                dropdown.appendChild(chip);
            });
            
            // Position dropdown relative to the button using viewport coordinates
            const btnRect = expandBtn.getBoundingClientRect();
            
            dropdown.style.position = 'fixed';
            dropdown.style.top = (btnRect.bottom + 4) + 'px';
            dropdown.style.left = (btnRect.right - 200) + 'px';
            dropdown.style.zIndex = '1001';
            
            // Check if dropdown would go off the bottom of screen
            dropdown.style.display = 'block';
            dropdown.style.visibility = 'hidden';
            
            const dropdownRect = dropdown.getBoundingClientRect();
            if (dropdownRect.bottom > window.innerHeight) {
                dropdown.style.top = (btnRect.top - dropdownRect.height - 4) + 'px';
            }
            
            dropdown.style.visibility = 'visible';
            expandBtn.innerHTML = '<i class="fas fa-times"></i>';
            
            setTimeout(() => {
                document.addEventListener('click', this.closeTagsDropdownHandler.bind(this), { once: true });
            }, 10);
        } else {
            this.closeTagsDropdown();
        }
    }

    // Close tags dropdown
    closeTagsDropdown() {
        const dropdown = document.getElementById('tags-dropdown');
        const expandBtn = document.getElementById('tags-expand-btn');
        
        dropdown.style.display = 'none';
        expandBtn.innerHTML = '<i class="fas fa-ellipsis-h"></i>';
    }

    // Handler for closing dropdown when clicking outside
    closeTagsDropdownHandler(event) {
        const dropdown = document.getElementById('tags-dropdown');
        const expandBtn = document.getElementById('tags-expand-btn');
        
        if (!dropdown.contains(event.target) && event.target !== expandBtn) {
            this.closeTagsDropdown();
        }
    }

    // Export project method
    async exportProject(projectId, event, button = null) {
        event.stopPropagation(); // Prevent site card click
        const site = this.siteById.get(projectId);
        if (!site) return;
        const projectName = site.projectName;
        
        const userContext = this.getUserContext();
        if (!userContext) {
            this.showToast('Please log in to export projects', 'error');
            return;
        }

        const exportIcon = button?.querySelector('i');
        if (button) {
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
        }
        exportIcon?.classList.replace('fa-download', 'fa-spinner');
        exportIcon?.classList.add('fa-spin');

        try {
            const response = await fetch('/api/projects/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    projectName,
                    userContext 
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Export failed');
            }

            // Get the filename from response headers
            const contentDisposition = response.headers.get('content-disposition');
            let filename = `${projectName}_Export.zip`;
            if (contentDisposition) {
                const matches = /filename="([^"]+)"/.exec(contentDisposition);
                if (matches) filename = matches[1];
            }

            // Download the file
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            console.log('✅ Export completed:', filename);
            this.showToast(`Project exported: ${filename}`, 'success');

        } catch (error) {
            console.error('❌ Export error:', error);
            this.showToast(`Export failed: ${error.message}`, 'error');
        } finally {
            exportIcon?.classList.remove('fa-spinner', 'fa-spin');
            exportIcon?.classList.add('fa-download');
            if (button) {
                button.disabled = false;
                button.removeAttribute('aria-busy');
            }
        }
    }

    // Helper method to show toast notifications
    showToast(message, type = 'info') {
        // You can either implement this locally or use the global toast system
        if (window.mainManager && window.mainManager.showToast) {
            window.mainManager.showToast(message, type);
        } else {
            console.log(`Toast: ${message} (${type})`);
            // Fallback: create simple toast
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
            toast.textContent = message;
            (document.getElementById('toast-container') || document.body).appendChild(toast);
            setTimeout(() => document.body.removeChild(toast), 3000);
        }
    }

    // Refresh sites (called when tab becomes active)
    refresh(options = {}) {
        const sessionKey = this.getSessionKey();
        if (!sessionKey) {
            this.clear('no_signed_in_user');
            return Promise.resolve();
        }
        if (this.refreshPromise && this.refreshSessionKey === sessionKey && !options.force) {
            return this.refreshPromise;
        }
        this.refreshController?.abort();
        const controller = new AbortController();
        this.refreshController = controller;
        this.refreshSessionKey = sessionKey;
        this.refreshPromise = this.performRefresh(sessionKey, controller.signal)
            .catch(error => {
                if (error.name !== 'AbortError' && this.getSessionKey() === sessionKey) {
                    console.error('Error refreshing My Sites:', error);
                    this.showEmptyState('Error loading sites. Please try again.');
                }
            })
                .finally(() => {
                    if (this.refreshController === controller) {
                        this.refreshController = null;
                        this.refreshPromise = null;
                    }
                });
        return this.refreshPromise;
    }

    async performRefresh(sessionKey, signal) {
        this.isLoading = true;
        this.showLoadingState();
        try {
            const [preferenceResult, catalog] = await Promise.all([
                this.preferencesClient.get({ signal }),
                this.loadUserSites(signal)
            ]);
            if (signal.aborted || this.getSessionKey() !== sessionKey) return;

            this.sites = Array.isArray(catalog.sites) ? catalog.sites : [];
            this.catalogWarnings = Array.isArray(catalog.warnings) ? catalog.warnings : [];
            this.siteById = new Map(this.sites.map(site => [site.projectId, site]));
            this.applyPreferencesWithIdentityMigration(preferenceResult.preferences || {});
            this.updateFavoriteButton();
            this.updateTagsDisplay();
            if (this.sites.length === 0) {
                this.showEmptyState('No sites found. Create a project in Lore Codex to see it here!');
                this.updateCatalogWarning(this.catalogWarnings);
            } else {
                this.sortAndRenderSites();
            }
        } finally {
            if (this.getSessionKey() === sessionKey) this.isLoading = false;
        }
    }

    applyPreferencesWithIdentityMigration(preferences) {
        const oldFavorites = new Set(Array.isArray(preferences.favorites) ? preferences.favorites : []);
        const oldTags = preferences.tags && typeof preferences.tags === 'object' ? preferences.tags : {};
        const favorites = new Set();
        const tags = {};
        let migrated = false;

        this.sites.forEach(site => {
            const aliases = new Set([site.projectId, site.projectName, ...(site.legacyNames || [])]);
            const favoriteAlias = [...aliases].find(alias => oldFavorites.has(alias));
            if (favoriteAlias) {
                favorites.add(site.projectId);
                if (favoriteAlias !== site.projectId) migrated = true;
            }
            const tagAlias = [...aliases].find(alias => Array.isArray(oldTags[alias]));
            if (tagAlias) {
                tags[site.projectId] = oldTags[tagAlias];
                if (tagAlias !== site.projectId) migrated = true;
            }
        });

        oldFavorites.forEach(value => {
            if (!this.sites.some(site => (site.legacyNames || []).includes(value) || site.projectName === value)) favorites.add(value);
        });
        Object.entries(oldTags).forEach(([key, value]) => {
            if (!this.sites.some(site => (site.legacyNames || []).includes(key) || site.projectName === key) && Array.isArray(value)) {
                tags[key] = value;
            }
        });
        this.favorites = favorites;
        this.tags = tags;
        this.pendingIdentityMigration = migrated;
    }

    // Clear sites (called when user logs out)
    clear(reason = 'unknown') {
        console.log(`🗑️ MySitesManager.clear() called - Reason: ${reason}`);
        this.sites = [];
        this.siteById = new Map();
        this.catalogWarnings = [];
        this.refreshController?.abort();
        this.refreshController = null;
        this.refreshPromise = null;
        this.refreshSessionKey = null;
        this.favorites = new Set();
        this.tags = {};
        this.showingFavoritesOnly = false;
        this.selectedTags = new Set();
        
        this.updateFavoriteButton();
        this.updateTagsDisplay();
        this.showEmptyState('Please log in to view your sites.');        
    }

    // ADD this new method for manual recovery:
    async forceReload() {
        await this.refresh({ force: true });
    }

}

window.ToolkitModules = window.ToolkitModules || {};
window.ToolkitModules.MySitesManager = MySitesManager;
