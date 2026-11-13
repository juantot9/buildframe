---
id: WF-031
title: "Define v1 Workflow Handoff payload contracts"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: JuanAn Aranda Triana
blocked_by: [WF-017, WF-024, WF-026, WF-030, WF-035]
created: 2026-07-16
assets: []
---

## Amendment (2026-09-08)

[Reframe Reviewing around the current repository](./WF-225-reframe-reviewing-around-the-current-repository.md) and its confirmed child map replace the **Submit Review Batch** body for Reviewing with a minimal one-message Handoff: user text plus a `file:line` Live Repository Reference, plus exact labelled historical lines only when the origin is a saved past point ([Define the outgoing review message contract](./WF-228-define-the-outgoing-review-message-contract.md)). The closed, versioned Handoff Payload Contract, its envelope separation, destination binding, and atomic commitment remain unchanged for every other kind. Component manifests, representations, and disclosure deltas remain defined above but are no longer exercised by ordinary Reviewing.

## Question

What exact semantic payload, destination, authority, provenance, disclosure scope, and required or optional workflow records define each v1 Workflow Handoff—Start Planning Exploration, Request Plan Generation, Submit Feedback Batch, Begin Implementation, Submit Review Batch, and the discussion-only Continue Workflow Handoff carrying a Continuation Brief—and which content must remain excluded, unavailable, or explicitly degraded, without deciding Adapter prompt wording or wire serialization?

## Blocked by

- [Test the blueprint for completeness](./WF-017-test-blueprint-completeness.md)
- [Define workflow context curation and capture](./WF-024-define-workflow-context-curation.md)
- [Shape the cross-session continuation workflow](./WF-026-shape-cross-session-continuation.md)
- [Shape Plan-to-Review Continuity](./WF-030-shape-plan-to-review-continuity.md)
- [Define Plan Revision result evidence](./WF-035-define-plan-revision-result-evidence.md)

## Resolution comment

V1 uses one closed, versioned **Handoff Payload Contract** with a common destination-scoped semantic envelope and exactly six kind-specific bodies. The contract is route-neutral: a Direct, User Pull, Native Gate, or Manual commitment preserves the same Workflow meaning even though its correlated encoding, native reference, or human-carriable rendering differs. It is not a flattened prompt, generic context bag, transport envelope, or Adapter extension point.

The common envelope separates three concerns that must never be inferred from one another:

1. **Authority and provenance** identify the owning Workflow and Workspace, exact source records and decisions, action-specific authority, and integrity evidence that make the commitment valid.
2. **Disclosure** is an ordered component manifest of exactly what this destination may receive. Every component binds its immutable source occurrence, semantic role, exact bytes or bounded range where carried, digest, ordering and boundaries, size, provenance, sensitivity, and accepted representation: exact content, an exact destination-native reference, metadata only, or explicitly unavailable. Exclusion and local-only status are recorded just as deliberately, but those source identities do not cross the destination unless the preview explicitly includes their metadata.
3. **Local-only evidence** preserves facts needed for truth and recovery without treating them as Harness context: Approval and Completion records, Capability and consent evidence, Commitment Receipts, Implementation Baselines, lifecycle evidence, raw diagnostic identities, and any undisclosed Workflow dependencies.

One immutable record may support more than one concern, but authority never implies disclosure and disclosure never grants authority. The Handoff references immutable workflow records rather than copying them into a second mutable representation. At commitment, the Harness Interaction Module validates the complete dependency graph and resolves one exact disclosure projection. An Adapter receives only that projection plus the minimum route-correlation identity it must encode; it cannot browse Authoritative Workflow State, re-resolve a Context Locator, fetch newer Artifact content, add ambient context, or drop a component. Prompt wording, native command structure, escaping, chunking, and wire serialization remain Adapter implementation details.

Every Handoff freezes one destination. A correlated Handoff binds one exact validated Attachment Identity; a Native Gate Handoff additionally binds its exact associated Harness Offer; a Manual Handoff binds one exact Manual Handoff Destination and the verification state of each destination fact. Human-readable destination labels are disclosed to the user, while raw session and protocol identifiers remain local except for the minimum correlation metadata a reviewed Adapter requires. Changing Harness, session, checkout, Manual destination, authority, or semantic material creates a new Handoff. Exact resubmission to the same destination reuses the immutable Handoff and changes only attempt evidence.

The contract also records the Handoff kind and contract version, Workflow and Workspace identities, the exact consent scope, required Effect Constraint, Evidence Profile, optional Artifact Result Contract requirement, and all known representation limitations. These contract facts are not themselves model instructions. The Handoff, Commitment Receipt, accepted disclosure projection, and Direct Invocation, User Pull Preparation, Native Gate decision records, or Manual material required by the selected path Durable-Commit atomically before external contact or reveal.

An exact destination-native reference is valid only when reviewed correlation proves that the destination already holds the same immutable source occurrence—for example the associated Claude Plan Offer underlying a Feedback or Implementation decision. Content similarity, timing, a focused conversation, or an earlier Manual Handoff cannot substitute. Metadata-only or unavailable representation may proceed only where the kind-specific contract remains semantically truthful and the exact limitation is accepted through the existing composed gate or Capability Downgrade. Unknown scope, incoherent capture, missing required authority, an unrepresentable required Plan or Concrete Replacement, silent truncation, or an Adapter-added omission is a Commitment Blocker. Context Budget Evidence informs the choice but never removes material automatically.

### Start Planning Exploration

The required record graph is the new self-contained Planning Context Snapshot, its Planning Workflow and Plan identities, the owning Workspace Identity, and the destination. The exact disclosed material is the Snapshot’s user-authored goal and the accepted route projection of its admitted context captures, preserving stable source labels, ranges, order, bytes or declared representation, provenance, sensitivity, and non-sensitive limitation statements. The complete local Snapshot still records locator expansion, explicit and default exclusions, unavailable-item reasons, and capture evidence; excluded content and path identities stay local unless deliberately represented as metadata.

Its authority is discussion-only exploration of that exact goal and context. It grants no Plan Revision result, workspace mutation, Feedback, Approval, or implementation authority and has no Artifact Result Contract. Pi may enforce the cooperative request-scoped read-tool gate; Manual presentation can claim no Effect Constraint. Harness transcripts, Editor Presence, unresolved live locators, ambient workspace files, and later changes are absent. Starting again from changed goal or context requires a new Snapshot and Handoff rather than refreshing this one.

### Request Plan Generation

The required basis is the exact Planning Origin established under [Define native-offer Planning origin semantics](./WF-037-define-native-offer-planning-origin.md), including its exact available or explicitly unavailable context basis. A first-candidate request carries no prior Revision. A successor request additionally identifies and discloses one exact basis Plan Revision and any exact committed Feedback Batches deliberately carried into generation; uncommitted drafts can never enter. One optional user-authored generation direction may capture a conclusion that otherwise exists only in the Harness-owned exploration, but it is frozen verbatim and never synthesized from a transcript. Selected supporting captures retain the common exact-disclosure accounting.

Its sole added authority is to produce one candidate Plan Revision for the owning Plan; it grants no workspace mutation, Approval, implementation, Annotation disposition, or semantic-success claim. A correlated `Generate plan` option is valid only when its frozen Artifact Result Contract can materialize one exact Revision on the supported success path. Pi Direct therefore carries that contract; a Manual plan-generation Handoff carries the same request material but creates no Invocation or result guarantee, and a later Claude Harness Offer remains a separate native occurrence requiring explicit Offer Association. Exploration transcript, thinking, tools, prior outputs not selected as the basis, and inferred conversation conclusions remain excluded.

### Submit Feedback Batch

The required records are one exact Feedback Batch, every immutable Annotation in its committed order, and their one exact target Plan Revision. The disclosed material contains the target Revision’s lossless payload; each Annotation’s exact body, declared intent, Anchor and selected content or structural context; every Concrete Replacement payload; and only deliberately selected Evidence References or supporting context. For an exact associated Claude Plan Offer, the native occurrence may represent the target Revision without retransmitting its bytes; the Feedback remains the only newly disclosed workflow material. Pi Direct and Manual forms carry the exact target and Batch material themselves.

Authority is the union of the Batch’s explicit intents. Questions and Notes remain discussion-only; Change Requests and Concrete Replacements authorize changes only in a successor Plan Revision and only within their Plan Anchors. The Batch never authorizes workspace mutation, Approval, implementation, automatic disposition, or a generated Artifact under this Handoff. It has no Artifact Result Contract: a later Pi generation request or Claude Offer must independently satisfy its own result rules. Other Revisions, Batches, Annotation Drafts, dispositions, Planning Completion, Approval state, ambient Planning context, and transcript history are local unless explicitly selected as supporting material.

### Begin Implementation

The required authority graph contains one exact active Plan Approval, its exact approved Plan Revision, the owning Planning Workflow and Workspace, the exact Planning Origin governed by [Define native-offer Planning origin semantics](./WF-037-define-native-offer-planning-origin.md), Planning Completion created atomically when needed or the existing Completion, and either one complete Implementation Baseline or the durable acknowledged decision to proceed without it. Any assessable Context Drift or explicit unavailable origin-context evidence and the user’s exact proceed-or-return decision are also bound. A Native Gate form additionally requires the exact live associated Offer whose Revision is the approved Revision.

The required disclosed material is the complete approved Plan Revision, the Planning goal, and the accepted exact context projection available from the Planning Origin. Accepted Context Drift or unavailable origin context is disclosed as a plain limitation without rewriting old captures or silently adding current workspace state. Under Native Gate, the exact associated Offer may represent the already-present Plan; Direct and Manual forms carry it explicitly. Supporting context may inform implementation but grants no authority beyond the approved Plan.

This Handoff alone authorizes workspace mutation bounded by the approved Plan Revision in the named Workspace. It consumes the Approval while remaining independent from Harness tool permissions and safety policy; communicated or unenforced scope must be shown honestly. A new mutating instruction cannot be smuggled in as an implementation note—material scope change returns to Planning and a fresh Approval. Approval and Completion identities, Commitment Receipt, Context Drift evidence details, and the complete Implementation Baseline bytes and manifest remain local-only; the Baseline exists to bound later Review evidence, not to become a giant Harness attachment. The Handoff grants no task tracking, Plan compliance, change attribution, successful-start, terminal-outcome, or correct-implementation claim.

### Submit Review Batch

The required record graph is one verified-current Review Snapshot, its stable Change Set and owning Review, one exact Review Batch, and every immutable Annotation in Batch order. The disclosed material contains a stable human-readable Change Set and Snapshot identity; the complete changed-file manifest with per-side availability; every Annotation’s body, intent, Anchor, selected content and structural context; every Concrete Replacement; and the accepted projection of deliberately selected Review supporting context. Exact captured content for anchored ranges is required when available; whole-file Anchors carry the complete available side or an explicit metadata-only limitation. Additional Snapshot files or ranges are optional supporting context rather than implied by attachment.

An Evidence Reference discloses only its exact selected target and provenance. A linked approved Plan Revision, Planning Context, Implementation Baseline, or other Planning record is never added merely because Plan-to-Review Continuity exists; Plan material crosses only when deliberately selected as supporting context or cited by an Evidence Reference. Unbatched Drafts or Findings, unrelated Snapshot bytes, Review Coverage, dispositions, Results, and other Workflow history remain local.

Authority is again the exact union of Annotation intents. Questions and Notes are discussion-only. Change Requests and Concrete Replacements authorize workspace mutation only within their Review Snapshot Anchors; supporting context, the changed-file manifest, and linked Plan evidence never widen that scope. Missing exact Concrete Replacement bytes block commitment. A known unrenderable whole-file target may proceed only with its exact metadata limitation and honest Effect Constraint. Harness receipt, workspace change, or settlement creates no Artifact Result and no Annotation disposition; human Re-review remains mandatory.

### Continue Workflow

The required record is one exact Continuation Brief and its strong provenance references to the owning Workflow, selected Continuation Point, current lifecycle position, unresolved records, and relevant Harness evidence. The disclosed material is the Brief’s deterministic source-backed goal and current-position account, the selected primary Artifact or milestone, every later truth-critical fact needed to prevent a historical point from masquerading as rollback, unresolved items, one optional verbatim user transition note, and the accepted exact projection of deliberately selected Artifacts and context captures. Every inclusion, unavailable representation, exclusion, limitation, and destination disclosure remains visible in the Brief manifest.

Its authority is orientation and discussion only. It cannot generate an Artifact, mutate the workspace, submit Feedback or a Review Batch, approve a Plan, begin implementation, disposition an Annotation, inherit a prior Handoff, or prove semantic progress. It has no Artifact Result Contract. The destination must be fresh under the continuation rules: a distinct validated Pi Attachment for Direct or an honestly declared Claude Manual destination. Whole Workflow history, Harness transcripts, hidden conversation state, streams, tools, ambient context, generated summaries, inferred tasks, and ephemeral interface state remain excluded.

Across all six kinds, minimum route correlation data is never reclassified as Workflow context, and Harness-owned conversation may help the Harness interpret material without becoming part of Neoflow’s proof. An Adapter may choose clear native phrasing, but it cannot strengthen authority through wording or weaken the exact semantic contract through omission. The TUI derives a clean Commitment Summary—action, destination, concrete scope, and at most one material limitation—from the contract, while exact components, provenance, degradations, and local-only evidence remain immediately inspectable in progressive detail.

This contract deepens the Harness Interaction Module: workflow callers depend on one closed semantic Interface, all destination and disclosure validation stays local to that Module, and Pi and Claude Adapters contain only native encoding and evidence translation. The conceptual summary is reconciled in [`docs/blueprint/harness-capability-seam.md`](../docs/blueprint/harness-capability-seam.md), and canonical language is recorded in [`CONTEXT.md`](../CONTEXT.md). The six contracts close the known payload gap without surfacing another ticket or fog; Adapter prompt wording and wire serialization remain for separate implementation planning.
