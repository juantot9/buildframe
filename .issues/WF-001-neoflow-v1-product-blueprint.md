---
id: WF-001
title: "Chart the Neoflow v1 product blueprint"
status: closed
labels:
  - wayfinder:map
parent: null
assignee: null
blocked_by: []
created: 2026-07-14
---

## Destination

Reach a decision-complete Neoflow v1 product blueprint covering its core workflows, product boundaries, owned artifacts, harness/editor integration model, interaction and visual language, prioritized capabilities, and the disposition of the current MVP—ready for separate implementation planning.

## Notes

- Neoflow is a workspace-centered companion to existing harnesses and editors, not a coding agent or editor.
- Optimize v1 for one terminal-oriented developer working locally in one workspace with one active harness and editor at a time.
- Planning and Reviewing are the anchor workflows. Durable artifacts and anchored annotations are primary; conversation supports them.
- Neoflow owns workflow artifacts and status. Harnesses own agent execution, tools, safety policy, and their execution history.
- The TUI is the primary surface. Editor companions provide bidirectional context, focused actions, artifact locations, and compact status rather than reproducing the TUI.
- Pi and Claude Code are reference harnesses; Neovim is the reference editor. Contracts remain tool-neutral and capability-aware.
- Prefer informed control without ceremony: explicit agreement at meaningful commitment points, fluid reversible work elsewhere.
- Prefer comprehension, comfort, and a coherent default path over feature count or maximum automation.
- Plannotator is an interaction reference for Planning and Reviewing, not a visual or architectural template.
- Existing code and documentation are evidence, not constraints. Any current behavior or structure may be retained, redesigned, or removed.
- Every session should use `grilling` and `domain-modeling`; use `prototype` for behavior or visual questions, `research` for external facts, and `codebase-design` for module seams and interfaces.
- This map makes product and design decisions only; it does not carry implementation into the effort.

## Decisions so far

- [Learn from Plannotator’s artifact-review loop](./WF-002-learn-from-plannotator.md) — Adopt its explicit, durable artifact-review loop while replacing its browser/editor/agent ownership, weak identity, and optimistic handoff semantics with terminal-native, capability-aware behavior.
- [Establish Claude Code’s integration envelope](./WF-003-establish-claude-code-integration-envelope.md) — Foreground Claude integration is hook-driven and pull-based, with a native Plan gate and user-invoked Review skill but no stable host push, cancellation, authoritative busy state, or replay.
- [Establish Pi’s integration envelope](./WF-004-establish-pi-integration-envelope.md) — Pi supports attached message execution and observation, but Neoflow must own transport and workflow semantics and must not claim read-only Planning or semantic Review success without additional enforcement.
- [Choose the harness operating posture](./WF-018-choose-harness-operating-posture.md) — V1 attaches only to user-owned live harness sessions, never launches a managed fallback, and exposes capability asymmetry explicitly.
- [Probe Pi’s attached-session guarantees](./WF-019-probe-pi-attached-guarantees.md) — Pi requires observed start and settlement rather than trusting submission return values; a cooperative request-scoped read-tool gate works, while cancellation, session replacement, and recovery must fail conservatively.
- [Probe Claude Code’s attached Plan and Review paths](./WF-020-probe-claude-attached-paths.md) — Claude’s Plan gate can persist before deny/allow and Review pull can correlate expansion through terminal hooks, while interrupts, disconnects, cwd changes, and missing plugin or host must fail conservatively without replay.
- [Shape the Planning workflow](./WF-005-shape-planning-workflow.md) — Use one artifact-centered lifecycle with fluid context start, harness-owned exploration, immutable generated revisions, explicit feedback/approval/handoff gates, and event-driven conservative cancellation and outcome handling.
- [Shape the Reviewing workflow](./WF-006-shape-reviewing-workflow.md) — Use immutable checkout-aware snapshots, intent-bounded review batches, capability-honest handoff, and human-only re-review disposition through a durable local result.
- [Define artifact and annotation semantics](./WF-007-define-artifact-annotation-semantics.md) — Use distinct immutable Artifact lineages, single-anchor explicit-intent Annotations committed in durable Batches, human-only re-review and disposition, and Invocation evidence that never implies semantic resolution.
- [Define the harness capability seam](./WF-008-define-harness-capability-seam.md) — Put one deep semantic Harness Interaction Module in front of separate Pi and Claude Adapters, using per-Handoff route, availability, effect, evidence, interruption, and failure contracts without generic Chat or false parity.
- [Shape the editor-companion workflow](./WF-009-shape-editor-companion-workflow.md) — Use a persistent checkout-aware Neovim companion for explicit context, exact Annotation actions and navigation, compact status, and acknowledged editor/TUI round trips while keeping commitments in the TUI and Inquiry post-v1.
- [Set persistence, portability, and recovery policy](./WF-010-set-persistence-portability-recovery-policy.md) — Keep one private local authoritative store per checkout, durably commit semantic records before effects, recover conservatively through unresolved state and quarantine, and separate v1 exact bundles, post-v1 redacted reports, and explicit workflow-level cleanup.
- [Set trust and consent guardrails](./WF-011-set-trust-consent-guardrails.md) — Keep unambiguous actions fluid while composing mutation, sensitive, downgrade, unresolved, or irreversible risk into one compact exact-scope gate with no standing trust and immutable semantic receipts.
- [Choose the terminal interaction system](./WF-012-choose-terminal-interaction-system.md) — Use a workflow-first Home, one configurable adaptive workspace, and focused commitment layers with plain language, conventional and Vim-friendly commands, portable JSON preferences, and semantic narrow or linear reflow.
- [Choose Neoflow’s visual language](./WF-013-choose-visual-language.md) — Blend Editorial Ledger’s readable Artifact rhythm with Flowline’s connected identity and selective Console density, using redundant helper color, sparse framing, and optional motion.
- [Discover capabilities that reinforce the core workflows](./WF-014-discover-reinforcing-capabilities.md) — Reinforce Artifact-centered continuity with Plan-informed Review, exact lineage comparison, controlled cross-session and cross-Harness continuation, context-budget evidence, semantic resume, and explicit context reuse.
- [Establish Pi and Claude Code context-budget evidence](./WF-021-establish-context-budget-evidence.md) — Treat Pi usage as a guarded estimate and Claude usage as opt-in status-line evidence, with exact local payload counts, explicit freshness, and unknown tokenizer or post-invalidation state.
- [Set the v1 boundary and priorities](./WF-015-set-v1-boundary-priorities.md) — Make complete independent Planning and Reviewing, optional continuity, truthful reference integrations, durable trust semantics, selected reinforcing capabilities, portability, and measurable cross-platform quality gates the v1 release spine.
- [Reconcile the current MVP with the blueprint](./WF-016-reconcile-current-mvp.md) — Treat the legacy MVP as evidence and a parts bin: rebuild every product Module from the blueprint, selectively transplant validated mechanics, remove conflicting concepts, and migrate legacy Review data conservatively.
- [Test the blueprint for completeness](./WF-017-test-blueprint-completeness.md) — The foundations are coherent but not implementation-ready; the audit corrected settled contradictions and surfaced fourteen sharp product, workflow, evidence, and integration gaps for resolution and final retest.
- [Define the workspace and change-set evidence contract](./WF-023-define-workspace-change-set-evidence.md) — Bind v1 Reviews to local Git worktrees and explicit locally resolved endpoints, with coherent immutable evidence, per-file honest degradation, and exact edge-case handling without implicit fetch or hosting-service claims.
- [Shape setup, attachment, and diagnostics workflow](./WF-022-shape-setup-attachment-diagnostics.md) — Keep setup documentation-first while providing layered in-app diagnostics, bounded repair, configurable candidate selection, and conservative identity-bound attachment recovery without implied consent.
- [Define workflow context curation and capture](./WF-024-define-workflow-context-curation.md) — Use live explicit selections over mutable locators and immutable contributions, then coherently freeze exact provenance-rich captures with stable exclusions, evidence-first eligibility, visible deltas, and route-exact disclosure without silent refresh or omission.
- [Probe Pi’s Plan Revision capture guarantees](./WF-025-probe-pi-plan-revision-capture.md) — Pi exposes finalized structured assistant content and payload-free settlement as separate facts, enabling only conditional normal-stop capture while ambiguous, disconnected, or restarted runs require a Neoflow-owned settled receipt.
- [Define Artifact Lineage Comparison semantics](./WF-029-define-artifact-lineage-comparison.md) — Compare two exact same-kind Artifacts from one lineage through saved-payload deltas and side-bound evidence; current Review changes must first become a Snapshot, and limits never infer or omit.
- [Define prepared User Pull lifecycle](./WF-033-define-prepared-user-pull-lifecycle.md) — Keep one-use Preparation separate from Invocation: atomic claim creates awaiting-start, pre-claim endings prove no start, and post-claim evidence gaps remain unresolved without replay.
- [Define Manual Handoff commitment and lifecycle](./WF-034-define-manual-handoff-lifecycle.md) — Make Manual Handoff a durable destination-declared local commitment that needs no live attachment, preserves exact carry material and presentation evidence, and never creates or implies Harness lifecycle evidence.
- [Define native Plan Offer routing and lifecycle](./WF-027-define-native-plan-offer-routing.md) — Keep native Offers deadline-bound and explicitly associated, atomically bind feedback or approved implementation authority to exact decisions, and treat delivery, start, and outcome as separate evidence.
- [Define Plan Revision result evidence](./WF-035-define-plan-revision-result-evidence.md) — Materialize a Revision only under a versioned exact-result contract: Pi requires a durable normal-stop settlement capture, Claude requires a valid exact Offer plus explicit association, and lifecycle evidence or Manual Handoff never implies a generated Artifact.
- [Define Planning completion and post-approval lifecycle](./WF-032-define-planning-completion-lifecycle.md) — Establish completion as an immutable local decision over one exact Approval, composed with but independent from optional Handoff, while later activity, evidence, cancellation, reopening, revisions, and Review links remain separate.
- [Shape the cross-session continuation workflow](./WF-026-shape-cross-session-continuation.md) — Continue from an exact durable Workflow point through a discussion-only Brief and fresh destination, using Pi Direct or honest Claude Manual routing without inherited authority, replay, or rewritten evidence.
- [Shape Plan-to-Review Continuity](./WF-030-shape-plan-to-review-continuity.md) — Link one exact committed Implementation Handoff to an independent Review through explicit source and Change Set selection, fixed Plan evidence, and closed portable dependencies without execution, attribution, or compliance claims.
- [Shape Home attention and Workflow Resume](./WF-028-shape-home-workflow-resume.md) — Use a calm Home with direct new-Plan and new-Review entry, consequence-ranked attention, explained semantic Resume, and strict separation of completion, cancellation, Archive, and Trash.
- [Define v1 Workflow Handoff payload contracts](./WF-031-define-v1-workflow-handoff-payloads.md) — Use one destination-scoped, route-neutral contract separating exact authority and provenance, disclosed material, and local-only evidence across six closed kind-specific payloads.
- [Retest the completed v1 blueprint](./WF-036-retest-completed-v1-blueprint.md) — The resolved gaps cohere after derived consistency repairs, but native Claude Offer entry still lacks the durable goal and context basis required by later Planning behavior.
- [Define native-offer Planning origin semantics](./WF-037-define-native-offer-planning-origin.md) — Use one harness-neutral Planning Origin that binds a confirmed goal to exact Offer evidence, preserves absent pre-Offer context honestly, and keeps later Planning actions viable without Adapter-specific branches.
- [Retest the reconciled v1 blueprint](./WF-038-retest-reconciled-v1-blueprint.md) — The reconciled decisions now form a coherent, contradiction-free, implementation-planning-ready v1 blueprint with no remaining product or design decision.

## Not yet specified


## Out of scope

- Implementing or refactoring Neoflow during this effort; implementation planning begins after the blueprint.
- Editing or applying code directly from Neoflow.
- Autonomous task orchestration.
- Team collaboration or shared remote workflow state.
- Simultaneous multi-workspace or multi-harness operation.
- A public plugin ecosystem or implementing integrations beyond Pi, Claude Code, and Neovim.
- [Choose the harness operating posture](./WF-018-choose-harness-operating-posture.md) defers Neoflow-managed or isolated harness sessions because they would introduce a distinct product posture beyond the attached-only v1.
- [Set the v1 boundary and priorities](./WF-015-set-v1-boundary-priorities.md) defers Context Reuse, Code Inquiry, Context Import, Shareable Workflow Reports, richer Harness Observability, and native Windows support beyond v1.
