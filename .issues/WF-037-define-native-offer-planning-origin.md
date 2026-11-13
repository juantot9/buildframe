---
id: WF-037
title: "Define native-offer Planning origin semantics"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: juanan
blocked_by: [WF-036]
created: 2026-07-17
assets: []
---

## Question

When the user explicitly associates an initial Claude Code native Plan Offer with `Create new Planning Workflow`, what exact durable goal, origin, and context basis must that Workflow establish, and how do Approval, Feedback, later generation, Planning Completion, Begin Implementation, Context Drift, Home, continuation, and Handoff payloads behave when no Planning Context Snapshot was previously handed to the Harness—without retroactively inventing exploration context or leaving the native-origin Workflow unable to advance?

## Blocked by

- [Retest the completed v1 blueprint](./WF-036-retest-completed-v1-blueprint.md)

## Resolution comment

A newly created Planning Workflow may begin from an associated Harness Offer without fabricating a prior exploration. V1 models this through one harness-neutral, closed **Planning Origin**, not a Claude-specific workflow type and not a nullable Planning Context Snapshot:

- a **context-first origin** binds the user-confirmed goal to the exact Planning Context Snapshot committed before `Start exploration`; or
- an **associated-offer origin** binds the user-confirmed goal to the exact Offer Association and initial Plan Revision that created the Workflow, while explicitly recording that Neoflow captured no pre-Offer Harness context.

Every Planning Workflow has exactly one immutable Planning Origin. Associating a later Offer with an existing Workflow never replaces that Origin. The distinction is semantic rather than Adapter-shaped: Claude Code is the v1 producer of the associated-offer form, but any future Harness Adapter, including a Codex Adapter, may use it only when its reviewed Capability and Artifact Result Contract produce the same normalized Harness Offer guarantees. Planning never branches on Harness name or native payload shape.

When the user selects `Create new Planning Workflow` for one exact unassociated Offer, the creation surface shows the captured Plan and exact destination and requires one concise user-authored or explicitly user-confirmed goal. A visible suggestion may help entry, but the Durable Commit preserves the exact confirmed text and its user-confirmed provenance; Neoflow never extracts an authoritative goal from a Harness transcript, ambient conversation, tool history, Attachment label, Plan filename, or inferred Plan summary. The goal frames the Workflow from association onward and does not claim that the Harness previously received it or generated the Plan from it.

One atomic Durable Commit creates the Planning Workflow and Plan identities, associated-offer Planning Origin, exact Offer Association, initial Plan Revision ownership, and initial Artifact focus. It creates no Planning Context Snapshot, Workflow Handoff, Approval, Offer Decision, Invocation, or conversation-ownership claim. Failed durability leaves the Offer unassociated and creates no partial Workflow. Offer expiry or decision-delivery failure after association preserves the Origin, Workflow, and captured Revision.

The absent context is a positive provenance fact: **pre-Offer context not captured by Neoflow**. It is not an empty Snapshot and does not mean the Harness had no context. The Plan text, file references inside it, Workspace and Attachment evidence, a prior Manual Handoff, and current workspace contents cannot be promoted into retrospective context. Exact captures deliberately selected for a later Handoff retain their later capture and disclosure provenance; they never rewrite the Origin, establish what the initial Harness saw, or make the initial Revision appear derived from them.

The governing Origin makes the remaining lifecycle consequences mechanical:

- **Approval and Feedback:** The initial Revision has the same Approval, Annotation, Re-review, and Feedback semantics as every other Revision. Missing pre-Offer context neither blocks Approval nor adds a second confirmation. Feedback against a live associated Offer follows the existing exact Native Gate deny path; other routes carry the exact target Revision and Batch. A correlated revised Offer remains in the same Plan only under the already-settled native causality rules and never changes the Origin.
- **Later generation:** An associated-offer Workflow already has a candidate, so every explicit `Request Plan Generation` is a successor request. Its required basis is the Planning Origin, exact selected basis Revision, committed Feedback carried forward, and any verbatim user direction or deliberately selected later supporting captures. The confirmed goal is disclosed; no nonexistent origin context is sent. The known absence is not a blocker, while unknown or silently omitted selected material remains one. A later native Offer still requires the existing exact association or successor correlation evidence.
- **Planning Completion:** Approval, `Finish planning`, Approval Withdrawal, Reopening, and Completion behave unchanged. Completion binds the exact Approval and Revision; it neither requires a Planning Context Snapshot nor claims that Neoflow knows the initial Harness context.
- **Begin Implementation:** The authority graph requires the exact Planning Origin rather than always requiring a Planning Context Snapshot. The approved Plan, confirmed goal, Approval, Completion, Baseline or accepted absence, destination, capability, and consent evidence remain exact. Direct and Manual routes disclose the goal, complete approved Plan, and any deliberately selected later supporting captures. For the exact live Native Gate, the associated Offer may represent the Plan already present at the destination; the record must still state that Neoflow cannot prove or reproduce the pre-Offer context or claim that the later-confirmed goal was present in the conversation. This known limitation appears inside the existing composed mutation commitment, not in a second dialog, and does not weaken the approved Plan’s authority or invent Harness compliance.
- **Context Drift:** Drift is assessable only against immutable context captured in a context-first Origin. An associated-offer Origin reports `Starting context not captured—drift cannot be assessed`, never `No drift`. Later captures, workspace inspection, or an Implementation Baseline do not retroactively establish that baseline. The unavailable assessment does not itself block Approval or Completion; it is a material limitation at a later mutation commitment.
- **Home and Resume:** The confirmed goal supplies the calm, human-readable Home identity. The associated Plan Revision and current decision or lifecycle state determine Resume normally. Missing origin context is not perpetual `Needs you` attention; it appears when explaining provenance or qualifying a consequential action. A live Offer deadline, unresolved decision delivery, or late evidence retains its existing consequence-based attention.
- **Continuation:** A Continuation Brief uses the confirmed goal, exact Origin, selected Plan Revision or milestone, later truth-critical facts, and unresolved evidence. It explicitly says that Neoflow has no captured pre-Offer context and excludes the Harness conversation. The exact Plan and source-backed records can orient a fresh destination without claiming conversation transfer, so absence of a Snapshot does not dead-end continuation.

The Handoff Payload Contract therefore consumes a Planning Origin wherever [Define v1 Workflow Handoff payload contracts](./WF-031-define-v1-workflow-handoff-payloads.md) previously required a Planning Context Snapshot for all Planning Workflows. `Start Planning Exploration` remains context-first and still creates the Snapshot. `Request Plan Generation` and `Begin Implementation` accept either Origin form and preserve the exact available-versus-unavailable context projection; `Submit Feedback Batch` remains target-Revision-based; `Continue Workflow` carries the source-backed Origin limitation. A known unavailable pre-Offer context component is an allowed, visible origin limitation, not permission for an Adapter to omit known selected content. The remaining Handoff kinds are unchanged.

This keeps the Harness Interaction Module deep. Workflow callers provide one normalized Planning Origin and action proposal; the Module validates the authority graph and exact disclosure projection. Pi, Claude Code, and future Harness Adapters continue to own only native capture, encoding, correlation, and evidence translation behind the internal Adapter seam. No Adapter-specific Origin, new Handoff kind, or workflow-to-Adapter method is introduced. A future integration that satisfies the existing Offer contract plugs into this model; one with genuinely different semantics must declare a new reviewed Capability contract rather than being forced into false parity.

Restart reconstructs the immutable Origin and exact absence evidence from Authoritative Workflow State. It never searches Harness history or current files to repair missing context. These rules supersede only the blanket Snapshot requirement for offer-origin Planning in [Define v1 Workflow Handoff payload contracts](./WF-031-define-v1-workflow-handoff-payloads.md); all existing Offer identity, decision, lifecycle, consent, result, recovery, and no-replay rules remain intact. Canonical language is updated in [`CONTEXT.md`](../CONTEXT.md), and the conceptual Module Interface is reconciled in [`docs/blueprint/harness-capability-seam.md`](../docs/blueprint/harness-capability-seam.md). No new ticket or fog is required.
