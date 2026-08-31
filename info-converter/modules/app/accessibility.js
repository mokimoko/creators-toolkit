const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

function readableId(value = '') {
    return value
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, character => character.toUpperCase())
        .trim();
}

function isVisible(element) {
    if (!element?.isConnected || element.hidden) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function focusableElements(container) {
    return [...container.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter(element => isVisible(element) && element.getAttribute('aria-hidden') !== 'true');
}

function ensureId(element, prefix) {
    if (element.id) return element.id;
    let suffix = 1;
    while (document.getElementById(`${prefix}-${suffix}`)) suffix += 1;
    element.id = `${prefix}-${suffix}`;
    return element.id;
}

function labelTextFor(control) {
    const explicitLabel = control.labels?.[0];
    if (explicitLabel?.textContent.trim()) return explicitLabel.textContent.trim().replace(/:\s*$/, '');

    if (control.id.endsWith('-picker')) {
        const pairedControl = document.getElementById(control.id.slice(0, -'-picker'.length));
        const pairedLabel = pairedControl?.labels?.[0]?.textContent.trim();
        if (pairedLabel) return `Choose ${pairedLabel.replace(/:\s*$/, '')}`;
    }

    return control.getAttribute('title')
        || control.getAttribute('placeholder')
        || readableId(control.id || control.name || control.type);
}

function appendDescription(control, description) {
    if (!description) return;
    const descriptionId = ensureId(description, 'field-description');
    const ids = new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    ids.add(descriptionId);
    control.setAttribute('aria-describedby', [...ids].join(' '));
}

function findLocalDescription(control) {
    const directSibling = control.nextElementSibling;
    if (directSibling?.matches('.helper-text, .field-error, .error-message')) return directSibling;

    const parentSibling = control.parentElement?.nextElementSibling;
    if (parentSibling?.matches('.helper-text, .field-error, .error-message')) return parentSibling;

    const group = control.closest('.control-group, .form-group, .field-group');
    return group?.querySelector('.helper-text, .field-error, .error-message') || null;
}

function enhanceFormControls(root) {
    const controls = root.matches?.('input, select, textarea')
        ? [root]
        : [...root.querySelectorAll?.('input, select, textarea') || []];

    for (const control of controls) {
        const needsExplicitName = ['color', 'file', 'range'].includes(control.type);
        if (needsExplicitName && !control.labels?.length && !control.hasAttribute('aria-label') && !control.hasAttribute('aria-labelledby')) {
            control.setAttribute('aria-label', labelTextFor(control));
        }
        appendDescription(control, findLocalDescription(control));
    }
}

function hasAccessibleName(element) {
    if (element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby')) return true;
    if (element.matches('input, select, textarea') && element.labels?.length) return true;
    if (element.querySelector('img[alt]:not([alt=""])')) return true;
    return Boolean(element.textContent.trim().replace(/^[×✕]+$/, ''));
}

function enhanceInteractiveControls(root) {
    const selector = 'button, a[href], [role="button"], [onclick]';
    const controls = root.matches?.(selector) ? [root] : [...root.querySelectorAll?.(selector) || []];

    for (const control of controls) {
        if (control.matches('.close, .modal-close, .text-editor-close')) {
            control.setAttribute('aria-label', 'Close dialog');
        } else if (!hasAccessibleName(control)) {
            const fallback = control.getAttribute('title') || readableId(control.id || control.classList[0]);
            if (fallback) control.setAttribute('aria-label', fallback);
        }

        if (control.matches('[onclick]') && !control.matches('button, a[href], input, select, textarea')) {
            control.setAttribute('role', 'button');
            control.tabIndex = 0;
            if (!control.dataset.loreKeyboardClick) {
                control.dataset.loreKeyboardClick = 'true';
                control.addEventListener('keydown', event => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    control.click();
                });
            }
        }
    }
}

function enhanceDialog(dialog) {
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-hidden', isVisible(dialog) ? 'false' : 'true');

    const title = dialog.querySelector('.modal-header h1, .modal-header h2, .modal-header h3, .text-editor-header h1, .text-editor-header h2, .text-editor-header h3');
    if (title) {
        dialog.setAttribute('aria-labelledby', ensureId(title, `${dialog.id || 'dialog'}-title`));
        title.setAttribute('role', 'heading');
        title.setAttribute('aria-level', '2');
    } else if (!dialog.hasAttribute('aria-label')) {
        dialog.setAttribute('aria-label', readableId(dialog.id) || 'Dialog');
    }

    for (const closeControl of dialog.querySelectorAll('.close, .modal-close')) {
        closeControl.setAttribute('role', 'button');
        closeControl.tabIndex = 0;
        closeControl.setAttribute('aria-label', 'Close dialog');
        if (!closeControl.dataset.loreKeyboardClick) {
            closeControl.dataset.loreKeyboardClick = 'true';
            closeControl.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                closeControl.click();
            });
        }
    }
}

function enhanceHeadings(root) {
    const replaceHeading = (heading, tagName, level) => {
        const replacement = document.createElement(tagName);
        for (const attribute of heading.attributes) replacement.setAttribute(attribute.name, attribute.value);
        while (heading.firstChild) replacement.appendChild(heading.firstChild);
        replacement.setAttribute('aria-level', String(level));
        heading.replaceWith(replacement);
    };

    for (const heading of root.querySelectorAll?.('.main-tab-content h3') || []) {
        replaceHeading(heading, 'h2', 2);
    }
    for (const heading of root.querySelectorAll?.('.main-tab-content h4') || []) {
        replaceHeading(heading, 'h3', 3);
    }
    for (const heading of root.querySelectorAll?.('.modal-header h3, .text-editor-header h3') || []) {
        replaceHeading(heading, 'h2', 2);
    }
}

export function createAccessibilityController(dependencies) {
    const dialogs = new Set();
    const dialogState = new WeakMap();
    let lastExternalFocus = null;

    function syncTabSet(tabSelector, panelForTab) {
        const tabs = [...document.querySelectorAll(tabSelector)];
        for (const tab of tabs) {
            const panel = panelForTab(tab);
            const active = tab.classList.contains('active');
            const tabId = ensureId(tab, 'lore-tab');
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            if (!panel) continue;
            const panelId = ensureId(panel, 'lore-tabpanel');
            tab.setAttribute('aria-controls', panelId);
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', tabId);
            panel.hidden = !active;
        }
    }

    function syncTabs() {
        syncTabSet('.main-tab-list .main-tab', tab => document.getElementById(`${tab.dataset.tab}-content`));
        syncTabSet('#generate-content .tabs .tab', tab => document.getElementById(`${tab.dataset.tab}-content-inner`));
    }

    function syncContentNavigation() {
        const items = [...document.querySelectorAll('.sidebar-item[data-category]')];
        const activeItem = items.find(item => item.classList.contains('active'))
            || items.find(item => document.getElementById(`${item.dataset.category}-section`)?.classList.contains('active'))
            || items[0];

        for (const item of items) {
            const panel = document.getElementById(`${item.dataset.category}-section`);
            const active = item === activeItem;
            const itemId = ensureId(item, 'content-category');
            const categoryName = item.querySelector('.category-name');
            const itemCount = item.querySelector('.item-count');
            item.setAttribute('role', 'button');
            if (categoryName) {
                const labelIds = [ensureId(categoryName, 'content-category-name')];
                if (itemCount) labelIds.push(ensureId(itemCount, 'content-category-count'));
                item.setAttribute('aria-labelledby', labelIds.join(' '));
            } else {
                item.setAttribute('aria-label', readableId(item.dataset.category));
            }
            item.setAttribute('aria-pressed', String(active));
            item.tabIndex = active ? 0 : -1;
            if (!panel) continue;
            item.setAttribute('aria-controls', panel.id);
            panel.setAttribute('role', 'region');
            panel.setAttribute('aria-labelledby', itemId);
            panel.hidden = !active;
        }
    }

    function activateAdjacentTab(event, tabSelector, activate) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate(event.currentTarget.dataset.tab);
            syncTabs();
            return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = [...document.querySelectorAll(tabSelector)];
        const currentIndex = tabs.indexOf(event.currentTarget);
        if (currentIndex < 0) return;

        event.preventDefault();
        let targetIndex = currentIndex;
        if (event.key === 'Home') targetIndex = 0;
        if (event.key === 'End') targetIndex = tabs.length - 1;
        if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % tabs.length;

        const target = tabs[targetIndex];
        activate(target.dataset.tab);
        syncTabs();
        target.focus();
    }

    function initializeTabs() {
        document.querySelector('.main-tab-list')?.setAttribute('role', 'tablist');
        document.querySelector('#generate-content .tabs')?.setAttribute('role', 'tablist');
        syncTabs();

        for (const tab of document.querySelectorAll('.main-tab-list .main-tab')) {
            tab.addEventListener('keydown', event => {
                activateAdjacentTab(event, '.main-tab-list .main-tab', dependencies.switchMainTab);
            });
        }
        for (const tab of document.querySelectorAll('#generate-content .tabs .tab')) {
            tab.addEventListener('keydown', event => {
                activateAdjacentTab(event, '#generate-content .tabs .tab', dependencies.switchSubTab);
            });
        }
    }

    function topDialog() {
        return [...dialogs].filter(isVisible).at(-1) || null;
    }

    function focusDialog(dialog) {
        queueMicrotask(() => {
            if (!isVisible(dialog) || dialog.contains(document.activeElement)) return;
            const target = dialog.querySelector('[autofocus]') || focusableElements(dialog)[0];
            if (target) target.focus();
            else {
                const surface = dialog.querySelector('.modal-content, .text-editor-modal-content') || dialog;
                surface.tabIndex = -1;
                surface.focus();
            }
        });
    }

    function syncDialog(dialog) {
        const wasOpen = dialogState.get(dialog) === true;
        const open = isVisible(dialog);
        dialogState.set(dialog, open);
        dialog.setAttribute('aria-hidden', String(!open));

        if (open && !wasOpen) {
            dialog._loreReturnFocus = lastExternalFocus?.isConnected ? lastExternalFocus : document.activeElement;
            focusDialog(dialog);
        } else if (!open && wasOpen) {
            const returnFocus = dialog._loreReturnFocus;
            if (returnFocus?.isConnected && !topDialog()) queueMicrotask(() => returnFocus.focus());
        }
    }

    function registerDialog(dialog) {
        dialogs.add(dialog);
        enhanceDialog(dialog);
        enhanceInteractiveControls(dialog);
        enhanceFormControls(dialog);
        syncDialog(dialog);
    }

    function requestDialogClose(dialog) {
        const closeControl = dialog.querySelector('.close, .modal-close, .text-editor-close, .btn-cancel, [data-modal]');
        if (closeControl) closeControl.click();
        else dependencies.closeModal?.(dialog.id);
    }

    function handleDialogKeydown(event) {
        const dialog = topDialog();
        if (!dialog) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            requestDialogClose(dialog);
            return;
        }
        if (event.key !== 'Tab') return;

        const focusable = focusableElements(dialog);
        if (!focusable.length) {
            event.preventDefault();
            focusDialog(dialog);
            return;
        }

        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function enhanceRoot(root) {
        if (!(root instanceof Element)) return;
        enhanceInteractiveControls(root);
        enhanceFormControls(root);
        enhanceHeadings(root);
        if (root.matches('.modal, .text-editor-modal, .modal-overlay')) registerDialog(root);
        for (const dialog of root.querySelectorAll('.modal, .text-editor-modal, .modal-overlay')) registerDialog(dialog);
    }

    function initializeLiveRegions() {
        const toastContainer = document.getElementById('toast-container');
        toastContainer?.setAttribute('aria-live', 'polite');
        toastContainer?.setAttribute('aria-relevant', 'additions text');
        toastContainer?.setAttribute('aria-label', 'Notifications');

        const saveStatus = document.getElementById('save-status');
        saveStatus?.setAttribute('role', 'status');
        saveStatus?.setAttribute('aria-live', 'polite');
        saveStatus?.setAttribute('aria-atomic', 'true');
    }

    function initializeAccessibility() {
        initializeTabs();
        syncContentNavigation();
        initializeLiveRegions();
        enhanceRoot(document.body);

        document.addEventListener('focusin', event => {
            if (![...dialogs].some(dialog => isVisible(dialog) && dialog.contains(event.target))) {
                lastExternalFocus = event.target;
            }
        }, true);
        document.addEventListener('keydown', handleDialogKeydown, true);

        const observer = new MutationObserver(records => {
            for (const record of records) {
                if (record.type === 'attributes') {
                    if (dialogs.has(record.target)) syncDialog(record.target);
                    if (record.target.matches?.('.main-tab, .tab')) syncTabs();
                    continue;
                }
                for (const node of record.addedNodes) enhanceRoot(node);
                for (const node of record.removedNodes) {
                    if (!(node instanceof Element)) continue;
                    const removedDialogs = [node, ...node.querySelectorAll('.modal, .text-editor-modal, .modal-overlay')]
                        .filter(element => dialogs.has(element));
                    for (const dialog of removedDialogs) {
                        const returnFocus = dialog._loreReturnFocus;
                        dialogs.delete(dialog);
                        if (returnFocus?.isConnected && !topDialog()) queueMicrotask(() => returnFocus.focus());
                    }
                }
            }
        });
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class', 'style'],
            childList: true,
            subtree: true
        });

        window.LoreAccessibility = { syncContentNavigation, syncTabs };
    }

    return { initializeAccessibility, syncContentNavigation, syncTabs };
}
