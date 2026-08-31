export function createProjectFormBindings(dependencies) {
    function getBasic() {
        const infoData = dependencies.getInfoData();
        if (!infoData.basic) infoData.basic = {};
        return infoData.basic;
    }

    function markModified() {
        dependencies.markDataAsModified();
    }

    function bindBasicInput(id, field) {
        document.getElementById(id)?.addEventListener('input', event => {
            getBasic()[field] = event.currentTarget.value;
            markModified();
        });
    }

    function getTitleSettings() {
        const basic = getBasic();
        if (!basic.titleSettings) {
            basic.titleSettings = {
                show: true,
                alignment: 'left',
                position: 'bottom',
                font: 'theme',
                color: ''
            };
        }
        return basic.titleSettings;
    }

    function bindTitleSetting(id, eventName, field, readValue = element => element.value) {
        document.getElementById(id)?.addEventListener(eventName, event => {
            getTitleSettings()[field] = readValue(event.currentTarget);
            markModified();
        });
    }

    function initializeTitleBindings() {
        bindTitleSetting('world-title-font', 'change', 'font');
        bindTitleSetting('world-title-visibility', 'change', 'show', element => element.checked);
        bindTitleSetting('world-title-alignment', 'change', 'alignment');
        bindTitleSetting('world-title-position', 'change', 'position');

        const colorText = document.getElementById('world-title-color');
        const colorPicker = document.getElementById('world-title-color-picker');
        if (!colorText || !colorPicker) return;
        colorText.addEventListener('input', () => {
            const color = colorText.value.trim();
            if (color && dependencies.isValidHexColor(color)) colorPicker.value = color;
            getTitleSettings().color = colorText.value;
            markModified();
        });
        colorPicker.addEventListener('input', () => {
            colorText.value = colorPicker.value;
            getTitleSettings().color = colorPicker.value;
            markModified();
        });
    }

    function initializeStorylineLinkBinding() {
        const checkbox = document.getElementById('story-is-project-link');
        const linkInput = document.getElementById('story-link');
        const helper = document.getElementById('story-link-helper');
        if (!checkbox || !linkInput || !helper) return;

        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                linkInput.placeholder = 'story-title.html';
                linkInput.title = 'Enter just the HTML filename (roleplays/ will be added automatically)';
                helper.textContent = 'Project filename only. Save your HTML files in the roleplays/ folder for this to work.';
                void dependencies.populateStorylineDropdown();
                return;
            }

            linkInput.placeholder = 'https://archiveofourown.org/works/123456';
            linkInput.title = 'Enter the full URL to the storyline';
            helper.textContent = 'External URL (unchecked) or project filename (checked). Project files should be saved in the roleplays/ folder.';
            const dropdown = document.getElementById('story-roleplay-dropdown');
            const importButton = document.getElementById('story-import-btn');
            if (dropdown) {
                dropdown.disabled = true;
                dropdown.value = '';
            }
            if (importButton) importButton.disabled = true;
        });
    }

    function initializeModalEnterBindings() {
        for (const input of document.querySelectorAll('.modal input')) {
            input.addEventListener('keydown', event => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                input.closest('.modal')?.querySelector('[id*="save-"]')?.click();
            });
        }
    }

    function initializeFormListeners() {
        bindBasicInput('main-container-color', 'mainContainerColor');
        bindBasicInput('world-title', 'title');
        bindBasicInput('world-subtitle', 'subtitle');
        bindBasicInput('banner-image', 'banner');
        bindBasicInput('overview-title', 'overviewTitle');
        bindBasicInput('overview-text', 'overview');
        bindBasicInput('overview-image', 'overviewImage');
        bindBasicInput('background-color', 'backgroundColor');
        bindBasicInput('background-image', 'backgroundImage');
        initializeTitleBindings();
        initializeStorylineLinkBinding();
        initializeModalEnterBindings();
    }

    return { initializeFormListeners };
}
