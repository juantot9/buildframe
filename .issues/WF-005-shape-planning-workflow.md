---
id: WF-005
title: "Shape the Planning workflow"
status: closed
labels:
  - wayfinder:prototype
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: [WF-002, WF-003, WF-004, WF-018, WF-019, WF-020]
created: 2026-07-14
assets:
  - "git branch prototype/planning-workflow at 12f78c6"
  - "apps/tui/prototypes/planning-workflow/ on that branch"
---

## Question

What end-to-end Planning lifecycle—from entry and context curation through exploration, plan generation, anchored feedback, revision, approval, cancellation, and harness handoff—feels explicit and trustworthy without sacrificing the fluidity of working directly with a harness?

## Blocked by

- [Learn from Plannotator’s artifact-review loop](./WF-002-learn-from-plannotator.md)
- [Establish Claude Code’s integration envelope](./WF-003-establish-claude-code-integration-envelope.md)
- [Establish Pi’s integration envelope](./WF-004-establish-pi-integration-envelope.md)
- [Choose the harness operating posture](./WF-018-choose-harness-operating-posture.md)
- [Probe Pi’s attached-session guarantees](./WF-019-probe-pi-attached-guarantees.md)
- [Probe Claude Code’s attached Plan and Review paths](./WF-020-probe-claude-attached-paths.md)

## Resolution comment

Planning is one durable, artifact-centered workflow entered deliberately in Neoflow. A captured native Plan Offer enters it only through explicit Offer Association with an eligible existing Planning Workflow or a deliberately created new one; Neoflow never assigns it automatically, and new-Workflow association establishes the exact harness-neutral origin governed by [Define native-offer Planning origin semantics](./WF-037-define-native-offer-planning-origin.md). In a TUI-origin Workflow, context remains fluid and visible until `Start exploration`, which atomically creates an immutable Planning Context Snapshot and initiates the harness-appropriate Handoff without another confirmation dialog when no exceptional acknowledgment is required. Verified direct submission and explicit in-harness continuation are honest variants of that same lifecycle, not artificial parity.

Exploration remains in the harness-owned conversation. Only a contract-valid exact result from an explicit `Generate plan` request or a native Plan Offer can materialize an immutable candidate Plan Revision. Harness connector or hook evidence advances request-driven states automatically; those transitions are not user controls. Each revision remains in history. Anchored annotations stay editable and local until `Request revision` freezes them as an immutable Feedback Batch against the current revision, submits it deliberately, and leaves that revision visible until another candidate is captured.

Plan Approval is a durable user decision selecting one exact revision; it does not begin implementation and may be withdrawn until the first Implementation Handoff Durable Commit consumes it. Implementation Handoff is a separate explicit commitment with a Commitment Receipt and the selected path’s route-specific record or exact Manual material; it creates an Invocation only where that path’s lifecycle does. [Define Planning completion and post-approval lifecycle](./WF-032-define-planning-completion-lifecycle.md) establishes the later exact completion boundary; connector acceptance, correlated terminal outcome, and semantic correctness remain distinct and never establish Planning completion or prove the plan was followed.

Cancellation archives the workflow without deleting its artifacts. If an invocation is active, Neoflow may request interruption only where supported and must not claim that the harness stopped without correlated evidence. Missing terminal evidence leaves the invocation unresolved, retains snapshots, revisions, feedback, approval, and receipts, and never triggers automatic replay.

Validated behavior prototype: `apps/tui/prototypes/planning-workflow/` on branch `prototype/planning-workflow`, commit `12f78c6`.
