---
id: WF-090
title: "Add Live Changes and Versions to the Reviewing Application"
status: closed
labels:
  - wayfinder:task
parent: WF-079
assignee: juanan
blocked_by: [WF-088, WF-089]
created: 2026-08-09
---

## Question

Can the Application consume Workspace-owned Live Changes and Versions, navigate exact historical Questions, and preserve but block a composer whose source target changes without reconstructing policy or polling Git evidence?

## Blocked by

- [Project Versions and exact historical navigation](./WF-088-project-versions-and-historical-navigation.md)
- [Add exact whole-file Review Anchors](./WF-089-add-whole-file-review-anchors.md)

## Acceptance evidence

- The visible default current-change Diff updates from Workspace subscriptions; commit/range Reviews remain fixed.
- Versions navigation and `Return to Live Changes` preserve stable selection where exact identities survive and label historical source clearly.
- A source change during composition preserves exact text, marks the original target changed, and blocks ordinary Ask until the user returns to latest source and reselects; a race commits no Question or effect.
- Clicking a historical Question opens its complete original Snapshot and Anchor.
- The Application's 750 ms current-source polling loop is deleted, and owner-side subscription error semantics satisfy the X-02/A-06 constraint.

## Resolution comment

The Reviewing Application now composes its default current-change Files/Diff from Workspace-owned `review.live-*` views, subscribes to same-State live identity changes, and consumes bounded Versions alongside Manifest, Questions, Harness interaction, and Ask inspection. Fixed commit/range Reviews remain Snapshot-backed. The 750 ms Application verification timer and all related polling state/methods are deleted; owner hints/fallback and typed Projection failure updates are the only automatic refresh/error sources.

The visible source is explicitly `Live Changes` or an immutable numbered Version. `[`/`]` navigate bounded Versions, `L` returns to Live Changes, file selection survives when its stable identity remains, selected Snapshot Questions are linked/read-only, and Question navigation carries the original Snapshot identity. Workspace now exposes the current inspection's matching Live Changes identity, so Application bundle convergence cannot pair a Live Diff with a different source inspection.

A composing Question retains its exact text and original Live identity across same-State source refresh. Changed targets remain visibly `TARGET CHANGED`, Enter dispatches nothing, and Esc explicitly reselects the currently selected exact Live line/file while preserving text; a later owner-side race still rejects atomically. Empty/unrenderable Diff selections open a whole-file composer and dispatch the closed whole-file Anchor variant. Line inputs retain exact file ordinals without relying on temporary Live row identities, preserving historical file navigation across successors.

Application scenarios prove subscription-driven visible Diff movement, whole-file Ask, immutable Responses while Live source moves, composer preservation/block/reselection/no effect, stable Version selection and return to Live, historical Snapshot detail, and bounded stress rendering. All 76 focused Workspace/Application scenarios and `pnpm v1:typecheck` pass; the compiled dogfood probe was updated to the Live composer contract and passes on Node 26.5.1; `git diff --check` is clean.

## Authority

- [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)
- [`docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md`](../docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md)
