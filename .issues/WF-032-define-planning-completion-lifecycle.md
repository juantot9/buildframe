---
id: WF-032
title: "Define Planning completion and post-approval lifecycle"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: [WF-017, WF-027, WF-034, WF-035]
created: 2026-07-16
assets: []
---

## Question

What durably establishes successful completion of a Planning Workflow, and how do Plan Approval, Approval Withdrawal, optional Implementation Handoff, Manual Handoff, awaiting-start, active, settled, failed or unresolved Invocations, Workflow Cancellation, archival, reopening, later Plan Revisions, and Plan-to-Review Continuity interact after Approval without conflating readiness, implementation start, Harness outcome, or correct implementation?

## Blocked by

- [Test the blueprint for completeness](./WF-017-test-blueprint-completeness.md)
- [Define native Plan Offer routing and lifecycle](./WF-027-define-native-plan-offer-routing.md)
- [Define Manual Handoff commitment and lifecycle](./WF-034-define-manual-handoff-lifecycle.md)
- [Define Plan Revision result evidence](./WF-035-define-plan-revision-result-evidence.md)

## Resolution comment

Successful Planning completion is established by one immutable **Planning Completion**: a local human decision bound to one exact active Plan Approval and its exact Plan Revision. Plan Approval alone means `Ready for implementation`; it is not completion. `Finish planning` commits Planning Completion without a Handoff, while `Begin implementation` commits it atomically with the first Implementation Handoff when the Workflow is not already complete. Repeating either command is idempotent. The Completion proves only that the human finished Planning around that approved revision—not that material was disclosed, implementation began, a Harness ended normally, the Plan was followed, or the implementation is correct.

The ordinary `Finish planning` action is a Local Semantic Commitment whose exact surface is its Consent Boundary; it needs no second confirmation. It requires an active Plan Approval and successful durability. A live associated Harness Offer still awaiting a decision cannot be silently denied by finishing: the user must decide it, or let its existing fail-closed route end, before standalone completion. If another pre-implementation Planning Invocation remains awaiting-start, active, or unresolved, one composed gate names that activity, explains that finishing neither interrupts it nor prevents late evidence or a late Revision, and lets the user either return to it or finish around the exact approved Revision. Settlement, failure, rejection, or interruption needs no special completion ceremony because those facts remain independently visible.

Planning Completion does not consume the Approval’s implementation eligibility. A Workflow finished without Handoff may therefore begin implementation later from the same exact Approval, subject to normal revalidation of Context Drift, destination, capability, disclosure, baseline, and consent. Approval Withdrawal remains available until the first Implementation Handoff Durable Commit. Withdrawal and Handoff commitment serialize: withdrawal first blocks Handoff; Handoff first consumes the Approval. If a standalone Completion currently relies on that still-eligible Approval, withdrawing it atomically appends Planning Reopening, so the prior Completion remains historical rather than falsely remaining current. A later Approval always has a new identity.

An Implementation Handoff consumes the exact Approval at its Durable Commit, before any external effect. If Planning is still open, that same transaction establishes Planning Completion, the exact Handoff and Commitment Receipt, and the route-specific record: a Direct or claimed User Pull Invocation as defined by its route, a User Pull Preparation before claim, or the Native Gate decision and post-allow Invocation. If Planning is already complete, the transaction references the existing Completion rather than creating another. Retries or Explicit Resubmission of the same immutable Handoff continue to rely on its preserved authority; a materially new or redirected Implementation Handoff requires a fresh Plan Approval instead of reusing consumed consent.

Manual Handoff follows the same Planning boundary without fabricating Harness evidence. Committing an Implementation Manual Handoff consumes the Approval and, when needed, establishes Planning Completion in the same Durable Commit as the Workflow Handoff, Manual Handoff Destination, exact human-carriable material, and Commitment Receipt. Completion and `Ready to carry` survive a later reveal or clipboard failure. Reopening or copying the same material creates neither another Completion nor another Handoff, while authorizing a new manual attempt follows the already-defined destination-scoped repetition rules.

Every Invocation remains an independent evidence stream after Completion. `awaiting start`, `active`, `rejected`, `ended normally`, `failed`, `interrupted`, and `unresolved` may all coexist with a successfully completed Planning Workflow. No status completes or reopens Planning; Completion does not settle, dismiss, retry, interrupt, or hide an Invocation. Normal end proves settlement only. Failure or proven no-start does not revoke the approved Plan, and unresolved outcome retains its duplicate or overlap guardrails. Valid later Terminal Evidence is still appended after Completion, Cancellation, Archive, restart, or recovery.

Workflow Cancellation is also independent. Before Planning Completion it ends active work without creating a successful Completion, deactivates any unconsumed Approval eligibility, handles open Preparations and live Offers under their existing fail-closed rules, and archives the complete record. After Completion it may end remaining Workflow activity and archive it, but cannot erase or reinterpret the successful Completion, consumed authority, Handoffs, Manual material, or later evidence. If an Invocation may still be running, the existing cancellation preflight explains that cancellation does not stop the Harness; interruption intent and Terminal Evidence remain separate. Manual Handoff creates no activity to interrupt.

Completion itself does not Archive the Workflow. Archive and unarchive are organizational state: neither establishes nor reverses Completion, Approval, Handoff, or Invocation evidence, and archived records remain eligible to receive valid correlated evidence. Workflow Cancellation retains its already-settled archival effect. Exact Home placement, attention priority, and combined unarchive controls remain for [Shape Home attention and Workflow Resume](./WF-028-shape-home-workflow-resume.md).

Viewing a completed Workflow, inspecting its approved Plan, beginning a later Handoff from its still-eligible Approval, or starting a linked Review does not reopen Planning. `Reopen planning` is an explicit durable decision to resume revision work. It preserves every prior Completion and receipt, never resurrects a Preparation, Offer decision, or Invocation, and—when the prior Approval was completed but not consumed—commits Approval Withdrawal in the same transaction. A cancelled or archived Workflow must also cross its explicit restore or unarchive boundary; those state changes may share one visible action but remain separate durable facts. Any successor Completion requires a new active Approval.

A later Plan Revision never silently supersedes the completed Revision, revokes Approval, changes Completion, or becomes the focused candidate. Completed or cancelled Workflows cannot accept a newly associated Harness Offer or initiate new generation or Feedback work until explicitly reopened. If a contract-valid late result from an already-committed Invocation is durably captured, Neoflow preserves that immutable Revision and raises attention without rewriting the prior Completion; the user must reopen Planning and make fresh Approval and Completion decisions to adopt it.

Plan-to-Review Continuity depends on an exact Implementation Handoff, not on Planning Completion alone. A standalone Completion supplies no Implementation Baseline, Change Set, Harness activity, or implementation claim. A correlated or Manual Handoff may later be selected as the continuity source while its actual Invocation and destination evidence remain visible; those exact eligibility and Change Set rules belong to [Shape Plan-to-Review Continuity](./WF-030-shape-plan-to-review-continuity.md). Starting, completing, cancelling, or archiving the Review never rewrites Planning, and Planning archival or reopening never breaks durable cross-Workflow references.

This resolution supersedes the earlier shorthand that Harness settlement could complete Planning. No new ticket or fog is required: cross-session continuation, Plan-to-Review Continuity, Home and Resume behavior, exact Handoff payloads, and final blueprint retesting remain in their existing tickets. Canonical Completion and Reopening language is recorded in [`CONTEXT.md`](../CONTEXT.md), and the conceptual Harness Interaction Interface is reconciled in [`docs/blueprint/harness-capability-seam.md`](../docs/blueprint/harness-capability-seam.md).
