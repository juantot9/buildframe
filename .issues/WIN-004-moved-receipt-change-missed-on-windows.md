---
id: WIN-004
title: "A moved receipt changed during a read was missed on Windows"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: null
blocked_by: []
created: 2026-11-22
---

## Finding

In CI run 44958983631 (Windows, Node 26.13.1 only),
`legacyReviewMovedReceiptSources.test.ts:746` changed a moved receipt while
it was read and expected `{ status: 'unavailable', reason:
'changed-during-read' }`; the source came back `detected`. The other Windows
job and every macOS and Linux job passed the same test.

Not investigated yet. Candidates: the change check compares file metadata
that Windows updates lazily or with coarser precision, or the test's change
lands outside the window it means to hit on a slower runner.

## Cause (2026-11-22)

The read compares the file's `dev`, `ino`, mode, size, `mtimeNs` and
`ctimeNs` before and after (`sameStat` in `legacyReviewSource.ts`). The
test's mutations after the first are the same size (`changing-1`,
`changing-2`, …), so only the timestamps can show the change, and NTFS
stamps them from the system clock tick. On the reference machine, 1,177 of
2,000 quick same-size rewrites left size, `mtimeNs` and `ctimeNs` all
unchanged (probe: rewrite through one handle, `fstat` through another).

So the product can miss a change during a read on Windows: a same-size
rewrite within one clock tick. Linux has the same gap in principle (file
times come from a coarse clock) but far less often; it never failed there.
The same before-and-after comparison guards the content window in
`workspaceEvidence/repositoryContent.ts`.

Options, for the owner:

- Keep the metadata check and write the limit down (WF-304: differences are
  written down, not hidden); make the test change the size each time so it
  tests the retry path deterministically.
- Read twice and compare digests where a torn read matters. Receipts are
  small, so the cost is one more bounded read; the saved bytes and
  diagnostics stay the same on every platform.

## Work

- Find what the moved-receipt read compares before and after, and whether
  Windows can change a file's bytes without changing what is compared.
- Fix the product if it can miss a change; otherwise make the test hit the
  window deterministically.

## Verification

- The test passes on the Windows CI job in repeated runs.
