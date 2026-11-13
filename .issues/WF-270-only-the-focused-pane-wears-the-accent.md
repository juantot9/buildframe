---
id: WF-270
title: "Only the focused pane wears the accent"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-06
---

## Outcome

The accent marks only focus and the selection inside the focused pane, plus the "now" (or shown step) chip on the history row. Elsewhere, states keep their own colours.

## Finding

The 2026-11-06 critique raised this as P2. About eight places on one screen used the accent, so focus was legible only from the word FOCUSED.

- `✎ Code changed while answering` was in the accent, so the product's most distinctive warning read like a link.
- On a selected History row or a card title, `✗ failed` and `✓ answered` took the accent and lost their own colours.
- The `NEOFLOW` wordmark, the help group labels and every history-row segment at "now" were in the accent.
- Selections in panes without focus kept the full accent wash: the Files row, the Diff row, History's "now ◀ here" row, the inline Message card's border and its stack rows.
- Number and constant tokens used the exact caution colour in Quiet Graphite, Indigo Night and Quiet Paper, so `0` and `undefined` rendered brass.

## Interface

- **`selectionColors(state, region)`:**
  - In the focused pane: accent on Harbor Cyan Wash.
  - In any other pane: Frost Text on Graphite Raised, with the cursor glyph kept.
  - Used by the Files rows, Diff rows (unified, split and unchanged content) and History's selected card. Also used by its "here" rows.
- **Inline Message card:** the border is the accent only while the Diff has focus, otherwise Slate Rule. A single Message's title takes its state's tone. In a stack, the selected row is bold in its state's tone.
- **History header row:** the location stays in the row colour; the badge and `✎` follow as separate pieces in their own tones.
- **`✎ Code changed while answering`:** Brass, in both the card and History.
- **`NEOFLOW` and help group labels:** bold Frost Text.
- **History row:**
  - At now, the segments are thick and Pewter, and the node labels are Frost Text.
  - Only the "here" chip is filled with the accent, or with Brass for edits outside answers.
- **Number and constant tokens:**
  - Quiet Graphite `#e8a07a`.
  - Indigo Night `#e3a17c`.
  - Quiet Paper `#9a4a14`, which is 4.89:1 or better on every fill.
- `DESIGN.md` records the rules: One Accent, Harbor Cyan Wash, Brass, and the token palette.

## Verification

- `shows each selected Message inline…` now asserts that the Diff's selected row has the neutral fill while History has focus.
- `theme presets › never paint code in the accent … or the caution colour` covers the token colours.
- Both fail on the old code.
- Fresh 132x40 frames show the accent only inside the focused pane and on the "now" chip.
- All 91 app tests pass.
