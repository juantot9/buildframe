---
id: WF-247
title: "Keep verification captures retained across projection reads"
status: closed
labels:
  - wayfinder:task
parent: WF-205
assignee: juanan
created: 2026-09-17
---

## Outcome

A Message commit's final capture verification cannot fail because the Workspace
Evidence retention evicted the capture it is verifying, and the Review
projection's live captures stop thrashing re-captures when the evidence map
evicts them. The shared retention bound stays a private module constant; no
Interface, protocol, or durable shape changes.

## Finding

CI's first Linux runs of the two-message scenarios
(`shows each selected Message inline in the Diff…`, `renders a Message anchored
in an unchanged file…`) failed after the second Message was committed. The
first Message committed; the second commit was refused with
`inspection-changed`, and the UI showed the misleading banner `The selected
file changed; Message not sent. Press x or F4…`. Instrumented reproduction in a
Linux container showed the Workspace reason: the revalidation capture read
during the commit was missing from the evidence retention map
(`workspace.current-changes.verify` → `unverified / evidence-not-retained`).

`MAX_RETAINED_CAPTURES = 2` bounds one FIFO shared by current-change and
comparison captures. Every capture read inserts a new entry, and the Review
projection retains up to `MAX_LIVE_CAPTURES = 2` live captures that it verifies
by identity on each read (`#verifiedLiveChanges`). Two is not above the live
set plus a fresh capture per read, so the projection enters a verify-miss →
re-capture loop, and a commit's revalidation capture can be evicted between its
retention and the final `#snapshots.verify` (the window includes the live
context verification await). Raising the bound to 8 in the container removed
both failures.

## Interface

None. `MAX_RETAINED_CAPTURES` stays private to `workspaceEvidence.ts` and
non-configurable; the WF-105 FIFO scenario observes the new bound through
bounded manifest reads.

## Module seam

Workspace Evidence owns the retention policy; the projection's live-capture
cache depends on the evidence map keeping captures it still verifies. The bound
must exceed the live set plus in-flight commit captures, not merely equal it.

## Resolution

Two changes stop the eviction refusal:

- **Break the projection's re-capture loop.** `#captureLiveChanges` returned
  the retained live-capture entry even after taking a fresh capture for the same
  live-changes identity, so the fresh evidence was orphaned and every later
  read verify-missed again and inserted yet another capture — churning the
  shared FIFO until it evicted the capture a commit was about to verify. It now
  rebuilds the entry around the fresh capture (same live-changes identity, so
  the projection is equivalent), which makes the next verify succeed instead of
  re-capturing. A regression test in `workspaceProjection.test.ts` pins the
  adoption: it fails when the early return is restored.
- **Raise the shared FIFO bound to 4** (`MAX_RETAINED_CAPTURES`): the
  projection's live set (`MAX_LIVE_CAPTURES`, two reviews) plus an in-flight
  Message commit's fresh capture, with one slot of slack for a concurrent
  comparison capture. Context captures keep their own two-entry bound
  (`MAX_RETAINED_CONTEXT_CAPTURES`), which their scenarios already pin. The
  WF-105 FIFO scenario moves to the new bound and asserts eviction only on the
  fifth capture.

The bound experiment left one real test-side artifact: raising the bound
changes the render schedule, and the clicked-row scenario read its click
coordinates from a freshly replaced tree that had not been laid out yet
(`screenX/Y/W/H` of `0,0,0,1`), so the click degraded to a region click. The
scenario now waits for the Diff rows to be laid out before reading their
coordinates; the synchronous selection assertion is unchanged. The ENOTEMPTY
cleanup race in the early-exit Evidence scenario (git processes can recreate
`.git` before the test renames the hidden directory back) is fixed by clearing
the recreated path before restoring the hidden directory.

## Acceptance

- [x] The projection adopts a fresh re-capture for the same live-changes
      identity instead of serving an entry whose evidence was evicted, so the
      capture FIFO stops churning and `evidence-not-retained` cannot refuse a
      commit where nothing changed.
- [x] The `selects clicked Files and Diff rows through the bounded Review
      projection` synchronous marker assertion still holds under the fix.
- [x] The two-message app scenarios pass repeatedly on Linux without
      `inspection-changed` from an evicted capture.
- [x] Workspace Evidence scenarios, the app scenarios, lint, format, typecheck,
      build, smoke, and the compiled probes pass.

## Investigation so far (2026-09-17)

Raising the bound in a Linux container removed the two `inspection-changed`
refusals, but every value tried above 2 (`3`, `4`, `6`, `8`, `16`) also made the
`selects clicked Files and Diff rows through the bounded Review projection`
scenario fail its synchronous clicked-row marker assertion, so no bound change
was landed. The capture is still evicted under concurrent projection reads. A
fix must either make the projection reuse verified captures instead of
re-capturing unconditionally, or pin a capture through the commit's
revalidation and final verification. WF-248's landed content-line preservation
removes the navigation flake that appeared beside this defect, but not this one.

## Completion evidence (2026-09-17)

- macOS: 44 files / 381 tests pass on Node 26.5.1 with the adoption and the
  raised bound; lint, format, and the dependency firewall pass, package and
  test typechecks pass, clean builds and build smoke pass, and all four
  compiled risk probes pass (`risk:state`, `risk:runtime`, `risk:pi` on Pi
  0.80.6, `risk:dogfood`).
- CI run [`35248769725`](https://github.com/juantot9/neoflow/actions/runs/35248769725)
  is green on both engines boundaries: `verify (Node 26.5.1)` in 4m21s and
  `verify (Node 26.4.0)` in 5m33s on `macos-latest`, covering the two-message
  scenarios and the new projection regression test.
- Linux container (`node:26.5.1`, 2 CPUs, non-root `node` user): the two
  Message scenarios and the clicked-row scenario pass in two consecutive
  full-suite runs (379/380 each; the only failure is the pre-existing
  `legacyReviewMovedReceiptSources` changed-during-read container flake, which
  also fails in isolation), and a 5× focused loop of the three scenarios passes
  15/15. The context evidence file passes 14/14 as the non-root user.
- The measurement that isolated the cause: the Message scenario failed 3/3 at
  `MAX_RETAINED_CAPTURES = 2` and passed 3/3 at 4; the raised bound alone still
  let a full Linux run refuse the second Message (`Selected file changed;
  Message not sent`), because `#captureLiveChanges` kept returning the evicted
  entry while inserting an orphaned capture on every read. Adopting the fresh
  capture made the following full runs pass the Message scenarios.
- The clicked-row scenario failed 4/5 at bound 4 with click coordinates read
  from an unlaid tree (row rect `0,0,0,1`) and passes with the layout wait; the
  synchronous selection assertion is unchanged.
- A load-independent regression test in `workspaceProjection.test.ts`
  (`adopts a fresh live capture on eviction instead of re-capturing every
  read`) fails on the pre-fix early return and passes with the adoption.
