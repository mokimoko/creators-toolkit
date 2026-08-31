# Lore Codex modernization baseline

Recorded: 2026-08-29  
Baseline commit: `4aa7a9f657b553c34366e68569926196550de7ea`

The pre-modernization snapshot is stored in `_backups/lore-codex-pre-modernization-2026-08-29/` and includes the dirty working-tree state described below.

## User-owned work already in progress

These changes predate the modernization and must remain logically separate from it:

- `info-converter/index.html`, `info-converter/info-converter.js`, and `info-converter/css/info-converter.css`: repository connection/status/publish controls and save-result feedback.
- `info-converter/html-generator.js`: generated metadata adjustment used by the save/repository workflow.
- `server/projects.js`: Lore Codex repository status, folder selection, publish/update behavior, project-config preservation, and save-result reporting. This file also contains separate RP Archiver media/security/read-through work.
- `server/server.js` and `server/path-security.js`: shared path-containment work used by both tools.
- `server/package.json` and `server/package-lock.json`: dependency updates made alongside the shared server work.

Modernization commits must not reset these files or claim the pre-existing changes as modernization work. Any edit that overlaps them needs a focused diff review.

## Phase 0 contract

The normalized test model inventories the following authoring state:

- Identity and overview: title, subtitle, banner, overview content/images/links, custom navigation, page inclusion, title settings, and editor-selected backgrounds.
- Appearance: template, banner/overview/navigation styles, colors, fonts, sizing, headers, card/container/subcontainer/info-display/button/back-to-top styles, width, background style/overlay, storyline style, and custom color overrides.
- Content: characters, storylines, plans/timelines, playlists, custom pages, and all world categories including unknown future categories.
- Options: storyline, character, events, culture, cultivation, magic, and plan/calendar selections.
- Integrations: linked lorebook and selected time-system identifier.
- Compatibility extensions: unknown legacy top-level fields are retained under `extensions.legacyTopLevel` instead of being discarded.

## Round-trip invariants

Normalization and future editable archive generation must preserve:

1. Array ordering and object ordering semantics for every authored collection.
2. Hidden state, notes, tags, links, images, item icons, timing/calendar references, and custom-page content.
3. All recognized appearance selections and custom color overrides.
4. Unknown nested fields and unknown legacy top-level fields.
5. Unicode, quotes, HTML-like text, `};`, and `</script>`-like author text as data.
6. Missing legacy blocks through explicit defaults without inheriting state from a previously loaded project.
7. A source file remains read-only until an explicit Save or Export action.

Raw generated HTML formatting is not an invariant. Tests compare normalized authoring models.
