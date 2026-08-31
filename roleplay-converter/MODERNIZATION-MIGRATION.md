# RP Archiver modernization migration and rollback

*Release candidate: 2026-08-28*

## Migration summary

New exports contain a versioned schema-v2 project payload alongside the standalone reading page. Structured parts, character IDs, editable source, appearance, media references, and Shared Read-Through identity are stored independently from rendered presentation markup.

Legacy projects are migrated in memory through the `legacy-v0` adapter. Opening an older HTML file never writes to or replaces that file. A migrated copy is created only when the user explicitly chooses **Save project** or **Export HTML**.

The release keeps all legacy import heuristics, `&&&PART&&&` input compatibility, all 18 CSS templates, standalone generated HTML, stable `rp-block-00001` anchors, hosted Read-Through URLs/document IDs/cache data, and Lore Codex storyline preparation.

The three output states are now explicit:

- **Generate preview** creates an in-memory reading view.
- **Save project** writes the project to Toolkit-managed storage and returns an asset manifest.
- **Export HTML** downloads a standalone browser file. A separate **Download instead** action appears only after Toolkit save failure.

## Existing project expectations

- Existing files under `users/**/roleplays/` do not require bulk conversion.
- The first legacy import reports an in-memory migration; saving or exporting produces a schema-v2 copy.
- Missing referenced media is reported instead of silently discarded during Toolkit save.
- Deterministic asset-name collisions replace the expected asset and are reported in the save manifest.

## Rollback

1. Stop the Toolkit server before restoring code.
2. Preserve any projects deliberately saved after modernization; code rollback does not require reverting user files.
3. Restore RP Archiver source from `_backups/roleplay-converter` only if rolling back the entire modernization.
4. Restore the targeted server/package integration files from `_backups/rp-archiver-integration-2026-08-28` only after reviewing its manifest. Do not blindly replace `server/package.json`, `server/package-lock.json`, or unrelated integration work.
5. Restart the server and verify the legacy application at `/roleplay-converter/`.

Rollback removes schema-aware editing from the older application, but generated schema-v2 files remain readable standalone HTML. Keep the modernized code available when those files need to be edited without falling back to legacy DOM scraping.

## Release verification

- 47 focused Node tests pass.
- Syntax checks pass for RP Archiver JavaScript, the touched server modules, and the Netlify Function.
- The read-only corpus census remains 102 files with the original six structural variants and no rewritten originals.
- All six synthetic legacy variants migrate to schema v2 and reimport through the structured path.
- All 18 CSS templates render with short and long representative synthetic stories while retaining template metadata and payload selection.
- An isolated synthetic Toolkit project passes save → reload → edit → resave, including stable Read-Through document ID/cache anchor; its QA folder is removed afterward.
- Lore Codex site preparation installs the Netlify Function kit idempotently while preserving existing package dependencies and `.gitignore` entries.
- Phase 6/7 live checks cover desktop, 390px compact mode, keyboard tab operation, reduced-motion rules, preview generation, and explicit save/export state.
