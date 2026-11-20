---
id: WF-316
title: "Below 30 columns, a wrapped Diff line loses its last word"
status: open
labels:
  - wayfinder:task
assignee: null
blocked_by: []
created: 2026-11-20
---

## Finding

Found while checking the TUI in Windows terminals
([WF-314](./WF-314-check-the-tui-in-windows-terminals.md)); nothing in it is
Windows-specific, so it probably happens everywhere.

With Diff wrapping on, in the narrow one-pane layout, at 29 columns
`windows line 1` (14 cells) shows as `windows line ` and the `1` is gone; at
28 columns ` 1` is gone. There is no second row and no `›` marker: the text
is silently cut, which the WF-015 quality floor forbids ("never silent
omission"). A longer line on the same screen (`windows line 3 (edited)`)
does wrap. At 30 columns the same line fits and shows whole.

Selection makes no difference.

## Lead

`codeRowStarts` (`apps/buildframe/src/displayCells.ts`) wraps
`windows line 1` correctly for a 13-cell width. The rows on screen behave as
if the width it was given stayed at 14 at 29 and 28 columns, so the wrap is
computed for a wider code area than is drawn. The width comes from
`contentWidth - 14 - markWidth` in `apps/buildframe/src/reviewingView.ts`;
check what `contentWidth` is in the narrow layout below 30 columns.

## Verification

- At 28 and 29 columns, every character of every Diff line is on screen,
  wrapped or marked as clipped; never silently dropped.
- A test renders a Diff at those widths and checks it.
