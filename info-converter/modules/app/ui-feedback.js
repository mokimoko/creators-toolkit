export function showToast(type, message, duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            if (container.contains(toast)) container.removeChild(toast);
        }, 300);
    }, duration);
}

export function showStatus(type, message) {
    const status = document.getElementById('save-status');
    if (!status) return;

    status.className = `save-status ${type}`;
    status.setAttribute('role', type === 'error' ? 'alert' : 'status');
    status.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    status.setAttribute('aria-atomic', 'true');
    status.textContent = message;

    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            status.textContent = '';
            status.className = 'save-status';
        }, 3000);
    }
}

// Classic feature scripts still consume these names through the compatibility facade.
window.showToast = showToast;
window.showStatus = showStatus;
