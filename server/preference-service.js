const PREFERENCE_SCHEMA_VERSION = 1;

const SECTION_DEFAULTS = Object.freeze({
    application: Object.freeze({
        autoSave: true,
        defaultTemplate: 'generated.css',
        notifications: true
    }),
    appearance: Object.freeze({
        theme: 'default',
        markdownTheme: 'nord',
        markdownFontSize: 14
    }),
    ai: Object.freeze({
        aiToolsEnabled: false
    }),
    sites: Object.freeze({
        favorites: Object.freeze([]),
        tags: Object.freeze({})
    })
});

const FIELD_TO_SECTION = Object.freeze(Object.fromEntries(
    Object.entries(SECTION_DEFAULTS).flatMap(([section, defaults]) => (
        Object.keys(defaults).map(field => [field, section])
    ))
));

class PreferenceError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createDefaultPreferences() {
    return {
        schemaVersion: PREFERENCE_SCHEMA_VERSION,
        sections: clone(SECTION_DEFAULTS)
    };
}

function validateString(value, field, maxLength = 200) {
    if (typeof value !== 'string' || value.length < 1 || value.length > maxLength) {
        throw new PreferenceError(`${field} must be a non-empty string up to ${maxLength} characters`);
    }
    return value;
}

function validateStringArray(value, field, maxItems = 2000) {
    if (!Array.isArray(value) || value.length > maxItems) {
        throw new PreferenceError(`${field} must be an array with at most ${maxItems} items`);
    }
    return value.map((item, index) => validateString(item, `${field}[${index}]`));
}

function validateSectionPatch(section, changes) {
    if (!Object.hasOwn(SECTION_DEFAULTS, section)) {
        throw new PreferenceError(`Unknown preference section: ${section}`);
    }
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
        throw new PreferenceError('Preference changes must be an object');
    }

    const allowed = SECTION_DEFAULTS[section];
    const result = {};
    for (const [key, value] of Object.entries(changes)) {
        if (!Object.hasOwn(allowed, key)) {
            throw new PreferenceError(`Unknown ${section} preference: ${key}`);
        }
        if (['autoSave', 'notifications', 'aiToolsEnabled'].includes(key)) {
            if (typeof value !== 'boolean') throw new PreferenceError(`${key} must be a boolean`);
            result[key] = value;
        } else if (key === 'markdownFontSize') {
            if (!Number.isInteger(value) || value < 10 || value > 24) {
                throw new PreferenceError('markdownFontSize must be an integer from 10 to 24');
            }
            result[key] = value;
        } else if (key === 'favorites') {
            result[key] = validateStringArray(value, key);
        } else if (key === 'tags') {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                throw new PreferenceError('tags must be an object');
            }
            if (Object.keys(value).length > 2000) throw new PreferenceError('tags has too many projects');
            result[key] = Object.fromEntries(Object.entries(value).map(([project, tags]) => [
                validateString(project, 'tags project key'),
                validateStringArray(tags, `tags.${project}`, 50)
            ]));
        } else {
            result[key] = validateString(value, key);
        }
    }
    return result;
}

function reconcilePreferences(canonical, accountSettings = {}, legacyFile = {}) {
    if (canonical?.schemaVersion === PREFERENCE_SCHEMA_VERSION && canonical.sections) {
        const preferences = createDefaultPreferences();
        for (const section of Object.keys(SECTION_DEFAULTS)) {
            const existing = canonical.sections[section] || {};
            preferences.sections[section] = {
                ...preferences.sections[section],
                ...validateSectionPatch(section, existing)
            };
        }
        return { preferences, report: { performed: false, schemaVersion: PREFERENCE_SCHEMA_VERSION } };
    }

    const preferences = createDefaultPreferences();
    const sources = {};
    const legacySources = [
        ['account-settings', accountSettings || {}],
        ['settings/preferences.json', legacyFile || {}]
    ];
    for (const [field, section] of Object.entries(FIELD_TO_SECTION)) {
        for (const [sourceName, source] of legacySources) {
            if (!Object.hasOwn(source, field)) continue;
            try {
                preferences.sections[section] = {
                    ...preferences.sections[section],
                    ...validateSectionPatch(section, { [field]: source[field] })
                };
                sources[field] = sourceName;
                break;
            } catch {
                sources[field] = `${sourceName}:invalid`;
            }
        }
    }

    const knownFields = new Set(Object.keys(FIELD_TO_SECTION));
    const ignoredKeys = [...new Set(legacySources.flatMap(([, source]) => (
        Object.keys(source).filter(key => !knownFields.has(key) && key !== 'schemaVersion')
    )))];
    return {
        preferences,
        report: {
            performed: true,
            schemaVersion: PREFERENCE_SCHEMA_VERSION,
            precedence: ['canonical', 'account-settings', 'settings/preferences.json', 'defaults'],
            sources,
            ignoredKeys
        }
    };
}

function flattenPreferences(preferences) {
    return {
        schemaVersion: preferences.schemaVersion,
        ...preferences.sections.application,
        ...preferences.sections.appearance,
        ...preferences.sections.ai,
        ...preferences.sections.sites
    };
}

class PreferenceService {
    constructor(options) {
        this.loadAccounts = options.loadAccounts;
        this.saveAccounts = options.saveAccounts;
        this.loadLegacyPreferences = options.loadLegacyPreferences || (async () => ({}));
        this.guestPreferences = new Map();
        this.writeChain = Promise.resolve();
    }

    async get(userContext, sessionToken) {
        if (userContext.isGuest) {
            const preferences = this.getGuest(sessionToken);
            return this.result(preferences, { performed: false, guestLifetime: 'toolkit-session' });
        }
        return this.getSignedIn(userContext);
    }

    async patch(userContext, sessionToken, section, changes) {
        const validated = validateSectionPatch(section, changes);
        if (userContext.isGuest) {
            const preferences = this.getGuest(sessionToken);
            preferences.sections[section] = { ...preferences.sections[section], ...validated };
            return this.result(preferences, { performed: false, guestLifetime: 'toolkit-session' });
        }

        return this.serialize(async () => {
            const accounts = await this.loadAccounts();
            const user = accounts[userContext.userId];
            if (!user) throw new PreferenceError('User not found', 404);
            const legacy = await this.loadLegacyPreferences(userContext);
            const reconciled = reconcilePreferences(user.preferences, user.settings, legacy);
            reconciled.preferences.sections[section] = {
                ...reconciled.preferences.sections[section],
                ...validated
            };
            user.preferences = reconciled.preferences;
            if (reconciled.report.performed) user.preferenceMigration = reconciled.report;
            accounts[user.id] = user;
            if (!await this.saveAccounts(accounts)) throw new PreferenceError('Failed to save preferences', 500);
            return this.result(user.preferences, reconciled.report);
        });
    }

    async patchLegacy(userContext, sessionToken, changes) {
        const patches = new Map();
        for (const [field, value] of Object.entries(changes || {})) {
            const section = FIELD_TO_SECTION[field];
            if (!section) throw new PreferenceError(`Unknown preference: ${field}`);
            patches.set(section, { ...(patches.get(section) || {}), [field]: value });
        }
        let result = await this.get(userContext, sessionToken);
        for (const [section, sectionChanges] of patches) {
            result = await this.patch(userContext, sessionToken, section, sectionChanges);
        }
        return result;
    }

    clearGuest(sessionToken) {
        if (sessionToken) this.guestPreferences.delete(sessionToken);
    }

    getGuest(sessionToken) {
        if (!sessionToken) throw new PreferenceError('Toolkit session required', 401);
        if (!this.guestPreferences.has(sessionToken)) {
            this.guestPreferences.set(sessionToken, createDefaultPreferences());
        }
        return this.guestPreferences.get(sessionToken);
    }

    async getSignedIn(userContext) {
        const accounts = await this.loadAccounts();
        const user = accounts[userContext.userId];
        if (!user) throw new PreferenceError('User not found', 404);
        const legacy = await this.loadLegacyPreferences(userContext);
        const reconciled = reconcilePreferences(user.preferences, user.settings, legacy);
        if (reconciled.report.performed) {
            user.preferences = reconciled.preferences;
            user.preferenceMigration = reconciled.report;
            accounts[user.id] = user;
            if (!await this.saveAccounts(accounts)) throw new PreferenceError('Failed to initialize preferences', 500);
        }
        return this.result(reconciled.preferences, reconciled.report);
    }

    result(preferences, migrationReport) {
        return {
            schemaVersion: PREFERENCE_SCHEMA_VERSION,
            sections: clone(preferences.sections),
            preferences: flattenPreferences(preferences),
            migrationReport
        };
    }

    serialize(operation) {
        const result = this.writeChain.then(operation, operation);
        this.writeChain = result.catch(() => {});
        return result;
    }
}

module.exports = {
    FIELD_TO_SECTION,
    PREFERENCE_SCHEMA_VERSION,
    PreferenceError,
    PreferenceService,
    SECTION_DEFAULTS,
    createDefaultPreferences,
    flattenPreferences,
    reconcilePreferences,
    validateSectionPatch
};
