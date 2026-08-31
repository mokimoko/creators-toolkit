export function createUserUiController(dependencies) {
    const initializeUserSession = dependencies.initializeUserSession;
    const initializeAuthUI = dependencies.initializeAuthUI;
    let userSessionManager = null;
    let infoConverterAuth = null;

function getCorrectAvatarPath(avatarPath) {
    if (!avatarPath) {
        return '../main/images/default-avatar.png';
    }
    
    // If it's a data URL (base64 image), use as-is
    if (avatarPath.startsWith('data:')) {
        return avatarPath;
    }
    
    // If it's an absolute URL, use as-is
    if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
        return avatarPath;
    }
    
    // If it's the default avatar from main app
    if (avatarPath === 'images/default-avatar.png') {
        return '../main/images/default-avatar.png';
    }
    
    // If it starts with main/, it's already a correct relative path
    if (avatarPath.startsWith('../main/') || avatarPath.startsWith('main/')) {
        return avatarPath;
    }
    
    // If it's just a filename or relative path, assume it's in main/images/
    if (!avatarPath.includes('/')) {
        return `../main/images/${avatarPath}`;
    }
    
    // For any other case, try to use it as-is first, fallback to default if it fails
    return avatarPath;
}

function updateUserAvatar() {
    const navUserAvatar = document.getElementById('nav-user-avatar');
    const avatarImg = document.getElementById('nav-avatar-img');
    
    if (!navUserAvatar || !avatarImg || !userSessionManager) return;
    
    const currentUser = userSessionManager.getCurrentUser();
    
    if (currentUser) {
        let avatarSrc = currentUser.avatar;
        
        // Convert main app path to info-converter relative path
        if (avatarSrc === 'images/default-avatar.png') {
            avatarSrc = '../images/default-avatar.png';
        }
        
        avatarImg.src = avatarSrc;
        avatarImg.alt = `${currentUser.username} Avatar`;
        navUserAvatar.classList.remove('is-hidden');
    } else {
        navUserAvatar.classList.add('is-hidden');
    }
}

async function initializeUserSystem() {
    try {
        console.log('Initializing user session system...');
        
        // Initialize session manager
        userSessionManager = initializeUserSession();

        window.userSessionManager = userSessionManager;
        
        // Initialize auth UI
        infoConverterAuth = initializeAuthUI(userSessionManager);
        
        // Add user info display to UI (this is for the import section login, not nav)
        addUserInfoDisplay();
        
        // Initialize user session
        const hasValidUser = await userSessionManager.initializeUser();
        
        // Update UI with user info
        userSessionManager.updateUserDisplay();
        updateUserAvatar();
        
        // Set up login button event
        setupUserInfoEvents();
        
        console.log('✅ User system initialized');
        
    } catch (error) {
        console.error('Error initializing user system:', error);
        // Continue with guest mode if something fails
        if (userSessionManager) {
            userSessionManager.setGuestMode();
            userSessionManager.updateUserDisplay();
            updateUserAvatar();
        }
    }
}

// Add user info display to the interface
function addUserInfoDisplay() {
    // Find the import section or a suitable location
    const importSection = document.getElementById('import-section');
    const navContent = document.querySelector('.nav-content');
    
    let targetElement = navContent || importSection;
    
    if (!targetElement) {
        console.warn('Could not find suitable location for user info display');
        return;
    }
    
    // Create user info display
    const userInfoHTML = `
        <div class="user-info-display" id="user-info-display">
            <img src="../main/images/default-avatar.png" alt="User Avatar" class="user-avatar" id="user-avatar">
            <span class="username" id="current-username">Guest</span>
            <button class="login-btn" id="login-btn">Login</button>
        </div>
    `;
    
    // Insert the user info display
    if (navContent) {
        // If we have a nav, add it there
        navContent.insertAdjacentHTML('beforeend', userInfoHTML);
    } else {
        // Otherwise, add it to the import section
        importSection.insertAdjacentHTML('afterbegin', userInfoHTML);
    }
}

// Set up event listeners for user info controls
function setupUserInfoEvents() {
    const loginBtn = document.getElementById('login-btn');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            if (userSessionManager && userSessionManager.isLoggedIn()) {
                // User is logged in, show logout confirmation
                infoConverterAuth.showLogoutConfirmation();
            } else {
                // User is guest, show login modal
                infoConverterAuth.showLoginModal();
            }
        });
    }
}


    return {
        getCorrectAvatarPath,
        initializeUserSystem,
        updateUserAvatar
    };
}
