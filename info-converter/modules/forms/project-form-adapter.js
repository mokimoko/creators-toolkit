const BASIC_TEXT_FIELDS = Object.freeze({
    title: 'world-title',
    subtitle: 'world-subtitle',
    banner: 'banner-image',
    overviewTitle: 'overview-title',
    overview: 'overview-text',
    overviewImage: 'overview-image',
    backgroundColor: 'background-color',
    backgroundImage: 'background-image',
    mainContainerColor: 'main-container-color',
    overviewContentBgImage: 'overview-content-bg-image',
    overviewContentBgColor: 'overview-content-bg-color',
    mainContainerBgImage: 'main-container-bg-image',
    mainContainerBgColor: 'main-container-bg-color',
    modalBgColor: 'modal-bg-color',
    modalBgImage: 'modal-bg-image'
});

const APPEARANCE_FIELDS = Object.freeze({
    template: 'appearance-template',
    overviewStyle: 'appearance-overview-style',
    navigationStyle: 'appearance-navigation-style',
    colorScheme: 'appearance-color-scheme',
    fontSet: 'appearance-font-set',
    worldCategoriesHeader: 'appearance-world-categories-header',
    pageHeader: 'appearance-page-header',
    cardStyle: 'appearance-card-style',
    containerStyle: 'appearance-container-style',
    subcontainerStyle: 'appearance-subcontainer-style',
    infodisplayStyle: 'appearance-infodisplay-style',
    buttonStyle: 'appearance-button-style',
    backToTopStyle: 'appearance-back-to-top-style',
    customNavButtonStyle: 'appearance-custom-nav-button-style',
    bannerSize: 'appearance-banner-size',
    siteWidth: 'appearance-site-width'
});

const DEFAULT_CHARACTER = Object.freeze({
    name: '',
    fullName: '',
    title: '',
    age: '',
    image: '',
    tags: [],
    location: '',
    faction: '',
    stats: {
        range: 100,
        entries: [
            { label: 'Strength', value: 0 },
            { label: 'Constitution', value: 0 },
            { label: 'Agility', value: 0 },
            { label: 'Technique', value: 0 },
            { label: 'Defense', value: 0 },
            { label: 'Charisma', value: 0 }
        ]
    },
    basic: '',
    physical: '',
    personality: '',
    sexuality: '',
    fightingStyle: '',
    background: '',
    equipment: '',
    items: [],
    skills: [],
    hobbies: '',
    quirks: '',
    relationships: '',
    notes: '',
    gallery: []
});

const DEFAULT_EVENT = Object.freeze({
    title: '',
    type: 'rising',
    timing: '',
    notes: '',
    image: '',
    background: '',
    visible: true
});

function textValue(id) {
    return document.getElementById(id)?.value?.trim() || '';
}

function trimStringFields(value) {
    for (const [key, child] of Object.entries(value || {})) {
        if (typeof child === 'string') value[key] = child.trim();
    }
    return value;
}

function cleanStringArray(value) {
    return Array.isArray(value)
        ? value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim())
        : [];
}

function applyMissingDefaults(target, defaults) {
    for (const [key, value] of Object.entries(defaults)) {
        if (target[key] === undefined) target[key] = structuredClone(value);
    }
}

function cleanEvent(event) {
    applyMissingDefaults(event, DEFAULT_EVENT);
    trimStringFields(event);
    return event;
}

function cleanPlan(plan) {
    trimStringFields(plan);
    plan.characterTags = cleanStringArray(plan.characterTags);
    plan.events = Array.isArray(plan.events)
        ? plan.events.filter(event => event?.title?.trim()).map(cleanEvent)
        : [];
    plan.subArcs = Array.isArray(plan.subArcs)
        ? plan.subArcs.filter(subArc => subArc?.title?.trim()).map(subArc => {
            applyMissingDefaults(subArc, {
                title: '',
                description: '',
                characterTags: [],
                visible: true,
                events: []
            });
            trimStringFields(subArc);
            subArc.characterTags = cleanStringArray(subArc.characterTags);
            subArc.events = Array.isArray(subArc.events)
                ? subArc.events.filter(event => event?.title?.trim()).map(cleanEvent)
                : [];
            return subArc;
        })
        : [];
    return plan;
}

export function createProjectFormAdapter(dependencies) {
    function cleanupData() {
        const infoData = dependencies.getInfoData();
        trimStringFields(infoData.basic);

        infoData.characters = (infoData.characters || [])
            .filter(character => character?.name?.trim())
            .map(character => {
                applyMissingDefaults(character, DEFAULT_CHARACTER);
                trimStringFields(character);
                for (const key of ['tags', 'items', 'skills', 'gallery']) {
                    character[key] = cleanStringArray(character[key]);
                }
                return character;
            });

        infoData.storylines = (infoData.storylines || [])
            .filter(storyline => storyline?.title?.trim())
            .map(storyline => {
                trimStringFields(storyline);
                storyline.tags = cleanStringArray(storyline.tags);
                return storyline;
            });
        infoData.plans = (infoData.plans || []).filter(plan => plan?.title?.trim()).map(cleanPlan);

        for (const category of Object.keys(infoData.world || {})) {
            infoData.world[category] = (infoData.world[category] || [])
                .filter(item => item?.name?.trim())
                .map(item => {
                    if (item.hidden === undefined) item.hidden = false;
                    return trimStringFields(item);
                });
        }
        return infoData;
    }

    function collectTitleSettings(basic) {
        const current = basic.titleSettings || {};
        basic.titleSettings = {
            ...current,
            show: document.getElementById('world-title-visibility')?.checked ?? current.show ?? true,
            alignment: document.getElementById('world-title-alignment')?.value || current.alignment || 'left',
            position: document.getElementById('world-title-position')?.value || current.position || 'bottom',
            font: document.getElementById('world-title-font')?.value || current.font || 'theme',
            color: textValue('world-title-color') || current.color || ''
        };
    }

    function cleanCustomNavigation(basic) {
        basic.customNavLinks = Array.isArray(basic.customNavLinks)
            ? basic.customNavLinks.filter(link => link?.label?.trim() && link?.url?.trim()).map(link => ({
                ...link,
                label: link.label.trim(),
                url: link.url.trim(),
                color: link.color || '#B1B695',
                fontColor: link.fontColor || '#ffffff'
            }))
            : [];
        if (!basic.customNavSettings || typeof basic.customNavSettings !== 'object') {
            basic.customNavSettings = { location: null, alignment: null, spacing: null, position: null };
        }
    }

    function collectFormData() {
        const infoData = dependencies.getInfoData();
        if (!infoData.basic) infoData.basic = {};
        if (!infoData.appearance) infoData.appearance = {};

        for (const [field, id] of Object.entries(BASIC_TEXT_FIELDS)) infoData.basic[field] = textValue(id);
        infoData.basic.overviewContentOpacity = parseInt(document.getElementById('overview-content-opacity')?.value || 100);
        infoData.basic.overviewContentBlur = parseInt(document.getElementById('overview-content-blur')?.value || 0);
        collectTitleSettings(infoData.basic);
        cleanCustomNavigation(infoData.basic);

        infoData.basic.includedPages = {
            world: document.getElementById('include-world')?.checked ?? true,
            characters: document.getElementById('include-characters')?.checked ?? true,
            storylines: document.getElementById('include-storylines')?.checked ?? true,
            plans: document.getElementById('include-plans')?.checked ?? true,
            playlists: document.getElementById('include-playlists')?.checked ?? true
        };

        for (const [field, id] of Object.entries(APPEARANCE_FIELDS)) {
            const control = document.getElementById(id);
            if (control) infoData.appearance[field] = control.value;
        }

        if (!Array.isArray(infoData.playlists)) infoData.playlists = [];
        if (!Array.isArray(infoData.customPages)) infoData.customPages = [];
        infoData.linkedLorebook ||= null;
        return cleanupData();
    }

    return { cleanupData, collectFormData };
}
