# Lore Codex compatibility checks

These are intentionally dependency-free Node checks. They operate on sanitized fixtures or read project HTML without writing it.

Run the focused fixture contract:

```powershell
node info-converter/tests/run-phase0-tests.js
```

Run the dependency-free editor accessibility contract:

```powershell
node info-converter/tests/run-accessibility-checks.js
```

Run the structure-only local corpus scanner (paths and authored values are omitted):

```powershell
node info-converter/tests/scripts/scan-lore-corpus.js
```

Pass another folder to scan external/downloaded fixtures. Add `--show-paths` only when diagnosing a failure locally.

The scanner runs each embedded payload through the versioned migration chain and reports payload format, top-level field-shape counts, migration/invariant failures, and aggregate presence counts for hidden objects, notes, and linked lorebooks. It never rewrites or saves a project.

The dated baseline folder contains the five main editor states plus a representative modal at desktop and narrow widths. `checklists/keyboard-and-public-privacy.md` tracks the combined safety boundary, and `checklists/screen-reader.md` is the short assistive-technology smoke.
