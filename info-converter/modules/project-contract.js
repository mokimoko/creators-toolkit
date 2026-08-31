'use strict';

const LoreGenerationSecurity = typeof module !== 'undefined' && module.exports
    ? require('./generation-security')
    : window.LoreGenerationSecurity;

const CURRENT_SCHEMA_VERSION = 1;

const WORLD_CATEGORIES = Object.freeze([
    'locations',
    'concepts',
    'events',
    'creatures',
    'plants',
    'items',
    'factions',
    'culture',
    'cultivation',
    'magic',
    'general'
]);

const APPEARANCE_FIELDS = Object.freeze([
    'template',
    'bannerStyle',
    'overviewStyle',
    'navigationStyle',
    'colorScheme',
    'fontSet',
    'bannerSize',
    'worldCategoriesHeader',
    'pageHeader',
    'cardStyle',
    'containerStyle',
    'subcontainerStyle',
    'infodisplayStyle',
    'siteWidth',
    'buttonStyle',
    'customNavButtonStyle',
    'backToTopStyle',
    'backgroundStyle',
    'backgroundColorOverlay',
    'storylineStyle',
    'customColorOverrides'
]);

const DEFAULT_BASIC = Object.freeze({
    title: '',
    subtitle: '',
    banner: '',
    overviewTitle: '',
    overview: '',
    overviewImage: '',
    overviewLinks: [],
    overviewLinksAlignment: 'left',
    overviewLinksSpacing: 'normal',
    customNavLinks: [],
    customNavSettings: {},
    includedPages: [],
    backgroundColor: '',
    backgroundImage: '',
    overviewContentBgImage: '',
    overviewContentBgColor: '',
    overviewContentOpacity: 100,
    overviewContentBlur: 0,
    mainContainerColor: '',
    mainContainerBgImage: '',
    mainContainerBgColor: '',
    mainContainerOpacity: 100,
    mainContainerBlur: 0,
    modalBgColor: '',
    modalBgImage: '',
    titleSettings: {
        show: true,
        position: 'left',
        font: 'theme',
        color: ''
    }
});

const DEFAULT_APPEARANCE = Object.freeze({
    template: 'journal',
    bannerStyle: 'none',
    overviewStyle: 'journal',
    navigationStyle: 'journal',
    colorScheme: 'current',
    fontSet: 'serif',
    bannerSize: 'large',
    worldCategoriesHeader: 'default',
    pageHeader: 'standard',
    cardStyle: 'current',
    containerStyle: 'left-border',
    subcontainerStyle: 'soft-bg',
    infodisplayStyle: 'default',
    siteWidth: 'standard',
    buttonStyle: 'rounded',
    customNavButtonStyle: 'rounded',
    backToTopStyle: 'circular',
    backgroundStyle: 'default',
    backgroundColorOverlay: '',
    storylineStyle: 'default',
    customColorOverrides: {}
});

const DEFAULT_OPTIONS = Object.freeze({
    storylines: {
        showTOC: true,
        showSections: true,
        showSubsections: true
    },
    characters: {
        showByFaction: true,
        showInfoDisplay: false
    },
    events: { customLabel: 'Events' },
    culture: { customLabel: 'Culture' },
    cultivation: { customLabel: 'Cultivation' },
    magic: { customLabel: 'Magic' },
    plans: { selectedTimeSystemId: 'default' }
});

const KNOWN_TOP_LEVEL_FIELDS = new Set([
    'schemaVersion',
    'generatorVersion',
    'basic',
    'appearance',
    'characters',
    'storylines',
    'plans',
    'playlists',
    'world',
    'customPages',
    'options',
    'integrations',
    'extensions',
    'storylinesOptions',
    'charactersOptions',
    'eventsOptions',
    'cultureOptions',
    'cultivationOptions',
    'magicOptions',
    'plansOptions',
    'linkedLorebook'
]);

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (!isRecord(value)) return value;

    const clone = {};
    for (const [key, child] of Object.entries(value)) clone[key] = cloneValue(child);
    return clone;
}

function mergeDefaults(defaults, value) {
    if (!isRecord(value)) return cloneValue(defaults);

    const merged = cloneValue(value);
    for (const [key, defaultValue] of Object.entries(defaults)) {
        if (!(key in merged)) {
            merged[key] = cloneValue(defaultValue);
        } else if (isRecord(defaultValue) && isRecord(merged[key])) {
            merged[key] = mergeDefaults(defaultValue, merged[key]);
        }
    }
    return merged;
}

function arrayOrEmpty(value) {
    return Array.isArray(value) ? cloneValue(value) : [];
}

function normalizeWorld(value) {
    const world = isRecord(value) ? cloneValue(value) : {};
    for (const category of WORLD_CATEGORIES) {
        if (!Array.isArray(world[category])) world[category] = [];
    }
    return world;
}

function normalizeOptions(source) {
    const modern = isRecord(source.options) ? source.options : {};
    return {
        storylines: mergeDefaults(DEFAULT_OPTIONS.storylines, modern.storylines || source.storylinesOptions),
        characters: mergeDefaults(DEFAULT_OPTIONS.characters, modern.characters || source.charactersOptions),
        events: mergeDefaults(DEFAULT_OPTIONS.events, modern.events || source.eventsOptions),
        culture: mergeDefaults(DEFAULT_OPTIONS.culture, modern.culture || source.cultureOptions),
        cultivation: mergeDefaults(DEFAULT_OPTIONS.cultivation, modern.cultivation || source.cultivationOptions),
        magic: mergeDefaults(DEFAULT_OPTIONS.magic, modern.magic || source.magicOptions),
        plans: mergeDefaults(DEFAULT_OPTIONS.plans, modern.plans || source.plansOptions)
    };
}

function collectLegacyExtensions(source) {
    const extensions = isRecord(source.extensions) ? cloneValue(source.extensions) : {};
    const legacyTopLevel = isRecord(extensions.legacyTopLevel)
        ? cloneValue(extensions.legacyTopLevel)
        : {};

    for (const [key, value] of Object.entries(source)) {
        if (!KNOWN_TOP_LEVEL_FIELDS.has(key)) legacyTopLevel[key] = cloneValue(value);
    }

    if (Object.keys(legacyTopLevel).length > 0) extensions.legacyTopLevel = legacyTopLevel;
    return extensions;
}

function normalizeLoreProject(value) {
    const source = isRecord(value) ? value : {};
    const options = normalizeOptions(source);
    const modernIntegrations = isRecord(source.integrations) ? source.integrations : {};
    const linkedLorebook = Object.prototype.hasOwnProperty.call(modernIntegrations, 'linkedLorebook')
        ? cloneValue(modernIntegrations.linkedLorebook)
        : cloneValue(source.linkedLorebook || null);
    const timeSystemId = modernIntegrations.timeSystemId
        || options.plans.selectedTimeSystemId
        || 'default';

    options.plans.selectedTimeSystemId = timeSystemId;

    return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        generatorVersion: typeof source.generatorVersion === 'string'
            ? source.generatorVersion
            : 'legacy-unversioned',
        basic: mergeDefaults(DEFAULT_BASIC, source.basic),
        appearance: mergeDefaults(DEFAULT_APPEARANCE, source.appearance),
        characters: arrayOrEmpty(source.characters),
        storylines: arrayOrEmpty(source.storylines),
        plans: arrayOrEmpty(source.plans),
        playlists: arrayOrEmpty(source.playlists),
        world: normalizeWorld(source.world),
        customPages: arrayOrEmpty(source.customPages),
        options,
        integrations: {
            linkedLorebook,
            timeSystemId
        },
        extensions: collectLegacyExtensions(source)
    };
}

function migrateLoreProjectV0ToV1(value) {
    return normalizeLoreProject({ ...cloneValue(value), schemaVersion: CURRENT_SCHEMA_VERSION });
}

const LORE_PROJECT_MIGRATIONS = Object.freeze({
    0: migrateLoreProjectV0ToV1
});

function migrateLoreProject(value, options = {}) {
    const source = isRecord(value) ? cloneValue(value) : {};
    const sourceVersion = source.schemaVersion === undefined ? 0 : source.schemaVersion;
    if (!Number.isInteger(sourceVersion) || sourceVersion < 0) {
        throw new Error('Lore project schemaVersion must be a non-negative integer');
    }
    if (sourceVersion > CURRENT_SCHEMA_VERSION) {
        throw new Error(`Lore project schemaVersion ${sourceVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}`);
    }

    const report = {
        sourceVersion,
        targetVersion: CURRENT_SCHEMA_VERSION,
        steps: [],
        defaultsUsed: [],
        warnings: [],
        unrecoverableFields: []
    };
    const blockAlternatives = {
        basic: ['basic'],
        appearance: ['appearance'],
        characters: ['characters'],
        storylines: ['storylines'],
        plans: ['plans'],
        playlists: ['playlists'],
        world: ['world'],
        customPages: ['customPages'],
        options: [
            'options', 'storylinesOptions', 'charactersOptions', 'eventsOptions',
            'cultureOptions', 'cultivationOptions', 'magicOptions', 'plansOptions'
        ],
        integrations: ['integrations', 'linkedLorebook', 'plansOptions']
    };
    for (const [block, alternatives] of Object.entries(blockAlternatives)) {
        if (!alternatives.some(key => Object.prototype.hasOwnProperty.call(source, key))) {
            report.defaultsUsed.push(block);
        }
    }

    let project = source;
    let version = sourceVersion;
    while (version < CURRENT_SCHEMA_VERSION) {
        const migration = LORE_PROJECT_MIGRATIONS[version];
        if (!migration) throw new Error(`No Lore project migration is available from schemaVersion ${version}`);
        project = migration(project);
        report.steps.push(`${version}->${version + 1}`);
        version += 1;
    }
    project = normalizeLoreProject(project);

    if (Array.isArray(options.availableTimeSystemIds)) {
        const available = new Set(['default', 'preset-chinese', ...options.availableTimeSystemIds]);
        if (!available.has(project.integrations.timeSystemId)) {
            report.warnings.push(`Selected time system "${project.integrations.timeSystemId}" is not currently available`);
        }
    }

    return { project, report };
}

const PRIVATE_PUBLIC_KEYS = new Set([
    'notes',
    'authornotes',
    'privatenotes',
    'developmentnotes',
    'linkedlorebook',
    'editorstate',
    'repository',
    'repositorypath',
    'githubsync',
    'usercontext',
    'accountcontext',
    'sourcedata',
    'importsource',
    'localpath',
    'projectconfig'
]);

const OMIT_PUBLIC_VALUE = Symbol('omit-public-value');

function normalizedKey(key) {
    return String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function sanitizePublicValue(value) {
    if (Array.isArray(value)) {
        return value
            .map(sanitizePublicValue)
            .filter(child => child !== OMIT_PUBLIC_VALUE);
    }
    if (!isRecord(value)) return cloneValue(value);
    if (value.hidden === true || value.isHidden === true) return OMIT_PUBLIC_VALUE;

    const publicValue = {};
    for (const [key, child] of Object.entries(value)) {
        const keyName = normalizedKey(key);
        if (keyName === 'hidden' || keyName === 'ishidden' || PRIVATE_PUBLIC_KEYS.has(keyName)) continue;
        const sanitizedChild = sanitizePublicValue(child);
        if (sanitizedChild !== OMIT_PUBLIC_VALUE) publicValue[key] = sanitizedChild;
    }
    return publicValue;
}

function publicArray(value) {
    const sanitized = sanitizePublicValue(value);
    return Array.isArray(sanitized) ? sanitized : [];
}

function createLorePublicSite(value) {
    const project = normalizeLoreProject(value);
    const hiddenCustomPageIds = new Set(
        project.customPages
            .filter(page => isRecord(page) && (page.hidden === true || page.isHidden === true))
            .map(page => String(page.id || ''))
            .filter(Boolean)
    );
    const basic = sanitizePublicValue(project.basic);

    if (Array.isArray(basic.includedPages)) {
        basic.includedPages = basic.includedPages.filter(pageId => !hiddenCustomPageIds.has(String(pageId)));
    }
    if (Array.isArray(basic.customNavLinks)) {
        basic.customNavLinks = basic.customNavLinks.filter(link => {
            if (!isRecord(link)) return true;
            const target = String(link.target || link.pageId || '').replace(/^#/, '');
            return !hiddenCustomPageIds.has(target);
        });
    }

    return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        generatorVersion: project.generatorVersion,
        basic,
        appearance: sanitizePublicValue(project.appearance),
        characters: publicArray(project.characters),
        storylines: publicArray(project.storylines),
        storylinesOptions: sanitizePublicValue(project.options.storylines),
        charactersOptions: sanitizePublicValue(project.options.characters),
        eventsOptions: sanitizePublicValue(project.options.events),
        cultureOptions: sanitizePublicValue(project.options.culture),
        cultivationOptions: sanitizePublicValue(project.options.cultivation),
        magicOptions: sanitizePublicValue(project.options.magic),
        plans: publicArray(project.plans),
        plansOptions: sanitizePublicValue(project.options.plans),
        playlists: publicArray(project.playlists),
        customPages: publicArray(project.customPages),
        world: sanitizePublicValue(project.world)
    };
}

function toLegacyInfoData(value) {
    const project = normalizeLoreProject(value);
    return {
        ...cloneValue(project.extensions.legacyTopLevel || {}),
        basic: cloneValue(project.basic),
        appearance: cloneValue(project.appearance),
        characters: cloneValue(project.characters),
        storylines: cloneValue(project.storylines),
        storylinesOptions: cloneValue(project.options.storylines),
        charactersOptions: cloneValue(project.options.characters),
        eventsOptions: cloneValue(project.options.events),
        cultureOptions: cloneValue(project.options.culture),
        cultivationOptions: cloneValue(project.options.cultivation),
        magicOptions: cloneValue(project.options.magic),
        plans: cloneValue(project.plans),
        plansOptions: cloneValue(project.options.plans),
        playlists: cloneValue(project.playlists),
        customPages: cloneValue(project.customPages),
        world: cloneValue(project.world),
        linkedLorebook: cloneValue(project.integrations.linkedLorebook)
    };
}

function serializeJsonForHtml(value) {
    return LoreGenerationSecurity.serializeJsonForHtml(value);
}

function serializeEditableProjectData(value) {
    return serializeJsonForHtml(normalizeLoreProject(value));
}

function normalizePublicFileReference(value) {
    if (typeof value !== 'string') return null;
    let candidate = value.trim().replace(/\\/g, '/');
    if (!candidate || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(candidate)) return null;
    candidate = candidate.split(/[?#]/, 1)[0].replace(/^\.\//, '');
    if (!candidate || /[<>"'{}\r\n]/.test(candidate)) return null;
    const segments = candidate.split('/');
    if (segments.some(segment => !segment || segment === '.' || segment === '..')) return null;
    if (!/\.(?:html?|css|js|json|png|jpe?g|webp|gif|avif|bmp|svg|ico|woff2?|ttf|otf)$/i.test(candidate)) return null;
    if (/^(?:project-config\.json|lore-project\.json)$/i.test(candidate)) return null;
    if (/^assets\/lorebook\//i.test(candidate)) return null;
    return candidate;
}

function buildPublicFileManifest(html, publicSite, styleAssets, filename) {
    const files = new Set();
    const add = value => {
        const normalized = normalizePublicFileReference(value);
        if (normalized) files.add(normalized);
    };

    let htmlFilename = filename || 'info';
    if (!htmlFilename.toLowerCase().endsWith('.html')) htmlFilename += '.html';
    add(htmlFilename);

    const referencePattern = /(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/gi;
    let match;
    while ((match = referencePattern.exec(html || ''))) add(match[1] || match[2]);

    function collect(value) {
        if (Array.isArray(value)) {
            value.forEach(collect);
        } else if (value && typeof value === 'object') {
            Object.values(value).forEach(collect);
        } else {
            add(value);
        }
    }
    collect(publicSite);
    (styleAssets || []).forEach(asset => add(asset.destination));
    return [...files].sort();
}

function summarizePublicProjection(value) {
    const project = normalizeLoreProject(value);
    const summary = {
        hiddenObjectsRemoved: 0,
        noteFieldsRemoved: 0,
        linkedLorebookRemoved: Boolean(project.integrations.linkedLorebook),
        compatibilityExtensionFieldsRemoved: Object.keys(project.extensions.legacyTopLevel || {}).length
    };

    function inspect(child) {
        if (Array.isArray(child)) {
            child.forEach(inspect);
            return;
        }
        if (!isRecord(child)) return;
        if (child.hidden === true || child.isHidden === true) summary.hiddenObjectsRemoved += 1;
        for (const [key, nested] of Object.entries(child)) {
            if (normalizedKey(key) === 'notes' && typeof nested === 'string' && nested.trim()) {
                summary.noteFieldsRemoved += 1;
            }
            inspect(nested);
        }
    }

    inspect(project);
    return summary;
}

function validateLoreProject(project) {
    const errors = [];
    if (!isRecord(project)) return ['project must be an object'];
    if (project.schemaVersion !== CURRENT_SCHEMA_VERSION) errors.push('schemaVersion must be 1');

    for (const key of ['basic', 'appearance', 'world', 'options', 'integrations', 'extensions']) {
        if (!isRecord(project[key])) errors.push(`${key} must be an object`);
    }
    for (const key of ['characters', 'storylines', 'plans', 'playlists', 'customPages']) {
        if (!Array.isArray(project[key])) errors.push(`${key} must be an array`);
    }
    for (const category of WORLD_CATEGORIES) {
        if (!Array.isArray(project.world?.[category])) errors.push(`world.${category} must be an array`);
    }
    for (const field of APPEARANCE_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(project.appearance || {}, field)) {
            errors.push(`appearance.${field} is missing`);
        }
    }
    if (typeof project.basic?.title !== 'string') errors.push('basic.title must be a string');
    if (typeof project.basic?.subtitle !== 'string') errors.push('basic.subtitle must be a string');
    if (typeof project.integrations?.timeSystemId !== 'string') {
        errors.push('integrations.timeSystemId must be a string');
    }
    return errors;
}

const api = {
    APPEARANCE_FIELDS,
    buildPublicFileManifest,
    CURRENT_SCHEMA_VERSION,
    DEFAULT_APPEARANCE,
    DEFAULT_BASIC,
    DEFAULT_OPTIONS,
    WORLD_CATEGORIES,
    createLorePublicSite,
    migrateLoreProject,
    migrateLoreProjectV0ToV1,
    normalizeLoreProject,
    normalizePublicFileReference,
    serializeEditableProjectData,
    serializeJsonForHtml,
    summarizePublicProjection,
    toLegacyInfoData,
    validateLoreProject
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.LoreProjectContract = api;
