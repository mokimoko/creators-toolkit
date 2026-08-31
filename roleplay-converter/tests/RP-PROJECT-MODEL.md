# RP Archiver compatibility model

This is the normalized comparison shape for compatibility tests. It is deliberately format-neutral: legacy HTML scraping and future versioned project data should both produce this shape before their results are compared.

```text
RPProject
├── sourceFormat: legacy-v0 | structured
├── schemaVersion: integer | null
├── story
│   ├── title
│   ├── subtitle
│   ├── description
│   ├── universe
│   ├── pairing
│   ├── updated
│   └── status
├── characters[]
│   ├── id
│   ├── name
│   └── color
├── parts[]
│   ├── id
│   ├── title
│   ├── sourceText
│   └── entries[]
├── media
│   ├── background
│   ├── banner
│   └── storyImages[]
├── soundtrack[]
├── navigation[]
├── glossary[]
├── comments[]
├── readThrough
│   ├── enabled
│   ├── documentId
│   ├── hostedUrl
│   └── cachedThreads[]
└── appearance
    ├── template
    ├── backgroundOpacity
    ├── backgroundBlur
    └── banner settings
```

## Round-trip invariants

The following must compare equal after import → render → import, except where a reviewed migration explicitly documents a change:

1. Story metadata and status.
2. Exact source text/markdown in paragraph order.
3. Part count, order, titles, and content boundaries.
4. Character order, display names, colors, and speaker assignment.
5. Background, banner, and story-image order/references.
6. Soundtrack headings/tracks and navigation link order.
7. Glossary terms, definitions, and display options.
8. Author comments and headings.
9. Footnote source markers and definitions.
10. Template and appearance settings.
11. Shared Read-Through enabled state, hosted URL, document ID, cached threads, and stable `data-rp-anchor` values.

Imports and compatibility scans are read-only. A source project is never rewritten merely because it was opened or inspected.

## Schema v2 part source

Schema v2 makes `parts[]` the editable source of truth. Every part has a stable `id`, a title, exact editable `sourceText`, and parsed `entries[]` used by the renderer. `editor.sourceText` remains a derived marker-delimited compatibility export; schema v0/v1 payloads and legacy HTML are migrated in memory before the editor is populated.
