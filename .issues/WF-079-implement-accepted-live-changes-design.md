---
id: WF-079
title: "Implement the accepted Live Changes design"
status: closed
labels:
  - wayfinder:map
parent: WF-051
assignee: juanan
blocked_by: [WF-053]
created: 2026-08-09
---

## Destination

P16B of [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md) is implemented through the existing deep Workspace and Application Interfaces: default current-change Reviews project the latest verified working evidence, committed Questions retain exact immutable Snapshot and Anchor meaning, Versions provide exact historical navigation, commit/range Reviews remain fixed, and continuation from a frozen range preserves its saved endpoint. Existing Reviews remain readable facts and no source change invents a durable user decision.

## Authority

- Product language and truth-critical distinctions: [`CONTEXT.md`](../CONTEXT.md)
- Accepted semantics: [`docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md`](../docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md)
- P16B outcome, acceptance evidence, and learning gate: [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)
- Pull-forward roster and P16B constraints: [`docs/audit/pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md), Summary

## Route

Work one child at a time from the dependency frontier. The first milestone establishes the regression and compiler-safety net before any Live Changes semantic change:

1. X-09 terminal Review lifecycle tests.
2. L-03 typed Local Runtime → Workspace seam.
3. W-13 Workspace Reviewing/Harness durable codecs only.
4. W-01 bounded Snapshot evidence identity cache.
5. W-10 direct byte comparison in `sameDiffLine`.
6. Canonical verification and all four v1 risk probes.

After that milestone, implement the accepted semantics in dependency-sized children confirmed against the current Module seams. The provisional sequence is atomic successor Snapshot transition; Workspace-owned live evidence projection and invalidation verification; Versions and exact historical navigation Projection; Application navigation and composer source-change blocking; frozen-range continuation; then integration, risk probes, and human acceptance.

## Constraints

- Keep every finding independently traceable, and give every bug fix a regression that fails against the old implementation.
- W-13 here covers Workspace Reviewing/Harness durable structures. Local Runtime and Application codecs remain in P16C order. Do not touch unrelated `deepFreeze`, `validText`, legacy consolidation, add a generic cross-package validation package, or widen a public Interface merely to share object checks.
- Preserve the ledger Summary's X-01, X-02, L-04, and A-06 constraints; do not duplicate or weaken them in child-local designs.
- File events are hints. Workspace owns authoritative verification and bounded reads. The TUI does not orchestrate a semantic transition.
- Stop at the P16B learning gate if implementation would require mutable committed Snapshots, Anchor inference, replay, TUI-orchestrated multi-step commits, or unbounded working-tree reads.

## Blocked by

- [Chart the pre-P17 codebase deepening plan](./WF-053-pre-p17-codebase-deepening-plan.md)

## Decisions so far

- [Add terminal Review lifecycle regressions](./WF-080-add-terminal-review-lifecycle-regressions.md) — X-09 is closed with Interface-level historical completion, cancellation, and human-disposition scenarios asserting exact terminal results and State versions; production semantics are unchanged.
- [Type the Local Runtime to Workspace seam](./WF-081-type-local-runtime-workspace-seam.md) — L-03 is closed: Local Runtime now holds the real Workspace Interface, and its private frame union tracks Workspace command, request, and scope types without widening the public seam.
- [Add compiler-checked Workspace durable codecs](./WF-082-add-workspace-durable-codecs.md) — W-13's Workspace portion is closed with owner codecs for complete Reviewing/Harness durable structures, one private structural primitive Module, and malformed nested regressions; later-package codec scope stays deferred.
- [Bound the Snapshot evidence identity cache](./WF-083-bound-snapshot-evidence-cache.md) — W-01 is closed with four-entry FIFO retention and an Interface regression proving an evicted hint falls back to authoritative capture without changing Snapshot truth.
- [Compare Diff line bytes directly](./WF-084-compare-diff-line-bytes-directly.md) — W-10 is closed with direct `Uint8Array` comparison and a no-Buffer-construction regression over equal and unequal lines.
- [Prove the Live Changes prerequisite milestone](./WF-085-prove-live-changes-prerequisite-milestone.md) — all five pull-forwards are independently closed; canonical v1 verification and all four compiled risk probes pass on Node 26.5.1 before semantic changes.
- [Commit an atomic successor Review Snapshot on Ask](./WF-086-commit-atomic-successor-review-snapshot.md) — current-change Ask now reuses exact unchanged evidence or atomically commits one bounded immutable successor lineage entry with every Question/Handoff record before dispatch; races, faults, restart, and no replay are covered.
- [Project verified Live Changes from Workspace](./WF-087-project-verified-live-changes.md) — bounded current Files/Diff views now refresh on coalesced hints plus owner-side fallback verification at one State version, reject mixed generations, keep fixed Reviews frozen, and surface permanent Projection-record invalidity explicitly.
- [Project Versions and historical Snapshot navigation](./WF-088-project-versions-and-historical-navigation.md) — bounded newest-first Versions expose stable chronology, selected immutable Files/Diff and Snapshot-linked Questions are read-only, and restart reconstructs the same identities and bytes.
- [Add exact whole-file Review Anchors](./WF-089-add-whole-file-review-anchors.md) — Anchor input and durable disclosure are closed line/whole-file unions; empty, binary, unavailable, successor, race, projection, and restart semantics remain exact without invented rows.
- [Add Live Changes and Versions to the Reviewing Application](./WF-090-add-live-versions-application-flow.md) — default current Files/Diff are owner-refreshed Live Changes, immutable Versions are read-only/navigable, composers preserve text but block changed targets until explicit reselection, whole-file Ask is usable, and the 750 ms Application poll is deleted.
- [Continue a frozen range Review into Live Changes](./WF-091-continue-frozen-range-to-live-changes.md) — a same-State owner inspection and one generation-checked command require an explicit moved-HEAD choice, atomically create a new HEAD-based Current Review, retain the frozen range and Questions as durable supporting context, and leave the saved-endpoint composite as a separate no-effect intent.
- [Prove Live Changes integration and human acceptance](./WF-092-prove-live-changes-integration-and-acceptance.md) — canonical verification, all four risk probes, compatibility and fault scenarios, and fresh human use accept the P16B semantics; presentation findings remain explicit inputs to P16E's deferred UX gate.

## Resolution comment

P16B is implemented through the existing deep Workspace and Application Interfaces. Current-change Reviews project bounded, verified Live Changes; the first Ask after a source change atomically commits one immutable successor Snapshot before any Pi effect; durable Questions retain exact immutable Snapshot and line/whole-file Anchor meaning; Versions provide bounded historical navigation; fixed Reviews remain immutable; and explicit continuation creates one HEAD-based Current Review while preserving the frozen range as supporting context.

The final integration gate passes on Node 26.5.1 at `113d0e6`: `pnpm v1:verify` covers 105 tests, typecheck, builds, and smoke, and all four compiled risk probes pass. The human pass accepted Live Changes/Versions semantics, exact historical Question navigation, generation-first changed-composer blocking, saved-endpoint no effect, and current-HEAD continuation. The accepted visual and interaction concerns—including navigable historical dialogs, low-weight target-change disclosure, stable commit navigation and command chrome, in-place continuation, and opaque Terminal-theme dialog backgrounds—are deliberately retained for the P16E UX gate rather than folded into or used to weaken P16B semantics.

## Out of scope
