---
id: WF-089
title: "Add exact whole-file Review Anchors"
status: closed
labels:
  - wayfinder:task
parent: WF-079
assignee: juanan
blocked_by: [WF-087]
created: 2026-08-09
---

## Question

Can Review Questions target exact whole-file Anchors for empty, binary, or otherwise unrenderable Snapshot files without inventing rows or weakening line Anchors?

## Blocked by

- [Project verified Live Changes from Workspace](./WF-087-project-verified-live-changes.md)

## Acceptance evidence

- Anchor is a closed union whose whole-file variant binds one exact Review Snapshot and file side/scope with immutable content or explicit unavailability evidence.
- New textual files retain new-side line Anchors; deletions retain old-side line Anchors; empty and unrenderable files use whole-file Anchors.
- Ask validation and disclosure preserve exact Snapshot meaning through successor lineage and reject stale/racing targets atomically.
- Projection and tests distinguish line and whole-file targets without approximate coordinates.

## Resolution comment

Review Anchor input and durable State are now closed discriminated unions of exact `review.diff-line` and `review.whole-file` variants. A whole-file Anchor binds one immutable Review Snapshot, exact file identity, old/new side, file scope, optional verified file coordinate, and either captured content classification/length/SHA-256 identity or the exact non-captured/unavailable classification, availability, length, optional identity, and limitation evidence. Existing line Anchors retain exact line bytes, digest, side, and verified row coordinates.

Both initial/unchanged and successor Ask paths resolve the same union. Whole-file resolution validates the selected file/side and coordinate against exact Snapshot evidence, validates captured bytes against the side identity when available, and commits/discloses the Anchor in the same atomic Question/Handoff transition. Harness reconstruction revalidates whole-file metadata against immutable Snapshot files. Projection preserves the discriminant and exact whole-file evidence rather than inventing a line or approximate row; Application labels and navigates whole-file historical targets without treating them as inline Diff discussions.

The Interface scenario proves new-side textual and deleted old-side line Anchors, empty and binary whole-file Anchors, exact successor-Snapshot binding, multiple Questions reusing that successor, durable disclosure/restart reconstruction, projected target distinctions, and changed-after-inspection whole-file rejection with no State or effect. Owner-local codec coverage also proves explicit unavailable whole-file evidence. All 75 focused Workspace/Application scenarios and `pnpm v1:typecheck` pass; Workspace and Application isolated-declaration builds pass; `git diff --check` is clean on Node 26.5.1.

## Authority

- [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)
- [`docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md`](../docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md)
- `CONTEXT.md` definitions of Anchor and Review Snapshot
