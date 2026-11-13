---
id: WF-011
title: "Set trust and consent guardrails"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: [WF-008, WF-009, WF-010]
created: 2026-07-14
assets: []
---

> **Superseded in part (2026-11-06):** sensitive-disclosure checks were removed by [Send to the Harness as written](./WF-266-send-to-the-harness-as-written.md). Material sent to a Harness is never scanned or gated for secrets.

## Question

At which commitment points must Neoflow preview context, obtain explicit agreement, expose the receiving harness and side effects, protect sensitive data, or preserve an audit trail while keeping reversible work uninterrupted?

## Blocked by

- [Define the harness capability seam](./WF-008-define-harness-capability-seam.md)
- [Shape the editor-companion workflow](./WF-009-shape-editor-companion-workflow.md)
- [Set persistence, portability, and recovery policy](./WF-010-set-persistence-portability-recovery-policy.md)

## Follow-up candidates

- Validate the compact Commitment Summary, Attachment Destination Label, composed-gate hierarchy, progressive detail, and simplified Interaction Language through [Choose the terminal interaction system](./WF-012-choose-terminal-interaction-system.md).

## Resolution comment

Neoflow treats a visible, unambiguous explicit action as consent when destination, scope, and effect are clear. Consent is bounded to the exact content, Attachment Identity, authority, Capability Snapshot, and route prerequisites; it neither becomes standing trust nor expires merely with time. Mutation, sensitive disclosure, Capability Downgrade, destination change, unresolved activity, irreversible purge, or comparable ambiguity receives one compact composed gate rather than stacked dialogs. Failed durability, unvalidated identity, unknown payload or authority, invalid capability contracts, stale or unverified Review source, approval-blocking dispositions, and absent Direct or Native Gate prerequisites remain non-overridable blockers.

Every Handoff presents a concise human-readable destination and concrete scope. The destination combines harness, local session label, repository label, canonical checkout root, and connection state; `cwd`, model, and raw identifiers remain supplementary evidence rather than identity. Deliberately curated immutable context for that exact destination needs no second confirmation. Any unexpected disclosure delta identifies every added, refreshed, or expanded capture and makes exact content or a comparable difference inspectable and individually excludable. Unsaved, outside-checkout, ignored, credential-like, secret-flagged, or unavoidable raw-identifier context receives a destination-scoped acknowledgment; detection is advisory and never proves other content safe.

Every mutation-authorizing Handoff uses one batch-level gate naming its bounded authority and the real Effect Constraint. Neoflow’s semantic authority remains independent from harness-owned tools and permission prompts. Direct consent authorizes dispatch after Durable Commit; User Pull preparation authorizes only the exact named Attachment to retrieve the payload; Native Gate decisions bind only their exact Offers; Manual Handoff authorizes only revealing material to the user. Manual Handoff may be prominent when it is the sole viable route but never claims delivery, start, outcome, enforcement, or correlation. Unresolved work remains visible without deadlocking the workspace; same-Handoff retries require Explicit Resubmission, while different overlapping work requires a distinct risk decision.

Local semantic decisions such as Plan Approval, ordinary Review completion, and Approval Withdrawal use their exact action surface without another dialog. Completing with unresolved findings is exceptional. Recoverable Archive, ordinary Cancellation, Delete to Trash, and cache cleanup remain uninterrupted; cancellation while an Invocation may still have effects receives the focused preflight explaining that it does not stop the Harness, while permanent purge receives an irreversible-scope gate. Full-fidelity v1 bundle export always exposes its sensitive contents and destination; the post-v1 redacted report remains fluid unless redaction is weakened.

Code Inquiry is post-v1. If introduced later, the Editor Companion may directly submit one only on the exact unambiguous discussion-only path; any exceptional acknowledgment routes to the TUI’s composed gate and preserves the Editor Return Location, avoiding a second trust-dialog system. In v1, Attachment Establishment itself shares no workflow context and resumes no activity.

Consequential commitments create immutable semantic Commitment Receipts that reference exact records instead of duplicating content. Delivery, start, terminal evidence, interruption, recovery, and resubmission remain separate facts. Receipts exclude transcripts, streams, and tool telemetry, permit only append-only correction and whole-Workflow purge, and make no cryptographic or forensic tamper-resistance claim.

The product presents these semantics through compact progressive disclosure: action, destination, scope, and at most one material plain-language limitation, with exact contracts available in details and history. Internal domain terms are simplified in the TUI except where collapsing approval and execution, discussion and mutation, lifecycle evidence, constraint strength, workspace verification, recoverability, or Manual versus correlated Handoff would mislead. Canonical policy vocabulary is recorded in [`CONTEXT.md`](../CONTEXT.md).
