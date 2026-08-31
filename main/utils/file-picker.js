(function initializeToolkitFilePicker(root, factory) {
    'use strict';

    const api = factory(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.ToolkitFilePicker = api;
    }
})(typeof window !== 'undefined' ? window : null, function createToolkitFilePicker(root) {
    'use strict';

    const IMAGE_EXTENSIONS = Object.freeze([
        '.png',
        '.jpg',
        '.jpeg',
        '.webp',
        '.gif',
        '.avif',
        '.bmp'
    ]);

    function getPickerTypes(accept = '') {
        const normalized = String(accept).toLowerCase();
        const types = [];

        if (normalized.includes('image/') || IMAGE_EXTENSIONS.some(extension => normalized.includes(extension))) {
            types.push({
                description: 'Image files',
                accept: {
                    'image/png': ['.png'],
                    'image/jpeg': ['.jpg', '.jpeg'],
                    'image/webp': ['.webp'],
                    'image/gif': ['.gif'],
                    'image/avif': ['.avif'],
                    'image/bmp': ['.bmp']
                }
            });
        }

        if (normalized.includes('.html') || normalized.includes('.htm')) {
            types.push({
                description: 'HTML files',
                accept: { 'text/html': ['.html', '.htm'] }
            });
        }

        if (normalized.includes('.json') || normalized.includes('.jsonl')) {
            const extensions = [];
            if (normalized.includes('.json')) extensions.push('.json');
            if (normalized.includes('.jsonl')) extensions.push('.jsonl');
            types.push({
                description: 'JSON files',
                accept: { 'application/json': extensions }
            });
        }

        if (normalized.includes('.txt')) {
            types.push({
                description: 'Text files',
                accept: { 'text/plain': ['.txt'] }
            });
        }

        return types;
    }

    function canUseModernPicker() {
        return Boolean(root?.isSecureContext && typeof root.showOpenFilePicker === 'function');
    }

    function openLegacyPicker(input) {
        input.dataset.toolkitPickerBypass = 'true';
        try {
            input.click();
        } finally {
            delete input.dataset.toolkitPickerBypass;
        }
    }

    function assignFiles(input, files) {
        const transfer = new root.DataTransfer();
        files.forEach(file => transfer.items.add(file));
        input.files = transfer.files;
        input.dispatchEvent(new root.Event('input', { bubbles: true }));
        input.dispatchEvent(new root.Event('change', { bubbles: true }));
    }

    async function open(input) {
        if (!input) return [];

        if (!canUseModernPicker()) {
            openLegacyPicker(input);
            return null;
        }

        const types = getPickerTypes(input.accept);
        const options = {
            multiple: Boolean(input.multiple),
            excludeAcceptAllOption: false
        };
        if (types.length) options.types = types;

        try {
            const handles = await root.showOpenFilePicker(options);
            const files = await Promise.all(handles.map(handle => handle.getFile()));
            assignFiles(input, files);
            return files;
        } catch (error) {
            if (error?.name === 'AbortError') return [];

            root.console?.warn('Modern file picker failed; using the compatibility picker.', error);
            openLegacyPicker(input);
            return null;
        }
    }

    function enhance(input) {
        if (!input || input.dataset.toolkitPickerEnhanced === 'true') return;
        input.dataset.toolkitPickerEnhanced = 'true';

        input.addEventListener('click', event => {
            if (input.dataset.toolkitPickerBypass === 'true' || !canUseModernPicker()) return;

            event.preventDefault();
            void open(input);
        });
    }

    function enhanceMarkedInputs(scope = root?.document) {
        scope?.querySelectorAll?.('input[type="file"][data-toolkit-file-picker]')
            .forEach(enhance);
    }

    if (root?.document) {
        if (root.document.readyState === 'loading') {
            root.document.addEventListener('DOMContentLoaded', () => enhanceMarkedInputs(), { once: true });
        } else {
            enhanceMarkedInputs();
        }
    }

    return {
        IMAGE_EXTENSIONS,
        canUseModernPicker,
        enhance,
        enhanceMarkedInputs,
        getPickerTypes,
        open
    };
});
