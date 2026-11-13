---
id: WF-087
title: "Project verified Live Changes from Workspace"
status: closed
labels:
  - wayfinder:task
parent: WF-079
assignee: juanan
blocked_by: [WF-086]
created: 2026-08-09
---

## Question

Can Workspace own a bounded Live Changes projection that treats file events as invalidation hints, authoritatively verifies HEAD-to-effective-working-state evidence, and replaces Application-side source polling without creating Artifacts on edits?

## Blocked by

- [Commit an atomic successor Review Snapshot on Ask](./WF-086-commit-atomic-successor-review-snapshot.md)

## Acceptance evidence

- Current-change Reviews expose mutable Live Changes separately from immutable Snapshot lineage; fixed commit/range Reviews do not.
- Hints are debounced/coalesced and verified by Workspace; missed, duplicated, and racing hints cannot produce an unverified freshness claim or an unsolicited durable write.
- Subscriptions deliver refreshed bounded views and surface permanent projection-record invalidity while preserving the deliberate treatment of transient inspection failure recorded under X-02.
- The 750 ms Application liveness loop is not yet replaced until the Application child consumes this projection, but this child provides the sole owner-side mechanism needed to delete it.
- Reads remain bounded and no working-tree watcher or Git mechanic crosses the Workspace Interface.

## Resolution comment

Workspace Projection now exposes bounded `review.live-manifest` and identity-correlated `review.live-diff` views for the current live Review. The views are built from exact Workspace Evidence bytes through the shared capture/diff implementation, carry a non-Artifact `liveChangesIdentity`, report whether they match the latest immutable Snapshot, and project direct Ask availability from verified latest source. Fixed comparisons and Previous Reviews remain frozen and do not acquire Live Changes.

A private Workspace invalidation source supplies recursive file events as hints. Projection debounces duplicate hints, single-flights subscription refreshes, verifies retained evidence before reuse, performs a bounded authoritative recapture only after movement, and retains a periodic owner-side verification fallback. Same-State-version content movement is delivered by live identity, while old identity-correlated Diff requests return `live-changes-moved` instead of mixing generations. Live capture retention is bounded to two entries, and all manifest, Diff-row, and text windows retain their existing bounds.

Permanent malformed Projection records now produce a typed `workspace.projection-failed` subscription update, which Application renders as visible failure; deliberate Workspace Evidence inspection failure remains a transient `unverified` Live Changes view. Interface scenarios cover same-version movement, duplicate-hint coalescing, fallback detection, exact Diff bytes, transient Git inspection failure/recovery, old-generation rejection, fixed-range behavior, and malformed durable State.

All 62 Workspace tests and `pnpm v1:typecheck` pass; the compiled dogfood risk probe passes; `git diff --check` is clean on Node 26.5.1. No Snapshot is mutated, no temporary Live state is represented as an Artifact, and no unbounded Interface read was added.

## Authority

- [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)
- [`docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md`](../docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md)
- X-02 and A-06 constraints in the ledger Summary
