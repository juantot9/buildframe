---
id: WF-280
title: "Keys that fit the moment"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-07
---

## Outcome

The keys row offers what works in the current situation, drops the same keys at the same width in every pane, and the balanced arrangement shows that the pane it hides exists.

## Finding

The 2026-11-06 critique re-run (P2, "the keys row doesn't fit the situation"):

- The empty Review said "press f" but its keys row offered `[a]`, `[v]`, `[ and ]` and `[j/k]` instead. None of those does anything there.
- Ranks differed by pane: at the same width, the Diff kept `[q] quit` and dropped `[Esc] Home`, while Files did the opposite.
- With History focused, `[ and ] history` disappeared.
- At 100 columns, Files and History share one side pane, and nothing showed that History existed.

## Interface

- **Empty Review** (changed files listed, none changed): the row is `[Tab] pane`, then `[f] all files`, then the app keys.
- **One rank table:** `[Enter] open` 4, `[a] new Message` 3, `[f] Changed / All` 5, `[ and ] history` 5, `[v] side-by-side` 7, `[t] review points` 8. `[Esc] Home` and `[q] quit` share rank 6.
- **History focus:** `[ and ] history` shows in every pane once there is history.
- **Balanced title:** the side pane's title names its sibling: `· History N` in Files, `· Files` in History.
- `DESIGN.md` records the rank rule, the empty-Review row and the balanced title.

## Verification

- `says plainly when nothing has changed, and how to go on` asserts `[f] all files` and no `[a]` or `[v]`. It fails on the old code.
- `keeps user-owned pane geometry stable while focus changes emphasis` asserts `Files FOCUSED  Changed  · History 0` at 100 columns. It fails on the old code.
