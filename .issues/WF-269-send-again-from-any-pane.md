---
id: WF-269
title: "Send again and interrupt from any pane"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-06
---

## Outcome

The Message card's "Press r to send it again" and "Press x to interrupt" are true wherever the card shows. `r` and `x` act on the selected Message from Files, the Diff or History, and the keys row offers them in every pane while they apply.

## Finding

The 2026-11-06 critique raised this as P1. A failed Message's card shows in both the Diff and History, but `r` only acted when History had focus. Elsewhere the status line said to Tab to History, select the Message, then press `r`, even though that Message was already selected. The keys row showed `[r] send again` and `[x] interrupt` only in History. This was the recovery moment, and it ended on a detour.

## Interface

- `r` and `x` act on the selected Message from any Review pane.
- With no Message selected, both say "No Message is selected. Select one in History, then press r" (or x), in the info tone.
- The keys row puts `[r] send again` or `[x] interrupt` just after `[Tab] pane` in every pane, whenever the selected Message is in that state.
- The help list always shows `r` and `x`.
- The working card reads "Press x to interrupt."
- `DESIGN.md` (Keys row) records the rule.

## Verification

- `opens and resends a Message in a file outside the loaded part of the Files list` now expects `[r] send again` in the keys row while Files has focus. It then presses `r` from Files, with the Message's file outside the loaded part of the list, and the draft reopens on that file.
- `opens the key list with ?, says x needs a selected Message, and quits with q` covers `x` with nothing selected.
- Both fail on the old code. All 91 app tests pass.
