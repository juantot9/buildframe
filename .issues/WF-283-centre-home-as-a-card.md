---
id: WF-283
title: "Centre Home as a card"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-09
---

## Outcome

Home's pane is a card centred in the body, like a dialog. It keeps the Review's frame from WF-282: context row, rounded border, `▌ Home FOCUSED` title and whole-row selection.

## Finding

Owner, after WF-282: "I don't like it being at the corner." The full-width, top-anchored pane left four short rows in a 130-column box on wide terminals.

OpenTUI 0.8.1 was checked for help, using its type files rather than the website, which tracks the latest release:
- **Used:** `alignItems`, `paddingTop`, a fixed width and `maxHeight` on a Box. These do the placement.
- **Not used:** `Select`. It would bypass the model's keys, the `›` and wash style, the ASCII stand-ins and pointer handling.
- **Not used:** `ASCIIFont`, big block text, which conflicts with Weight-Not-Size.
- **Not used:** border titles, since DESIGN.md keeps titles and keys out of borders.

## Interface

- **Width:** 76 cells, or the full width below that. Rows, the whole-row wash and wrapped sentences all fit the card's width, not the terminal's.
- **Height:**
  - The card is as tall as its rows.
  - The launcher reserves its longest description, so moving between choices never resizes it.
  - The commit list and Previous Reviews grow to the room available.
- **Placement:**
  - Centred across the terminal.
  - Centred down the body as if the footer had its ordinary two rows. A search's three-row footer takes its extra row from below, so the card never moves while you type.
- **Same column everywhere:** the launcher, the picker and Previous Reviews share the same width and left edge.
- **Docs:** `DESIGN.md` Home records the placement rule.

## Verification

- **New test:** `centres Home as a card that keeps its column between views and while searching`. It fails on WF-282, where the width was 132, not 76. It checks:
  - width 76, centred across a 132x40 terminal;
  - above and below are equal to within one row;
  - the same x and width in the picker;
  - an identical rectangle once search opens.
- **Updated test:** `frames Home like a Review…` now checks centring instead of top anchoring, and full width at 70 columns.
- **Frames checked:** at 132, 100 and 70 columns plus light, the left edge holds steady in all six views, and the picker holds steady while searching.
- **Full run:** `pnpm verify` passes, 647 tests.
