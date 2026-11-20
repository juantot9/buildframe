---
id: WF-318
title: "The wheel over a Files list that fits on screen jumps to its first or last file"
status: open
labels:
  - wayfinder:task
assignee: null
blocked_by: []
created: 2026-11-20
---

## Finding

Found by hand in WezTerm on Windows while checking the TUI
([WF-314](./WF-314-check-the-tui-in-windows-terminals.md)); the cause is in
shared code, so it should happen everywhere.

In a Review whose Files list fits in its pane (the WF-314 fixture: 8 changed
files, 17 rows), one wheel tick down selects the last file and one tick up
selects the first. The wheel is meant to move the view and leave the
selection alone.

## Cause

`handlePaneWheel` in `apps/buildframe/src/reviewingModel.ts` scrolls the
view first. When the view cannot move, Files steps the selection "just past
the loaded edge so the next window opens":
`moveFile(direction > 0 ? nodes.length - current : -current - 1, true)`. A list
that fits on screen can never scroll, so every tick takes that branch and
lands on an end. The same branch for Messages looks like it has the same
effect when every Message fits.

## Verification

- Over a Files list that fits on screen, the wheel changes nothing.
- Over a longer list, the wheel scrolls the view, and at the edge of the loaded
  window it still opens the next window (the behaviour the branch exists
  for).
- The same for Messages.
