(function installUserMenu(root) {
    'use strict';

    class ShellUserMenu {
        constructor(options = {}) {
            this.document = options.document || root.document;
            this.navigation = options.navigation;
            this.dialogs = options.dialogs;
            this.initialized = false;
            this.handleClick = this.handleClick.bind(this);
            this.handleKeydown = this.handleKeydown.bind(this);
        }

        initialize() {
            if (this.initialized) return;
            this.initialized = true;
            this.document.addEventListener('click', this.handleClick);
            this.document.addEventListener('keydown', this.handleKeydown);
        }

        handleClick(event) {
            const avatar = event.target.closest('.user-menu-trigger');
            const contextMenu = this.document.getElementById('user-context-menu');
            const navDropdown = this.document.querySelector('.nav-dropdown');

            if (avatar && contextMenu) {
                event.stopPropagation();
                const rect = avatar.getBoundingClientRect();
                contextMenu.style.left = `${rect.left - 60}px`;
                contextMenu.style.top = `${rect.bottom + 5}px`;
                contextMenu.style.display = contextMenu.style.display === 'block' ? 'none' : 'block';
                avatar.setAttribute('aria-expanded', String(contextMenu.style.display === 'block'));
                if (contextMenu.style.display === 'block') contextMenu.querySelector('[role="menuitem"]')?.focus();
                return;
            }

            if (event.target.closest('#context-settings')) {
                if (contextMenu) contextMenu.style.display = 'none';
                this.document.querySelector('.user-menu-trigger')?.setAttribute('aria-expanded', 'false');
                this.dialogs?.openSettings();
                return;
            }

            if (event.target.closest('#context-about, #about-btn')) {
                if (contextMenu) contextMenu.style.display = 'none';
                this.document.querySelector('.user-menu-trigger')?.setAttribute('aria-expanded', 'false');
                this.dialogs?.openAbout();
                return;
            }

            const dropdownButton = event.target.closest('.nav-dropdown-btn');
            if (dropdownButton && navDropdown) {
                event.preventDefault();
                event.stopPropagation();
                navDropdown.classList.toggle('open');
                dropdownButton.setAttribute('aria-expanded', String(navDropdown.classList.contains('open')));
                return;
            }

            const dropdownItem = event.target.closest('.nav-dropdown-item');
            if (dropdownItem) {
                event.preventDefault();
                navDropdown?.classList.remove('open');
                this.document.querySelector('.nav-dropdown-btn')?.setAttribute('aria-expanded', 'false');
                const label = dropdownItem.querySelector('span')?.textContent?.trim();
                this.navigation?.navigate(dropdownItem.getAttribute('href'), { label });
                return;
            }

            if (contextMenu && !contextMenu.contains(event.target)) {
                contextMenu.style.display = 'none';
                this.document.querySelector('.user-menu-trigger')?.setAttribute('aria-expanded', 'false');
            }
            if (navDropdown && !navDropdown.contains(event.target)) {
                navDropdown.classList.remove('open');
                this.document.querySelector('.nav-dropdown-btn')?.setAttribute('aria-expanded', 'false');
            }
        }

        handleKeydown(event) {
            if (event.key !== 'Escape') return;
            const contextMenu = this.document.getElementById('user-context-menu');
            const contextWasOpen = contextMenu?.style.display === 'block';
            const dropdownWasOpen = this.document.querySelector('.nav-dropdown')?.classList.contains('open');
            if (contextMenu) contextMenu.style.display = 'none';
            this.document.querySelector('.nav-dropdown')?.classList.remove('open');
            this.document.querySelector('.user-menu-trigger')?.setAttribute('aria-expanded', 'false');
            this.document.querySelector('.nav-dropdown-btn')?.setAttribute('aria-expanded', 'false');
            if (contextWasOpen) this.document.querySelector('.user-menu-trigger')?.focus();
            else if (dropdownWasOpen) this.document.querySelector('.nav-dropdown-btn')?.focus();
        }
    }

    root.ToolkitModules = root.ToolkitModules || {};
    root.ToolkitModules.ShellUserMenu = ShellUserMenu;
})(typeof window !== 'undefined' ? window : null);
