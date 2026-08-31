(function initializeCoWriterDialogs(root) {
    'use strict';

    const dialogSelector = '[role="dialog"][aria-modal="true"]';
    const focusableSelector = [
        'button:not([disabled])',
        'a[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    const previousFocus = new WeakMap();
    const openState = new WeakMap();

    function isVisible(element) {
        return element
            && getComputedStyle(element).display !== 'none'
            && !element.hidden
            && element.getClientRects().length > 0;
    }

    function visibleDialogs() {
        return [...document.querySelectorAll(dialogSelector)]
            .filter(isVisible)
            .sort((a, b) => (Number.parseInt(getComputedStyle(a).zIndex, 10) || 0)
                - (Number.parseInt(getComputedStyle(b).zIndex, 10) || 0));
    }

    function focusDialog(dialog) {
        if (!previousFocus.has(dialog)) previousFocus.set(dialog, document.activeElement);
        const preferred = [...dialog.querySelectorAll(
            '[autofocus], input:not([type="hidden"]), textarea, select, button:not(.close-btn)'
        )].find(isVisible);
        (preferred || dialog).focus({ preventScroll: true });
    }

    function restoreFocus(dialog) {
        const prior = previousFocus.get(dialog);
        previousFocus.delete(dialog);
        if (prior?.isConnected) prior.focus({ preventScroll: true });
    }

    function closeDialog(dialog) {
        if (dialog.hasAttribute('data-dialog-static')) return;
        const closeButton = dialog.querySelector('[data-dialog-close], .close-btn');
        if (closeButton) closeButton.click();
        else dialog.remove();
    }

    function trapFocus(event, dialog) {
        const controls = [...dialog.querySelectorAll(focusableSelector)].filter(isVisible);
        if (controls.length === 0) {
            event.preventDefault();
            dialog.focus();
            return;
        }
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    document.addEventListener('keydown', event => {
        const dialogs = visibleDialogs();
        const dialog = dialogs[dialogs.length - 1];
        if (!dialog) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            closeDialog(dialog);
        } else if (event.key === 'Tab') {
            trapFocus(event, dialog);
        }
    });

    document.addEventListener('keydown', event => {
        const tab = event.target.closest?.('[role="tab"]');
        if (tab?.classList.contains('main-tab')) return;
        if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = [...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
        let index = tabs.indexOf(tab);
        if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = tabs.length - 1;
        else index = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        tabs[index].focus();
        tabs[index].click();
    });

    document.addEventListener('click', event => {
        const tab = event.target.closest?.('[role="tab"]');
        if (!tab) return;
        for (const item of tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')) {
            item.setAttribute('aria-selected', String(item === tab));
            item.tabIndex = item === tab ? 0 : -1;
        }
    });

    function registerDialog(dialog) {
        if (!dialog || openState.has(dialog)) return;
        const open = isVisible(dialog);
        openState.set(dialog, open);
        if (open) queueMicrotask(() => focusDialog(dialog));
    }

    function dialogsInNode(node) {
        if (!(node instanceof Element)) return [];
        return [
            ...(node.matches(dialogSelector) ? [node] : []),
            ...node.querySelectorAll(dialogSelector)
        ];
    }

    const observer = new MutationObserver(records => {
        for (const record of records) {
            if (record.type === 'childList') {
                record.addedNodes.forEach(node => dialogsInNode(node).forEach(registerDialog));
                record.removedNodes.forEach(node => dialogsInNode(node).forEach(dialog => {
                    restoreFocus(dialog);
                    openState.delete(dialog);
                }));
                continue;
            }

            const dialog = record.target.matches?.(dialogSelector)
                ? record.target
                : record.target.closest?.(dialogSelector);
            if (!dialog) continue;
            registerDialog(dialog);
            const open = isVisible(dialog);
            if (openState.get(dialog) === open) continue;
            openState.set(dialog, open);
            if (open) {
                dialog.tabIndex = -1;
                queueMicrotask(() => focusDialog(dialog));
            } else {
                restoreFocus(dialog);
            }
        }
    });

    document.querySelectorAll(dialogSelector).forEach(registerDialog);
    observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
    });

    function enhanceDialog(dialog, { labelledBy, describedBy } = {}) {
        if (!dialog) return dialog;
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        if (labelledBy) dialog.setAttribute('aria-labelledby', labelledBy);
        if (describedBy) dialog.setAttribute('aria-describedby', describedBy);
        dialog.querySelectorAll('.close-btn').forEach(button => button.setAttribute('data-dialog-close', ''));
        return dialog;
    }

    const toolkitDialog = document.getElementById('cowriter-dialog-modal');
    const dialogForm = document.getElementById('cowriter-dialog-form');
    const dialogTitle = document.getElementById('cowriter-dialog-title');
    const dialogMessage = document.getElementById('cowriter-dialog-message');
    const dialogIcon = toolkitDialog?.querySelector('.cowriter-dialog-icon i');
    const dialogInputGroup = document.getElementById('cowriter-dialog-input-group');
    const dialogInputLabel = document.getElementById('cowriter-dialog-input-label');
    const dialogInput = document.getElementById('cowriter-dialog-input');
    const folderGroup = document.getElementById('cowriter-dialog-folder-group');
    const folderSelect = document.getElementById('cowriter-dialog-folder');
    const newFolderGroup = document.getElementById('cowriter-dialog-new-folder-group');
    const newFolderInput = document.getElementById('cowriter-dialog-new-folder');
    const validation = document.getElementById('cowriter-dialog-validation');
    const confirmButton = document.getElementById('cowriter-dialog-confirm');
    const alternateButton = document.getElementById('cowriter-dialog-alternate');
    const closeButtons = toolkitDialog ? [...toolkitDialog.querySelectorAll('[data-dialog-close]')] : [];
    const newFolderValue = '__cowriter_new_folder__';
    let activeRequest = null;

    function showValidation(message, control) {
        validation.textContent = message;
        validation.hidden = false;
        control?.focus();
    }

    function settleDialog(value) {
        if (!activeRequest) return;
        const resolve = activeRequest.resolve;
        activeRequest = null;
        toolkitDialog.style.display = 'none';
        resolve(value);
    }

    function configureDialog(mode, options, resolve) {
        if (activeRequest) settleDialog(null);
        activeRequest = { mode, options, resolve };

        dialogTitle.textContent = options.title || 'Confirm action';
        dialogMessage.textContent = options.message || '';
        dialogIcon.className = options.icon || (options.danger ? 'fas fa-triangle-exclamation' : 'fas fa-circle-question');
        confirmButton.textContent = options.confirmLabel || 'Continue';
        confirmButton.className = options.danger ? 'btn-danger' : 'btn-primary';
        alternateButton.hidden = mode !== 'choice';
        alternateButton.textContent = options.alternateLabel || 'Alternate action';
        alternateButton.className = options.alternateDanger ? 'btn-danger' : 'btn-secondary';
        validation.hidden = true;
        validation.textContent = '';

        dialogInputGroup.hidden = mode !== 'input';
        folderGroup.hidden = mode !== 'folder';
        newFolderGroup.hidden = true;

        if (mode === 'input') {
            dialogInputLabel.textContent = options.label || 'Name';
            dialogInput.type = options.inputType || 'text';
            dialogInput.autocomplete = options.autocomplete || 'off';
            dialogInput.value = options.value || '';
            dialogInput.placeholder = options.placeholder || '';
        }

        if (mode === 'folder') {
            const folders = [...new Set((options.folders || []).filter(Boolean))]
                .sort((a, b) => a === 'Uncategorized' ? -1 : b === 'Uncategorized' ? 1 : a.localeCompare(b));
            folderSelect.replaceChildren();
            for (const folder of folders) {
                const option = document.createElement('option');
                option.value = folder;
                option.textContent = folder;
                folderSelect.appendChild(option);
            }
            const createOption = document.createElement('option');
            createOption.value = newFolderValue;
            createOption.textContent = 'Create a new folder…';
            folderSelect.appendChild(createOption);
            folderSelect.value = folders.includes(options.value) ? options.value : (folders[0] || newFolderValue);
            newFolderInput.value = '';
            newFolderGroup.hidden = folderSelect.value !== newFolderValue;
        }

        toolkitDialog.style.display = 'flex';
        queueMicrotask(() => {
            if (mode === 'input') {
                dialogInput.focus();
                dialogInput.select();
            } else if (mode === 'folder') {
                (folderSelect.value === newFolderValue ? newFolderInput : folderSelect).focus();
            } else {
                confirmButton.focus();
            }
        });
    }

    function openDialog(mode, options = {}) {
        if (!toolkitDialog) return Promise.resolve(mode === 'confirm' ? false : null);
        return new Promise(resolve => configureDialog(mode, options, resolve));
    }

    folderSelect?.addEventListener('change', () => {
        const isCreating = folderSelect.value === newFolderValue;
        newFolderGroup.hidden = !isCreating;
        if (isCreating) queueMicrotask(() => newFolderInput.focus());
    });

    dialogForm?.addEventListener('submit', event => {
        event.preventDefault();
        if (!activeRequest) return;

        if (activeRequest.mode === 'confirm' || activeRequest.mode === 'choice') {
            settleDialog(activeRequest.mode === 'confirm'
                ? true
                : (activeRequest.options.confirmValue ?? 'confirm'));
            return;
        }

        if (activeRequest.mode === 'input') {
            const value = dialogInput.value.trim();
            if (!value) {
                showValidation('Enter a name to continue.', dialogInput);
                return;
            }
            settleDialog(value);
            return;
        }

        const isCreating = folderSelect.value === newFolderValue;
        const value = isCreating ? newFolderInput.value.trim() : folderSelect.value;
        if (!value) {
            showValidation('Choose a folder or enter a new folder name.', isCreating ? newFolderInput : folderSelect);
            return;
        }
        settleDialog(value);
    });

    for (const button of closeButtons) {
        button.addEventListener('click', () => settleDialog(activeRequest?.mode === 'confirm' ? false : null));
    }

    alternateButton?.addEventListener('click', () => {
        if (activeRequest?.mode === 'choice') {
            settleDialog(activeRequest.options.alternateValue ?? 'alternate');
        }
    });

    toolkitDialog?.addEventListener('click', event => {
        if (event.target === toolkitDialog) {
            settleDialog(activeRequest?.mode === 'confirm' ? false : null);
        }
    });

    const dialogApi = Object.freeze({
        confirm: options => openDialog('confirm', options),
        choice: options => openDialog('choice', options),
        input: options => openDialog('input', options),
        chooseFolder: options => openDialog('folder', options),
        enhance: enhanceDialog
    });

    // The dialog is shared Toolkit UI. Keep the original name for existing
    // CoWriter integrations while giving other features a neutral entry point.
    root.ToolkitDialogs = dialogApi;
    root.CoWriterDialogs = dialogApi;
}(typeof window !== 'undefined' ? window : null));
