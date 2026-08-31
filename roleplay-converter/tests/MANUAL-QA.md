# RP Archiver Manual QA Baseline
*Recorded: 2026-08-28*

Use this short checklist after startup, import, or UI-shell changes. Test against synthetic fixtures first; existing projects under `users/` remain read-only.

## Desktop startup

- [x] App opens at `http://localhost:9000/roleplay-converter/`.
- [x] Themed body becomes visible without a startup timer.
- [x] Story Information is the initial active section.
- [x] No browser console errors occur on startup.
- [x] Routine startup messages are silent at the default `warn` log level.
- [x] A desktop baseline screenshot was captured and visually inspected during the 2026-08-28 browser run.

## Shell interactions

- [x] Selecting Characters activates the Characters section.
- [x] Collapse changes the sidebar state and exposes `aria-expanded="false"`.
- [x] Expand restores the sidebar and the `Collapse sidebar` accessible label.
- [x] Repeat section and collapse checks with keyboard-only input in a normal desktop browser. Verified during the Phase 6 keyboard/tab smoke pass.

## Import/export checks

- [x] Static tests confirm manual files and organized-project loads share one import controller.
- [x] The six structural fixtures and the edge/template fixtures pass their checks.
- [ ] Manually import one fixture from each structural variant through the native file chooser.
- [x] Convert all six structural fixtures and compare their schema-v2 model after structured reimport through `release-browser-smoke.html`.
- [x] Confirm synthetic save → reload → edit → resave through `release-server-smoke.cjs`; the dedicated QA folder is removed afterward and imported sources are never used as save targets.

## Structured part editor

- [x] A new project opens with one labeled part editor and no console errors.
- [x] `Insert part break at cursor` creates a second part without a marker in editable text.
- [x] Legacy marker conversion creates separate parts and preserves their content order.
- [x] Part move controls update order, labels, and the generated payload.
- [x] Expanded editing writes back to the selected part.
- [x] Generated HTML contains schema v2 data, stable part IDs, and one rendered header per structured part.
- [x] Single-story mode disables adding parts without deleting existing content.

## Known accessibility baseline

The first desktop focusable controls appear in a sensible document order: Home, project import, About, sidebar collapse, then Story Information fields. Some icon-only add buttons still lack accessible names; keep that work in the UI/accessibility phase rather than mixing it into startup behavior.
