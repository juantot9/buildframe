---
id: WF-192
title: "Refresh the Current Review's Change Set explicitly"
status: closed
labels:
  - wayfinder:task
parent: WF-187
assignee: juanan
blocked_by: [WF-191]
created: 2026-09-05
---

## Resolution
Closed (2026-09-05). Reviewing gains one closed `review.change-set.refresh` command for the Active Review's exact-resolution comparison Change Set: the owner-local currentness interpretation re-resolves the declared intent (fixed endpoints stay fixed, dynamic refs re-resolve through their witnesses, scope membership and degradation facts re-derive) and answers unchanged versus changed without new caller-side comparison logic. An unchanged observation reuses the latest Snapshot byte-for-byte, is fully deterministic (no timestamps or generated identities), and commits no record, so the State version never advances and same-command replay re-derives the identical accepted result. A changed observation materializes one successor through the existing capture route (unpinned so moved selectors resolve forward), Durable-Commits the complete successor Snapshot/records/index/result atomically with `previousReviewSnapshotIdentity` lineage, and recall makes replay return the identical successor. Closed diagnostics (`change-set-refresh-unsupported`, `change-set-lineage-limit-reached`, plus existing phase/version/identity reasons) never advance State; refreshed successors flow through Projection and Harness via the one delegated verifier. Local Runtime version-1 transport is generic over `WorkspaceCommand` and carries the command unchanged.

## Outcome

Reviewing gains one explicit, human-invoked refresh of the Current Review's unchanged Change Set intent. An exact unchanged capture reuses the latest Snapshot and advances no State; a changed exact capture atomically writes one complete successor Snapshot, records, index, and result with bounded lineage and no Anchor movement. Race, replay, restart, failed commit, and unknown outcome can never create a partial or duplicate successor.

## Interface

Add one closed Reviewing command for explicit refresh of the Active Review's retained Change Set intent, accepted only for a current, resolvable, pre-Baseline comparison Change Set — never for fixed-only historical convenience selections whose evidence is already frozen, and never as an automatic, watcher, or scheduled behavior. The command re-resolves the declared intent (fixed objects stay fixed; dynamic selectors re-resolve through their witnesses; scope membership and degradation facts re-derive) through the existing capture route.

Results are closed and exhaustive: `unchanged` reuses the latest Snapshot byte-for-byte, records the refresh observation, and advances no State version; `changed` Durable-Commits exactly one successor Snapshot with new resolution/endpoints/witnesses/scope evidence, updates the Change Set's Snapshot lineage within the existing bounded history, and advances State once. Human Anchors never move or re-target: successor Snapshots reference the same immutable Anchors, and any mapping/coverage consequences belong to P23, not this child. Concurrent human commands (start, finish, cancel, annotation) resolve by the existing exact State-version expectations; a lost race returns a closed diagnostic and never a partial successor. No UI is added in this child beyond the command surface the existing Reviewing routes already expose.

## Module seam

Reviewing remains the owner of Review, Change Set, Snapshot, and refresh records and performs the successor Durable Commit atomically through its existing transition machinery; Workspace Evidence supplies capture and the one owner-local currentness interpretation, extended to answer "unchanged versus changed" for refresh without new caller-side comparison logic. Projection and Harness Interaction keep delegating; the successor relationship is Reviewing-owned lineage, not a Workspace concept.

## Acceptance

- [x] Explicit refresh of the Active Review's comparison Change Set re-resolves declared intent through the existing capture route; fixed endpoints stay fixed, dynamic selectors re-resolve with witnesses, scope membership and degradation facts re-derive, and nothing fetches, hydrates, or mutates the checkout.
- [x] Exact unchanged capture reuses the latest Snapshot and advances no State version; the refresh is observable, idempotent under replay, and returns the identical accepted result for a same-command replay.
- [x] Changed exact capture Durable-Commits exactly one successor Snapshot, records, index, and result atomically with bounded lineage and one State advance; the prior Snapshot and all earlier records remain byte-identical and no Anchor moves or re-targets.
- [x] Preview/refresh races, concurrent human commands with exact State-version mismatches, mid-capture movement, restart between resolve and commit, corruption, and pre/post-commit faults each leave either the original or exactly one complete successor — never a partial, duplicate, or contradictory lineage.
- [x] Refresh rejects closed diagnostics for missing/unresolvable intent, exceeded lineage bounds, wrong Review phase, and non-comparison Change Sets without advancing State or mutating records.
- [x] Old format-1 records keep parsing; new optional refresh/lineage fields validate strictly and never make an old record mean something new. State format 2 and Interface version 1 are unchanged.
- [x] Comparison currentness stays owned once; Projection headers and Harness inspection report the successor through the existing delegated verifier. A focused mutation that reuses the latest Snapshot on changed intent, or that allows a duplicate successor under replay, makes the relevant focused scenarios fail.
- [x] Focused Workspace/Reviewing scenarios, Local Runtime version-1 transport of the new command, canonical verification, all four compiled risk probes, dependency/package seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with the package-manager bump unstaged.

## Constraints

- Read local evidence only through the bounded, provenance-isolated Git inspection context. Never fetch, hydrate, checkout, stage, mutate the index or worktree, run a filter, or contact a host service.
- Refresh is explicit and human-invoked. No watcher, prefetch, background scan, timer, or Harness-driven trigger exists. Refresh never rewrites a prior Snapshot, moves an Anchor, or invents a mapping.
- One refresh produces at most one successor; bounded lineage (existing history bounds) is never exceeded silently. Cancellation semantics of the underlying Review are unchanged.
- Keep existing limits, deadlines, budgets, the FIFO, State format 2, Interface version 1, and format-1 compatibility. Add no Coverage, Re-review, disposition, or P23 semantics.
- Use only disposable real Git repositories and sanitized generated objects. Never inspect real user repositories, `.neoflow` state, Configuration, or receipts.

## Authority

- [Complete Change Set and Review Snapshot evidence](./WF-187-complete-change-set-review-snapshot-evidence.md)
- [Resolve optional exact file scope for Change Set evidence](./WF-191-resolve-optional-exact-file-scope.md)
- [Degrade special, sparse, Gitlink, and partial evidence per side](./WF-190-degrade-special-sparse-gitlink-partial-evidence.md)
- [Capture index and working-state comparisons](./WF-189-capture-index-working-comparisons.md)
- [Resolve exact local revision Change Sets](./WF-188-resolve-exact-local-revision-change-sets.md)
- [Define the workspace and change-set evidence contract](./WF-023-define-workspace-change-set-evidence.md)
- [Shape the Reviewing workflow](./WF-006-shape-reviewing-workflow.md)
- [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
