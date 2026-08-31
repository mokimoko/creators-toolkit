# Phase 8 Performance Verification

Measured 2026-08-29 with one focused Chromium smoke. Timings are single samples, not benchmark averages, to avoid repeated project loads or generation work.

## Startup and loading

| Measure | Earlier baseline | Phase 8 final | Change |
| --- | ---: | ---: | ---: |
| Initial DOM nodes | 2,722 | 2,342 | -380 (-14.0%) |
| Direct script tags | 60 | 40 | -20 (-33.3%) |
| Direct local script bytes | 1,119,156 | 852,028 | -267,128 (-23.9%) |
| Startup duration | not previously instrumented | 223.1–254.2 ms | baseline established |
| Startup used JS heap | not previously available | 9,340,888 bytes | baseline established |

The direct-script comparison excludes the shared `../utils/file-picker.js` file because it is outside the Lore Codex folder. Browser resource counts include native-module dependencies, so the final startup sample reported 116 script requests and 242,671 transferred bytes with the current cache state.

At startup, Custom Pages editor, Time Systems editor, character importer, lorebook importer, and project import adapters all remained deferred. On-demand initialization took 48.9 ms, 63.8 ms, and 13.4 ms respectively for the three features opened during the complete smoke. A focused repeat measured the five-script Custom Pages editor load at +101,359 heap bytes, establishing a reproducible before/after feature-memory delta.

## Project and output

| Measure | Result |
| --- | ---: |
| Existing-project load | 269.2 ms |
| Default public generation | 1,089.6 ms |
| Default public output | 176,009 characters |
| Default inline CSS/runtime reduction | 122,726 characters |
| Existing-project generation | 1,317.4 ms |
| Existing-project public output | 585,291 characters |
| Existing-project inline CSS/runtime reduction | 122,892 characters (17.4% of unminified total output) |

The preview `srcdoc` length exactly matched generated output in both generation checks. No generated-reader errors appeared. The only warning remained the established guest-user display-placement warning.

## Verification scope

- One syntax pass over touched JavaScript.
- One compatibility/privacy fixture run covering five embedded shapes, one DOM-only shape, and edge values.
- One Phase 8 source/output contract check.
- One browser startup, three representative deferred features, one existing-project load, and two generation samples.
