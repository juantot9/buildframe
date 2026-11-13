---
id: WF-036
title: "Retest the completed v1 blueprint"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: JuanAn Aranda Triana
blocked_by: [WF-022, WF-023, WF-024, WF-025, WF-026, WF-027, WF-028, WF-029, WF-030, WF-031, WF-032, WF-033, WF-034, WF-035]
created: 2026-07-16
assets: []
---

## Question

After resolving every gap surfaced by the first completeness test, do the decisions now form one coherent, non-contradictory Neoflow v1 product blueprint that satisfies the agreed implementation-planning readiness criteria without leaving any product behavior, truth-critical distinction, feature disposition, integration contract, or quality boundary for an implementation planner to invent?

## Blocked by

- [Shape setup, attachment, and diagnostics workflow](./WF-022-shape-setup-attachment-diagnostics.md)
- [Define the workspace and change-set evidence contract](./WF-023-define-workspace-change-set-evidence.md)
- [Define workflow context curation and capture](./WF-024-define-workflow-context-curation.md)
- [Probe Pi’s Plan Revision capture guarantees](./WF-025-probe-pi-plan-revision-capture.md)
- [Shape the cross-session continuation workflow](./WF-026-shape-cross-session-continuation.md)
- [Define native Plan Offer routing and lifecycle](./WF-027-define-native-plan-offer-routing.md)
- [Shape Home attention and Workflow Resume](./WF-028-shape-home-workflow-resume.md)
- [Define Artifact Lineage Comparison semantics](./WF-029-define-artifact-lineage-comparison.md)
- [Shape Plan-to-Review Continuity](./WF-030-shape-plan-to-review-continuity.md)
- [Define v1 Workflow Handoff payload contracts](./WF-031-define-v1-workflow-handoff-payloads.md)
- [Define Planning completion and post-approval lifecycle](./WF-032-define-planning-completion-lifecycle.md)
- [Define prepared User Pull lifecycle](./WF-033-define-prepared-user-pull-lifecycle.md)
- [Define Manual Handoff commitment and lifecycle](./WF-034-define-manual-handoff-lifecycle.md)
- [Define Plan Revision result evidence](./WF-035-define-plan-revision-result-evidence.md)

## Resolution comment

Not yet. The fourteen gaps from [Test the blueprint for completeness](./WF-017-test-blueprint-completeness.md) now have mutually compatible decisions across workspace evidence, context capture, setup, route lifecycles, result evidence, Planning completion, continuation, linked Review, Home, and Artifact comparison. The audit found no remaining unshaped fog in those areas and no reason to reopen their governing choices.

The retest reconciled earlier wording that had become stale after later decisions fixed the governing boundary. [Shape the Planning workflow](./WF-005-shape-planning-workflow.md) now requires explicit Offer Association and route-specific commitment records; [Shape the Reviewing workflow](./WF-006-shape-reviewing-workflow.md) now uses exact local comparison selection, focused composed gates only when warranted, and lifecycle evidence separate from receipts; [Define artifact and annotation semantics](./WF-007-define-artifact-annotation-semantics.md) and [Define the harness capability seam](./WF-008-define-harness-capability-seam.md) now distinguish Preparation, Invocation, Native Gate, and Manual repetition rather than assuming one delivery lifecycle. [Set persistence, portability, and recovery policy](./WF-010-set-persistence-portability-recovery-policy.md), [Set trust and consent guardrails](./WF-011-set-trust-consent-guardrails.md), and [Set the v1 boundary and priorities](./WF-015-set-v1-boundary-priorities.md) now agree that Shareable Workflow Reports are post-v1 and that Manual Handoff is available when no compatible correlated option is currently available or through explicit downgrade. [Define Artifact Lineage Comparison semantics](./WF-029-define-artifact-lineage-comparison.md) now uses the exact Plan text-segment payload fixed by the result contract. The conceptual Harness Interaction Module summary now accepts a proposal rather than a pre-existing committed Handoff and leaves concrete package topology to implementation planning. These are derived consistency repairs, not new product decisions.

One sharp contradiction remains. [Define native Plan Offer routing and lifecycle](./WF-027-define-native-plan-offer-routing.md) permits an initial Claude Code Offer to be explicitly associated with a newly created Planning Workflow. Such a Workflow has never handed a Planning Context Snapshot to the Harness and has no defined durable source for its user goal. Yet [Define v1 Workflow Handoff payload contracts](./WF-031-define-v1-workflow-handoff-payloads.md) requires that Snapshot and goal for later generation and Begin Implementation, while Home, Context Drift, and continuation also depend on them. Fabricating the missing Snapshot would violate provenance; requiring it without a creation path dead-ends the most important native-entry path. An implementation planner would otherwise have to invent whether association captures a distinct origin basis, makes context optional, blocks actions, or changes the Handoff contracts.

[Define native-offer Planning origin semantics](./WF-037-define-native-offer-planning-origin.md) now owns that decision. [Retest the reconciled v1 blueprint](./WF-038-retest-reconciled-v1-blueprint.md) will perform the final readiness check after it closes. No additional fog, research, prototype, or implementation work is required at this frontier.
