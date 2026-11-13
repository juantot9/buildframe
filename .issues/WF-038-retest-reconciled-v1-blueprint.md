---
id: WF-038
title: "Retest the reconciled v1 blueprint"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: juanan
blocked_by: [WF-037]
created: 2026-07-17
assets: []
---

## Question

After defining the native-offer Planning origin and reconciling every dependent workflow and Handoff contract, do the decisions form one coherent, non-contradictory Neoflow v1 product blueprint that satisfies the agreed implementation-planning readiness criteria without leaving product behavior, truth-critical distinctions, feature disposition, integration contracts, or quality boundaries for an implementation planner to invent?

## Blocked by

- [Define native-offer Planning origin semantics](./WF-037-define-native-offer-planning-origin.md)

## Resolution comment

Yes. [Retest the completed v1 blueprint](./WF-036-retest-completed-v1-blueprint.md) established that the fourteen gaps from the first audit had mutually compatible answers and isolated one contradiction: native-offer Planning could create a Workflow without the durable goal and context basis assumed by its later actions. After [Define native-offer Planning origin semantics](./WF-037-define-native-offer-planning-origin.md), the final retest finds no unresolved product or design decision and no contradictory truth claim.

The native-entry path now closes end to end. Every Planning Workflow has one immutable, harness-neutral Planning Origin. A context-first Origin binds its confirmed goal to the exact pre-exploration Planning Context Snapshot; an associated-offer Origin binds its confirmed goal to the exact Offer Association and initial Plan Revision while positively recording that Neoflow did not capture pre-Offer Harness context. The creation commit establishes those facts without fabricating exploration, transcript ownership, prior goal delivery, a Workflow Handoff, or Harness lifecycle evidence. Later association with an existing Workflow preserves its original Origin.

The downstream trace is mechanically consistent across the reconciled decisions:

- the initial associated Revision can be annotated, re-reviewed, approved, or denied with Feedback without an extra context ceremony;
- later generation uses the Origin, exact basis Revision, committed Feedback, verbatim direction, and deliberately selected later captures, never a nonexistent Snapshot or ambient conversation;
- Planning Completion remains an exact local decision over Approval and Revision and does not depend on captured starting context;
- Begin Implementation binds the exact Origin, goal, approved Plan, Completion, destination, Baseline or accepted absence, and the available context projection or explicit origin limitation;
- Context Drift is truthfully unassessable rather than absent when no starting context was captured, and that known limitation joins the existing composed mutation gate rather than adding another dialog;
- Home uses the confirmed goal and durable Revision or lifecycle state, while missing origin context appears only where provenance or a consequential action makes it material; and
- continuation carries the exact Origin limitation and source-backed Workflow records without claiming conversation transfer or reconstructing history after restart.

[Shape the Planning workflow](./WF-005-shape-planning-workflow.md), [Define native Plan Offer routing and lifecycle](./WF-027-define-native-plan-offer-routing.md), and [Define v1 Workflow Handoff payload contracts](./WF-031-define-v1-workflow-handoff-payloads.md) now agree on that trace. `Start Planning Exploration` remains context-first; `Request Plan Generation` and `Begin Implementation` consume either closed Origin form; `Submit Feedback Batch` remains Revision-based; Reviewing remains independent except for its already-explicit Plan-to-Review provenance; and unknown or silently omitted selected content remains a blocker even though known absent pre-Offer context is an allowed visible limitation. The canonical terms in [`CONTEXT.md`](../CONTEXT.md) preserve the same distinctions without a nullable Snapshot or Harness-specific Workflow model.

The architecture retest found and repaired one derived representational omission, not a new product choice. The conceptual Harness Interaction Module already owned explicit Offer Association, but its sketched Interface exposed Handoff commitment and Offer decision without a separate way to commit association before or without a decision. [Define the harness capability seam](./WF-008-define-harness-capability-seam.md) and [`docs/blueprint/harness-capability-seam.md`](../docs/blueprint/harness-capability-seam.md) now expose one semantic `associate` operation. It atomically revalidates and associates an exact Offer with an explicit existing or create-new target while keeping native capture and correlation behind the internal Adapter seam. This preserves a deep Module: Planning does not branch on Pi, Claude Code, Codex-like names, native payloads, or store mechanics; future Adapters may use the associated-offer form only by satisfying the same normalized Offer and Artifact Result contracts. Exact language types, package topology, wire encoding, and process placement remain legitimate implementation-planning choices.

The full readiness criteria remain satisfied. Planning and Reviewing have explicit entry, success, cancellation, failure, unresolved, restart, and recovery behavior; every essential Handoff has truthful Pi and Claude Code route, evidence, limitation, and Manual fallback semantics; TUI and Neovim ownership is settled; every capability has a v1, non-blocking, post-v1, or out-of-scope disposition; and the platform, performance, accessibility, durability, privacy, fault-injection, bundle, and scenario-usability gates in [Set the v1 boundary and priorities](./WF-015-set-v1-boundary-priorities.md) remain measurable. The interaction consequences stay calm and developer-readable: one concise goal confirmation at native creation, one compact composed gate for material limitations, progressive detail for exact evidence, and no perpetual Home warning for an honest known absence.

Tracker metadata and dependency integrity, closed-ticket Resolution comments, local Markdown links, glossary uniqueness, trailing whitespace, and stale blanket Planning Context Snapshot assumptions all validate. There is no remaining fog, research need, prototype question, or newly specifiable ticket. The destination is reached: the Neoflow v1 product blueprint is ready for separate implementation planning, while implementation and refactoring remain out of this map’s scope.
