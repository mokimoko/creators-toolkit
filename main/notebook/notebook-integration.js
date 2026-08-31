// Selection actions shared by Notebook and CoWriter.

class NotebookIntegrationController {
    constructor(notebookManager) {
        this.notebookManager = notebookManager;
        this.listenersAttached = false;
        this.contextMenuHandler = this.handleContextMenu.bind(this);
        this.clickOutsideHandler = this.handleClickOutside.bind(this);
    }

    activate() {
        if (this.listenersAttached) return;

        document.addEventListener('contextmenu', this.contextMenuHandler);
        document.addEventListener('click', this.clickOutsideHandler);
        this.listenersAttached = true;
    }

    deactivate() {
        if (this.listenersAttached) {
            document.removeEventListener('contextmenu', this.contextMenuHandler);
            document.removeEventListener('click', this.clickOutsideHandler);
            this.listenersAttached = false;
        }
        this.hideMenu();
    }

    handleContextMenu(event) {
        const isCoWriterText = event.target.closest('#chat-messages .message-text')
            || event.target.closest('.cowriter-content .message-text')
            || event.target.closest('#cowriter-content .message-text');
        const isNotebookText = event.target.closest('#markdown-editor')
            || event.target.closest('#notebook-textarea')
            || event.target.closest('.editor-content');

        if (!isCoWriterText && !isNotebookText) return;

        const selectedText = window.getSelection().toString();
        if (selectedText.trim().length <= 5) return;

        event.preventDefault();
        this.showMenu(event, selectedText, isCoWriterText ? 'cowriter' : 'notebook');
    }

    handleClickOutside(event) {
        const menu = document.getElementById('notebook-context-menu');
        if (menu && !menu.contains(event.target)) this.hideMenu();
    }

    showMenu(event, selectedText, context = 'notebook') {
        this.hideMenu();

        const menu = document.createElement('div');
        menu.id = 'notebook-context-menu';
        menu.className = 'context-menu notebook-context-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute(
            'aria-label',
            context === 'cowriter' ? 'CoWriter selection actions' : 'Notebook selection actions'
        );
        const menuItems = [];
        if (context === 'cowriter') {
            menuItems.push('<div class="context-menu-item primary" data-action="create-snippet" role="menuitem" tabindex="-1"><i class="fas fa-magic"></i> Create Snippet</div>');
        }
        if (context === 'notebook') {
            menuItems.push('<div class="context-menu-item" data-action="send-to-cowriter" role="menuitem" tabindex="-1"><i class="fas fa-paper-plane"></i> Send to CoWriter</div>');
        }
        menuItems.push('<div class="context-menu-item" data-action="copy" role="menuitem" tabindex="-1"><i class="fas fa-copy"></i> Copy</div>');
        menu.innerHTML = menuItems.join('');

        menu.style.left = `${Math.min(event.pageX, window.innerWidth - 200)}px`;
        menu.style.top = `${Math.min(event.pageY, window.innerHeight - 100)}px`;
        document.body.appendChild(menu);

        this.enableKeyboardNavigation(menu);
        this.bindActions(menu, selectedText);
        setTimeout(() => menu.remove(), 30000);
    }

    enableKeyboardNavigation(menu) {
        const items = [...menu.querySelectorAll('[role="menuitem"]')];
        menu.addEventListener('keydown', event => {
            const currentIndex = Math.max(0, items.indexOf(document.activeElement));
            let nextIndex = currentIndex;

            if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
            else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = items.length - 1;
            else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                document.activeElement?.click();
                return;
            } else if (event.key === 'Escape') {
                event.preventDefault();
                this.hideMenu();
                return;
            } else {
                return;
            }

            event.preventDefault();
            items[nextIndex]?.focus();
        });
        items[0]?.focus();
    }

    bindActions(menu, selectedText) {
        menu.querySelector('[data-action="create-snippet"]')?.addEventListener('click', () => {
            const source = window.coWriterManager?.getNotebookSnippetSource?.() || {
                sourceType: 'cowriter',
                chatSessionId: null
            };
            this.notebookManager.openSnippetModal(selectedText, source);
            this.hideMenu();
        });

        menu.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(selectedText);
                this.notebookManager.showToast('Text copied to clipboard', 'info');
            } catch (error) {
                console.error('Unable to copy Notebook selection:', error);
                this.notebookManager.showToast('Unable to copy text', 'error');
            }
            this.hideMenu();
        });

        menu.querySelector('[data-action="send-to-cowriter"]')?.addEventListener('click', () => {
            this.sendToCoWriter(selectedText);
            this.hideMenu();
        });
    }

    hideMenu() {
        document.getElementById('notebook-context-menu')?.remove();
    }

    sendToCoWriter(text) {
        window.mainManager?.switchTab('cowriter');

        setTimeout(() => {
            if (window.coWriterManager?.appendComposerText?.(text)) {
                this.notebookManager.showToast('Text sent to CoWriter', 'success');
                return;
            }

            const input = document.getElementById('chat-input');
            if (!input) {
                this.notebookManager.showToast('CoWriter not available', 'error');
                return;
            }

            input.value = input.value ? `${input.value}\n\n${text}` : text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.focus();
            setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 50);
            this.notebookManager.showToast('Text sent to CoWriter', 'success');
        }, 100);
    }
}

window.NotebookIntegrationController = NotebookIntegrationController;
