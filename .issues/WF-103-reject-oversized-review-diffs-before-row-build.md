---
id: WF-103
title: "Reject oversized Review diffs before row construction"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: []
created: 2026-08-13
---

## Question

Can the Workspace preserve its existing `comparison-limit` degradation while rejecting a known oversized per-file Diff before it constructs projected row objects and row identities?

## Acceptance evidence

- `buildReviewDiff` checks `oldLines.length + newLines.length` immediately after both line sets are known and returns the existing `unavailable` / `comparison-limit` result when that sum exceeds 250,000; no context term or new outcome is introduced.
- A process-bounded Workspace Interface scenario captures an added text file at the first over-limit count (250,001 lines, well below the 50 MiB capture limit), starts the Review, and reads its Diff as `unavailable` / `comparison-limit` while the owner runs with a 96 MiB V8 old-space ceiling.
- The regression fails against the old implementation: under the same ceiling it exhausts the heap while constructing and hashing 250,001 discarded projected rows, so no Interface result is emitted.
- Existing ordinary Diff scenarios continue to pin available rows, stable identities, windows, and Anchors without exposing the private builder or adding a production test seam.
- No Workspace Interface, durable record shape, line-count bound, LCS behavior, or in-limit row identity changes.
- Focused Workspace Reviewing tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent route and package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled repair and exact precheck arithmetic: [`W-11`](../docs/audit/pre-p17-codebase-findings.md#w-11--the-per-file-diff-row-limit-is-checked-only-after-every-row-is-built)
- Reviewing/diff disposition: [Disposition the Workspace reviewing and diff findings](./WF-073-disposition-workspace-reviewing-and-diff-findings.md)

## Evidence prototype

- Throwaway branch `prototype/wf-103-diff-row-precheck` preserves the bounded-process experiment and its one-command runner. It answers only whether the accepted precheck can return the public result within a heap ceiling that makes the old row-building implementation fail.

## Constraints

- Keep the accepted conservative precheck exactly at the private builder; do not widen the package Interface or export the limit or builder for tests.
- Preserve `content-unavailable` and `not-text` precedence, the strict over-limit comparison, and every existing in-limit Diff row/window result.
- The regression must assert the observable Workspace result, not hash-call counts, row allocations, timing, or a private helper.
- Keep the subprocess helper test-only and ensure its fixture and Workspace owner are cleaned up on success or failure.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. `buildReviewDiff` now treats the known old-plus-new line count as the
worst-case row budget immediately after both line sets are available. A context
row consumes one line from each side and every other row consumes one, so a sum
over 250,000 returns the existing `unavailable` / `comparison-limit` result
before prefix/suffix comparison, projected row construction, or per-row SHA-256
identity work. The now-redundant post-build check is removed. Content and text
classification still take precedence, while every in-budget path is unchanged.

The new Interface scenario writes the first over-limit added file: 250,001 lines
in 500,002 bytes, far inside the existing 50 MiB capture ceiling. A test-only
child opens the real runtime owner with a 96 MiB V8 old-space ceiling, executes
`review.current-changes.start`, and reads the selected file through
`review.diff`. It emits the accepted State version 1 and the exact public
`comparison-limit` result. Its parent owns fixture cleanup; the child disposes
the Workspace owner in `finally`. No builder, limit, allocator, or hash seam is
exposed.

The throwaway proof is preserved at `68e6505` on
`prototype/wf-103-diff-row-precheck`. Restoring the old source under the final
regression makes the child abort with JavaScript heap exhaustion before emitting
a Diff result; the focused mutation therefore fails 1/1. The repaired complete
Workspace Reviewing file passes 12/12.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the dependency
firewall, all 19 files / 130 tests, typecheck, builds, and smoke. All four
compiled risk probes pass, and `git diff --check` is clean. No public Interface,
durable record, row/window identity, LCS rule, or capture limit changed. The
unrelated root `package.json` bump remains excluded.
