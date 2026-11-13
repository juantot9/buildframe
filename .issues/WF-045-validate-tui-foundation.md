---
id: WF-045
title: "Validate the TUI implementation foundation"
status: closed
labels:
  - wayfinder:prototype
parent: WF-039
assignee: juanan
blocked_by: [WF-041]
created: 2026-07-17
assets:
  - "ab9e1ce:apps/tui-foundation-prototype/ on evidence/validated-implementation-probes (disposable evidence only)"
  - "ba374d1:evidence/validated-implementation-probes/README.md on evidence/validated-implementation-probes"
---

## Question

Which renderer and projection-command architecture should implement the workflow-first TUI, and can a disposable representative slice validate responsive wide-to-linear reflow, Artifact-scale rendering, keyboard and focus behavior, composed commitment gates, pending states, no-color and ASCII-safe presentation, and sub-100-ms interaction feedback without moving workflow orchestration into view code?

## Blocked by

- [Define the target Module architecture](./WF-041-define-target-module-architecture.md)

## Resolution comment

Replace Ink/React in the target TUI with a directly pinned **`@earendil-works/pi-tui`** dependency. Use its differential synchronized terminal renderer, raw input normalization, explicit focus, width-safe text utilities, and substitutable Terminal Interface; keep semantic layout, viewport selection, mouse mapping, no-color behavior, and Neoflow's visual grammar in Neoflow-owned implementation. Do not preserve the legacy Ink component tree or `App.tsx` orchestration, and do not build a custom terminal renderer while `pi-tui` satisfies the required mechanics.

`pi-tui` is private TUI implementation, not a new product seam. There is no generic renderer Interface: one production renderer does not justify it. Its existing Terminal Interface is a useful internal test seam because production and scripted Terminal Adapters both exist. Pin and verify the renderer independently from Pi Harness Adapter versions; the probe used `@earendil-works/pi-tui` `0.80.6`, whose Node floor matches the already-selected Node `22.19.0` floor. The packaging and verification plans must test the ultimately pinned version on every supported platform rather than inheriting it transitively from Pi.

```text
workspace runtime
   │  scoped, same-version projections
   │  typed commands and command results
   ▼
TUI Application Module
   ├─ projection cache: monotonic envelopes by scope and state version
   ├─ local interaction: focus, cursor, scroll, resize, mouse, text entry
   ├─ commitment interaction: projected checks plus truthful local pending phase
   └─ semantic layout: Wide / Balanced / Linear regions
   │
   ▼
pi-tui components and differential terminal output
```

### Projection-command seam

The TUI remains a reconnectable client of the Workspace Interface settled by [Define the target Module architecture](./WF-041-define-target-module-architecture.md) and [Choose the local runtime and Workspace Writer topology](./WF-042-choose-local-runtime-topology.md). Its deep application-facing dependency remains conceptually `read(viewRequest)`, `subscribe(viewScope)`, and `execute(command)`; it never receives a State Adapter, workflow repository, Git helper, Harness Adapter, or IPC frame.

A view request names one closed projection kind and bounded windows for the current semantic regions. A projection response is one immutable envelope with projection scope and committed state version. Header, content, action availability, blocker explanation, gate, counts, and status rendered together must come from that same envelope. Stale envelopes are ignored. Subscriptions announce or deliver committed scoped changes; they never stream mutable records or force a complete Workspace snapshot.

Large Artifacts and Reviews use manifests plus stable-identity windows. The TUI requests only visible and modest overscan rows, retains selection by Workflow Record Identity or row identity, and asks for another window near an edge. It never receives or constructs the complete 50 MiB Artifact merely to display one terminal. Expensive parsing, comparison, evidence capture, action availability, and Commitment Policy assessment finish in their owning workspace Modules before projection. Projection cache entries are replaced by scope and version rather than merged field by field, preventing mixed-state frames.

The **TUI Application Module** owns fast interface state and input interpretation behind a small internal Interface equivalent to accepting a projection, accepting input or resize, accepting a command result, and producing a frame plus typed Workspace effects. Focus, cursor, scroll, text buffers, divider positions, mouse gestures, temporary arrangement, and reduced-update timing remain local and never become Workspace commands or Authoritative Workflow State. User Configuration may persist an explicit preference, but not a transient interface occurrence.

View code does not orchestrate workflows. The Projection Module supplies a closed projected action as direct, blocked with one corrective action, or requiring one complete Composed Commitment Gate. The gate projection already contains its accurately named action, destination, concrete scope, material limitation, required acknowledgements, blocker state, exact command basis, and return location. The TUI only reveals it, tracks the displayed checks locally, and emits the corresponding closed semantic command with a fresh stable command identity, expected state version, gate identity, target identities, and accepted acknowledgement identities. It never reconstructs policy from native Harness facts, strings, or records.

Command feedback has three truthful phases:

1. The input handler immediately records a local `pending` presentation before asynchronous I/O, without changing projected workflow meaning.
2. `execute` returns a committed version or a structured blocked/stale result. A committed result may say the Durable Commit succeeded, but the TUI still keeps the prior projection visible while waiting for that version's scoped projection.
3. Only the matching newer projection changes visible durable meaning and restores the exact return region. No optimistic Approval, submission, Handoff, Invocation, completion, or failure state is invented in view code.

### Layout, interaction, and presentation

Implement one semantic region tree, not separate desktop and narrow applications:

- **Wide** shows Files, the Artifact, and Findings together when their semantic minimum widths fit.
- **Balanced** keeps the Artifact and one useful focused context region; the other regions retain textual counts, warnings, and direct access.
- **Linear** shows one named region with breadcrumb, counts, warnings, and Tab traversal. Reflow preserves focused record identity and viewport intent rather than resetting by row number.
- A Composed Commitment Gate receives dedicated focus and preserves its exact return location. It is a focused region over the same application state, not a stack of renderer-owned dialogs.

Tab and Shift+Tab traverse meaningful regions; arrows move within one; `j/k` remain aliases away from text entry; Enter acts; and Escape returns one layer. A central input dispatcher resolves User Configuration conflicts and sends one normalized local action to the focused region. Mouse click, wheel, and optional divider drag map to the same local focus, movement, and resize actions as the keyboard; they never bypass command or consent handling. Reuse audited composer, viewport, side-aware diff, resize, and SGR mouse algorithms only as private transplant candidates behind this shape.

Generate no-color output without styling escapes, use ASCII-safe chrome when selected, and preserve textual focus, selection, pending, warning, and outcome labels in every palette. Color and Unicode remain redundant helpers. Keep animation limited to evidence-backed active work and brief acknowledgement; reduced-update presentation removes motion without hiding state.

### Probe verdict

The disposable TUI foundation probe preserved at `ab9e1ce:apps/tui-foundation-prototype/` on `evidence/validated-implementation-probes` implements the selected seam as a `pi-tui` root over a pure local controller and an in-memory Workspace session. The evidence report at `ba374d1:evidence/validated-implementation-probes/README.md` records the exact `pnpm prototype:tui-foundation -- --all` reproduction route.

All nine checks passed. A representative 1,000-file, 50 MiB Review projected 66,341 bytes containing 80 file summaries, 240 Artifact rows, and 80 finding summaries, then rendered only 34 terminal rows. The same selected Artifact row survived wide-to-linear reflow. Keyboard and mouse produced equivalent local movement without a Workspace effect. The complete projected gate produced one typed Review Batch command; pending appeared before asynchronous execution, and durable meaning changed only after subscribed projection version 8 arrived. No-color/ASCII output and stale-projection isolation passed.

On the audited arm64 macOS machine, representative wide rendering took 4.14 ms, direct pending-frame production took 12.20 ms, and an actual `pi-tui` differential input update reached the scripted Terminal Adapter in 2.97 ms; width change deliberately triggered a synchronized full redraw. These are feasibility measurements, not release budgets. [Define the verification and learning architecture](./WF-048-define-verification-architecture.md) must set repeatable percentile budgets with real projections, rapid updates, long scrolling, resize storms, slower terminals, and the supported platform matrix.

The probe is deliberately untracked planning evidence pending explicit capture approval. `pnpm prototype:tui-foundation -- --all`, standalone strict TypeScript checking, `pnpm verify`, changed-issue link validation, and `git diff --check` pass. No product terminology changed, so `CONTEXT.md` remains unchanged. This decision surfaces no new ticket or fog.
