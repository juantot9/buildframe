---
id: WF-086
title: "Commit an atomic successor Review Snapshot on Ask"
status: closed
labels:
  - wayfinder:task
parent: WF-079
assignee: juanan
blocked_by: [WF-085]
created: 2026-08-09
---

## Question

Can the Workspace semantic owner make Ask reuse exact unchanged evidence or create one immutable successor Review Snapshot in the same Durable Commit as Question, Batch, Handoff, receipt, Capability Snapshot, and Invocation—before any Pi directive?

## Blocked by

- [Prove the Live Changes prerequisite milestone](./WF-085-prove-live-changes-prerequisite-milestone.md)

## Acceptance evidence

- The Review index records bounded chronological Snapshot lineage while existing one-Snapshot Reviews remain readable facts.
- Ask against exact unchanged evidence reuses the latest Snapshot; changed evidence creates exactly one immutable successor carrying the stable Change Set intent.
- Snapshot files, manifest and Diff windows, Question/Batch/Handoff records, both owner indexes, and the command result commit atomically or not at all.
- Race, failed commit, and crash-after-commit/before-effect scenarios prove no partial lineage and no replay.
- No mutable committed Snapshot, Anchor inference, TUI orchestration, or unbounded read is introduced.

## Resolution comment

Workspace now records a bounded chronological `reviewSnapshotIdentities` lineage while normalizing pre-lineage indexes to their one existing Snapshot. The first Snapshot has no predecessor; each successor records the previous latest identity. Existing immutable-Current Reviews remain readable without migration.

A private `ReviewSnapshotTransition` Module now owns bounded Evidence capture, exact bytes, Diff construction, immutable Snapshot/file/window records, final verification, and captured-Anchor resolution. Reviewing uses it for initial capture; Harness Interaction uses the same implementation so an Ask against changed current evidence adds the complete successor record set in the one State transaction that also commits Question, Batch, Handoff, receipt, Capability Snapshot, Invocation, both indexes, and command result before Pi dispatch. Exact unchanged evidence reuses the latest Snapshot, including follow-up Questions after a successor.

Interface scenarios prove unchanged reuse; changed-source successor creation and predecessor lineage; restart reconstruction; changed-after-inspection rejection with no State advance or effect; failed commit with no partial successor; and post-commit/pre-effect death with durable recovery and no replay. All 60 Workspace tests and `pnpm v1:typecheck` pass; the State and dogfood compiled risk probes pass; `git diff --check` is clean on Node 26.5.1. No committed Snapshot is mutable, no Anchor is inferred, and no TUI orchestration or unbounded read was added.

## Authority

- [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)
- [`docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md`](../docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md)
