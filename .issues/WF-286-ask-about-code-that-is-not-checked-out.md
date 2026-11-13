---
id: WF-286
title: "Ask about code that isn't checked out"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-09
---

## Outcome

In a Review of a commit or range, you can ask about a line in a file that isn't in your checkout, for example one that only exists on another branch. A deleted file says up front why it can't take a Message.

## Finding

Owner question, 2026-11-09: "what happens when I ask about a file that is in other branch and is not in the code right now?"

- **Commit or range Review:** a Message already reads the line from the Review Snapshot saved when the Review started, not from the files on disk. It quotes the line with its commit and a "historical source … not current code" caveat. No test covered this case, so it is tested now.
- **Deleted file:** the file has no new side, but `a` opened a composer at line 1 anyway. The refusal only came at send time, and it said "That file is no longer there", which reads as if the file disappeared after the Review started.

## Interface

- **`a` on a deleted file** (any Review): no composer opens. The status line says "This file was deleted, so it has no line to ask about. Pick another file."
- **No change** to what a commit-origin Message sends: `From <hash> · <subject> — <file>:<line>:`, the fenced line, then the caveat.

## Verification

- `quotes a commit Review line from its saved copy when the file exists only on another branch` (workspace):
  - the file is committed on `side`, and the checkout is back on the base commit, where the file doesn't exist;
  - a commit Review of `side`, then a Message on line 2;
  - asserts the exact outgoing text in both the inspection and the dispatched directive.
- `opens a Review on the first listed file, not on a deleted one` (TUI), extended:
  - selects the deleted file and presses `a`;
  - asserts the notice and no `New Message` card;
  - fails on the old code.
