'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const {
    APPEARANCE_FIELDS,
    buildPublicFileManifest,
    createLorePublicSite,
    migrateLoreProject,
    normalizeLoreProject,
    serializeEditableProjectData,
    summarizePublicProjection,
    toLegacyInfoData,
    validateLoreProject
} = require('../modules/project-contract');
const {
    escapeAttribute,
    escapeText,
    normalizeUrl,
    renderMarkdown,
    renderMarkdownBlocks,
    renderTrustedHtml,
    sanitizeCssColor
} = require('../modules/generation-security');
const {
    embedEditableProject,
    extractProjectPayload
} = require('./helpers/project-payload');

const FIXTURE_FOLDER = path.join(__dirname, 'fixtures');
const editorIndexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const embeddedFixtures = [
    'embedded-shape-1.json',
    'embedded-shape-2.json',
    'embedded-shape-3.json',
    'embedded-shape-4.json',
    'embedded-shape-5-edge.json'
];

assert.equal(escapeText('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;', 'plain text is escaped');
assert.equal(escapeAttribute('"quoted" & safe'), '&quot;quoted&quot; &amp; safe', 'attribute values are escaped');
assert.equal(normalizeUrl('javascript:alert(1)'), null, 'script URLs are rejected');
assert.equal(normalizeUrl('assets/ui/banner.png'), 'assets/ui/banner.png', 'project-relative URLs remain available');
assert.equal(sanitizeCssColor('red; background:url(evil)'), '', 'CSS declaration injection is rejected');
assert.equal(renderMarkdown('**safe** <img onerror=alert(1)>'), '<strong>safe</strong> &lt;img onerror=alert(1)&gt;', 'Markdown is escape-first');
assert.equal(
    renderMarkdown('++Sites for Testing++\n[My Roleplays](roleplays.html)'),
    '<u>Sites for Testing</u><br><a href="roleplays.html">My Roleplays</a>',
    'overview-style Markdown supports underline and project-relative links'
);
assert.equal(renderMarkdown('<u>safe underline</u>'), '<u>safe underline</u>', 'safe underline HTML is supported as a convenience');
assert.equal(
    renderMarkdown('[unsafe](javascript:alert(1))'),
    '[unsafe](javascript:alert(1))',
    'Markdown links reject executable URLs'
);
assert.equal(
    renderMarkdownBlocks('## Sites for Testing\n\n[My Roleplays](roleplays.html)\n\n- Draft\n- Published'),
    '<h2 class="overview-markdown-heading">Sites for Testing</h2>\n<p class="overview-markdown-link-list"><a href="roleplays.html">My Roleplays</a></p>\n<ul><li>Draft</li><li>Published</li></ul>',
    'overview Markdown renders semantic headings, links, and lists'
);
assert.equal(
    renderMarkdownBlocks('Introductory prose.\n\n[One](one.html)\n[Two](two.html)\n\n## Next\n[Three](three.html)'),
    '<p>Introductory prose.</p>\n<p class="overview-markdown-link-list"><a href="one.html">One</a><br><a href="two.html">Two</a></p>\n<h2 class="overview-markdown-heading">Next</h2>\n<p class="overview-markdown-link-list"><a href="three.html">Three</a></p>',
    'link-only groups are distinguishable from prose for Overview theme styling'
);
const spoilerMarkup = renderMarkdown('<spoiler>secret</spoiler>');
assert.equal(spoilerMarkup.includes('data-lore-action="toggle-spoiler"'), true, 'spoilers use delegated reader actions');
assert.equal(spoilerMarkup.includes('onclick='), false, 'new spoiler markup has no inline handler');
assert.throws(() => renderTrustedHtml('<b>raw</b>'), /explicit trusted flag/, 'raw HTML requires an explicit trusted context');
assert.equal(renderTrustedHtml('<b>raw</b>', { trusted: true }), '<b>raw</b>', 'trusted HTML remains an explicit opt-in');

const previewFrameTag = editorIndexHtml.match(/<iframe\b[^>]*\bid="preview-frame"[^>]*>/i)?.[0] || '';
assert.match(previewFrameTag, /title="Public Lore Codex preview"/i, 'preview iframe has an accessible title');
assert.match(previewFrameTag, /sandbox="allow-scripts allow-downloads"/i, 'preview iframe uses the reviewed capability allowlist');
assert.equal(/allow-same-origin|allow-forms|allow-popups|allow-top-navigation/i.test(previewFrameTag), false, 'preview cannot regain editor origin or broad navigation capabilities');

for (const fixtureName of embeddedFixtures) {
    const fixturePath = path.join(FIXTURE_FOLDER, fixtureName);
    const legacyData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const legacyHtml = `<!doctype html><script>var fullInfoData = ${JSON.stringify(legacyData)};</script>`;
    const extractedLegacy = extractProjectPayload(legacyHtml);

    assert.equal(extractedLegacy.format, 'legacy-fullInfoData', `${fixtureName}: legacy format`);
    assert.deepEqual(extractedLegacy.data, legacyData, `${fixtureName}: legacy extraction`);

    const normalized = normalizeLoreProject(extractedLegacy.data);
    assert.deepEqual(validateLoreProject(normalized), [], `${fixtureName}: normalized contract`);
    const migrated = migrateLoreProject(extractedLegacy.data);
    assert.deepEqual(migrated.project, normalized, `${fixtureName}: migration output`);
    assert.equal(migrated.report.sourceVersion, 0, `${fixtureName}: legacy source version`);
    assert.deepEqual(migrated.report.steps, ['0->1'], `${fixtureName}: migration chain`);

    const editableHtml = embedEditableProject(normalized);
    const extractedEditable = extractProjectPayload(editableHtml);
    assert.equal(extractedEditable.format, 'schema-json', `${fixtureName}: schema format`);
    assert.deepEqual(
        normalizeLoreProject(extractedEditable.data),
        normalized,
        `${fixtureName}: normalized editable round trip`
    );
}

const edgeSource = JSON.parse(fs.readFileSync(path.join(FIXTURE_FOLDER, 'embedded-shape-5-edge.json'), 'utf8'));
const edgeProject = normalizeLoreProject(edgeSource);
const edgeArchive = embedEditableProject(edgeProject);
const serializedEdgeProject = serializeEditableProjectData(edgeProject);
const mixedArchive = `<!doctype html><script>var fullInfoData = ${JSON.stringify({ basic: { title: 'Public copy' } })};</script>${edgeArchive}`;
const extractedMixedArchive = extractProjectPayload(mixedArchive);

assert.equal(edgeProject.basic.overview, edgeSource.basic.overview, 'edge text is preserved');
assert.equal(edgeProject.integrations.timeSystemId, 'fixture-calendar', 'custom calendar selection is preserved');
assert.deepEqual(edgeProject.integrations.linkedLorebook, edgeSource.linkedLorebook, 'linked lorebook is preserved');
assert.equal(edgeProject.characters[0].hidden, true, 'hidden state is preserved');
assert.equal(edgeProject.characters[0].notes, 'Author-only character note', 'notes are preserved');
assert.equal(edgeProject.world.futureCategory[0].name, 'Unknown category survives', 'future world category survives');
assert.equal(edgeProject.extensions.legacyTopLevel.futureTopLevel.preserveMe, true, 'unknown top-level field survives');
assert.equal(edgeArchive.includes('</script> and'), false, 'script terminator is escaped in archive JSON');
assert.equal(serializedEdgeProject.includes('</script> and'), false, 'production project serializer escapes script terminators');
assert.equal(extractedMixedArchive.format, 'schema-json', 'schema payload wins when a public compatibility payload appears first');
assert.equal(extractedMixedArchive.data.basic.title, edgeProject.basic.title, 'schema-first import preserves editable project data');
assert.deepEqual(
    normalizeLoreProject(toLegacyInfoData(edgeProject)),
    edgeProject,
    'canonical project survives the legacy editor adapter'
);
const unavailableCalendarMigration = migrateLoreProject(edgeSource, { availableTimeSystemIds: [] });
assert.equal(unavailableCalendarMigration.report.warnings.length, 1, 'missing selected calendar is reported');
assert.deepEqual(unavailableCalendarMigration.report.unrecoverableFields, [], 'embedded migration reports no unrecoverable fields');
assert.equal(
    unavailableCalendarMigration.project.integrations.timeSystemId,
    'fixture-calendar',
    'missing selected calendar reference is preserved for recovery'
);
assert.throws(
    () => migrateLoreProject({ schemaVersion: 99 }),
    /newer than supported/,
    'future schema versions fail explicitly'
);
for (const field of APPEARANCE_FIELDS) {
    assert.equal(Object.prototype.hasOwnProperty.call(edgeProject.appearance, field), true, `appearance.${field}`);
}

const publicSite = createLorePublicSite(edgeProject);
const publicJson = JSON.stringify(publicSite);
const privacySummary = summarizePublicProjection(edgeProject);
assert.equal(Object.prototype.hasOwnProperty.call(publicSite, 'linkedLorebook'), false, 'public model omits linked lorebook');
assert.equal(Object.prototype.hasOwnProperty.call(publicSite, 'extensions'), false, 'public model omits compatibility extensions');
assert.equal(publicSite.characters.length, 0, 'hidden character is removed from public model');
assert.equal(publicSite.customPages.length, 0, 'hidden custom page is removed from public model');
assert.equal(publicSite.world.items.length, 0, 'hidden world item is removed from public model');
assert.equal(publicSite.storylines[0].title, 'Visible Thread', 'visible storyline remains public');
assert.equal(Object.prototype.hasOwnProperty.call(publicSite.storylines[0], 'notes'), false, 'visible author notes are removed');
assert.equal(publicSite.plansOptions.selectedTimeSystemId, 'fixture-calendar', 'reader calendar selection remains public');
assert.equal(publicSite.appearance.colorScheme, 'quietEcho', 'reader appearance remains public');
assert.equal(publicJson.includes('Author-only'), false, 'privacy sentinels are absent from public model');
assert.equal(publicJson.includes('fixture-lorebook.json'), false, 'linked source filename is absent from public model');
assert.equal(publicJson.includes('preserveMe'), false, 'compatibility extensions are absent from public model');
assert.deepEqual(privacySummary, {
    hiddenObjectsRemoved: 3,
    noteFieldsRemoved: 3,
    linkedLorebookRemoved: true,
    compatibilityExtensionFieldsRemoved: 1
}, 'pre-publish privacy summary');

const publicFiles = buildPublicFileManifest(
    '<img src="assets/ui/logo.png"><a href="https://example.invalid/external.css">external</a>',
    publicSite,
    [{ destination: 'images/styles/mist.png' }],
    'fixture-site'
);
assert.equal(publicFiles.includes('fixture-site.html'), true, 'public manifest includes generated HTML');
assert.equal(publicFiles.includes('assets/ui/logo.png'), true, 'public manifest includes rendered HTML assets');
assert.equal(publicFiles.includes('assets/overview.webp'), true, 'public manifest includes public model assets');
assert.equal(publicFiles.includes('images/styles/mist.png'), true, 'public manifest includes required style assets');
assert.equal(publicFiles.includes('assets/characters/mira.webp'), false, 'public manifest excludes hidden-character assets');
assert.equal(publicFiles.includes('assets/lorebook/fixture-lorebook.json'), false, 'public manifest excludes lorebook assets');
assert.equal(publicFiles.some(file => file.includes('example.invalid')), false, 'public manifest excludes remote URLs');

const domOnly = fs.readFileSync(path.join(FIXTURE_FOLDER, 'dom-only-legacy.html'), 'utf8');
assert.equal(extractProjectPayload(domOnly).format, 'legacy-dom', 'DOM-only legacy adapter remains detectable');

const previousWindow = global.window;
global.window = { LoreProjectContract: require('../modules/project-contract') };
delete require.cache[require.resolve('../modules/project-state')];
require('../modules/project-state');
const stateReference = { placeholder: true };
global.window.LoreProjectState.configure(stateReference);
global.window.LoreProjectState.replace(edgeProject, { markDirty: false });
assert.equal(global.window.LoreProjectState.get(), stateReference, 'state owner preserves the compatibility object reference');
assert.equal(stateReference.basic.title, edgeProject.basic.title, 'state owner replaces project data');
global.window.LoreProjectState.update(state => {
    state.basic.title = 'Updated through owner';
});
assert.deepEqual(global.window.LoreProjectState.getStatus(), { dirty: true, generated: false }, 'state owner tracks dirty updates');
global.window.LoreProjectState.reset({ markDirty: false });
assert.equal(stateReference.basic.title, '', 'state reset restores canonical defaults');
assert.deepEqual(global.window.LoreProjectState.getStatus(), { dirty: false, generated: false }, 'clean reset clears generated state');
delete require.cache[require.resolve('../modules/compat-state')];
require('../modules/compat-state');
global.window.editingIndex = 7;
global.window.currentPublicSiteData = { generated: true };
assert.equal(global.window.LoreCodexCompatState.snapshot().editingIndex, 7, 'compatibility facade owns legacy editor aliases');
global.window.LoreCodexCompatState.resetProjectScoped();
assert.equal(global.window.editingIndex, -1, 'compatibility facade resets editor aliases');
assert.equal(global.window.currentPublicSiteData, null, 'compatibility facade resets generated project aliases');
if (previousWindow === undefined) delete global.window;
else global.window = previousWindow;

console.log(`Compatibility checks passed: ${embeddedFixtures.length} embedded shapes, 1 DOM-only shape, edge values, public privacy projection.`);
