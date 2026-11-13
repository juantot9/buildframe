---
id: WF-041
title: "Define the target Module architecture"
status: closed
labels:
  - wayfinder:grilling
parent: WF-039
assignee: juanan
blocked_by: [WF-040]
created: 2026-07-17
assets: []
---

## Question

What target Module map, ownership model, dependency direction, and small set of deep Interfaces should implement the settled Planning, Reviewing, Artifact, Annotation, workspace-evidence, Harness-interaction, Editor-companion, projection, command, configuration, bundle, and recovery semantics without recreating a shared grab bag or distributing invariants across callers?

## Blocked by

- [Audit the blueprint-to-code starting point](./WF-040-audit-blueprint-code-starting-point.md)

## Resolution comment

Use one deep **Workspace Module** as the application-facing seam for one Workspace Identity. Its Interface is conceptually `execute(command)`, `read(viewRequest)`, and `subscribe(viewScope)`. Commands are a closed, versioned union of real actions such as Approve Plan, Refresh Review, or Begin Implementation; each carries stable command identity and is revalidated when handled. The Interface exposes no generic record updates, repositories, native Harness events, Git helpers, or storage paths.

```text
╭─────────────────────────────────────────────────────────────╮
│                    TUI / CLI / Adapters                     │
╰─────────────────────────────┬───────────────────────────────╯
                              ▼
╭─────────────────────────────────────────────────────────────╮
│ Workspace Interface: execute • read • subscribe             │
╰─────────────────────────────┬───────────────────────────────╯
                              ▼
╭─────────────────────────────────────────────────────────────╮
│ Planning     Reviewing      Harness Interaction             │
│ Editor       Projection     Workflow Portability            │
│ Workflow Organization       Commitment Policy               │
╰─────────────────────────────┬───────────────────────────────╯
                              ▼
╭─────────────────────────────────────────────────────────────╮
│ Authoritative State            Workspace Evidence           │
╰─────────────────────────────────────────────────────────────╯
```

The Workspace Module has a deep outside Interface but is not one giant implementation. It routes each command to its owning Module, opens one atomic save, publishes the resulting state version, and permits any external effect only after the save succeeds. Command handlers, rules, records, projections, and Interface-level tests stay beside their owning Module. Logical Modules do not imply separate packages or processes.

### Ownership

- The **Planning Module** owns Planning Origin, Plan and Revision lineage rules, Feedback, Approval, Completion, Reopening, and Planning-specific cancellation.
- The **Reviewing Module** owns Change Set intent, Review Passes, Snapshots, Findings, Coverage, Results, re-review, continuation of a completed Review, and Reviewing-specific cancellation.
- Artifact, Anchor, Annotation, Batch, and record-identity behavior is expressed through concrete workflow-owned records and private shared immutable constructors and validators. There is no public generic Artifact, Annotation, or Workflow Core Module and no generic lifecycle shared across Artifact kinds.
- The **Harness Interaction Module** remains the deep semantic owner settled by the product blueprint. It owns Handoff inspection and commitment, exact disclosure, Capabilities, Attachments, Offers and association, Preparations, Invocations, result evidence, interruption, normalized failures, receipts, and route-specific recovery. Planning and Reviewing provide structured workflow facts; they never branch on Harness name, payload, transport, availability text, or native events.
- The **Editor Companion Module** owns Editor Attachment Identity, Editor Target, exact Anchor matching, command idempotency, navigation acknowledgements, return locations, reconnect checks, and the decision to route a consequential editor action to the TUI. A thin Neovim Adapter owns only Neovim transport, buffers, extmarks, and native presentation.
- The **Workflow Organization Module** owns Archive, unarchive, Trash, restore, permanent-purge dependency checks, and workspace storage totals. It does not own Planning Completion, Review Result, or Workflow Cancellation.
- The **Workflow Portability Module** owns full dependency closure, manifests, sensitive export inspection, exact bundle creation, whole-bundle validation, identity conflicts, atomic import, and Workspace Rebinding. A Portable Workflow Bundle is never a zipped store.
- The internal **Commitment Policy Module** consistently assesses exact destination, mutation authority, sensitive disclosure, Capability Downgrade, unresolved activity, irreversible deletion, and true blockers. It yields direct action, blocker, or one composed gate; the command owner still performs the commit and effect, and Projection prepares the visible gate.
- **User Configuration** is a separate deep Module for the portable versioned JSON preferences, defaults, conflict validation, safe save, and change notification. It contains no Workspace or Attachment Identity, workflow state, credentials, or history.

### State, evidence, and recovery

The **Authoritative State Module** owns coherent reads, one-writer ordering, identity allocation, command idempotency, all-or-nothing Durable Commit, format migration foundations, generation integrity, and preservation of corrupt bytes. It owns durability, not workflow meaning. It exposes no Plan, Artifact, Annotation, or receipt repositories and no generic CRUD. Exact persistence technology and physical history shape remain open.

The **Workspace Evidence Module** is the one deep owner of canonical-checkout evidence, Workspace Identity evidence, Context Locator expansion, coherent context capture, Git endpoint resolution, complete changed-file manifests, Review Snapshot evidence, Implementation Baseline evidence, bounded race retry, lossless path and special-file handling, capture limits, and current/stale/unverified derivation. Its conceptual Interface is a closed family of inspect, capture, and verify requests. Git commands, filesystem reads, parsers, and temporary-repository tests stay private; callers never receive `getGitRoot`, `getGitDiff`, or `readFile` composition primitives.

There is no catch-all Recovery Module. Corrupt bytes and failed migrations stay with State; unresolved Harness activity with Harness Interaction; stale workspace evidence with Workspace Evidence and its owning Workflow; invalid bundles with Portability; and damaged workflow meaning with Planning or Reviewing. Projection combines these facts into the persistent Recovery Summary while each owner keeps the relevant recovery rule local.

### Commands and effects

Every semantic command has exactly one owner. That owner may consult another Module's read-only rules, but peer Modules never save separate pieces of one action. The owner produces one complete transition, State commits all or none of it, and only then may the owner perform its route-specific external effect.

For example, Harness Interaction owns Begin Implementation: it consults Planning authority and Workspace Evidence, then atomically includes any required Planning Completion, Implementation Handoff, Commitment Receipt, Capability or Manual basis, and Invocation, Preparation, or Offer Decision before contacting the destination. Planning cannot save Completion first, and no later receipt writer fills a crash gap.

External effects remain with the Module that understands them: Harness Interaction for Pi and Claude, Editor Companion for Neovim, and Portability for bundle files. There is no generic automatic-retry worker. A crash or lost acknowledgment follows the owning route's rejected, unresolved, resubmission, presentation-retry, or no-replay rules rather than blindly repeating an effect.

### Projections and rendering

The **Projection Module** builds Home, Resume, Workflow views, action availability, blocker explanations, commitment surfaces, Editor Status, Connections and Diagnostics, Recovery Summary, history, and Artifact Lineage Comparison from durable facts. It does not write state.

Its Interface is scoped, versioned, and on demand rather than one complete workspace snapshot. Large Artifacts and Reviews are requested as manifests and visible slices; unchanged records retain stable identity; related changes publish one committed version; heavy comparison and evidence work finishes outside rendering; and fast cursor, focus, scroll, mouse, resize, and text-entry state remains local to the TUI. A header, actions, and content in one view come from the same state version, preventing mixed-state rendering. The later TUI validation must still prove large-review, rapid-update, resize, and scrolling behavior.

The Neovim Adapter exposes stable Lua actions, commands, or mapping targets but installs no mandatory key combinations. Users choose mappings in Neovim configuration; Neoflow supplies semantic tools rather than owning editor keys. Those actions become typed Editor Commands, never open string dispatch.

### Seams and dependency direction

Dependencies point inward: surfaces and native Adapters depend on the Workspace Interface; command owners depend on narrow internal Interfaces; State and Evidence never import presentation or workflow orchestration. Planning and Reviewing do not import Ink, React, native SDKs, Git mechanics, or persistence mechanics. Adapters cannot browse Authoritative Workflow State.

Use Adapter seams only where behavior really varies and the replacement has value: Pi, Claude, and scripted Harness Adapters; Neovim and test Editor Adapters; and the chosen production and test State Adapters. Low-level parsing, path, receipt, and routing helpers remain private implementation rather than hypothetical seams.

This chooses the third of the challenged shapes: one simple outside Interface over deep internal owners. It rejects both a giant Workspace implementation and many public record Modules that force callers to orchestrate invariants. It also rejects package-per-Module by default.

Process placement and package topology remain for [Choose the local runtime and Workspace Writer topology](./WF-042-choose-local-runtime-topology.md); persistence technology for [Choose the Authoritative Workflow State architecture](./WF-043-choose-authoritative-state-architecture.md); and empirical validation of the three native seams for [Validate the Harness Interaction Module implementation seam](./WF-044-validate-harness-module-implementation-seam.md), [Validate the TUI implementation foundation](./WF-045-validate-tui-foundation.md), and [Validate the Editor Companion implementation seam](./WF-046-validate-editor-companion-seam.md). No product language changed, and this decision surfaces no new ticket or fog.
