import titleFonts from '../../templates/titlefonts.js';

export function isValidHexColor(color) {
    return /^#[0-9A-Fa-f]{3,6}$/.test(color);
}

export function createAppearanceControls(dependencies) {
    function updateBasicField(field, value) {
        const infoData = dependencies.getInfoData();
        if (!infoData.basic) infoData.basic = {};
        infoData.basic[field] = value;
        dependencies.markDataAsModified();
    }

    function bindColorField(textId, pickerId, basicField = null) {
        const textInput = document.getElementById(textId);
        const picker = document.getElementById(pickerId);
        if (!textInput || !picker) return;

        textInput.addEventListener('input', () => {
            const color = textInput.value.trim();
            if (color && isValidHexColor(color)) picker.value = color;
            if (basicField) updateBasicField(basicField, textInput.value);
        });

        picker.addEventListener('input', () => {
            textInput.value = picker.value;
            if (basicField) updateBasicField(basicField, picker.value);
        });
    }

    function bindBasicTextField(inputId, basicField) {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.addEventListener('input', () => updateBasicField(basicField, input.value));
    }

    function bindNumberPair(sliderId, numberId, basicField, normalize) {
        const slider = document.getElementById(sliderId);
        const number = document.getElementById(numberId);
        if (!slider || !number) return;

        slider.addEventListener('input', () => {
            number.value = slider.value;
            updateBasicField(basicField, parseInt(slider.value));
        });

        number.addEventListener('input', () => {
            const value = normalize(number.value);
            number.value = value;
            slider.value = value;
            updateBasicField(basicField, value);
        });
    }

    function initializeOverviewBackgroundControls() {
        bindColorField(
            'overview-content-bg-color',
            'overview-content-bg-color-picker',
            'overviewContentBgColor'
        );
        bindBasicTextField('overview-content-bg-image', 'overviewContentBgImage');
        bindNumberPair(
            'overview-content-opacity-slider',
            'overview-content-opacity',
            'overviewContentOpacity',
            value => Math.max(0, Math.min(100, parseInt(value) || 100))
        );
        bindNumberPair(
            'overview-content-blur-slider',
            'overview-content-blur',
            'overviewContentBlur',
            value => Math.max(0, parseInt(value) || 0)
        );
    }

    function initializeModalBackgroundControls() {
        bindColorField('modal-bg-color', 'modal-bg-color-picker', 'modalBgColor');
        bindBasicTextField('modal-bg-image', 'modalBgImage');
    }

    function initializeMainContainerBackgroundControls() {
        bindColorField(
            'main-container-bg-color',
            'main-container-bg-color-picker',
            'mainContainerBgColor'
        );
        bindBasicTextField('main-container-bg-image', 'mainContainerBgImage');
    }

    function initializeAppearanceColorPickers() {
        bindColorField('background-color', 'background-color-picker');
        bindColorField('main-container-color', 'main-container-color-picker');
    }

    function populateTitleFontDropdown() {
        const titleFontSelect = document.getElementById('world-title-font');
        if (!titleFontSelect) return;
        titleFontSelect.replaceChildren();
        for (const [key, fontSet] of Object.entries(titleFonts)) {
            const option = new Option(fontSet.name, key);
            if (fontSet.description) option.title = fontSet.description;
            titleFontSelect.add(option);
        }
    }

    return {
        initializeAppearanceColorPickers,
        initializeMainContainerBackgroundControls,
        initializeModalBackgroundControls,
        initializeOverviewBackgroundControls,
        populateTitleFontDropdown
    };
}
