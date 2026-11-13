---
id: WF-242
title: "Show Messages in the Diff and follow Messages-panel navigation"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-16
---

## Outcome

Selecting a Message in the Messages pane puts its exact line on screen in the Diff pane and shows the complete Message and its Response inline beneath that row. Moving the selection with j/k follows the anchor, and opening a Message at another Review point switches to its origin basis and lands on the same line.

## Finding

The pre-diff-first Reviewing view rendered the selected Question thread inline in the Diff beneath its anchored row, and moving the Questions-pane selection navigated the Diff to that row (`navigateToQuestion`). The diff-first Messages model lost that path: the Diff pane renders `discussionThreadCard` only for legacy Questions, `moveMessage` loads the Message body without touching the Diff, and `ReviewMessageListItem.location` carries only `file:line` with no presentation coordinate, so the row cannot be selected.

## Interface

`review.diff` and `review.live-diff` accept an optional `anchorLine` and return the 64-row window containing that line's row when the file has one, falling back to the requested offset when it does not. The Application model gains `navigateToMessage`, which follows the Messages-pane selection into the Diff exactly as `navigateToQuestion` does for legacy Questions; `applyReviewMessageOrigin` lands on the origin line. The Diff pane renders the selected Message inline like the legacy Question thread, with the complete body and Response and the existing card paging. No durable record, wire frame, or protocol version changes.

## Acceptance

- [x] Moving the Messages-pane selection highlights the anchored row and scrolls the Diff to it.
- [x] A Message whose line is outside the loaded window loads the window that contains it, live and saved Snapshot alike.
- [x] The selected Message renders inline in the Diff with its complete body and Response, paging like the legacy thread card.
- [x] Opening a Message at another Review point switches to its origin basis and shows the same line and card.
- [x] A Message whose line cannot be located fails visibly without fabricating a row.
- [x] Focused scenarios, full verification, the compiled dogfood probe, and `git diff --check` pass with unrelated work untouched.

## Resolution

`review.diff` and `review.live-diff` now accept an optional `anchorLine`. The live path resolves it from the in-memory projected rows; the Snapshot path scans stored Diff windows in bounded eight-window batches and returns the window whose row carries that source line (new side first, old side as fallback). An unresolvable line keeps the caller's requested offset, so no window or row is ever fabricated.

The Application model gains `navigateToMessage`, which the Messages-pane navigation (`moveMessage`), `openSelectedMessage`, and the post-commit bundle path all use. In the current basis it selects the anchored row in place when the window already contains it, otherwise it loads the window with the `anchorLine` hint; when the Message belongs to another Review point it opens the origin view, whose `anchorLine` selection lands on the same line after the basis switch. A Message file outside the loaded window, or one on an unchanged file, produces a notice instead of a wrong row.

The Diff pane resolves the selected Message to its visible row (`selectedMessageThread`) and renders a `messageThreadCard` beside it in both inline and side-by-side modes. The card mirrors the legacy Question thread: the anchored code line, one row per Message at that line, then the complete Message body and the complete Response (or the honest awaiting state) with the shared Ctrl+K/J paging. The card is suppressed while the composer is open.

## Completion evidence (2026-09-16)

- New projection scenarios prove `anchorLine` resolves to window offset 128 for a 200-line file changed at line 180, live and saved Snapshot alike; an unresolvable line keeps the requested offset; and `anchorLine: 0` is rejected.
- A new Application scenario composes two Messages at `review.txt:1` and `review.txt:3`, settles the first Invocation with exact start and terminal evidence, and proves each selected Message renders `reviewing-expanded-message-card` inline while its Diff row owns the selection; `k`/`j` in the Messages pane move both the card and the selected row.
- Verification on Node 26.5.1: the full suite passes 43 files / 375 tests; lint, format, dependency firewall, typecheck, clean builds, build smoke, all four compiled risk probes (State, Local Runtime, Pi, dogfood), and `git diff --check` pass. The unrelated repository-health backlog remains untracked and untouched.
