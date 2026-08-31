function bindClick(id, action) {
    const element = document.getElementById(id);
    if (element && action) element.addEventListener('click', action);
}

async function runWithButtonProgress(button, action, options = {}) {
    if (!button || button.getAttribute('aria-busy') === 'true') return;

    const lockedButtons = (options.lockedButtons || []).filter(Boolean);
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-generating');
    lockedButtons.forEach(lockedButton => {
        lockedButton.disabled = true;
        lockedButton.dataset.generationLocked = 'true';
    });

    // Let the busy state paint before synchronous document assembly begins.
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
    try {
        return await action();
    } finally {
        button.classList.remove('is-generating');
        button.setAttribute('aria-busy', 'false');
        button.disabled = false;
        lockedButtons.forEach(lockedButton => delete lockedButton.dataset.generationLocked);
        options.onSettled?.();
    }
}

export function createDomainButtonController(actions) {
    function initializeButtons() {
        const generateButton = document.getElementById('generate-btn');
        if (generateButton && actions.generateHTML) {
            generateButton.addEventListener('click', () => runWithButtonProgress(generateButton, actions.generateHTML, {
                lockedButtons: [document.getElementById('save-to-sites-btn')],
                onSettled: actions.updateSaveButtonState
            }));
        }

        const bindings = {
            'download-btn': actions.downloadHTML,
            'save-to-sites-btn': actions.saveToSitesFolder,
            'export-editable-btn': actions.downloadEditableArchive,
            'github-sync-select': actions.selectGitHubRepository,
            'github-sync-update': actions.updateGitHubRepository,
            'open-project-btn': actions.openCurrentProject,
            'import-btn': actions.importHTML,
            'add-character': actions.addCharacter,
            'add-storyline': actions.addStoryline,
            'storylines-options': actions.openStorylinesOptionsModal,
            'plans-options': actions.openPlansOptionsModal,
            'characters-options': actions.openCharactersOptionsModal,
            'cultivation-options': actions.openCultivationOptionsModal,
            'magic-options': actions.openMagicOptionsModal,
            'culture-options': actions.openCultureOptionsModal,
            'events-options': actions.openEventsOptionsModal,
            'add-plan': actions.addPlan,
            'add-subarc-btn': actions.addSubArc,
            'add-location': actions.addLocation,
            'add-concept': actions.addConcept,
            'add-event': actions.addEvent,
            'add-creature': actions.addCreature,
            'add-plant': actions.addPlant,
            'add-item': actions.addItem,
            'add-faction': actions.addFaction,
            'add-culture': actions.addCulture,
            'add-cultivation': actions.addCultivation,
            'add-magic': actions.addMagic,
            'add-general': actions.addGeneral,
            'save-character': actions.saveCharacter,
            'save-storyline': actions.saveStoryline,
            'save-storylines-options': actions.saveStorylinesOptions,
            'save-plans-options': actions.savePlansOptions,
            'save-characters-options': actions.saveCharactersOptions,
            'save-cultivation-options': actions.saveCultivationOptions,
            'save-magic-options': actions.saveMagicOptions,
            'save-culture-options': actions.saveCultureOptions,
            'save-events-options': actions.saveEventsOptions,
            'manage-faction-order-btn': actions.openFactionOrderModal,
            'save-faction-order': actions.saveFactionOrder,
            'customize-info-display-labels-btn': actions.openInfoDisplayLabelsModal,
            'save-info-display-labels': actions.saveInfoDisplayLabels,
            'save-plan': actions.savePlan,
            'save-event': actions.saveEvent,
            'save-subarc': actions.saveSubArc,
            'save-location': actions.saveLocation,
            'save-world-item': actions.saveWorldItem
        };
        for (const [id, action] of Object.entries(bindings)) bindClick(id, action);

        bindClick('add-playlist', () => {
            actions.prepareNewPlaylist();
            actions.openPlaylistModal();
        });
        bindClick('add-subarc-event-btn', actions.addEventToSubArc);
        bindClick('add-event-btn', () => actions.addEventToPlan('main'));

        if (document.getElementById('save-to-sites-btn')) actions.updateSaveButtonState();
    }

    return { initializeButtons };
}
