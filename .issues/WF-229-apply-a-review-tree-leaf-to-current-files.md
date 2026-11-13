---
id: WF-229
title: "Apply a review tree leaf to current files (parked)"
status: open
labels:
  - wayfinder:task
parent: WF-225
assignee: juanan
blocked_by: [WF-226]
created: 2026-09-08
---

## Status: parked — no design, no authorization

The user expressed **tentative interest** ("maybe … I don't know") in being able to apply a review tree leaf — adopting a past review point's state or its changes onto current files. This issue intentionally parks that interest. Nothing here authorizes design detail, a prototype, or implementation.

## Reserved design requirements (from the accepted direction)

Whenever this is taken up, it remains the separately designed explicit **apply-selected-changes** action:

- Show the proposed changes and all conflicts **before** anything is applied; never apply implicitly.
- Preserve newer work; applying never means a whole-repository rollback or an implicit checkout.
- The executor (exact application versus Harness-assisted adaptation), conflict behavior, and mutation consent are open design questions.
- Interaction with the change-driven tree must be defined: adopting a leaf is not re-parenting history, and applying must itself be a recorded change event under WF-226's fork rules.

## Non-goals while parked

- No "undo" framing, no automatic replay of past changes, no branch management.
- No weakening of the current-target validation or the one-message interaction to make this possible.
