---
id: WF-278
title: "Whole words and whole names"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-06
---

## Outcome

A History row never cuts a file name, and every preview that has to give way ends on a whole word before its `…`.

## Finding

The 2026-11-06 critique re-run (P2, "text is still cut mid-word"). History rows showed "…ue.ts:17", "…Queue.ts:17" and "…wQueue.ts:16", so two Messages in different files could look alike. The stacked card cut "equal priori…", and the ASCII History preview cut "is working o...".

## Interface

- **Locations:** `fitLocation` keeps `path:line`, then `name:line`. When the name still doesn't fit beside the state word, it says `line N`; the Diff title already names the file.
- **Previews:** History's last preview row and `fitDisplayCellsEnd` (stack rows, Home history detail, the agent status line) end on the last whole word before the ellipsis. A single word longer than the room is still cut where it must be.
- `DESIGN.md` records both rules.

## Verification

- `never cuts a file name in a History row; it falls back to the line` fails on the old code ("› #1 …dering.ts:1") and passes now ("› #1 line 1").
- `fits text by keeping its start or its end` covers the whole-word cut and the single-long-word case.
