// User Session Management for RP Archiver - File-Based Avatar System
// Simple version that matches info-converter exactly

class UserSessionManager {
    constructor() {
        this.currentUser = null;
        this.isGuest = false;
        this.sessionKey = 'writingTools_session';
        this.apiBase = window.location.origin;
    }

    // Initialize user session on app load
    async initializeUser() {
        window.RPLogger?.debug('Initializing user session');
        
        try {
            const session = this.loadFromLocalStorage();
            if (session) {
                window.RPLogger?.debug('Found saved session data');
                const isValid = await this.validateSession(session);
                if (isValid) {
                    window.RPLogger?.debug('Valid user session loaded');
                    return true;
                }
            }
        } catch (error) {
            window.RPLogger?.error('Error initializing user session:', error);
        }
        
        // If no valid session, start as guest
        window.RPLogger?.debug('No valid session; starting as guest');
        await this.startGuestSession();
        this.setGuestMode();
        return false;
    }

    async startGuestSession() {
        try {
            const response = await fetch(`${this.apiBase}/api/auth/toolkit-session/guest`, {
                method: 'POST'
            });
            if (!response.ok) return false;
            const result = await response.json();
            const token = result.toolkitSessionToken || result.coWriterSessionToken;
            if (token) sessionStorage.setItem('writingTools_toolkitSessionToken', token);
            return Boolean(token);
        } catch (error) {
            window.RPLogger?.warn('Could not create guest Toolkit session', error);
            return false;
        }
    }

    // Load session data from localStorage
    loadFromLocalStorage() {
        try {
            const sessionData = localStorage.getItem(this.sessionKey);
            if (!sessionData) return null;

            const session = JSON.parse(sessionData);
            
            // Check if session has required fields
            if (!session.userId || !session.timestamp) {
                window.RPLogger?.warn('Invalid session data structure');
                return null;
            }

            return session;
        } catch (error) {
            window.RPLogger?.error('Error loading session from localStorage:', error);
            return null;
        }
    }

    // Validate session with file-based user system
    async validateSession(session) {
        try {
            // Try to load user profile from server first
            const serverUserContext = {
                userId: session.userId,
                username: session.username,
                isGuest: false
            };

            try {
                const response = await fetch(`${this.apiBase}/api/user/profile`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userContext: serverUserContext })
                });

                if (response.ok) {
                    const userData = await response.json();
                    this.currentUser = {
                        userId: userData.id,
                        username: userData.username,
                        email: userData.email,
                        avatar: userData.avatar, // This is now the server avatar URL
                        isGuest: false
                    };
                    this.isGuest = false;
                    window.RPLogger?.debug('Session validated with file-based system');
                    return true;
                }
            } catch (serverError) {
                window.RPLogger?.warn('Server session validation failed:', serverError);
            }

            return false;

        } catch (error) {
            window.RPLogger?.error('Error validating session:', error);
            return false;
        }
    }

    // Set guest mode
    setGuestMode() {
        this.isGuest = true;
        const guestContext = { isGuest: true };
        this.currentUser = {
            username: 'Guest',
            avatar: `/api/user/avatar?userContext=${encodeURIComponent(JSON.stringify(guestContext))}`,
            isGuest: true
        };
        
        // ADD THIS LINE - Store guest mode state for main app
        localStorage.setItem('writingTools_guestMode', 'true');
        
        window.RPLogger?.debug('Guest mode activated');
    }

    // Get user context for API calls
    getUserContext() {
        if (this.isGuest) {
            return { isGuest: true };
        }

        return {
            userId: this.currentUser.userId,
            username: this.currentUser.username,
            isGuest: false
        };
    }

    // Get current user info for display
    getCurrentUser() {
        return this.currentUser;
    }

    // Check if user is logged in (not guest)
    isLoggedIn() {
        return !this.isGuest && this.currentUser && this.currentUser.userId;
    }

    // Update user display in UI
    updateUserDisplay() {
        // Update navigation avatar
        this.updateNavigationAvatar();
        
        window.RPLogger?.debug(`Active user: ${this.isGuest ? 'Guest' : this.currentUser.username}`);
    }

    // Update navigation avatar display
    // Update navigation avatar display
    updateNavigationAvatar() {
        const navUserAvatar = document.getElementById('nav-user-avatar');
        const avatarImg = document.getElementById('nav-avatar-img');
        
        if (!navUserAvatar || !avatarImg) {
            window.RPLogger?.warn('Navigation avatar elements not found');
            return;
        }
        
        if (this.currentUser) {
            // Use the avatar URL from the server
            avatarImg.src = this.currentUser.avatar;
            avatarImg.alt = `${this.currentUser.username} Avatar`;
            
            // ADD: Set username for tooltip
            const displayName = this.isGuest ? 'Guest' : this.currentUser.username;
            navUserAvatar.setAttribute('data-username', displayName);
            
            // Show the avatar container
            navUserAvatar.style.display = 'flex';
            
            // Handle avatar load errors
            avatarImg.onerror = () => {
                window.RPLogger?.warn('Avatar failed to load; using default');
                avatarImg.src = '/images/default-avatar.png';
            };
            
            window.RPLogger?.debug(`Updated avatar display for: ${displayName}`);
        } else {
            navUserAvatar.style.display = 'none';
            navUserAvatar.removeAttribute('data-username');
        }
    }

    // Login with credentials
    async login(usernameOrEmail, password) {
        try {
            window.RPLogger?.debug('Attempting login');

            // Try file-based login first
            try {
                const response = await fetch(`${this.apiBase}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ usernameOrEmail, password })
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        if (result.toolkitSessionToken || result.coWriterSessionToken) {
                            sessionStorage.setItem(
                                'writingTools_toolkitSessionToken',
                                result.toolkitSessionToken || result.coWriterSessionToken
                            );
                        }
                        // Save session
                        this.saveSession(result.user.id, result.user.username);
                        
                        // Load full profile
                        const profileUserContext = {
                            userId: result.user.id,
                            username: result.user.username,
                            isGuest: false
                        };
                        
                        const profileResponse = await fetch(`${this.apiBase}/api/user/profile`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userContext: profileUserContext })
                        });
                        if (!profileResponse.ok) throw new Error(`Profile request failed (${profileResponse.status})`);
                        const userData = await profileResponse.json();
                            this.currentUser = {
                                userId: userData.id,
                                username: userData.username,
                                email: userData.email,
                                avatar: userData.avatar,
                                isGuest: false
                            };
                            this.isGuest = false;
                            this.updateUserDisplay();

                            window.RPLogger?.debug('File-based login succeeded');
                            return { success: true, user: this.currentUser };
                    }
                } else {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.error || 'Server login failed');
                }
            } catch (serverError) {
                throw new Error(serverError.message || 'The local account service is unavailable');
            }

        } catch (error) {
            window.RPLogger?.error('Login error:', error);
            return { success: false, error: error.message };
        }
    }

    // Register new account
    async register(username, email, password) {
        try {
            window.RPLogger?.debug('Attempting registration');

            // Try file-based registration first
            try {
                const response = await fetch(`${this.apiBase}/api/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        if (result.toolkitSessionToken || result.coWriterSessionToken) {
                            sessionStorage.setItem(
                                'writingTools_toolkitSessionToken',
                                result.toolkitSessionToken || result.coWriterSessionToken
                            );
                        }
                        // Auto-login after registration
                        this.saveSession(result.user.id, result.user.username);
                        
                        // Load full profile
                        const regProfileUserContext = {
                            userId: result.user.id,
                            username: result.user.username,
                            isGuest: false
                        };
                        
                        const profileResponse = await fetch(`${this.apiBase}/api/user/profile`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userContext: regProfileUserContext })
                        });
                        if (!profileResponse.ok) throw new Error(`Profile request failed (${profileResponse.status})`);
                        const userData = await profileResponse.json();
                            this.currentUser = {
                                userId: userData.id,
                                username: userData.username,
                                email: userData.email,
                                avatar: userData.avatar,
                                isGuest: false
                            };
                            this.isGuest = false;
                            this.updateUserDisplay();

                            window.RPLogger?.debug('File-based registration succeeded');
                            return { success: true, user: this.currentUser };
                    }
                } else {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.error || 'Server registration failed');
                }
            } catch (serverError) {
                throw new Error(serverError.message || 'The local account service is unavailable');
            }

        } catch (error) {
            window.RPLogger?.error('Registration error:', error);
            return { success: false, error: error.message };
        }
    }

    // Save session to localStorage
    saveSession(userId, username) {
        const sessionData = {
            userId: userId,
            username: username,
            timestamp: Date.now()
        };
        localStorage.setItem(this.sessionKey, JSON.stringify(sessionData));
        window.RPLogger?.debug('User session saved');
    }

    // Logout current user
    logout() {
        window.RPLogger?.debug('Logging out user');
        
        // Clear session
        localStorage.removeItem(this.sessionKey);
        localStorage.removeItem('writingTools_guestMode'); // ADD THIS LINE
        
        // Reset to guest mode
        this.setGuestMode();
        this.updateUserDisplay();
        
        window.RPLogger?.debug('User logged out; guest mode active');
    }

    // Generate unique user ID
    generateUserId() {
        return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Utility: Show toast notification (placeholder)
    showToast(message, type = 'info') {
        window.RPLogger?.debug(`[${type.toUpperCase()}] ${message}`);
    }

    // Debug: Get session info
    getSessionInfo() {
        return {
            currentUser: this.currentUser,
            isGuest: this.isGuest,
            isLoggedIn: this.isLoggedIn(),
            sessionInStorage: !!localStorage.getItem(this.sessionKey),
            usingFileBasedAvatars: true
        };
    }
}

// Initialize user session management
function initializeUserSession() {
    if (!window.userSessionManager) {
        window.userSessionManager = new UserSessionManager();
    }
    return window.userSessionManager;
}

// Export for use in other files
window.UserSessionManager = UserSessionManager;
window.initializeUserSession = initializeUserSession;
