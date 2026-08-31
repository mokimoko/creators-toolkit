(function initSchemaMigrations(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root?.RPArchiver) root.RPArchiver.define('schemaMigrations', api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSchemaMigrationAPI() {
    'use strict';

    const LEGACY_PART_MARKER = '&&&PART&&&';

    const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;
    const array = value => Array.isArray(value) ? value : [];
    const cloneJson = value => JSON.parse(JSON.stringify(value));

    function sourceTextFromEntries(entries) {
        return array(entries).map(entry => {
            if (entry?.type !== 'character') return '';
            const prefix = entry.character ? `${entry.character}: ` : '';
            return prefix + array(entry.paragraphs).join('\n\n');
        }).filter(Boolean).join('\n\n');
    }

    function splitLegacySourceText(sourceText) {
        const normalized = text(sourceText).replace(/\r\n?/g, '\n');
        const parts = [''];
        normalized.split('\n').forEach(line => {
            if (line.trim() === LEGACY_PART_MARKER) {
                parts.push('');
                return;
            }
            const index = parts.length - 1;
            parts[index] += `${parts[index] ? '\n' : ''}${line}`;
        });
        return parts.map(part => part.replace(/^\n+|\n+$/g, ''));
    }

    function migrateV0ToV1(project) {
        const migrated = {
            ...project,
            schemaVersion: 1,
            editor: project.editor || {
                sourceText: text(project.sourceText),
                singleStory: false,
                usePartMarkers: true,
                noCharacters: false
            }
        };
        delete migrated.sourceText;
        return migrated;
    }

    function migrateV1ToV2(project) {
        const existingParts = array(project.parts);
        const sourceParts = splitLegacySourceText(project.editor?.sourceText || '');
        const hasSourceMarkers = sourceParts.length > 1;
        const partCount = Math.max(
            existingParts.length,
            hasSourceMarkers ? sourceParts.length : 0,
            project.editor?.sourceText ? 1 : 0
        );

        return {
            ...project,
            schemaVersion: 2,
            parts: Array.from({ length: partCount }, (_, index) => {
                const existing = existingParts[index] || {};
                let sourceText = sourceTextFromEntries(existing.entries);
                if (hasSourceMarkers || (index === 0 && project.editor?.sourceText)) {
                    sourceText = sourceParts[index] ?? sourceText;
                }
                return {
                    ...existing,
                    id: text(existing.id, `part-${index + 1}`),
                    title: text(existing.title, `Part ${index + 1}`),
                    sourceText
                };
            }),
            editor: {
                ...(project.editor || {}),
                usePartMarkers: false
            }
        };
    }

    const MIGRATORS = new Map([
        [0, migrateV0ToV1],
        [1, migrateV1ToV2]
    ]);

    function migrateProject(input, currentSchemaVersion = 2) {
        let project = cloneJson(input);
        let version = Number(project.schemaVersion);
        if (!Number.isInteger(version) || version < 0) {
            throw new Error('RP project data has an invalid schemaVersion');
        }
        if (version > currentSchemaVersion) {
            throw new Error(`RP project schema ${version} is newer than supported schema ${currentSchemaVersion}`);
        }

        while (version < currentSchemaVersion) {
            const migrate = MIGRATORS.get(version);
            if (!migrate) throw new Error(`No RP project migration exists for schema ${version}`);
            project = migrate(project);
            version = Number(project.schemaVersion);
        }
        return project;
    }

    return { migrateProject, migrateV0ToV1, migrateV1ToV2 };
});
