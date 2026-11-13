---
id: WF-015
title: "Set the v1 boundary and priorities"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: juanan
blocked_by: [WF-013, WF-014, WF-021]
created: 2026-07-14
assets: []
---

## Question

Which agreed capabilities and quality criteria are essential for a coherent Neoflow v1, which should follow later, and what observable outcomes would make the blueprint ready for implementation planning?

## Blocked by

- [Choose Neoflow’s visual language](./WF-013-choose-visual-language.md)
- [Discover capabilities that reinforce the core workflows](./WF-014-discover-reinforcing-capabilities.md)
- [Establish Pi and Claude Code context-budget evidence](./WF-021-establish-context-budget-evidence.md)

## Resolution comment

V1 prioritizes vertical coherence over feature count. Planning and Reviewing must each work end to end without the other. When a Review starts from an Implementation Handoff, Plan-to-Review Continuity is also required: the exact approved Plan Revision remains inspectable, the Implementation Baseline may define the Change Set basis, and Review Findings may cite Plan Anchors. This composition never makes either anchor workflow depend on the other or introduces task tracking, automatic mapping, compliance scoring, or implementation attribution.

The complete trustable workflow spine is release-critical rather than later hardening. The settled Artifact and Annotation semantics, local authoritative durability, conservative recovery, consent and authority boundaries, immutable receipts, truthful lifecycle evidence, responsive TUI interaction, and Artifact-first visual hierarchy apply across every essential path. Approval must remain distinct from implementation, commitment from external effect, and correlated outcome from semantic correctness.

For Pi and Claude Code, every essential Workflow Handoff must default to the strongest already-validated compatible Harness Capability currently available in the reference envelope. Manual Handoff is acceptable when no compatible correlated option is currently available, or as an explicit Capability Downgrade when the user deliberately declines a stronger available option; it cannot substitute for an unfinished viable Adapter path. V1 remains attached-only and capability-asymmetric. End-to-end contract evidence must cover the documented supported Harness versions, each essential route, interruption, disconnect, session or checkout identity change, missing bridge or plugin, stale telemetry, and absent Terminal Evidence. Every case must result in the promised evidence, explicit unavailability, an honest Manual Handoff, or conservative unresolved state—never optimistic success.

The v1 Neovim Editor Companion includes the complete non-Inquiry loop: explicit context contribution; exact Annotation drafting, navigation, human disposition, and viewed-state actions; Artifact Buffer fallback for historical, stale, or mismatched locations; compact status; acknowledged idempotent navigation and commands; reconnect revalidation; and preserved TUI return locations. Tests must prove these paths across the supported platform matrix, and no mismatch may navigate approximately or commit against unverified content.

The reinforcing v1 feature set is deliberately narrow:

- Workflow Resume returns to durable semantic state rather than replaying Harness or UI state.
- Artifact Lineage Comparison compares two exact same-kind Plan Revisions or Review Snapshots without generated judgment or supersession claims.
- Continue in Another Session supports a fresh session of the same Harness or movement between Pi and Claude Code through an explicit Continuation Brief, without transcript transfer or rewritten Invocation evidence.
- Context Budget Evidence always includes exact proposed-payload bytes, characters, records, and files. Fresh model, capacity, or usage evidence appears only where the Attached Harness reports it reliably; `unknown` is valid, parity is not required, and no external token service or automatic session change enters v1.
- Portable Workflow Bundle export, validation, import, and explicit Workspace Rebinding provide full-fidelity ownership and recovery. Bundles must round-trip across supported platforms while preserving record identities, provenance, and exact Artifact bytes; platform paths remain locators and historical harness activity remains inert.
- A concise Workspace Storage utility provides usage, Archive, Delete to Trash, Restore, Empty Trash, Clear Caches, and contextual bundle export.
- Versioned portable JSON User Configuration and a focused TUI Settings surface cover layout, keybindings, no-color, ASCII-safe, and reduced-update preferences without adding setup to the default path.

Context Reuse, Code Inquiry, Context Import, Shareable Workflow Report, richer transcript/stream/tool Harness Observability, and native Windows support follow after v1. Mouse acceleration, decorative motion, and branding refinement are non-blocking polish: they may ship without displacing the release spine but cannot carry information or authority unavailable through the required static keyboard experience.

V1 supports native macOS and Linux. It supports Windows through WSL2 only when Neoflow, the Harness, editor, and canonical checkout all live in the same WSL environment. Native Windows requires a later deliberate treatment of filesystem identity, IPC, permissions, process control, and terminal behavior.

> **Amendment, 2026-11-11, from
> [Ship the 0.1.0 public preview](./WF-287-ship-the-0-1-0-public-preview.md).**
> WSL2 is no longer pursued. The owner prefers native Windows, which becomes
> the next platform goal after `0.1.0` (macOS and Linux). The treatment named
> above still applies, at an estimated 4–7 weeks. A `node:ffi` + OpenTUI
> `win32` probe runs first, because a failure reopens the renderer choice in
> WF-059.

The mandatory terminal quality floor is keyboard-complete operation; semantic wide, medium, narrow, and linear reflow; and fully usable no-color, ASCII-safe, and reduced-update presentations. On a documented reference machine and fixture, input, focus, and navigation feedback must remain under 100 ms at p95, ordinary local Artifact and Workflow views must become usable within 500 ms, and cold start must reach a usable Home within two seconds. Durable and external operations must show an accurate pending state immediately without freezing input. Oversized content must degrade through explicit progressive rendering, collapse, or a named limit, never silent omission.

The initial stress fixture is a checkout with 250,000 tracked paths without eager content reads, 1,000 stored Workflows, a Review with 1,000 changed files and 50 MiB of captured textual content, and individual text Artifacts up to 1 MiB. Implementation planning may refine these bounds only from measurements while preserving explicit behavior beyond the supported envelope.

Release evidence must include automated crash and fault injection proving that a reported Durable Commit survives immediate termination, no external effect begins after its prerequisite commit fails, restart never silently retries or upgrades uncertain outcomes, corruption quarantines the smallest affected record, failed migration preserves the prior verified generation, and bundle transfer round-trips exact records. Privacy and consent tests must prove that destination, scope, authority, disclosure delta, Capability Snapshot, and every material limitation are visible before consequential commitment; true blockers cannot be overridden; receipts do not copy transcripts or credentials; and sensitive export content requires its exact scoped gate.

Scenario-based usability validation with representative terminal-oriented developers must cover standalone Planning, standalone Reviewing, linked Plan-to-Review, Workflow Resume, and Continue in Another Session from attachment instructions and contextual help. Users must correctly distinguish approval, disclosure, start, settlement, and unresolved outcomes; repeated truth-critical misunderstanding blocks release. Setup and recovery documentation must let a new user install Neoflow, establish and verify Pi, Claude Code, and Neovim attachments, understand unavailable routes, locate local state, recover a Workflow, and export or import a bundle. Functional visual outcomes—Artifact hierarchy, role-based density, readable measure, sparse framing, explicit focus, and redundant status cues—block release; decorative fidelity does not.

The blueprint is ready for implementation planning only when every essential workflow has defined entry, success, cancellation, failure, unresolved, restart, and recovery behavior; every essential Handoff has a Pi and Claude Code route/evidence/limitation/fallback account; TUI and Neovim action ownership is unambiguous; all features have a v1, non-blocking, post-v1, or out-of-scope disposition; and the platform and quality gates above remain measurable. [Reconcile the current MVP with the blueprint](./WF-016-reconcile-current-mvp.md) must account for existing behavior without constraining the design, and [Test the blueprint for completeness](./WF-017-test-blueprint-completeness.md) must leave no unresolved product decision that would force an implementation planner to invent behavior.
