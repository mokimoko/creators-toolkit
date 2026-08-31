// Calendar data stays available at bootstrap; the editor UI is loaded only when opened.
async function loadUserTimeSystems() {
    try {
        const userContext = window.userSessionManager
            ? window.userSessionManager.getUserContext()
            : { isGuest: true };
        const response = await fetch('/api/time-systems/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userContext })
        });

        if (response.ok) {
            const data = await response.json();
            window.userTimeSystems = data.timeSystems || [];
            userTimeSystems = window.userTimeSystems;
        } else {
            userTimeSystems = [];
        }
    } catch (error) {
        console.error('Error loading time systems:', error);
        userTimeSystems = [];
    }

    window.loreTimeSystemsLoaded = true;
    document.documentElement.dataset.loreTimeSystemsData = 'ready';
}

async function saveUserTimeSystems() {
    try {
        const userContext = window.userSessionManager
            ? window.userSessionManager.getUserContext()
            : { isGuest: true };
        const response = await fetch('/api/time-systems/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeSystems: userTimeSystems, userContext })
        });
        return response.ok;
    } catch (error) {
        console.error('Error saving time systems:', error);
        return false;
    }
}

window.loadUserTimeSystems = loadUserTimeSystems;
