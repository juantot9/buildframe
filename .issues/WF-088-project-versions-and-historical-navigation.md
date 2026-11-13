---
id: WF-088
title: "Project Versions and exact historical navigation"
status: closed
labels:
  - wayfinder:task
parent: WF-079
assignee: juanan
blocked_by: [WF-087]
created: 2026-08-09
---

## Question

Can Workspace Projection expose bounded Versions navigation over Live Changes and immutable Review Snapshot lineage, with exact historical Question targets and no whole-Review projection?

## Blocked by

- [Project verified Live Changes from Workspace](./WF-087-project-verified-live-changes.md)

## Acceptance evidence

- A bounded Versions read lists Live Changes and chronological immutable Snapshots with stable identities and same-version navigation bases.
- Selecting a Snapshot projects its exact Files, Diff, Questions, and a clear historical state; returning to Live Changes restores the mutable latest projection.
- Opening any historical Question resolves its original Snapshot and exact Anchor after later successors exist.
- A historical Question appears inline in Live Changes only on proven exact source reuse; ambiguity remains historical.
- Existing one-Snapshot Reviews project correctly without migration or digest rewriting.

## Resolution comment

Workspace Projection now exposes bounded `review.versions` windows over each Review's immutable Snapshot lineage. Items are newest-first for navigation while retaining stable oldest-first ordinals, exact Snapshot/predecessor identities, latest status, file counts, and capture verification. Projection validates every returned predecessor link against the durable chronology and reconstructs the same list after restart.

The existing bounded Manifest, Diff, and Questions requests now accept an optional selected `reviewSnapshotIdentity` from that lineage. Their headers identify both selected and latest Snapshot plus ordinal/total/latest metadata. Historical Manifest and Diff bytes are read only from the selected immutable records, linked Questions are filtered by their durable Snapshot identity, and all projected actions are absent for historical versions. Unknown Snapshot selections fail as not found, and Versions, Files, Diff rows/text, and linked Question output remain bounded.

The successor-Snapshot Interface scenario proves two-version chronology, stable file navigation, old exact bytes rather than current source, version-linked Questions, read-only historical actions, rejection of an oversized Versions window, and identical restart reconstruction. All 62 Workspace tests and `pnpm v1:typecheck` pass; the Workspace isolated-declaration build passes; `git diff --check` is clean on Node 26.5.1. No immutable Snapshot or historical payload is rewritten.

## Authority

- [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)
- [`docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md`](../docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md)
