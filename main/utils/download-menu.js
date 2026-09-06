(function defineToolkitDownloadMenu(root) {
    'use strict';

    function initialize(target, options = {}) {
        const container = typeof target === 'string' ? document.querySelector(target) : target;
        if (!container) return null;
        if (container.__toolkitDownloadMenu) return container.__toolkitDownloadMenu;

        const trigger = container.querySelector('[data-download-trigger]');
        const menu = container.querySelector('[data-download-options]');
        const items = [...container.querySelectorAll('[data-download-action]')];
        if (!trigger || !menu || !items.length) return null;

        function enabledItems() {
            return items.filter(item => item.getAttribute('aria-disabled') !== 'true' && !item.disabled);
        }

        function setOpen(open, focusFirst = false) {
            const nextOpen = Boolean(open) && !trigger.disabled;
            menu.hidden = !nextOpen;
            container.classList.toggle('is-open', nextOpen);
            trigger.setAttribute('aria-expanded', String(nextOpen));
            if (nextOpen) {
                options.onOpen?.();
                if (focusFirst) enabledItems()[0]?.focus();
            }
        }

        function setItemState(action, state = {}) {
            const item = items.find(candidate => candidate.dataset.downloadAction === action);
            if (!item) return;
            const disabled = Boolean(state.disabled);
            item.disabled = disabled;
            item.setAttribute('aria-disabled', String(disabled));
            if (state.description) {
                const description = item.querySelector('[data-download-description]');
                if (description) description.textContent = state.description;
            }
            trigger.disabled = enabledItems().length === 0;
        }

        trigger.addEventListener('click', event => {
            event.preventDefault();
            setOpen(menu.hidden);
        });

        trigger.addEventListener('keydown', event => {
            if (event.key !== 'ArrowDown') return;
            event.preventDefault();
            setOpen(true, true);
        });

        items.forEach(item => {
            item.addEventListener('click', event => {
                event.preventDefault();
                if (item.disabled || item.getAttribute('aria-disabled') === 'true') return;
                setOpen(false);
                options.onSelect?.(item.dataset.downloadAction, item);
            });
        });

        menu.addEventListener('keydown', event => {
            const available = enabledItems();
            const currentIndex = available.indexOf(document.activeElement);
            let nextIndex = currentIndex;
            if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % available.length;
            else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + available.length) % available.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = available.length - 1;
            else if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
                trigger.focus();
                return;
            } else {
                return;
            }
            event.preventDefault();
            available[nextIndex]?.focus();
        });

        document.addEventListener('pointerdown', event => {
            if (!container.contains(event.target)) setOpen(false);
        });
        window.addEventListener('resize', () => setOpen(false), { passive: true });

        const controller = Object.freeze({
            close: () => setOpen(false),
            setItemState
        });
        container.__toolkitDownloadMenu = controller;
        options.onOpen?.();
        return controller;
    }

    function submitPostDownload(url, fields) {
        const token = `toolkit-download-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const frame = document.createElement('iframe');
        frame.name = token;
        frame.hidden = true;

        const form = document.createElement('form');
        form.method = 'post';
        form.action = url;
        form.target = token;
        form.hidden = true;
        for (const [name, rawValue] of Object.entries(fields || {})) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
            form.appendChild(input);
        }

        document.body.append(frame, form);
        form.submit();
        form.remove();
        window.setTimeout(() => frame.remove(), 10 * 60 * 1000);
    }

    root.ToolkitDownloadMenu = Object.freeze({ initialize, submitPostDownload });
})(window);
