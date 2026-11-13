---
id: WF-016
title: "Reconcile the current MVP with the blueprint"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: [WF-015]
created: 2026-07-14
assets: []
---

## Question

Given the agreed product blueprint and deep-module principles, which current Neoflow concepts and modules should be retained, reshaped, replaced, or removed before implementation planning begins?

## Blocked by

- [Set the v1 boundary and priorities](./WF-015-set-v1-boundary-priorities.md)

## Resolution comment

The legacy MVP is evidence and a parts bin, not an architectural foundation or source of product decisions. V1 should begin from the agreed blueprint. No current package, product Module, state model, or interface receives a presumption of survival, and none should be retained wholesale. Existing code may contribute only narrowly validated mechanics transplanted behind a blueprint-defined Module's new interface.

The strongest reuse candidates are diff parsing, old/new-side targeting, viewport and navigation algorithms, composer editing, terminal focus and input behavior, mouse parsing, responsive-layout experiments, atomic-write and commit-before-effect techniques, socket framing and hardening, and observed Pi lifecycle handling. Their current ownership and package seams do not survive; tests move only where they continue to assert behavior through the new interface.

The current product and Module dispositions are:

- Retain the terminal TUI only as the independently chosen primary product surface. Replace the monolithic `App.tsx`, global mode state, UI-owned effects, current information architecture, and pure-black Codex treatment with a projection and command surface over the settled workflow-first, adaptive, Artifact-first system. The renderer remains an implementation-planning choice.
- Remove free-form Chat, Neoflow-owned conversational transcripts, generic composer-to-Harness submission, and the production Mock fallback. Harnesses own conversation; Code Inquiry remains post-v1.
- Replace legacy Plan mode completely with the durable Planning Workflow. The current pane is interaction evidence only: its ephemeral assistant-derived artifact, mutable status, and absent snapshots, lineage, anchored Feedback Batches, re-review, approval history, and capability-honest Handoffs are not a migration base.
- Replace the legacy Changes and Review workflow, queue, and receipt models. Selective diff interaction mechanics may be reused, but a live working-tree diff cannot stand for a Change Set or immutable Review Snapshot; harness settlement cannot clear Findings or create human disposition; and size limits must degrade explicitly rather than reject the entire Review silently or globally.
- Remove global Attachments, `ContextItem`, `ContextMessage`, `AiIntent`, and ambient all/selected scope. Replace them with Workflow-scoped context curation, explicit Editor Context Contributions and Context Locators, immutable snapshots, and exact destination, provenance, freshness, sensitivity, and disclosure treatment.
- Replace normalized-path workspace identity, `getGitDiff`, and other caller-assembled Git helpers with stable Workspace Identity and blueprint-aligned evidence capture and verification. Pure Git and path algorithms may remain internal mechanics.
- Replace repository-local `.neoflow/review.json` authority and separate Review receipt storage with one private Authoritative Workflow State and one Workspace Writer. Current persistence code contributes techniques only; it does not define the new record model, retention policy, recovery behavior, or module seam.
- Remove `@neoflow/ai-harness`, `AiHarness`, broad mode and capability Booleans, generic prompt formatting, `done` semantics, the current harness protocol, and `HarnessConnectionManager`. Replace them with the deep Harness Interaction Module, its Handoff-specific contracts, normalized durable evidence, a rebuilt first-party Pi Adapter, a separate Claude Adapter, and an in-memory Adapter used only in tests. Existing transport and Pi event work is evidence internal to those replacements.
- Remove `neoflow send`, its context protocol, the one-shot Neovim commands and compatibility aliases, and direct TUI process-spawn navigation from the v1 path. Replace them with the persistent registered Editor Companion, a Neovim Adapter, acknowledged commands and navigation, exact attachment and buffer revalidation, and conservative failure. Any future CLI surface is designed from launch, setup, diagnostic, storage, or bundle needs rather than inherited from `send`.
- Remove `@neoflow/core` as a shared grab bag. Canonical records and invariants belong to the deep Module that owns them; transport schemas and local mechanics remain internal. User surfaces must not reconstruct workflows from shared storage, Git, path, prompt, or protocol primitives.

The replacement architecture must preserve deep seams at product ownership points: Planning and Reviewing own their workflow invariants; the Harness Interaction Module hides all Adapter and lifecycle asymmetry; Authoritative Workflow State establishes durable semantic transitions before effects; workspace evidence capture hides filesystem and version-control detail; and the TUI and Editor Companion issue semantic commands and consume projections rather than orchestrating those internals.

Legacy data receives conservative migration rather than semantic invention. The one-time import preserves the original `.neoflow/review.json` and user-state receipt files unchanged, exposes old receipts only as clearly labelled read-only legacy history, and presents pending annotations as migration candidates. A candidate can become a new Annotation Draft only after a new Review Snapshot exists and the human confirms its Anchor. Import never fabricates canonical Artifacts, Batches, Commitment Receipts, Capability Snapshots, Invocations, or outcomes from incomplete legacy evidence.

Exact package names, process topology, IPC transport, persistence technology, and TUI renderer belong to separate implementation planning. This reconciliation constrains their semantics and seams, not their implementation form.
