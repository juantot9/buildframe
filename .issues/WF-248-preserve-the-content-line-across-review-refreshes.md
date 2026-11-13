---
id: WF-248
title: "Preserve the operator's content line across Review refreshes"
status: closed
labels:
  - wayfinder:task
parent: WF-244
assignee: juanan
created: 2026-09-17
---

## Outcome

While an unchanged file's content is open, a Review refresh or a re-read of the
same file keeps the operator's selected content line instead of jumping back to
line 1. A new file selection and an explicit anchor still land where asked.

## Finding

`applyReview` cleared `unchangedContent`, `unchangedContentLine`, and
`unchangedContentOffset` on every applied Review bundle, not only when the
Review identity changed, so each live projection update reset the content cursor
to line 1. `previewUnchangedFile` and `applyUnchangedFileContent` reset to
line 1 whenever no explicit `anchorLine` was supplied, including when
re-applying the file already on screen, and a stale in-flight content read could
overwrite a line the operator had since moved to.

CI's Linux runs of the WF-244 scenario exposed it: after selecting
`stable.txt`, the `j`/click to line 2 could be reset before the marker rendered,
and the composer opened at `stable.txt:1` instead of `stable.txt:2`. A Linux
container reproduced the scenario failing roughly one run in four at the
content-line marker or the composer line; moving the reset under the
Review-identity change and preserving the same-file line made the three
affected scenarios pass 10/10 under the same load.

## Interface

None. The Application model keeps its selection state; no Workspace read,
projection, protocol, or durable shape changes.

## Module seam

The Application model owns operator selection. A projection refresh of the same
Review reconciles content but must not reset a position the operator owns; a
different Review, a different file, or an explicit anchor still resets or lands
explicitly.

## Acceptance

- [x] A Review refresh of the same Review keeps `unchangedContentLine` and
      `unchangedContentOffset`.
- [x] Selecting a different file still starts at line 1, and an explicit
      Message/compared anchor still lands on its line.
- [x] A stale content read for the same selected file does not discard a line
      the operator moved to while it was in flight.
- [x] The WF-244 app scenario passes repeatedly on Linux, and the app
      scenarios, lint, format, typecheck, and build pass on macOS.

## Resolution

`applyReview` resets the unchanged-content state only when the Review identity
changes, beside the other selection resets. `previewUnchangedFile` carries the
current line as the anchor when it re-previews the already selected path, and
`applyUnchangedFileContent` keeps the current line when the applied path is the
one already on screen, so a stale read cannot overwrite a newer move.
`previewSelectedFile` clears the content when no file is selected.

## Completion evidence (2026-09-17)

- macOS full suite: 44 files / 380 tests pass on Node 26.5.1 with the fix;
  lint, format, dependency firewall, package and test typechecks, clean builds,
  and build smoke pass; `git diff --check` is clean.
- In the Linux container, with the WF-247 capture bound experiment in place to
  get past the separate eviction defect, the three affected app scenarios
  passed 10/10 after the fix, where runs before it failed roughly one in four
  at the content-line marker or the composer line. The macOS app scenarios pass
  with the fix, and selecting a different file still starts at line one.
