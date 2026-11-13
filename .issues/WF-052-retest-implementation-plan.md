---
id: WF-052
title: "Retest the Neoflow v1 implementation plan"
status: closed
labels:
  - wayfinder:grilling
parent: WF-039
assignee: juanan
blocked_by: [WF-051]
created: 2026-07-17
assets: []
---

## Question

Do the implementation decisions, prototype evidence, blueprint amendments if any, and sequenced solo-developer backlog form one coherent and feasible route to Neoflow v1 without leaving Module ownership, technical topology, migration, integration, validation, delivery order, or release behavior for an implementation session to invent—and without making any work package too cognitively intense for one developer?

## Blocked by

- [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)

## Resolution comment

**Retest verdict: pass after one execution-plan correction.** The settled product blueprint, implementation decisions, prototype evidence, and revised [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md) now form one coherent and feasible route to Neoflow v1.

The retest challenged the route in five ways:

- **Module ownership and Interfaces:** Every semantic transition still has one owner behind the Workspace Interface. State owns durability, Evidence owns workspace and exact-source facts, Harness Interaction owns every Handoff route and external-effect ordering, Editor Companion owns editor identity and commands, workflow owners retain Planning and Reviewing meaning, and Projection remains read-only. The revised cards explicitly restore that authority where the prior shorthand could have made an implementation session reload or infer it.
- **Product and route completeness:** All six Handoff Payload Contract kinds now have their required correlated and honest Manual forms assigned. The plan explicitly assigns Pi and Claude Context Budget Evidence, Review and Planning editor context contributions, attachment selection/switch/detach/recovery, exact Manual Plan-generation and Feedback paths, and Harness Interaction ownership of Implementation Handoff. No v1 workflow, consent distinction, recovery posture, or reference integration is left without an implementation and evidence package.
- **Technical feasibility:** The selected Node, `node:sqlite`, per-workspace runtime, private Unix IPC, `pi-tui`, reviewed Harness Adapter, and Editor Companion shapes remain consistent with the audited repository and the five passing disposable probes. Their unproven production concerns remain named risk gates rather than assumptions.
- **Dependency and deletion safety:** The default route remains low-WIP and strictly ordered: production spine, first Reviewing dogfood, explicit legacy import, hard source cutover, complete standalone Reviewing, complete standalone Planning, composition, packaging, installed-candidate qualification, then promotion. Every dependency names an earlier package; no package depends on deleted legacy behavior, and user data never shares the source-deletion boundary.
- **Cognitive size:** The original 42-package version did not pass this part of the retest. Several cards combined workflow semantics, projections, native Adapters, recovery, or release matrices and deferred their real slicing to implementation. The user confirmed that the final plan must enforce one-session granularity now. The canonical plan is therefore revised to 60 owner-local packages, while preserving every settled behavior, milestone, and the confirmed Reviewing-before-Planning order.

The 60 package cards are sequential and uniquely named; each retains exactly one Outcome, Dependencies, Blueprint authority, Acceptance evidence, and Learning gate. All linked authorities resolve, and Markdown validation passes. The remaining record layouts, private framing, parser shape, timeout constants, visual spacing, and test-builder choices are legitimately local implementation decisions under the owning Interface, not missing architecture.

No product-blueprint amendment, new Wayfinder ticket, or remaining planning fog is warranted. Evidence discovered during production implementation or dogfood follows the plan's explicit learning gates and belongs to execution, not to this completed implementation-planning map.

### Post-retest execution evidence (2026-07-25)

P02 found one external-policy contradiction after this retest: npm's official Open Source Terms reject content that exists only to reserve a name, while the original packaging decision told execution to reserve `neoflow` and `neoflow-pi` before genuine package assembly. The user approved a narrow correction in [Shape packaging, setup, and release topology](./WF-050-shape-packaging-setup-release.md) and the P02 card: secure a personal publisher and controlled scoped fallback now, keep preferred unscoped names availability-dependent, and claim them only with genuine usable artifacts.

The retest verdict remains a pass. The correction removes an impermissible external action, keeps P03 independent of an uncontrolled package name, and leaves all 60 package dependencies, Module ownership, release qualification, and installed-byte evidence unchanged. It is an execution-coordinate amendment, not a product-blueprint amendment or a reason to reopen the implementation map.

### Post-retest execution evidence (2026-08-05)

After the Gate A and Gate B OpenTUI gates closed and the accepted source was promoted into `main`, the user directed one further sequencing amendment: a general code-review-and-improve step covering **every** package, not only the Reviewing surface, before P17. The accepted shape is a read-only architecture and risk audit first, then the already-accepted Live Changes semantics, then per-package deepening of the active Modules, then a blocker-only legacy review, then one final quality gate. The user also required that improvements be evidence-driven, ruling out speculative abstraction, style-only churn, and new shallow Interfaces.

That gate is now recorded as five cards in [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md), inserted after the first Reviewing dogfood gate and before the legacy importer. They are lettered rather than renumbered so that every existing package number, cross-reference, and the 60-package count above stay accurate; the plan's operating contract already states that package numbers are scan aids and that dependencies always name the package. The importer's dependency now names the deepening quality gate.

The retest verdict remains a pass. The amendment reorders execution and adds evidence obligations without changing any Module's ownership or Interface, without altering the Reviewing-before-Planning decision, and without reopening a settled product rule. Its one substantive product effect is to schedule the recorded Live Changes and Snapshot-lineage design for implementation instead of leaving it deferred indefinitely behind the temporary stale-Snapshot blocker. It is an execution-sequencing amendment, not a product-blueprint amendment.

This retest also exposed one process weakness worth preserving. The accepted sequence above existed only in a coding-session transcript for roughly ten minutes before that session ended on a provider usage limit, and neither `HANDOFF.md` nor this tracker recorded it. It was recovered from the transcript rather than from a durable artifact. Accepted sequences belong in `.issues/` at the moment of acceptance, not at the next gate.
