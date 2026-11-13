---
id: WF-261
title: "Fix the Reviewing critique's P1s: cut text, ASCII ?, Diff room, anchor placement"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-05
---

## Outcome

The four P1 findings from the 2026-11-05 Reviewing design critique (`.impeccable/critique/2026-11-05T12-23-44Z__apps-neoflow-src-reviewingview-ts.md`) are fixed. Text is never cut from the middle, and `--ascii` no longer turns interface characters into `?`. The Diff keeps at least half the terminal and wraps code at token boundaries. A new Message anchors to the highlighted line and opens beneath it.

## Finding

- **Middle cuts:** OpenTUI's `truncate` removes the middle of text, and every label used it by default. On top of that, the inline Message and discussion cards wrapped 2 cells wider than they really were (they ignored the Diff pane's border), so answers lost words from the middle.
- **ASCII `?`:** `safeText` replaced every non-ASCII character with `?`, including `·`, `…` and `↳`. That collided with `?`, the symbol for the unknown state.
- **Diff room:** at 132 columns the Diff had 54 cells, and code wrapped character by character.
- **Anchors:** outside the Diff, `a` anchored to line 1 even while a Diff line was highlighted, and the composer was drawn above its line or at the bottom of the file.

## Interface

- `label()` now clips at the end. The status line, the Diff pane title (`fitPaneDetail`), the History empty state and the change notes are fitted or wrapped explicitly. New `fitDisplayCellsEnd`/`fitDisplayCellsStart` live in `displayCells.ts`.
- `safeText` has an ASCII stand-in table for interface text. Source code (`decodeDiffRow`) keeps `?`, because a stand-in could pass for real syntax.
- `diffMinimumWidth(width)` is `max(32, ceil(width / 2))`. It is shared by the view geometry and the pane-resize limits, and the side panes scale down in proportion to their preferred widths. Saved preferences are unchanged.
- `codeRowStarts` breaks code after whitespace or delimiters. The same function produces both the rendered rows and the row heights.
- The composer's anchor is the Diff's selected line for the selected file, whichever pane has focus; it falls back to line 1 only when there is no selected line. The composer and Message cards render directly under their line.
- Copy changes:
  - The composer hint is now "Up/Down moves by row · paste goes at the cursor".
  - The changed-line hint is now "Line changed; text kept. F4 targets the current line."
  - The empty state is now "No Messages yet. Press a on a line or a file to write one."
  - The refusal for a removed line is now "A removed line can't hold a Message. Select a line that exists now."

## Acceptance

- [x] No middle-ellipsis appears in re-rendered frames at 132×40, 100×30, 80×24 or 60×20.
- [x] Under `--no-color --ascii`, `?` appears only as the `[?] keys` hint.
- [x] At 132×40 the Diff has 67 cells, and wrapped code breaks at token boundaries.
- [x] `a` from another pane anchors to the highlighted line, and the composer renders beneath it.

## Completion evidence (2026-11-05)

- The app suite passes 80/80, including a new anchor/placement scenario and unit tests for fitting and code wrapping. Typecheck, oxlint and oxfmt are clean for `apps/neoflow`.
- The critique's 46-frame script was re-run against the changed code. The before and after frames are in the session scratchpad.
- Still open from the critique: P2 (sending moves focus and drops keys), the minor observations, and the 60×20 header clip.
