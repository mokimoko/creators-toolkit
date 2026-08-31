// Auth JavaScript - File-Based Authentication System

const AUTH_STATES = new Set([
    'starting',
    'anonymous',
    'guest',
    'authenticated',
    'switching',
    'expired',
    'signed-out',
    'error'
]);

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isInitialized = false; 
        this.apiBase = window.location.origin; // Use current origin for API calls
        this.sessionKey = 'writingTools_session';
        this.sessionTokenKey = 'writingTools_sessionToken'; 
        this.toolkitSessionTokenKey = 'writingTools_toolkitSessionToken';
        this.legacyCoWriterSessionTokenKey = 'writingTools_coWriterSessionToken';
        this.migrationOfferedKey = 'writingTools_migrationOffered';
        this.legacyMigration = window.LegacyAuthMigrationAdapter
            ? new window.LegacyAuthMigrationAdapter({ apiBase: this.apiBase })
            : null;
        this.eventListenersAttached = false; // Prevent duplicate listeners
        this.authState = 'starting';
        this.lastAuthIdentity = null;
        this.sessionPolicy = Object.freeze({
            access: 'tab-lifetime',
            rememberedLogin: 'persistent-until-expiry-or-logout',
            guestPreference: 'persistent-with-a-new-server-session-per-launch',
            localIdentity: 'compatibility-only-not-authorization'
        });
        this.authReady = new Promise(resolve => {
            this.resolveAuthReady = resolve;
        });
        this.initializeAuth().catch(error => {
            console.error('Authentication initialization failed:', error);
            this.setAuthState('error', { error: error.message });
            this.showAuthModal();
        });
    }

    getAuthState() {
        return this.authState;
    }

    whenReady() {
        return this.authReady;
    }

    getSessionPolicy() {
        return this.sessionPolicy;
    }

    setAuthState(state, details = {}) {
        if (!AUTH_STATES.has(state)) {
            throw new Error(`Unknown authentication state: ${state}`);
        }

        const previousState = this.authState;
        const user = this.currentUser
            ? {
                id: this.currentUser.id || null,
                username: this.currentUser.username,
                isGuest: this.currentUser.isGuest === true
            }
            : null;
        const identity = user ? (user.isGuest ? 'guest' : user.id) : null;
        this.authState = state;

        const eventDetail = { state, previousState, user, ...details };
        document.dispatchEvent(new CustomEvent('auth:state', { detail: eventDetail }));

        if (identity !== this.lastAuthIdentity || details.forceChanged === true) {
            document.dispatchEvent(new CustomEvent('auth:changed', {
                detail: { ...eventDetail, previousIdentity: this.lastAuthIdentity, identity }
            }));
            this.lastAuthIdentity = identity;
        }

        if (state === 'signed-out') {
            document.dispatchEvent(new CustomEvent('auth:signed-out', { detail: eventDetail }));
        }

        if (!['starting', 'switching'].includes(state) && this.resolveAuthReady) {
            this.isInitialized = true;
            const resolve = this.resolveAuthReady;
            this.resolveAuthReady = null;
            resolve(eventDetail);
            document.dispatchEvent(new CustomEvent('auth:ready', { detail: eventDetail }));
        }
    }

    // Global loading utilities (can be used by other parts of the app)
    showGlobalLoading(message = 'Loading...', icon = null) {
        console.log(`🔄 Showing global loading: ${message}`);
        
        this.hideLoadingState(); // Hide auth loading if showing
        
        let loadingOverlay = document.getElementById('global-loading');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'global-loading';
            loadingOverlay.className = 'shell-loading-overlay';
            document.body.appendChild(loadingOverlay);
        }

        const panel = document.createElement('div');
        panel.className = 'shell-loading-panel';
        const indicator = document.createElement(icon ? 'i' : 'div');
        indicator.className = icon ? `${icon} shell-loading-icon` : 'shell-spinner';
        const messageElement = document.createElement('div');
        messageElement.className = 'shell-loading-message';
        messageElement.textContent = message;
        const helper = document.createElement('div');
        helper.className = 'shell-loading-helper';
        helper.textContent = 'Please wait…';
        panel.append(indicator, messageElement, helper);
        loadingOverlay.replaceChildren(panel);
        
        loadingOverlay.style.display = 'flex';
        setTimeout(() => {
            loadingOverlay.style.opacity = '1';
        }, 10);
        
        console.log('✅ Global loading overlay created and shown');
    }

    hideGlobalLoading() {
        console.log('🔄 Hiding global loading');
        const loadingOverlay = document.getElementById('global-loading');
        if (loadingOverlay) {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
                console.log('✅ Global loading hidden');
            }, 300);
        }
    }

    // Navigation loading specifically
    showNavigationLoading(toolName) {
        const messages = {
            'info-converter': 'Loading Lore Codex...',
            'roleplay-converter': 'Loading RP Archiver...',
            'extractor': 'Loading Lorebook Manager...',
            'character-manager': 'Loading Character Manager...',
            'default': 'Loading...'
        };
        
        const icons = {
            'info-converter': 'fas fa-file-alt',
            'roleplay-converter': 'fas fa-theater-masks',
            'extractor': 'fas fa-tools',
            'character-manager': 'fas fa-users',
        };
        
        const message = messages[toolName] || messages.default;
        const icon = icons[toolName];
        
        console.log(`🎭 Navigation loading for: ${toolName}`);
        this.showGlobalLoading(message, icon);
    }

    // Initialize authentication system
    async initializeAuth() {
        window.authManager = this;
        let expiredSessionDetected = false;
        
        const startTime = Date.now();
        const minLoadingTime = 500;
        
        this.showLoadingState();
        
        // CHECK FOR SESSION TOKEN FIRST
        const sessionToken = localStorage.getItem(this.sessionTokenKey);
        if (sessionToken) {
            console.log('Found session token, validating...');
            const sessionValid = await this.validateSession(sessionToken);
            
            if (sessionValid) {
                await this.ensureMinimumLoadingTime(startTime, minLoadingTime);
                this.setAuthState('authenticated', { reason: 'remembered-session-restored' });
                this.showMainContent();
                console.log('✅ Auto-logged in via session token');
                return;
            } else {
                // Session expired or invalid, clear it
                localStorage.removeItem(this.sessionTokenKey);
                expiredSessionDetected = true;
            }
        }
        
        // Rest of existing code...
        const localSession = this.loadLocalSession();
        if (!localSession) {
            console.log('No local session found');
            
            // ADD THIS BLOCK - Check for guest mode before showing login
            const wasGuestMode = localStorage.getItem('writingTools_guestMode');
            if (wasGuestMode === 'true') {
                console.log('Found guest mode flag - continuing as guest');
                const guestSessionReady = await this.startGuestSession();
                if (!guestSessionReady) {
                    await this.ensureMinimumLoadingTime(startTime, minLoadingTime);
                    this.setAuthState('error', { reason: 'guest-session-unavailable' });
                    this.showAuthModal();
                    this.setupEventListeners();
                    return;
                }
                await this.ensureMinimumLoadingTime(startTime, minLoadingTime);
                this.setGuestMode();
                this.showMainContent();
                return;
            }
            
            console.log('Showing login modal');
            await this.ensureMinimumLoadingTime(startTime, minLoadingTime);
            this.setAuthState(expiredSessionDetected ? 'expired' : 'anonymous');
            this.showAuthModal();
            this.setupEventListeners();
            if (!expiredSessionDetected) {
                this.checkForLocalStorageMigration().catch(error => {
                    console.warn('Legacy migration check failed:', error);
                });
            }
            return;
        }
        
        // A live Toolkit token, not the server process ID, decides whether the
        // same-tab session can be restored.
        console.log('Found existing session, attempting to validate...');

        const accessSessionValid = await this.validateCoWriterAccessSession(localSession);
        if (!accessSessionValid) {
            console.log('CoWriter access session expired - showing login');
            this.clearSession();
            await this.ensureMinimumLoadingTime(startTime, minLoadingTime);
            this.setAuthState('expired', { reason: 'toolkit-session-expired' });
            this.showAuthModal();
            this.setupEventListeners();
            return;
        }
        
        const userContext = {
            userId: localSession.userId,
            username: localSession.username,
            isGuest: false
        };
        
        try {
            const response = await fetch(`${this.apiBase}/api/user/profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userContext })
            });
            
            if (response.ok) {
                const userData = await response.json();
                this.currentUser = userData;
                await this.ensureMinimumLoadingTime(startTime, minLoadingTime);
                this.setAuthState('authenticated', { reason: 'tab-session-restored' });
                this.showMainContent();
                console.log('✅ Session restored successfully');
                return;
            }
        } catch (error) {
            console.warn('Session validation failed:', error);
        }
        
        // Session validation failed, show auth modal
        console.log('Session validation failed - showing login');
        this.clearSession();
        await this.ensureMinimumLoadingTime(startTime, minLoadingTime);
        this.setAuthState('expired', { reason: 'profile-validation-failed' });
        this.showAuthModal();
        this.setupEventListeners();
    }

    async validateSession(sessionToken) {
        try {
            const response = await fetch(`${this.apiBase}/api/auth/validate-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken })
            });
            
            if (response.ok) {
                const result = await response.json();
                
                if (result.valid) {
                    const toolkitSessionToken = result.toolkitSessionToken || result.coWriterSessionToken;
                    if (!toolkitSessionToken) return false;
                    this.setToolkitSessionToken(toolkitSessionToken);
                    if (result.sessionToken) {
                        localStorage.setItem(this.sessionTokenKey, result.sessionToken);
                    }

                    // Load full user profile
                    const userContext = {
                        userId: result.user.id,
                        username: result.user.username,
                        isGuest: false
                    };
                    
                    const profileResponse = await fetch(`${this.apiBase}/api/user/profile`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userContext })
                    });
                    
                    if (profileResponse.ok) {
                        this.currentUser = await profileResponse.json();
                        this.saveSession(result.user.id, result.user.username);
                        return true;
                    }
                }
            }
            
            return false;
        } catch (error) {
            console.error('Session validation error:', error);
            return false;
        }
    }

    // Ensure loading shows for minimum time for smooth UX
    async ensureMinimumLoadingTime(startTime, minTime) {
        const elapsed = Date.now() - startTime;
        if (elapsed < minTime) {
            await new Promise(resolve => setTimeout(resolve, minTime - elapsed));
        }
    }

    async checkForLocalStorageMigration() {
        if (!this.legacyMigration?.hasData()) return;

        // The adapter is the only code allowed to read, migrate, or clear legacy auth data.
        const migrationOffered = this.legacyMigration.getStatus();
        
        if (this.legacyMigration.hasData()) {
            // Only offer migration if we haven't already offered it
            if (!migrationOffered) {
                if (await window.ToolkitDialogs.confirm({
                    title: 'Migrate browser data?',
                    message: 'Move your legacy browser data into the Toolkit’s file-based storage?',
                    confirmLabel: 'Migrate data',
                    icon: 'fas fa-database'
                })) {
                    const success = await this.migrateLocalStorageData();
                    if (success) {
                        // Mark migration as completed successfully
                        this.legacyMigration.complete();
                        this.showToast('Migration completed and old data cleared', 'success');
                    } else {
                        this.showToast('Migration failed - old data preserved', 'warning');
                    }
                } else {
                    // User declined migration - mark as offered but don't clear data yet
                    this.legacyMigration.markDeclined();
                    this.showToast('Migration declined - your data will remain in browser storage', 'info');
                }
            } else if (migrationOffered === 'declined') {
                // Migration was previously declined, ask if they want to try again
                if (await window.ToolkitDialogs.confirm({
                    title: 'Migrate browser data?',
                    message: 'You previously declined. Move the remaining legacy browser data now?',
                    confirmLabel: 'Migrate data',
                    icon: 'fas fa-database'
                })) {
                    const success = await this.migrateLocalStorageData();
                    if (success) {
                        this.legacyMigration.complete();
                        this.showToast('Migration completed!', 'success');
                    }
                }
            }
            // If migrationOffered === 'completed', do nothing - data was already migrated
        }
    }

    // Migrate localStorage data to file-based system
    async migrateLocalStorageData() {
        try {
            if (!this.legacyMigration) return false;
            const result = await this.legacyMigration.migrate();
            this.showToast(`Successfully migrated ${result.migratedCount} users to file-based system!`, 'success');
            return true;
        } catch (error) {
            console.error('Migration error:', error);
            this.showToast('Migration error occurred', 'error');
            return false;
        }
    }

    // Load session from localStorage (temporary until fully migrated)
    loadLocalSession() {
        try {
            const session = localStorage.getItem(this.sessionKey);
            return session ? JSON.parse(session) : null;
        } catch (error) {
            return null;
        }
    }

    // Save session to localStorage (minimal data)
    saveSession(userId, username) {
        const sessionData = {
            userId: userId,
            username: username,
            timestamp: Date.now()
        };
        localStorage.setItem(this.sessionKey, JSON.stringify(sessionData));
    }

    getToolkitSessionToken() {
        try {
            const token = sessionStorage.getItem(this.toolkitSessionTokenKey)
                || sessionStorage.getItem(this.legacyCoWriterSessionTokenKey);
            if (token && !sessionStorage.getItem(this.toolkitSessionTokenKey)) {
                sessionStorage.setItem(this.toolkitSessionTokenKey, token);
                sessionStorage.removeItem(this.legacyCoWriterSessionTokenKey);
            }
            return token;
        } catch (error) {
            console.warn('Toolkit session storage is unavailable:', error);
            return null;
        }
    }

    setToolkitSessionToken(token) {
        try {
            if (token) {
                sessionStorage.setItem(this.toolkitSessionTokenKey, token);
            } else {
                sessionStorage.removeItem(this.toolkitSessionTokenKey);
            }
            sessionStorage.removeItem(this.legacyCoWriterSessionTokenKey);
        } catch (error) {
            console.warn('Could not update Toolkit session storage:', error);
        }
    }

    getCoWriterSessionToken() {
        return this.getToolkitSessionToken();
    }

    setCoWriterSessionToken(token) {
        this.setToolkitSessionToken(token);
    }

    async validateCoWriterAccessSession(localSession) {
        const token = this.getToolkitSessionToken();

        try {
            const response = await fetch(`${this.apiBase}/api/auth/toolkit-session/validate`, {
                method: 'POST',
                headers: token ? { 'X-Toolkit-Session': token } : {}
            });
            if (!response.ok) return false;

            const result = await response.json();
            const valid = result.valid === true
                && result.user?.isGuest !== true
                && result.user?.id === localSession.userId;
            if (valid) {
                this.setToolkitSessionToken(result.toolkitSessionToken || result.coWriterSessionToken || token);
            }
            return valid;
        } catch (error) {
            console.warn('Could not validate CoWriter access session:', error);
            return false;
        }
    }

    async startGuestSession() {
        try {
            const response = await fetch(`${this.apiBase}/api/auth/toolkit-session/guest`, {
                method: 'POST'
            });
            if (!response.ok) return false;

            const result = await response.json();
            const toolkitSessionToken = result.toolkitSessionToken || result.coWriterSessionToken;
            if (!toolkitSessionToken) return false;
            this.setToolkitSessionToken(toolkitSessionToken);
            return true;
        } catch (error) {
            console.error('Could not start guest session:', error);
            return false;
        }
    }

    handleSessionExpired() {
        if (['starting', 'anonymous', 'expired', 'signed-out'].includes(this.authState)) return;

        this.clearSession();
        this.setAuthState('expired', {
            reason: 'protected-request-rejected',
            forceChanged: true
        });
        this.showAuthModal();
        this.setupEventListeners();
    }

    // Clear session
    clearSession() {
        localStorage.removeItem(this.sessionKey);
        this.setToolkitSessionToken(null);
        this.currentUser = null;
    }

    // Clear session and server session (for manual logout)
    clearAllSessions() {
        localStorage.removeItem(this.sessionKey);
        localStorage.removeItem(this.sessionTokenKey); // ADD THIS
        localStorage.removeItem('writingTools_guestMode');
        this.setToolkitSessionToken(null);
        this.currentUser = null;
    }

    // FIXED: Setup event listeners with better error handling and debugging
    setupEventListeners() {
        // Prevent duplicate event listeners
        if (this.eventListenersAttached) {
            console.log('⚠️ Event listeners already attached, skipping');
            return;
        }

        console.log('🎯 Setting up auth event listeners...');

        // Tab switching - FIXED: Use currentTarget and add debugging
        const authTabs = document.querySelectorAll('.auth-tab');
        console.log(`📋 Found ${authTabs.length} auth tabs`);
        
        authTabs.forEach((tab, index) => {
            console.log(`🔗 Attaching click listener to tab ${index}: ${tab.dataset.tab}`);
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const tabName = e.currentTarget.dataset.tab; // Use currentTarget instead of target
                console.log(`🎯 Tab clicked: ${tabName}`);
                this.switchTab(tabName);
            });

            // Also add keyboard support
            tab.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const tabName = e.currentTarget.dataset.tab;
                    console.log(`⌨️ Tab activated via keyboard: ${tabName}`);
                    this.switchTab(tabName);
                }
            });
        });

        // Form submissions
        const loginForm = document.getElementById('login-form-element');
        const registerForm = document.getElementById('register-form-element');
        
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
            console.log('✅ Login form listener attached');
        } else {
            console.error('❌ Login form not found!');
        }

        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
            console.log('✅ Register form listener attached');
        } else {
            console.error('❌ Register form not found!');
        }

        // Guest mode link (add after register form listener)
        const guestLink = document.getElementById('continue-as-guest');
        if (guestLink) {
            guestLink.addEventListener('click', () => {
                this.handleGuestMode();
            });
        }
        
        // Guest mode link in login tab (NEW)
        const guestLinkLogin = document.getElementById('continue-as-guest-login');
        if (guestLinkLogin) {
            guestLinkLogin.addEventListener('click', () => {
                this.handleGuestMode();
            });
        }

        // Mark listeners as attached
        this.eventListenersAttached = true;
        console.log('✅ All auth event listeners attached successfully');

        // Make available globally
        window.authManager = this;
    }

    // Load and display user selection grid
    async loadUserSelectionGrid() {
        try {
            const response = await fetch(`${this.apiBase}/api/auth/users`);
            if (!response.ok) return;
            
            const data = await response.json();
            this.availableUsers = data.users || [];
            this.currentUserPage = 0;
            this.usersPerPage = 6;
            
            if (this.availableUsers.length > 0) {
                this.renderUserGrid();
            } else {
                // Hide grid if no users
                document.getElementById('user-selection-grid').style.display = 'none';
            }
        } catch (error) {
            console.error('Failed to load users:', error);
        }
    }

    // Render user grid with pagination
    renderUserGrid() {
        const grid = document.getElementById('user-grid');
        const pagination = document.getElementById('user-pagination');
        
        if (!grid) return;
        
        const start = this.currentUserPage * this.usersPerPage;
        const end = start + this.usersPerPage;
        const pageUsers = this.availableUsers.slice(start, end);
        
        grid.replaceChildren(...pageUsers.map(user => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'user-card';
            card.dataset.userId = user.id;
            card.dataset.username = user.username;
            card.setAttribute('aria-pressed', 'false');
            const avatar = document.createElement('img');
            avatar.src = user.avatar;
            avatar.alt = '';
            avatar.className = 'user-card-avatar';
            const name = document.createElement('span');
            name.className = 'user-card-name';
            name.textContent = user.username;
            card.append(avatar, name);
            card.addEventListener('click', () => this.selectUser(user.id, user.username));
            return card;
        }));
        
        // Show/hide pagination
        if (this.availableUsers.length > this.usersPerPage) {
            pagination.style.display = 'flex';
            this.setupUserPagination();
        } else {
            pagination.style.display = 'none';
        }
    }

    // Setup pagination buttons
    setupUserPagination() {
        const prevBtn = document.getElementById('prev-users');
        const nextBtn = document.getElementById('next-users');
        
        const totalPages = Math.ceil(this.availableUsers.length / this.usersPerPage);
        
        prevBtn.disabled = this.currentUserPage === 0;
        nextBtn.disabled = this.currentUserPage >= totalPages - 1;
        
        prevBtn.onclick = () => {
            if (this.currentUserPage > 0) {
                this.currentUserPage--;
                this.renderUserGrid();
            }
        };
        
        nextBtn.onclick = () => {
            if (this.currentUserPage < totalPages - 1) {
                this.currentUserPage++;
                this.renderUserGrid();
            }
        };
    }

    // Select a user from the grid
    async selectUser(userId, username) {
        // Highlight selected card
        document.querySelectorAll('.user-card').forEach(card => {
            card.classList.remove('selected');
            card.setAttribute('aria-pressed', 'false');
        });
        const selectedCard = [...document.querySelectorAll('.user-card')]
            .find(card => card.dataset.userId === String(userId));
        selectedCard?.classList.add('selected');
        selectedCard?.setAttribute('aria-pressed', 'true');
        
        // Get form elements
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const rememberMeCheckbox = document.getElementById('remember-me-checkbox');
        const loginAsBtn = document.getElementById('login-as-btn');
        const loginAsUsername = document.getElementById('login-as-username');
        
        if (!usernameInput || !passwordInput || !loginAsBtn || !loginAsUsername) {
            console.error('Login form elements not found');
            return;
        }
        
        // Fill username field
        usernameInput.value = username;
        
        // Check remember me checkbox
        if (rememberMeCheckbox) {
            rememberMeCheckbox.checked = true;
        }
        
        // Update username in button
        loginAsUsername.textContent = username;
        
        // Show the account-specific login button. Passwords are never returned
        // from the server; the user or browser password manager supplies it.
        loginAsBtn.style.display = 'flex';
        loginAsBtn.disabled = false;
        const icon = loginAsBtn.querySelector('i');
        if (icon) icon.className = 'fas fa-sign-in-alt';
        
        // Setup login-as button click
        loginAsBtn.onclick = () => {
            if (!passwordInput.value) {
                this.showFormError('login-password', 'Please enter your password');
                passwordInput.focus();
                return;
            }
            this.handleLogin();
        };
    }

    // Check if password was autofilled and show login-as button
    checkPasswordAutofill(username) {
        const passwordInput = document.getElementById('login-password');
        const loginAsBtn = document.getElementById('login-as-btn');
        const loginAsUsername = document.getElementById('login-as-username');
        
        if (passwordInput.value.length > 0) {
            // Password was autofilled!
            loginAsUsername.textContent = username;
            loginAsBtn.style.display = 'flex';
            
            // Setup login-as button click
            loginAsBtn.onclick = () => {
                this.handleLogin();
            };
        } else {
            // No autofill, hide the button
            loginAsBtn.style.display = 'none';
        }
    }

    // FIXED: Switch between login and register tabs with better debugging
    switchTab(tabName) {
        console.log(`🔄 Switching to tab: ${tabName}`);
        
        if (!tabName) {
            console.error('❌ No tab name provided to switchTab');
            return;
        }

        // Update tab buttons
        const allTabs = document.querySelectorAll('.auth-tab');
        const targetTab = document.querySelector(`[data-tab="${tabName}"]`);
        
        if (!targetTab) {
            console.error(`❌ Target tab not found: ${tabName}`);
            return;
        }

        console.log(`📋 Updating ${allTabs.length} tab buttons`);
        allTabs.forEach(tab => {
            tab.classList.remove('active');
        });
        targetTab.classList.add('active');

        // Update form visibility
        const allForms = document.querySelectorAll('.auth-form');
        const targetForm = document.getElementById(`${tabName}-form`);
        
        if (!targetForm) {
            console.error(`❌ Target form not found: ${tabName}-form`);
            return;
        }

        console.log(`📝 Updating ${allForms.length} form sections`);
        allForms.forEach(form => {
            form.classList.remove('active');
        });
        targetForm.classList.add('active');

        // Clear any previous errors
        this.clearFormErrors();
        
        console.log(`✅ Successfully switched to ${tabName} tab`);
    }

    // Handle login form submission
    async handleLogin() {
        const form = document.getElementById('login-form');
        const usernameOrEmail = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const rememberMe = document.getElementById('remember-me-checkbox').checked;

        // Clear previous errors
        this.clearFormErrors();

        // Validation
        if (!usernameOrEmail || !password) {
            this.showFormError('login-username', 'Please fill in all fields');
            return;
        }

        // Add loading state
        form.classList.add('loading');
        this.setAuthState('switching', { reason: 'login-requested' });

        try {
            const response = await fetch(`${this.apiBase}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usernameOrEmail, password, rememberMe })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Clear guest mode
                localStorage.removeItem('writingTools_guestMode');
                
                // Save session
                this.saveSession(result.user.id, result.user.username);
                this.setToolkitSessionToken(result.toolkitSessionToken || result.coWriterSessionToken);
                
                // Store session token if remember me was checked
                if (result.sessionToken) {
                    localStorage.setItem(this.sessionTokenKey, result.sessionToken);
                } else {
                    // If remember me was unchecked, make sure to clear any existing token
                    localStorage.removeItem(this.sessionTokenKey);
                }
                
                // Load full user profile
                const userContext = {
                    userId: result.user.id,
                    username: result.user.username,
                    isGuest: false
                };
                
                const profileResponse = await fetch(`${this.apiBase}/api/user/profile`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userContext })
                });
                
                if (profileResponse.ok) {
                    this.currentUser = await profileResponse.json();
                    this.setAuthState('authenticated', { reason: 'login' });
                    this.showMainContent();
                    this.showToast('Welcome back!', 'success');
                } else {
                    this.setAuthState('error', { reason: 'profile-load-failed' });
                }
            } else {
                this.setAuthState('anonymous', { reason: 'login-rejected' });
                this.showFormError('login-password', result.error || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.setAuthState('error', { reason: 'login-failed', error: error.message });
            this.showFormError('login-username', 'Login failed. Please try again.');
        } finally {
            form.classList.remove('loading');
        }
    }

    // Handle register form submission
    async handleRegister() {
        const form = document.getElementById('register-form');
        const username = document.getElementById('register-username').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm').value;

        // Clear previous errors
        this.clearFormErrors();

        // Validation
        if (!username || !password || !confirmPassword) {
            this.showFormError('register-username', 'Please fill in all required fields');
            return;
        }

        const policy = await (this.accountPolicyPromise || Promise.resolve({
            username: { minLength: 3, maxLength: 64 },
            password: { minLength: 6, maxLength: 256 }
        }));
        if (username.length < policy.username.minLength || username.length > policy.username.maxLength) {
            this.showFormError('register-username', `Username must be ${policy.username.minLength}-${policy.username.maxLength} characters`);
            return;
        }
        if (policy.username.pattern && !new RegExp(policy.username.pattern).test(username)) {
            this.showFormError('register-username', 'Username contains unsupported characters');
            return;
        }

        // Only validate email format if email is provided
        if (email && (email.length > (policy.email?.maxLength || 254) || !this.isValidEmail(email))) {
            this.showFormError('register-email', 'Please enter a valid email address');
            return;
        }

        if (password.length < policy.password.minLength || password.length > policy.password.maxLength) {
            this.showFormError('register-password', `Password must be ${policy.password.minLength}-${policy.password.maxLength} characters`);
            return;
        }

        if (password !== confirmPassword) {
            this.showFormError('register-confirm', 'Passwords do not match');
            return;
        }

        // Add loading state
        form.classList.add('loading');
        this.setAuthState('switching', { reason: 'registration-requested' });

        try {
            const response = await fetch(`${this.apiBase}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Registration successful - auto-login
                this.saveSession(result.user.id, result.user.username);
                this.setToolkitSessionToken(result.toolkitSessionToken || result.coWriterSessionToken);
                
                // Load full user profile
                const userContext = {
                    userId: result.user.id,
                    username: result.user.username,
                    isGuest: false
                };
                
                const profileResponse = await fetch(`${this.apiBase}/api/user/profile`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userContext })
                });
                
                if (profileResponse.ok) {
                    this.currentUser = await profileResponse.json();
                    this.setAuthState('authenticated', { reason: 'registration' });
                    this.showMainContent();
                    this.showToast('Account created successfully!', 'success');
                } else {
                    this.setAuthState('error', { reason: 'profile-load-failed' });
                }
            } else {
                this.setAuthState('anonymous', { reason: 'registration-rejected' });
                this.showFormError('register-username', result.error || 'Registration failed');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.setAuthState('error', { reason: 'registration-failed', error: error.message });
            this.showFormError('register-username', 'Registration failed. Please try again.');
        } finally {
            form.classList.remove('loading');
        }
    }

    // Handle guest mode selection (add after handleRegister method)
    async handleGuestMode() {
        this.setAuthState('switching', { reason: 'guest-requested' });
        const sessionReady = await this.startGuestSession();
        if (!sessionReady) {
            this.setAuthState('error', { reason: 'guest-session-unavailable' });
            this.showToast('Could not start a guest session', 'error');
            return;
        }
        this.setGuestMode();
        this.showMainContent();
        this.showToast('Continuing as guest', 'info');
    }

    // Helper functions
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // UI Management
    showLoadingState() {
        // Hide both auth modal and main content immediately (no transition)
        const authModal = document.getElementById('auth-modal');
        const mainContent = document.getElementById('main-content');
        const userInfo = document.getElementById('user-info');
        
        authModal.style.display = 'none';
        mainContent.style.display = 'none';
        userInfo.style.display = 'none';
        authModal.classList.remove('show');
        mainContent.classList.remove('show');
        userInfo.classList.remove('show');
        
        // Show or create loading overlay
        let loadingOverlay = document.getElementById('auth-loading');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'auth-loading';
            loadingOverlay.className = 'shell-loading-overlay';
            const panel = document.createElement('div');
            panel.className = 'shell-loading-panel';
            const spinner = document.createElement('div');
            spinner.className = 'shell-spinner';
            const label = document.createElement('div');
            label.className = 'shell-loading-helper';
            label.textContent = 'Loading…';
            panel.append(spinner, label);
            loadingOverlay.append(panel);
            document.body.appendChild(loadingOverlay);
            
            // Fade in the loading overlay
            setTimeout(() => {
                loadingOverlay.style.opacity = '1';
            }, 10);
        } else {
            loadingOverlay.style.display = 'flex';
            setTimeout(() => {
                loadingOverlay.style.opacity = '1';
            }, 10);
        }
    }

    hideLoadingState() {
        const loadingOverlay = document.getElementById('auth-loading');
        if (loadingOverlay) {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
            }, 300);
        }
    }

    // Set guest mode (add after clearAllSessions method)
    setGuestMode() {
        this.currentUser = {
            username: 'Guest',
            isGuest: true,
            avatar: '/images/default-avatar.png',
            avatarVersion: 0
        };
        
        // ADD THIS LINE - Store guest mode state
        localStorage.setItem('writingTools_guestMode', 'true');
        this.setAuthState('guest', { reason: 'guest-session-created' });
        
        console.log('👤 Guest mode activated');
    }

    // FIXED: Show auth modal with proper timing
    showAuthModal() {
        this.hideLoadingState();
        
        const authModal = document.getElementById('auth-modal');
        const mainContent = document.getElementById('main-content');
        const userInfo = document.getElementById('user-info');
        
        // Hide others immediately
        mainContent.style.display = 'none';
        userInfo.style.display = 'none';
        mainContent.classList.remove('show');
        userInfo.classList.remove('show');
        
        // Show auth modal with delay for smooth transition from loading
        setTimeout(() => {
            authModal.style.display = 'flex';
            setTimeout(() => {
                authModal.classList.add('show');

                // Load version info when modal is shown
                this.loadVersionInfo();
                
                // Load user selection grid (NEW)
                this.loadUserSelectionGrid();
                
                // FIXED: Ensure event listeners are set up AFTER modal is fully visible
                setTimeout(() => {
                    if (!this.eventListenersAttached) {
                        console.log('🔧 Setting up event listeners after modal show');
                        this.setupEventListeners();
                    }
                }, 100);
                
            }, 50);
        }, 200); // Wait for loading to fade out
    }

    showMainContent() {
        this.hideLoadingState();
        
        const authModal = document.getElementById('auth-modal');
        const mainContent = document.getElementById('main-content');
        const userInfo = document.getElementById('user-info');
        
        // Hide auth modal immediately
        authModal.style.display = 'none';
        authModal.classList.remove('show');
        
        // Show main content with delay for smooth transition from loading
        setTimeout(() => {
            mainContent.style.display = 'flex';
            userInfo.style.display = 'flex';
            
            setTimeout(() => {
                mainContent.classList.add('show');
                userInfo.classList.add('show');
            }, 50);
        }, 200); // Wait for loading to fade out
        
        this.updateUserDisplay();
        
    }

    // Update user display with avatar from file system
    updateUserDisplay() {
        const user = this.getCurrentUser();
        const userInfo = document.getElementById('user-info');
        const userDisplay = document.getElementById('user-display');
        const userAvatar = document.getElementById('user-avatar');

        if (user) {
            userInfo.style.display = 'flex';
            userDisplay.innerHTML = user.username;
            
            if (userAvatar) {
                userAvatar.src = user.avatar
                    ? `${user.avatar}${user.avatar.includes('?') ? '&' : '?'}v=${user.avatarVersion || 0}`
                    : 'images/default-avatar.png';
            }
        } else {
            userInfo.style.display = 'none';
            userDisplay.innerHTML = '';
            if (userAvatar) {
                userAvatar.src = 'images/default-avatar.png';
            }
        }
    }

    // Form error handling
    showFormError(fieldId, message) {
        const field = document.getElementById(fieldId);
        const formGroup = field.closest('.form-group');
        
        formGroup.classList.add('error');
        
        let errorElement = formGroup.querySelector('.error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            formGroup.appendChild(errorElement);
        }
        
        errorElement.textContent = message;
    }

    clearFormErrors() {
        document.querySelectorAll('.form-group').forEach(group => {
            group.classList.remove('error', 'success');
        });
        
        document.querySelectorAll('.error-message').forEach(error => {
            error.style.display = 'none';
        });
    }

    // Toast notifications
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (toast.parentNode) {
                    container.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    // Logout
    async logout(options = {}) {
        const toolkitSessionToken = this.getToolkitSessionToken();
        if (toolkitSessionToken && options.revoke !== false) {
            await fetch(`${this.apiBase}/api/auth/toolkit-session/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Toolkit-Session': toolkitSessionToken
                },
                body: JSON.stringify({ forgetRemembered: true })
            }).catch(error => console.warn('Could not revoke Toolkit session:', error));
        }

        this.clearAllSessions(); // Clear both user session and server session
        this.setAuthState('signed-out', { reason: options.reason || 'logout' });
        
        // Reset event listeners flag so they can be reattached
        this.eventListenersAttached = false;
        
        this.showAuthModal();
        this.showToast('Logged out successfully', 'info');
        
        // Clear forms
        document.getElementById('login-form-element').reset();
        document.getElementById('register-form-element').reset();
        this.clearFormErrors();
        
        // Reset to login tab
        this.switchTab('login');
    }

    // Update user profile (called from settings)
    async updateUser(userData) {
        if (!this.currentUser || this.currentUser.isGuest) {
            return { success: false, error: 'No user logged in' };
        }

        try {
            if (this.accountClient) return await this.accountClient.updateProfile(userData);
            const userContext = {
                userId: this.currentUser.id,
                username: this.currentUser.username,
                isGuest: false
            };

            const response = await fetch(`${this.apiBase}/api/user/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userContext, updates: userData })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                const rotatedToolkitSessionToken = result.toolkitSessionToken || result.coWriterSessionToken;
                if (rotatedToolkitSessionToken) {
                    this.setToolkitSessionToken(rotatedToolkitSessionToken);
                }
                if (result.rememberedSessionRevoked) {
                    localStorage.removeItem(this.sessionTokenKey);
                }

                // Update session if username changed
                if (userData.username) {
                    this.saveSession(result.user.id, result.user.username);
                }
                
                // Reload user profile to get updated data
                const profileResponse = await fetch(`${this.apiBase}/api/user/profile`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userContext: { 
                        userId: result.user.id, 
                        username: result.user.username,
                        isGuest: false 
                    }})
                });
                
                if (profileResponse.ok) {
                    this.currentUser = await profileResponse.json();
                    this.setAuthState('authenticated', {
                        reason: 'profile-updated',
                        forceChanged: true
                    });
                    this.updateUserDisplay();
                }

                return { success: true };
            } else {
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('Update user error:', error);
            return { success: false, error: 'Update failed' };
        }
    }

    applyAccountUpdate(result) {
        if (!result?.success || !result.user) return;
        const rotatedToolkitSessionToken = result.toolkitSessionToken || result.coWriterSessionToken;
        if (rotatedToolkitSessionToken) this.setToolkitSessionToken(rotatedToolkitSessionToken);
        if (result.rememberedSessionRevoked) localStorage.removeItem(this.sessionTokenKey);
        this.currentUser = { ...this.currentUser, ...result.user };
        this.saveSession(result.user.id, result.user.username);
        this.setAuthState('authenticated', { reason: 'profile-updated', forceChanged: true });
        this.updateUserDisplay();
    }

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }

    // Get user context for API calls
    getUserContext() {
        if (!this.currentUser) {
            return { isGuest: true };
        }
        
        if (this.currentUser.isGuest) {
            return { isGuest: true };
        }
        
        return {
            userId: this.currentUser.id,
            username: this.currentUser.username,
            isGuest: false
        };
    }

    // Save user preferences to server
    async saveUserPreferences(preferences) {
        if (!this.currentUser || !this.preferencesClient) return false;
        try {
            await this.preferencesClient.patchFields(preferences);
            return true;
        } catch (error) {
            console.error('Failed to save user preferences:', error);
            return false;
        }
    }

    // Load user preferences from server
    async loadUserPreferences() {
        if (!this.currentUser || !this.preferencesClient) return {};
        try {
            return (await this.preferencesClient.get()).preferences || {};
        } catch (error) {
            console.error('Failed to load user preferences:', error);
        }
        
        return {};
    }

    async patchUserPreferences(section, changes) {
        if (!this.currentUser || !this.preferencesClient) return false;
        await this.preferencesClient.patch(section, changes);
        return true;
    }

    // Add this new method to the AuthManager class (around line 100, after initializeAuth)
    async loadVersionInfo() {
        try {
            const response = await fetch(`${this.apiBase}/api/version`);
            if (response.ok) {
                const versionData = await response.json();
                const versionElement = document.getElementById('version-number');
                if (versionElement) {
                    versionElement.textContent = `${versionData.version}`;
                }
            }
        } catch (error) {
            console.warn('Could not load version info:', error);
            // Fallback to hardcoded version
            const versionElement = document.getElementById('version-number');
            if (versionElement) {
                versionElement.textContent = '4.0.0';
            }
        }
    }
}

window.ToolkitModules = window.ToolkitModules || {};
window.ToolkitModules.AuthManager = AuthManager;
