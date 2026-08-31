(function initRPProjectData(root, factory) {
    const migrations = typeof module === 'object' && module.exports
        ? require('./schema-migrations.js')
        : root.RPArchiver.get('schemaMigrations');
    const api = factory(migrations);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root?.RPArchiver) root.RPArchiver.define('projectData', api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRPProjectDataAPI(schemaMigrations) {
    'use strict';

    const CURRENT_SCHEMA_VERSION = 2;
    const PROJECT_DATA_ID = 'rp-archiver-project-data';
    const LEGACY_PART_MARKER = '&&&PART&&&';

    function text(value, fallback = '') {
        return typeof value === 'string' ? value : fallback;
    }

    function bool(value, fallback = false) {
        return typeof value === 'boolean' ? value : fallback;
    }

    function array(value) {
        return Array.isArray(value) ? value : [];
    }

    function cloneJson(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function createDefaultProject() {
        return {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            generatorVersion: 'modernization-phase-4',
            story: {
                title: '',
                subtitle: '',
                description: '',
                universe: '',
                pairing: '',
                updated: '',
                status: 'Ongoing'
            },
            characters: [],
            parts: [],
            editor: {
                sourceText: '',
                singleStory: false,
                usePartMarkers: false,
                noCharacters: false,
                allowRawHtml: false
            },
            media: {
                background: '',
                banner: '',
                storyImages: []
            },
            soundtrack: [],
            navigation: [],
            glossary: [],
            glossaryOptions: {
                firstOnly: false,
                showTooltips: false,
                showSection: true
            },
            comments: [],
            readThrough: {
                enabled: false,
                documentId: '',
                hostedUrl: '',
                endpoint: '/api/read-through/comments',
                cachedThreads: []
            },
            appearance: {
                template: 'generated.css',
                backgroundOpacity: 20,
                backgroundBlur: 5,
                banner: {
                    size: 'medium',
                    showTitle: true,
                    showSubtitle: true,
                    titleFontSize: 32,
                    titleColor: '#ffffff',
                    subtitleColor: '#cccccc'
                }
            }
        };
    }

    function normalizeEntry(entry) {
        if (!entry || typeof entry !== 'object') return null;
        if (entry.type === 'partBreak') {
            return { type: 'partBreak', partIndex: Number.isInteger(entry.partIndex) ? entry.partIndex : 0 };
        }
        if (entry.type !== 'character') return null;
        return {
            type: 'character',
            character: text(entry.character),
            characterId: text(entry.characterId),
            paragraphs: array(entry.paragraphs).map(item => text(item))
        };
    }

    function normalizeOrderedItems(items, itemType) {
        return array(items).map(item => {
            if (!item || typeof item !== 'object') return null;
            if (item.type === 'heading') return { type: 'heading', title: text(item.title) };
            if (itemType === 'soundtrack' && item.type === 'track') {
                return { type: 'track', name: text(item.name), url: text(item.url) };
            }
            if (itemType === 'comments' && item.type === 'comment') {
                return { type: 'comment', text: text(item.text) };
            }
            return null;
        }).filter(Boolean);
    }

    function normalizeProject(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw new TypeError('RP project data must be an object');
        }

        const migrated = schemaMigrations.migrateProject(input, CURRENT_SCHEMA_VERSION);
        const defaults = createDefaultProject();
        const story = migrated.story || {};
        const editor = migrated.editor || {};
        const media = migrated.media || {};
        const readThrough = migrated.readThrough || {};
        const appearance = migrated.appearance || {};
        const banner = appearance.banner || {};
        const glossaryOptions = migrated.glossaryOptions || {};

        return {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            generatorVersion: text(migrated.generatorVersion, defaults.generatorVersion),
            story: {
                title: text(story.title),
                subtitle: text(story.subtitle),
                description: text(story.description),
                universe: text(story.universe),
                pairing: text(story.pairing),
                updated: text(story.updated),
                status: text(story.status, defaults.story.status)
            },
            characters: array(migrated.characters).map((character, index) => ({
                id: text(character?.id, `character-${index + 1}`),
                name: text(character?.name),
                color: text(character?.color, '#000000')
            })),
            parts: array(migrated.parts).map((part, index) => ({
                id: text(part?.id, `part-${index + 1}`),
                title: text(part?.title, `Part ${index + 1}`),
                sourceText: text(part?.sourceText),
                entries: array(part?.entries).map(normalizeEntry).filter(Boolean)
            })),
            editor: {
                sourceText: text(editor.sourceText),
                singleStory: bool(editor.singleStory),
                usePartMarkers: bool(editor.usePartMarkers),
                noCharacters: bool(editor.noCharacters),
                allowRawHtml: typeof editor.allowRawHtml === 'boolean'
                    ? editor.allowRawHtml
                    : /<[a-z][\s\S]*>/i.test(text(editor.sourceText))
            },
            media: {
                background: text(media.background),
                banner: text(media.banner),
                storyImages: array(media.storyImages).map(item => text(item)).filter(Boolean)
            },
            soundtrack: normalizeOrderedItems(migrated.soundtrack, 'soundtrack'),
            navigation: array(migrated.navigation).map(item => ({
                label: text(item?.label),
                url: text(item?.url)
            })).filter(item => item.label || item.url),
            glossary: array(migrated.glossary).map((item, index) => ({
                id: text(item?.id, `glossary-${index + 1}`),
                term: text(item?.term),
                definition: text(item?.definition)
            })).filter(item => item.term || item.definition),
            glossaryOptions: {
                firstOnly: bool(glossaryOptions.firstOnly),
                showTooltips: bool(glossaryOptions.showTooltips),
                showSection: bool(glossaryOptions.showSection, true)
            },
            comments: normalizeOrderedItems(migrated.comments, 'comments'),
            readThrough: {
                enabled: bool(readThrough.enabled),
                documentId: text(readThrough.documentId),
                hostedUrl: text(readThrough.hostedUrl),
                endpoint: text(readThrough.endpoint, defaults.readThrough.endpoint),
                cachedThreads: cloneJson(array(readThrough.cachedThreads))
            },
            appearance: {
                template: text(appearance.template, defaults.appearance.template),
                backgroundOpacity: Number.isFinite(Number(appearance.backgroundOpacity))
                    ? Number(appearance.backgroundOpacity) : defaults.appearance.backgroundOpacity,
                backgroundBlur: Number.isFinite(Number(appearance.backgroundBlur))
                    ? Number(appearance.backgroundBlur) : defaults.appearance.backgroundBlur,
                banner: {
                    size: text(banner.size, defaults.appearance.banner.size),
                    showTitle: bool(banner.showTitle, true),
                    showSubtitle: bool(banner.showSubtitle, true),
                    titleFontSize: Number.isFinite(Number(banner.titleFontSize))
                        ? Number(banner.titleFontSize) : defaults.appearance.banner.titleFontSize,
                    titleColor: text(banner.titleColor, defaults.appearance.banner.titleColor),
                    subtitleColor: text(banner.subtitleColor, defaults.appearance.banner.subtitleColor)
                }
            }
        };
    }

    function validateProject(input) {
        try {
            const project = normalizeProject(input);
            const errors = [];
            if (!project.story || !Array.isArray(project.characters) || !Array.isArray(project.parts)) {
                errors.push('Required RP project collections are missing');
            }
            return { valid: errors.length === 0, errors, project };
        } catch (error) {
            return { valid: false, errors: [error.message], project: null };
        }
    }

    function safeJson(project) {
        return JSON.stringify(normalizeProject(project))
            .replace(/&/g, '\\u0026')
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e');
    }

    function projectDataMarkup(project) {
        return `<meta name="rp-archiver-schema" content="${CURRENT_SCHEMA_VERSION}">\n` +
            `<script type="application/json" id="${PROJECT_DATA_ID}">${safeJson(project)}</script>`;
    }

    function injectProjectData(html, project) {
        if (typeof html !== 'string' || !html.trim()) throw new TypeError('Generated RP HTML is empty');
        const markup = projectDataMarkup(project);
        const withoutExisting = html
            .replace(/\s*<meta\b[^>]*\bname=["']rp-archiver-schema["'][^>]*>/gi, '')
            .replace(new RegExp(`\\s*<script\\b[^>]*\\bid=["']${PROJECT_DATA_ID}["'][^>]*>[\\s\\S]*?<\\/script>`, 'gi'), '');

        if (/<\/head>/i.test(withoutExisting)) {
            return withoutExisting.replace(/<\/head>/i, `    ${markup}\n</head>`);
        }
        if (/<head\b[^>]*>/i.test(withoutExisting)) {
            return withoutExisting.replace(/<head\b[^>]*>/i, match => `${match}\n    ${markup}`);
        }
        throw new Error('Generated RP HTML has no head element for project data');
    }

    function parseProjectJson(json) {
        try {
            return normalizeProject(JSON.parse(json));
        } catch (error) {
            throw new Error(`Invalid RP project data: ${error.message}`);
        }
    }

    function extractProjectData(source) {
        if (!source) return null;
        if (typeof source === 'string') {
            const pattern = new RegExp(`<script\\b[^>]*\\bid=["']${PROJECT_DATA_ID}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i');
            const match = source.match(pattern);
            return match ? parseProjectJson(match[1].trim()) : null;
        }
        const element = source.getElementById?.(PROJECT_DATA_ID) || source.querySelector?.(`#${PROJECT_DATA_ID}`);
        return element ? parseProjectJson(element.textContent.trim()) : null;
    }

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

    function partsFromLegacySource(sourceText, titles = []) {
        const sources = splitLegacySourceText(sourceText);
        const count = Math.max(sources.length, array(titles).length, 1);
        return Array.from({ length: count }, (_, index) => ({
            id: `part-${index + 1}`,
            title: text(titles[index], `Part ${index + 1}`),
            sourceText: sources[index] || '',
            entries: []
        }));
    }

    function sourceTextFromParts(parts, options = {}) {
        const includeMarkers = options.includeMarkers !== false;
        const sources = array(parts).map(part => (
            typeof part?.sourceText === 'string' ? part.sourceText : sourceTextFromEntries(part?.entries)
        ));
        return sources.join(includeMarkers ? `\n\n${LEGACY_PART_MARKER}\n\n` : '\n\n');
    }

    return {
        CURRENT_SCHEMA_VERSION,
        LEGACY_PART_MARKER,
        PROJECT_DATA_ID,
        createDefaultProject,
        extractProjectData,
        injectProjectData,
        migrateProject: input => schemaMigrations.migrateProject(input, CURRENT_SCHEMA_VERSION),
        normalizeProject,
        projectDataMarkup,
        partsFromLegacySource,
        splitLegacySourceText,
        sourceTextFromParts,
        validateProject
    };
});
