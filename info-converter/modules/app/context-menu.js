export function initializeLoreContextMenu() {
    const avatar = document.getElementById('nav-avatar-img');
    const menu = document.getElementById('lore-context-menu');
    const logoutOption = document.getElementById('lore-logout-option');
    if (!avatar || !menu) return;

    avatar.addEventListener('click', event => {
        event.stopPropagation();
        const rect = avatar.getBoundingClientRect();
        menu.style.left = `${rect.left - 60}px`;
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.display = 'block';
    });

    logoutOption?.addEventListener('click', () => {
        menu.style.display = 'none';
        localStorage.removeItem('writingTools_session');
        localStorage.removeItem('writingTools_guestMode');
        window.location.href = '../index.html';
    });

    document.addEventListener('click', event => {
        if (!menu.contains(event.target) && event.target !== avatar) menu.style.display = 'none';
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') menu.style.display = 'none';
    });
}

function placeMenu(menu, event) {
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    menu.style.display = 'block';
}

function initializeColorPickerMenu({ isValidHexColor, showToast }) {
    const menu = document.getElementById('color-picker-context-menu');
    const input = document.getElementById('color-hex-input');
    const applyButton = document.getElementById('apply-hex-color');
    if (!menu || !input || !applyButton) return;

    let currentPicker = null;
    const pickerClicks = new Map();

    document.addEventListener('contextmenu', event => {
        if (event.target.type !== 'color') return;
        event.preventDefault();
        currentPicker = event.target;
        input.value = event.target.value;
        placeMenu(menu, event);
        setTimeout(() => input.focus(), 10);
    });

    applyButton.addEventListener('click', () => {
        const value = input.value.trim();
        if (currentPicker && value && isValidHexColor(value)) {
            currentPicker.value = value;
            currentPicker.dispatchEvent(new Event('input'));
            currentPicker.dispatchEvent(new Event('change'));
        }
        menu.style.display = 'none';
    });

    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') applyButton.click();
    });

    document.addEventListener('click', event => {
        if (!menu.contains(event.target)) menu.style.display = 'none';
    });

    document.addEventListener('mousedown', event => {
        if (event.target.type !== 'color') return;
        const now = Date.now();
        const lastClick = pickerClicks.get(event.target) || 0;
        if (now - lastClick >= 400) {
            pickerClicks.set(event.target, now);
            return;
        }

        event.target.style.pointerEvents = 'none';
        event.preventDefault();
        event.stopPropagation();
        const value = event.target.value;
        event.target.classList.add('copied');
        setTimeout(() => event.target.classList.remove('copied'), 300);

        void (async () => {
            try {
                await navigator.clipboard.writeText(value);
            } catch (error) {
                const textArea = document.createElement('textarea');
                textArea.value = value;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            showToast('success', `Copied ${value} to clipboard`, 2000);
        })();

        setTimeout(() => {
            event.target.style.pointerEvents = '';
        }, 200);
        pickerClicks.delete(event.target);
    });
}

export function initializeEditorContextMenus(callbacks) {
    const generateTab = document.querySelector('[data-tab="generate"]');
    const generateMenu = document.getElementById('generate-context-menu');
    const projectList = document.getElementById('nav-project-list');
    const projectMenu = document.getElementById('nav-project-context-menu');

    if (generateTab && generateMenu) {
        generateTab.addEventListener('contextmenu', event => {
            event.preventDefault();
            callbacks.updateQuickOpenState();
            placeMenu(generateMenu, event);
        });
        document.getElementById('quick-gen-option')?.addEventListener('click', callbacks.quickGenerate);
        document.getElementById('quick-open-option')?.addEventListener('click', callbacks.quickOpenProject);
    }

    if (projectList && projectMenu) {
        projectList.addEventListener('contextmenu', event => {
            event.preventDefault();
            placeMenu(projectMenu, event);
        });
        document.getElementById('quick-load-option')?.addEventListener('click', callbacks.quickLoadLastProject);
        document.getElementById('rename-project-option')?.addEventListener('click', callbacks.showRenameProjectModal);
    }

    document.addEventListener('click', event => {
        if (generateMenu && !generateMenu.contains(event.target)) generateMenu.style.display = 'none';
        if (projectMenu && !projectMenu.contains(event.target)) projectMenu.style.display = 'none';
    });

    document.addEventListener('contextmenu', event => {
        if (generateMenu && generateTab && !generateTab.contains(event.target)) generateMenu.style.display = 'none';
        if (projectMenu && projectList && !projectList.contains(event.target)) projectMenu.style.display = 'none';
    });

    initializeColorPickerMenu(callbacks);
}
