---
id: WF-319
title: "The cursor in BuildFrame's inputs shows as a box in conhost's default font"
status: open
labels:
  - wayfinder:task
assignee: null
blocked_by: []
created: 2026-11-20
---

## Finding

Found by hand in conhost on Windows 11 while checking the TUI
([WF-314](./WF-314-check-the-tui-in-windows-terminals.md)). In the comparison
picker's `/` search the cursor after the typed text is a box: the default
console font (Consolas) has no `▏` (U+258F LEFT ONE EIGHTH BLOCK). WezTerm
draws it from its own fallback fonts. The Text icon setting does not help:
only `--ascii` swaps it for `|` or `_`.

The same glyph is the cursor of three inputs in
`apps/buildframe/src/reviewingView.ts`: Review search (`searchBody`), the
comparison picker's input (search, HEAD~N, reference) and the `e`/`m` list
filter.

## Direction

Draw the cursor with a glyph the default console fonts have, or let the icon
setting choose it with the other non-text glyphs. Every other glyph in the
default Text icons drew correctly in conhost.

## Verification

- In conhost with its default font, all three inputs show a visible cursor,
  not a box.
- `--ascii` still draws `|` or `_`.
