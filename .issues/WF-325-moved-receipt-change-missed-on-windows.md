---
id: WF-325
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

## Work

- Find what the moved-receipt read compares before and after, and whether
  Windows can change a file's bytes without changing what is compared.
- Fix the product if it can miss a change; otherwise make the test hit the
  window deterministically.

## Verification

- The test passes on the Windows CI job in repeated runs.
