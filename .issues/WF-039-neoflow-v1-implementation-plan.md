---
id: WF-039
title: "Chart the Neoflow v1 implementation plan"
status: closed
labels:
  - wayfinder:map
parent: null
assignee: null
blocked_by: []
created: 2026-07-17
---

## Destination

Reach a decision-complete, empirically challenged Neoflow v1 implementation plan covering target Modules and Interfaces, runtime and package topology, persistence and migration, Harness and Editor Adapter seams, TUI architecture, incremental dogfood delivery, verification, packaging, and release—ending in a sequenced, low-cognitive-load backlog ready for one developer to execute.

## Notes

- [Chart the Neoflow v1 product blueprint](./WF-001-neoflow-v1-product-blueprint.md) is the authoritative product baseline. Derived implementation choices must preserve it; real prototype, workflow, or use evidence may trigger an explicit, traceable amendment rather than silent reinterpretation.
- This map plans implementation; it does not carry production implementation or refactoring. It may create disposable feasibility prototypes, concrete workflow walkthroughs, and final planning artifacts where paper reasoning is insufficient.
- TypeScript, Node.js, and pnpm are the default technical foundation unless a prototype exposes a concrete blocker. The renderer, persistence technology, process topology, and package structure remain open to evidence.
- The legacy MVP is evidence and a parts bin, not an architectural constraint. Keep the repository buildable, seek dogfoodable v1 slices early, and retain or delete old code solely according to the cleanest validated route.
- Planning and Reviewing must both become independent end-to-end workflows. Do not preselect which comes first; choose the first slice by learning value, architectural risk, and useful mechanics.
- Optimize for one developer: low work in progress, one coherent default sequence, deep Modules, strong locality, minimal coordination machinery, and coding-sized work packages that do not require reloading the whole blueprint mentally.
- Final work packages must name an outcome, dependencies, blueprint authority, acceptance evidence, and learning gate. They are an output of the completed map, not Wayfinder decision tickets.
- Every session should use `codebase-design` and consult `CONTEXT.md`; use `grilling` and `domain-modeling` for governing decisions, `prototype` for risky behavior or technical shape, and `research` only for external facts that block a decision.
- Preserve the Harness Interaction Module as a deep semantic Module. Planning and Reviewing must not branch on Harness names, native payloads, transport details, or persistence mechanics.
- Use simple language and polished, easy-to-scan diagrams throughout architecture discussions and planning artifacts so Module ownership, Interfaces, and dependency direction remain easy to inspect.
- Keep projections scoped, versioned, on demand, stable by record identity, and separate from fast local UI state; never rebuild or send the whole workspace for each change.
- Let Neovim users choose their own key combinations: the Neovim Adapter should expose stable actions and mapping targets without installing mandatory keybindings or duplicating editor mappings in Neoflow configuration.
- **This map was reopened on 2026-08-06**, after closing, under its own **Out of scope** allowance for reopening settled behavior when there is concrete contradictory evidence. The evidence is measured and recorded in [Decide the declared Node version range](./WF-056-decide-declared-node-version-range.md): the renderer needs a flag that exists only on Node 26, and the tested Node window has narrowed to three patch releases on a line that is not yet LTS. [Shape packaging, setup, and release topology](./WF-050-shape-packaging-setup-release.md) had assumed a Node 22.19.0 floor and rules out bundling a runtime, so its resolution now carries a correction note. One ticket was open against this; the map **closed again on 2026-08-06** when [Decide whether the OpenTUI renderer choice survives public distribution](./WF-059-decide-renderer-survives-public-distribution.md) resolved. That resolution keeps the renderer and carries a recheck obligation, so a future trigger reopens this map the same way this one did.

## Decisions so far

- [Audit the blueprint-to-code starting point](./WF-040-audit-blueprint-code-starting-point.md) — Keep only tested low-level Git/diff, terminal, persistence-ordering, socket, Pi-hook, and build mechanics as private transplant candidates; replace every legacy product/package seam and design for the audited runtime, Unix, integration, evidence, and migration constraints.
- [Define the target Module architecture](./WF-041-define-target-module-architecture.md) — Put one typed Workspace Interface over deep workflow-owned Modules, one-owner atomic commands, scoped projections, separate State and Evidence foundations, thin native Adapters, and inward-only dependencies.
- [Choose the local runtime and Workspace Writer topology](./WF-042-choose-local-runtime-topology.md) — Run one on-demand writer process per Workspace Identity; keep the TUI, launcher, and native Adapters as reconnectable clients behind a private versioned local-runtime Module and avoid package-per-logical-Module seams.
- [Choose the Authoritative Workflow State architecture](./WF-043-choose-authoritative-state-architecture.md) — Use one generation-switched `node:sqlite` record store with a crash-released writer lease, atomic idempotent transitions, checksummed exact bytes, validate-before-switch migration, record quarantine, and storage-independent bundles.
- [Validate the Harness Interaction Module implementation seam](./WF-044-validate-harness-module-implementation-seam.md) — Put a closed evidence/directive Interface between one transactional semantic owner and reviewed Pi/Claude Adapters, committing every path or inbound fact before effects or acknowledgement while keeping native asymmetry out of workflows.
- [Validate the TUI implementation foundation](./WF-045-validate-tui-foundation.md) — Replace Ink with pinned `pi-tui` behind a projection-driven local controller that renders bounded same-version windows, keeps fast interaction state local, and emits only typed Workspace commands.
- [Validate the Editor Companion implementation seam](./WF-046-validate-editor-companion-seam.md) — Use one attachment-scoped projection/command session through a launcher bridge, with runtime-owned exact validation and TUI routing, thin acknowledged Neovim effects, read-only Artifact fallback, and conservative no-replay reconnect.
- [Choose the first dogfoodable vertical slice](./WF-047-choose-first-dogfood-slice.md) — Lead with production-spine, TUI-only current-workspace Reviewing through Question-only Pi Handoff and human Review Result, then hard-cut legacy paths only after real restart, staleness, and failure dogfood gates pass.
- [Define the verification and learning architecture](./WF-048-define-verification-architecture.md) — Keep verification owner-local and Interface-driven, with Vitest fast/full lanes, real-process risk probes, capability-conditioned Adapter contracts, versioned fixtures, measurable release gates, and human dogfood evidence that can stop or amend the plan.
- [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md) — Build v1 beside a dependency-isolated legacy MVP, hard-delete legacy product paths only after dogfood and migration gates pass, and explicitly import exact legacy bytes as non-canonical evidence whose candidates require human-confirmed v1 Anchors and intents.
- [Shape packaging, setup, and release topology](./WF-050-shape-packaging-setup-release.md) — Publish one MIT public-preview product version through npm, pnpm, and curl plus host-native coordinated integrations, with a personal publisher and controlled scoped npm fallback, no name-only placeholders, docs-first diagnostics, evidence-gated promotion, bounded compatibility, and rollback that never hides post-migration Durable Commits.
- [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md) — Sequence v1 through 60 low-WIP, owner-local work packages: preserve evidence, build the production spine, dogfood Reviewing, hard-cut legacy, finish Reviewing before Planning, compose continuity and portability, then promote installed evidence-backed artifacts.
- [Retest the Neoflow v1 implementation plan](./WF-052-retest-implementation-plan.md) — The complete route passes after tightening package granularity and making the remaining authority, Handoff, editor-context, attachment, and evidence coverage explicit.
- [Decide whether the OpenTUI renderer choice survives public distribution](./WF-059-decide-renderer-survives-public-distribution.md) — Keep OpenTUI under Node 26: the flag is already applied transparently so it costs consumers nothing, the 26.6.0+ ceiling is Neoflow resolving `git` through `PATH` rather than a renderer cost and is ours to fix, and the launcher must refuse below the floor, warn above it, and refuse only known-bad versions; reopen solely if the flag disappears, the `git` fix fails to reach the LTS patch, or OpenTUI breaks on it.

## Not yet specified


## Out of scope

- Production implementation, refactoring, or release execution during this map.
- Product-blueprint amendments that require contradictory prototype, dogfood, or real-use evidence discovered during execution; follow the owning learning gate and open a fresh planning effort if one is required.
- Optimization and simplification choices that depend on measured dogfood, fault-injection, performance, or usability evidence during execution.
- Reopening settled product behavior without concrete contradictory evidence.
- Preserving legacy package seams, protocols, commands, data models, or UI behavior for compatibility alone.
- Post-v1 capabilities already deferred by the product blueprint.
- Team collaboration workflow, multi-developer delivery machinery, or organizational process design.
