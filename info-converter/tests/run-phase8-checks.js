const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

async function main() {
    const source = read('modules/generation/output-minifier.js');
    const encoded = Buffer.from(source).toString('base64');
    const { minifyPublicCss, minifyPublicRuntime } = await import(`data:text/javascript;base64,${encoded}`);
    const previewSource = read('modules/generation/preview-document.js');
    const previewEncoded = Buffer.from(previewSource).toString('base64');
    const { addPreviewBaseHref, buildProjectPreviewBaseHref } = await import(`data:text/javascript;base64,${previewEncoded}`);

    const css = minifyPublicCss(`
        /* removable */
        .card > .title { color: red; width: calc(100% - 2px); content: "a  b"; }
    `);
    assert.equal(css, '.card>.title{color:red;width:calc(100% - 2px);content:"a  b";}');

    const runtime = minifyPublicRuntime(`<script>
        const label = \`  preserved text  \`;
        // Keep line comments safely separated.
        window.label = label;
    </script>`);
    const scriptBody = runtime.match(/<script>([\s\S]*?)<\/script>/i)[1];
    assert.doesNotThrow(() => new Function(scriptBody));
    assert.ok(runtime.length < 150, 'runtime whitespace is compacted');

    const previewBaseHref = buildProjectPreviewBaseHref('World & Story', { isGuest: true });
    assert.equal(previewBaseHref, '/projects/guest/World%20%26%20Story/');
    assert.equal(
        addPreviewBaseHref('<!doctype html><html><head><title>Preview</title></head><body></body></html>', previewBaseHref),
        '<!doctype html><html><head>\n    <base href="/projects/guest/World%20%26%20Story/"><title>Preview</title></head><body></body></html>',
        'preview-only documents resolve relative assets from the active project'
    );
    assert.equal(
        addPreviewBaseHref('<html><head></head></html>', ''),
        '<html><head></head></html>',
        'unsaved projects keep the editor URL as their preview base'
    );

    const index = read('index.html');
    for (const deferredPath of [
        'modules/time-systems.js',
        'modules/custom-pages/custom-pages.js',
        'modules/import/character-import.js',
        'modules/import/lorebook-import.js',
        'import-export.js'
    ]) {
        assert.doesNotMatch(index, new RegExp(`<script[^>]+src=["']${deferredPath.replaceAll('.', '\\.')}`));
    }
    assert.match(index, /modules\/time-systems\/time-system-data\.js/);
    assert.match(index, /data-lore-lazy-feature="timeSystems"/);
    assert.match(index, /data-lore-lazy-feature="characterImporter"/);
    assert.match(index, /data-lore-lazy-feature="lorebookImporter"/);

    const domainButtons = read('modules/app/domain-buttons.js');
    assert.match(domainButtons, /classList\.add\('is-generating'\)/, 'Create exposes a visible in-progress state');
    assert.match(domainButtons, /setAttribute\('aria-busy', 'true'\)/, 'Create exposes its busy state to assistive technology');
    assert.match(domainButtons, /requestAnimationFrame/, 'Create paints its progress state before synchronous generation');
    assert.match(domainButtons, /lockedButtons: \[document\.getElementById\('save-to-sites-btn'\)\]/, 'Save stays locked throughout generation');
    assert.match(domainButtons, /onSettled: actions\.updateSaveButtonState/, 'Save state is recalculated only after generation settles');
    assert.match(read('css/editor-refresh.css'), /\.btn-main-action\.is-generating::before/, 'Create has an in-button progress indicator');
    assert.match(index, /family=Instrument\+Sans/, 'Precision Brass uses its selected control typeface');

    const helperContext = {};
    helperContext.window = helperContext;
    vm.runInNewContext(read('modules/time-systems/time-system-state.js'), helperContext);
    vm.runInNewContext(read('modules/domain-helpers.js'), helperContext);
    assert.equal(typeof helperContext.window.formatDateWithFormat, 'function', 'date formatting is eager even when the calendar editor is deferred');
    assert.equal(
        helperContext.window.formatDateWithFormat(
            { year: 2026, month: 7, day: 29 },
            'MMMM D, YYYY E',
            helperContext.DEFAULT_CALENDAR
        ),
        'August 29, 2026 CE',
        'older storyline timing can be formatted during export'
    );
    assert.doesNotMatch(read('modules/time-systems/mini-calendar.js'), /function formatDateWithFormat/, 'the lazy editor does not own the shared formatter');

    const storylineController = read('modules/forms/storyline-controller.js');
    assert.match(
        storylineController,
        /async function openStoryDatePicker[\s\S]*?await window\.LoreFeatureLifecycle\?\.ensureFeature\('timeSystems'\)/,
        'storyline date picking loads the deferred mini-calendar before rendering it'
    );

    const timelineCss = read('modules/timeline-css.js');
    assert.match(
        timelineCss,
        /\.tl-event-card\[style\*="--event-bg-image"\] \.tl-event-timing\s*\{[\s\S]*?background:\s*rgba\(29, 31, 28, 0\.84\);[\s\S]*?color:\s*#f7f3eb;[\s\S]*?opacity:\s*1;/,
        'image-backed timeline events give their light date text an opaque-enough dark plate'
    );
    assert.match(
        timelineCss,
        /\.tl-event-card\[style\*="--event-bg-image"\]\s*\{[\s\S]*?overflow:\s*visible;[\s\S]*?isolation:\s*isolate;/,
        'event background images do not clip separately positioned event artwork'
    );

    const generator = read('html-generator.js');
    assert.match(generator, /minifyPublicCss\(rawCss\)/);
    assert.match(generator, /minifyPublicRuntime\(rawRuntime\)/);
    assert.equal((generator.match(/addEventListener\(['"]scroll/g) || []).length, 1, 'generated shell owns one scroll listener');

    console.log('Phase 8 focused checks passed.');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
