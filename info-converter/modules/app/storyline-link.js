function setImportStatus(status, message, color, clearAfter = 0) {
    if (!status) return;
    status.textContent = message;
    status.style.color = color;
    if (clearAfter) {
        setTimeout(() => {
            status.textContent = '';
        }, clearAfter);
    }
}

export function createStorylineLinkController(dependencies) {
    async function populateStorylineDropdown() {
        const dropdown = document.getElementById('story-roleplay-dropdown');
        const importButton = document.getElementById('story-import-btn');
        const { currentProject, userSessionManager } = dependencies.getContext();

        if (!dropdown || !currentProject) {
            if (dropdown) dropdown.disabled = true;
            if (importButton) importButton.disabled = true;
            return;
        }

        try {
            const userContext = userSessionManager?.getUserContext();
            const response = await fetch(`/api/roleplay/list/${encodeURIComponent(currentProject)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userContext })
            });
            if (!response.ok) throw new Error(`Roleplay list request failed (${response.status})`);
            const files = await response.json();

            dropdown.replaceChildren(new Option('None', ''));
            for (const file of files) dropdown.add(new Option(file, file));
            dropdown.disabled = files.length === 0;
            if (importButton) importButton.disabled = true;
        } catch (error) {
            console.error('Error loading roleplay files:', error);
            dropdown.disabled = true;
            if (importButton) importButton.disabled = true;
        }
    }

    function handleStorylineDropdownChange() {
        const dropdown = document.getElementById('story-roleplay-dropdown');
        const linkInput = document.getElementById('story-link');
        const importButton = document.getElementById('story-import-btn');
        if (!dropdown || !linkInput || !importButton) return;

        linkInput.value = dropdown.value || '';
        importButton.disabled = !dropdown.value;
    }

    async function handleStorylineImport() {
        const dropdown = document.getElementById('story-roleplay-dropdown');
        const status = document.getElementById('storyline-import-status');
        const { currentProject, userSessionManager } = dependencies.getContext();
        if (!dropdown?.value || !currentProject) return;

        try {
            setImportStatus(status, 'Importing...', '#666');
            const response = await fetch('/api/roleplay/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: dropdown.value,
                    projectName: currentProject,
                    userContext: userSessionManager?.getUserContext()
                })
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'Import failed');

            setImportStatus(status, '✓ Imported', '#28a745', 3000);
            dependencies.openStorylineModal({
                title: result.storylineData?.title || '',
                pairing: result.storylineData?.pairing || '',
                wordcount: result.storylineData?.wordcount || '',
                lastUpdated: result.storylineData?.lastUpdated || '',
                description: result.storylineData?.description || '',
                link: dropdown.value,
                isProjectLink: true
            });
        } catch (error) {
            console.error('Error importing roleplay:', error);
            setImportStatus(status, 'Import failed', '#dc3545', 5000);
        }
    }

    return {
        handleStorylineDropdownChange,
        handleStorylineImport,
        populateStorylineDropdown
    };
}
