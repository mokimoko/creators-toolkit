# Keyboard navigation and public-data privacy checklist

Use sanitized fixtures unless a step explicitly requires a local user project. Never save during an import-only compatibility check.

## Keyboard and focus

- [x] Main tabs expose tab semantics, the active state, and Left/Right arrow navigation.
- [ ] Every main workflow can be reached with Tab/Shift+Tab in a logical order.
- [x] Project picker, project actions, icon-only buttons, and file import controls have stable accessible names.
- [x] Visible focus is clear on links, tabs, buttons, inputs, list controls, and custom editors.
- [x] Opening a modal moves focus to its labelled dialog.
- [x] Tab and Shift+Tab remain inside an open modal.
- [x] Escape closes non-destructive modals and returns focus to the opener.
- [x] Destructive confirmation cannot be triggered by an accidental Enter/Space on the background page.
- [ ] Content sidebar items and reorder controls work without drag-and-drop.
- [x] Status, save, import, publish, and error messages are announced through an appropriate live region.
- [ ] At 200% zoom and 390 px width, controls remain reachable without horizontal page scrolling.
- [x] Reduced-motion preference disables nonessential movement.

## Import and round trip

- [ ] Each sanitized embedded-shape fixture reports the detected format and normalizes without errors.
- [ ] The DOM-only fixture reaches the named legacy fallback.
- [ ] Missing legacy blocks receive defaults from a clean project state.
- [ ] Importing an older partial project after a fuller project cannot inherit overview links, custom navigation, pages, lorebook data, or appearance state.
- [ ] Opening/importing a project does not rewrite its source.
- [ ] Unicode, quotes, HTML-like text, `};`, and `</script>`-like text survive an editable archive round trip.

## Public output boundary

- [ ] Public HTML contains no object whose authoring state is `hidden: true`.
- [ ] Public HTML contains no author notes or development-only notes fields.
- [ ] Public HTML contains no linked-lorebook filename or source data.
- [ ] Public HTML contains no account/user context, repository path/config, local path, import source metadata, or editor-only state.
- [ ] Public HTML contains only explicitly included pages and public navigation targets.
- [ ] Images/icons in the public asset manifest are referenced by visible public content.
- [ ] Pre-publish summary reports what is included and what private/editor-only categories were stripped.
- [ ] Repository publishing copies only the public output manifest and never `project-config.json` or editable project data.
- [ ] Searching generated output for fixture privacy sentinels returns no matches.

## Preview boundary

- [x] Preview iframe has a useful title.
- [x] Preview iframe uses the tested `allow-scripts allow-downloads` sandbox policy.
- [x] Preview content cannot read or mutate editor state.
- [ ] Links, downloads, dialogs, and navigation behave only as intentionally allowed by the sandbox.
