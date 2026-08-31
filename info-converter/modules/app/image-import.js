function sanitizeName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function replaceExtension(filename, extension) {
    const baseName = filename.replace(/\.[^/.]+$/, '');
    return `${baseName}.${extension}`;
}

export function createImageImportController(dependencies) {
    let currentField = null;
    let currentContext = null;

    function getDefaultPath(context) {
        const editorContext = dependencies.getContext();
        const category = editorContext.editingCategory;
        const characterName = sanitizeName(document.getElementById('char-name')?.value.trim());

        switch (context) {
            case 'banner': return 'assets/ui/banners/';
            case 'overview': return 'assets/ui/overview/';
            case 'background':
            case 'modal-bg': return 'assets/ui/backgrounds/';
            case 'event': return 'assets/events/';
            case 'character':
            case 'character-card':
                return characterName ? `assets/characters/${characterName}/` : 'assets/characters/';
            case 'location': return 'assets/world/locations/';
            case 'world-item': return category ? `assets/world/${category}/` : 'assets/world/';
            case 'item-icon': return `assets/world/${category || 'items'}/icons/`;
            case 'custom-page': {
                const pageId = editorContext.currentCustomPageId;
                return pageId ? `pages/${pageId}/` : 'pages/';
            }
            default: return 'assets/';
        }
    }

    function updateFinalPath() {
        const filename = document.getElementById('import-image-name')?.value.trim() || 'image.jpg';
        const location = document.getElementById('import-image-path')?.value.trim() || 'assets/';
        const finalPath = `${location.endsWith('/') ? location : `${location}/`}${filename}`;
        const preview = document.getElementById('import-final-path');
        if (preview) preview.textContent = finalPath;

        const importButton = document.getElementById('import-image-btn');
        const fileInput = document.getElementById('import-image-file');
        if (importButton) importButton.disabled = !fileInput?.files?.length || !filename;
    }

    function openImageImportModal(targetField, context) {
        currentField = targetField;
        currentContext = context;

        const modal = document.getElementById('imageImportModal');
        const fileInput = document.getElementById('import-image-file');
        const nameInput = document.getElementById('import-image-name');
        const pathInput = document.getElementById('import-image-path');
        if (!modal || !fileInput || !nameInput || !pathInput) return;

        modal.dataset.context = context || '';
        fileInput.value = '';
        nameInput.value = '';
        pathInput.value = getDefaultPath(context);
        updateFinalPath();
        dependencies.openModal('imageImportModal');
    }

    function suggestFilename(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        const characterName = sanitizeName(document.getElementById('char-name')?.value.trim());
        const itemName = sanitizeName(document.getElementById('item-name')?.value.trim());

        if (currentContext === 'character-card') {
            return characterName ? `${characterName}-card.png` : 'character-card.png';
        }
        if (currentContext === 'character' && characterName) {
            if (currentField === 'char-image') return `${characterName}-main.${extension}`;
            if (currentField === 'char-gallery') return `${characterName}-gallery-${Date.now()}.${extension}`;
            return `${characterName}.${extension}`;
        }
        if (currentContext === 'world-item' && itemName) return `${itemName}.${extension}`;
        return file.name;
    }

    function compressImage(file, maxWidth, maxHeight, quality, outputFormat) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const image = new Image();
            const objectUrl = URL.createObjectURL(file);

            image.onload = () => {
                let { width, height } = image;
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
                canvas.width = width;
                canvas.height = height;
                context.drawImage(image, 0, 0, width, height);
                canvas.toBlob(blob => {
                    URL.revokeObjectURL(objectUrl);
                    if (blob) resolve(blob);
                    else reject(new Error('Browser could not encode the image'));
                }, outputFormat, quality);
            };
            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Browser could not read the image'));
            };
            image.src = objectUrl;
        });
    }

    function replaceSelectedFile(fileInput, file) {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        fileInput.files = transfer.files;
    }

    function showProcessingStatus(fileInput, message) {
        const status = document.createElement('div');
        status.className = 'image-import-processing-status';
        status.textContent = message;
        status.style.color = '#007bff';
        fileInput.parentNode?.appendChild(status);
        return status;
    }

    async function resizeLargeSurfaceImage(file, fileInput, suggestedName, status) {
        const dimensions = await new Promise((resolve, reject) => {
            const image = new Image();
            const objectUrl = URL.createObjectURL(file);
            image.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve({ width: image.width, height: image.height });
            };
            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Browser could not read the image'));
            };
            image.src = objectUrl;
        });
        if (dimensions.width <= 2000 && dimensions.height <= 2000) return { file, filename: suggestedName };

        status.textContent = 'Resizing image...';
        const maxDimension = currentContext === 'banner' ? 2000 : 1920;
        const originalExtension = file.name.split('.').pop().toLowerCase();
        const extension = ['png', 'jpg', 'jpeg'].includes(originalExtension) ? originalExtension : 'png';
        const outputFormat = ['jpg', 'jpeg'].includes(extension) ? 'image/jpeg' : 'image/png';
        const blob = await compressImage(file, maxDimension, maxDimension, 1, outputFormat);
        const resizedFile = new File([blob], replaceExtension(file.name, extension), {
            type: outputFormat,
            lastModified: Date.now()
        });
        replaceSelectedFile(fileInput, resizedFile);
        status.textContent = `✓ Resized: ${(file.size / 1024).toFixed(1)}KB → ${(resizedFile.size / 1024).toFixed(1)}KB`;
        status.style.color = '#28a745';
        return { file: resizedFile, filename: replaceExtension(suggestedName, extension) };
    }

    async function handleFileSelection(event) {
        const fileInput = event.target;
        const file = fileInput.files?.[0];
        const nameInput = document.getElementById('import-image-name');
        if (!file || !nameInput) return;

        if (currentContext === 'character-card' && file.type !== 'image/png') {
            dependencies.notifyUser('Character cards must be PNG files only!');
            fileInput.value = '';
            updateFinalPath();
            return;
        }

        let suggestedName = suggestFilename(file);
        nameInput.value = suggestedName;
        if (currentContext === 'character-card' || currentContext === 'item-icon') {
            updateFinalPath();
            return;
        }

        const status = showProcessingStatus(fileInput, 'Compressing image...');
        try {
            if (['banner', 'background', 'modal-bg'].includes(currentContext)) {
                const result = await resizeLargeSurfaceImage(file, fileInput, suggestedName, status);
                suggestedName = result.filename;
                if (status.textContent === 'Compressing image...') status.remove();
            } else {
                const dimensions = {
                    character: [800, 800],
                    event: [300, 300],
                    'world-item': [600, 600],
                    location: [800, 600]
                }[currentContext] || [1200, 1200];
                const blob = await compressImage(file, dimensions[0], dimensions[1], 0.85, 'image/jpeg');
                const compressedFile = new File([blob], replaceExtension(file.name, 'jpg'), {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                });
                replaceSelectedFile(fileInput, compressedFile);
                suggestedName = replaceExtension(suggestedName, 'jpg');
                status.textContent = `✓ Compressed: ${(file.size / 1024).toFixed(1)}KB → ${(compressedFile.size / 1024).toFixed(1)}KB`;
                status.style.color = '#28a745';
            }
        } catch (error) {
            console.warn('Image preprocessing failed; using original:', error);
            status.textContent = '⚠ Processing failed, using original';
            status.style.color = '#dc3545';
        }

        nameInput.value = suggestedName;
        updateFinalPath();
        setTimeout(() => status.remove(), 3000);
    }

    function insertPathIntoField(relativePath) {
        const targetField = document.getElementById(currentField);
        if (!targetField) return;
        if (currentField.includes('gallery')) {
            const currentValue = targetField.value.trim();
            targetField.value = currentValue ? `${currentValue}\n${relativePath}` : relativePath;
        } else {
            targetField.value = relativePath;
        }
        targetField.dispatchEvent(new Event('input', { bubbles: true }));
    }

    async function performImageImport() {
        const { currentProject, userSessionManager } = dependencies.getContext();
        if (!currentProject) {
            dependencies.notifyUser('Please save your project first before importing images.');
            return;
        }

        const fileInput = document.getElementById('import-image-file');
        const filename = document.getElementById('import-image-name')?.value.trim();
        const folderPath = document.getElementById('import-image-path')?.value.trim();
        const importButton = document.getElementById('import-image-btn');
        if (!fileInput?.files?.length) return dependencies.notifyUser('Please select an image file.');
        if (!filename) return dependencies.notifyUser('Please enter a filename.');
        if (!folderPath) return dependencies.notifyUser('Please enter a folder path.');

        const originalLabel = importButton?.textContent || 'Import Image';
        try {
            if (importButton) {
                importButton.textContent = 'Importing...';
                importButton.disabled = true;
            }
            const formData = new FormData();
            formData.append('image', fileInput.files[0]);
            formData.append('filename', filename);
            formData.append('folderPath', folderPath.replace(/\/$/, ''));
            formData.append('projectName', currentProject);
            if (userSessionManager) formData.append('userContext', JSON.stringify(userSessionManager.getUserContext()));

            const response = await fetch('/api/assets/import-image', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'Import failed');

            insertPathIntoField(result.relativePath);
            dependencies.closeModal('imageImportModal');
            dependencies.showToast('success', `Image imported: ${result.filename}`);
        } catch (error) {
            console.error('Image import failed:', error);
            dependencies.showToast('error', `Import failed: ${error.message}`);
        } finally {
            if (importButton) {
                importButton.textContent = originalLabel;
                importButton.disabled = false;
            }
        }
    }

    function initializeImageImport() {
        document.addEventListener('click', event => {
            const trigger = event.target.closest('.image-import-trigger');
            if (trigger) openImageImportModal(trigger.dataset.targetField, trigger.dataset.context);
        });
        document.getElementById('import-image-file')?.addEventListener('change', handleFileSelection);
        document.getElementById('import-image-name')?.addEventListener('input', updateFinalPath);
        document.getElementById('import-image-path')?.addEventListener('input', updateFinalPath);
        document.getElementById('import-image-btn')?.addEventListener('click', performImageImport);
    }

    return {
        initializeImageImport,
        openImageImportModal,
        performImageImport,
        updateFinalPath
    };
}
