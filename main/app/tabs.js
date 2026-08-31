(function installShellTabs(root) {
    'use strict';

    class ShellTabController {
        constructor(options = {}) {
            this.document = options.document || root.document;
            this.activeTab = null;
            this.callbacks = new Map();
            this.initialized = false;
            this.handleClick = this.handleClick.bind(this);
            this.handleKeydown = this.handleKeydown.bind(this);
        }

        register(tabName, callback) {
            if (typeof callback === 'function') this.callbacks.set(tabName, callback);
            return this;
        }

        initialize(initialTab = 'tools') {
            if (this.initialized) return;
            this.initialized = true;
            this.document.addEventListener('click', this.handleClick);
            this.document.addEventListener('keydown', this.handleKeydown);
            this.activate(initialTab, { force: true, reason: 'bootstrap' });
        }

        handleClick(event) {
            const target = event.target.closest('.main-tab[data-tab], [data-tab-target]');
            if (!target) return;
            const tabName = target.dataset.tab || target.dataset.tabTarget;
            if (!tabName) return;
            event.preventDefault();
            this.activate(tabName, { reason: 'user' });
        }

        handleKeydown(event) {
            const tab = event.target.closest?.('.main-tab[role="tab"]');
            if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const tabs = [...this.document.querySelectorAll('.main-tab[role="tab"]')].filter(item => !item.hidden);
            let index = tabs.indexOf(tab);
            if (event.key === 'Home') index = 0;
            else if (event.key === 'End') index = tabs.length - 1;
            else index = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            event.preventDefault();
            tabs[index].focus();
            this.activate(tabs[index].dataset.tab, { reason: 'keyboard' });
        }

        activate(tabName, options = {}) {
            const button = this.document.querySelector(`.main-tab[data-tab="${tabName}"]`);
            const content = this.document.getElementById(`${tabName}-content`);
            if (!button || !content) return false;
            if (this.activeTab === tabName && options.force !== true) return true;

            const previousTab = this.activeTab;
            this.activeTab = tabName;
            this.document.body.classList.toggle('cowriter-active', tabName === 'cowriter');
            this.document.body.classList.toggle('notebook-active', tabName === 'notebook');
            this.document.querySelectorAll('.main-tab[data-tab]').forEach(tab => {
                const selected = tab === button;
                tab.classList.toggle('active', selected);
                tab.setAttribute('aria-selected', String(selected));
                tab.tabIndex = selected ? 0 : -1;
            });
            this.document.querySelectorAll('.tab-content').forEach(panel => {
                panel.classList.toggle('active', panel === content);
            });

            const callback = this.callbacks.get(tabName);
            if (callback) {
                Promise.resolve(callback({ tabName, previousTab, reason: options.reason || 'api' }))
                    .catch(error => console.error(`Tab activation failed for ${tabName}:`, error));
            }
            this.document.dispatchEvent(new CustomEvent('shell:tab-changed', {
                detail: { tabName, previousTab, reason: options.reason || 'api' }
            }));
            return true;
        }
    }

    root.ToolkitModules = root.ToolkitModules || {};
    root.ToolkitModules.ShellTabController = ShellTabController;
})(typeof window !== 'undefined' ? window : null);
