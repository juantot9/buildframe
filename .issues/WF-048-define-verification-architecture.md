---
id: WF-048
title: "Define the verification and learning architecture"
status: closed
labels:
  - wayfinder:grilling
parent: WF-039
assignee: juanan
blocked_by: [WF-043, WF-044, WF-045, WF-046, WF-047]
created: 2026-07-17
assets: []
---

## Question

How should the implementation layer Module-interface tests, model and invariant tests, Adapter contract suites, scenario fixtures, crash and fault injection, migration and bundle round trips, performance measurements, terminal accessibility checks, and human workflow walkthroughs so that a solo developer receives fast local feedback and each learning gate can challenge assumptions without building a brittle all-at-once test system?

## Blocked by

- [Choose the Authoritative Workflow State architecture](./WF-043-choose-authoritative-state-architecture.md)
- [Validate the Harness Interaction Module implementation seam](./WF-044-validate-harness-module-implementation-seam.md)
- [Validate the TUI implementation foundation](./WF-045-validate-tui-foundation.md)
- [Validate the Editor Companion implementation seam](./WF-046-validate-editor-companion-seam.md)
- [Choose the first dogfoodable vertical slice](./WF-047-choose-first-dogfood-slice.md)

## Resolution comment

Adopt an **owner-local, Interface-first verification architecture** with progressively stronger evidence. Verification is not a product Module, one universal harness, or a package that knows every record. Each owning Module keeps its rules, fixtures, contract kit, and tests beside its implementation; cross-Module behavior is exercised through the Workspace Interface. A thin test-only Workspace scenario driver may issue `execute`, `read`, and `subscribe`, but it cannot expose repositories, storage setup, native payloads, or private workflow methods.

```text
owner-local Module Interface tests
                 │
                 ▼
       Workspace Interface scenarios
                 │
                 ▼
 capability-conditioned Adapter contracts
                 │
                 ▼
 real-process risk and compatibility probes
                 │
                 ▼
 human dogfood and release walkthroughs
```

Tests use the narrowest stable Interface that owns the behavior. Planning, Reviewing, Harness Interaction, Editor Companion, Projection, Workflow Portability, Workflow Organization, State, and Evidence keep their invariant examples local. One user action spanning owners is tested through the Workspace Interface and one complete transition. Private algorithm tests remain appropriate for unusually lossless parsers, viewport arithmetic, or encoding mechanics, but they do not substitute for Interface evidence and should be deleted when deeper tests make them redundant. Existing legacy tests move only with still-valid behavior behind a new owner; tests of legacy records, modes, generic Harness behavior, prompts, or mutable outcomes are deleted rather than layered.

### Evidence lanes and tools

Use four explicit lanes so a solo developer gets quick feedback without weakening release evidence:

1. **Fast loop:** deterministic owner-local Interface examples, generated invariant traces, pure projection/controller behavior, and affected TypeScript checking. Keep the cold workspace target at **10 seconds or less**.
2. **Full local:** the fast lane plus governing Workspace scenarios and real temporary SQLite, Git, filesystem, local IPC, and scripted Terminal, Harness, and Editor Adapter integration. `pnpm verify` also retains clean build and compiled-import smoke evidence and should stay within a **two-minute** local target.
3. **Risk gates:** independently runnable crash, fault, migration, bundle, stress, performance, and headless native-host probes. A relevant work package names and runs its required gates; unrelated risk probes do not block every edit.
4. **Release evidence:** the supported platform and host-version matrix, clean installation and upgrade paths supplied by the packaging plan, pinned compatibility probes, reference performance results, terminal accessibility checks, and human workflow walkthroughs.

Use **Vitest** as the deterministic suite runner, with explicit imports and Node environments. Use `fast-check` only for seeded generation and shrinking. Vitest may coordinate a real process but cannot stand in for production execution: SQLite workers, runtime generations, Unix IPC, crash targets, native hosts, package imports, and benchmarks run as compiled Node subprocesses under the declared Node floor. Avoid broad full-screen snapshots; assert semantic frames and use only small reviewed textual snapshots where they communicate an intentional rendering contract.

Build this infrastructure incrementally with vertical slices. The first Reviewing slice establishes only the reusable runner, scenario driver, first contract kits, and risk probes its acceptance requires. Later work deepens those facilities when it introduces a new guarantee; there is no preliminary all-v1 test-platform phase.

### Scenarios, invariants, and fixtures

Maintain a small catalog of stable scenario names and narratives for traceability, such as a Review becoming stale before Batch commitment. The name may connect a Workspace scenario, Adapter fixture, crash probe, and human walkthrough, but those layers do **not** share one executable DSL or giant setup object. Concrete builders stay with their owning Module.

Allow three fixture forms:

- **Semantic builders** are small TypeScript builders that establish behavior through commands or the owner's canonical validators. Only State, migration, quarantine, and import tests may seed physical records directly.
- **Native fixtures** are minimal, sanitized, version-labelled Pi, Claude Code, Neovim, Git, terminal, or protocol inputs with recorded provenance and expected guarantees. They contain no transcripts, credentials, or machine identifiers.
- **Golden bytes** are immutable released store generations and Portable Workflow Bundles indexed by format version and digest. Expected goldens are never regenerated from the implementation during the test that judges them; updates use an explicit reviewed fixture-generation command.

Fast workflow scenarios may use a deterministic transactional in-memory State Adapter only after it passes the shared semantic contract for atomicity, command idempotency, state versions, compare-and-swap behavior, and immutable records. A compact governing scenario set always reruns against production `node:sqlite`; the in-memory Adapter establishes no durability, recovery, or performance claim. Workspace Evidence tests use real temporary Git repositories and filesystems rather than adding a public Git mock. Harness, Editor, and Terminal substitutes are named scripted Adapters and declare exactly which evidence they can produce.

For high-risk lifecycle rules, generate legal and adversarial command traces through the owning Interface. Assert Durable Commit ordering, stable identities, immutable history, legal lifecycle transitions, idempotent duplicate results, stale-version rejection, conservative unknown states, same-version projections, and owner-specific invariants. Retain the failing seed and shrink it to a checked reproducible case when valuable. Do not build a shadow workflow implementation: handwritten truth-critical scenarios remain the primary specification, and generated tests challenge them rather than defining an alternate domain model.

### Adapter contracts and native compatibility

The Module that defines an Adapter Interface owns its contract kit. Production and scripted Adapters run the guarantees they actually declare; a shared contract cannot force false parity or widen the Interface to a lowest common denominator.

- Harness contracts are conditioned by Handoff kind, route, Capability Snapshot, Evidence Profile, Effect Constraint, and Artifact Result Contract. Pi- and Claude-specific fixture suites retain native event ordering, correlation, and result-selection facts locally.
- Editor Host contracts cover Attachment Identity, fresh buffer evidence, command idempotency, exact navigation acknowledgements, Artifact fallback, reconnect, and no replay. Headless Neovim probes establish native compatibility separately.
- Terminal contracts cover dimensions, normalized input, frame delivery, focus-safe update behavior, no-color output, and backpressure through `pi-tui`'s existing Terminal Interface.
- State contracts separate common semantic transaction behavior from production-only writer exclusion, disk durability, migration, and quarantine evidence.

The local runtime is verified through built client/server processes and its semantic Workspace client, not by promoting private framing into a product Interface. Reviewed native fixtures run in the full or risk lanes; pinned live compatibility probes run when changing a supported host envelope and as release evidence. Unsupported or unavailable native evidence fails explicitly rather than being skipped into a compatibility claim.

### Crash, migration, and bundle evidence

Provide named deterministic **internal failpoints** at semantic checkpoints, injected only when constructing test implementations. They never appear on the Workspace Interface. Scripted Adapters control rejection, delayed or missing acknowledgement, duplicate evidence, correlation loss, and disconnect. True crash probes launch compiled processes, synchronize through explicit barriers, then terminate them with `SIGKILL`; sleeps and timing guesses are not synchronization.

Every commit/effect path carries a focused fault matrix proving at least: failed prerequisite commit performs no effect; a reported Durable Commit survives immediate process death; death after commit but before effect remains explicit and is not replayed; duplicate commands and evidence remain idempotent; acknowledgement or correlation loss becomes the settled conservative state; and restart derives only from durable facts. State-specific probes also cover writer death and lease release, corrupt-byte preservation, smallest-record quarantine, container failure, and no silent fallback.

Beginning with the first dogfood format, retain golden generations for every released store and record-schema basis that remains importable. Test every supported predecessor-to-current migration, interruption before every authority-switch checkpoint, candidate corruption, semantic validation failure, unknown newer formats, and preservation of the prior verified generation. Bundle suites verify complete dependency closure, invalid and conflicting identities, idempotent repeat import, Workspace Rebinding, inert historical Harness activity, and cross-platform preservation of record identities, provenance, and exact Artifact bytes. Archive compression bytes need not be identical when container metadata legitimately differs; the logical manifest and all authoritative record/content bytes must be exact. The legacy import decision supplies its own source goldens under this policy.

### Performance and terminal accessibility

Run benchmarks as built standalone programs outside Vitest workers. Each report records fixture version, Node and dependency versions, OS, architecture, machine details, terminal Adapter conditions, warm-up, sample count, percentiles, and failures. Enforce budgets only on documented reference environments; measurements from unlike machines are diagnostic rather than directly compared. Prototype timings are feasibility evidence, not baselines.

Preserve the blueprint's mandatory budgets and stress envelope:

- input, focus, navigation, and pending feedback remain below **100 ms at p95**;
- ordinary local Artifact and Workflow views become usable within **500 ms**;
- cold start reaches usable Home within **two seconds**;
- the stress fixture covers 250,000 tracked paths without eager content reads, 1,000 stored Workflows, a 1,000-file Review with 50 MiB of captured textual content, and individual 1 MiB text Artifacts.

Measure real scoped projections and terminal delivery under rapid updates, long scrolling, resize storms, slow-output backpressure, restart, and the Node 22.19.0 floor. Oversized fixtures assert truthful progressive rendering and named limits rather than only timing the happy path. A budget or envelope changes only from recorded measurements and an explicit learning decision; a failing threshold is not silently relaxed.

Automated terminal checks traverse all required actions with keyboard input across wide, balanced, narrow, and 80×24 linear arrangements; preserve record identity through reflow; and prove textual focus, selection, pending, warning, blocker, and outcome cues. No-color output contains no styling escapes, ASCII-safe output contains no required non-ASCII meaning, and reduced-update output removes motion without hiding state. Scripted Terminal evidence is supplemented by supported-terminal smoke checks and human visual inspection. Neoflow makes no blanket screen-reader claim without separate evidence.

### Human learning gates

Automated success cannot establish workflow comprehension or overrule contradictory dogfood. Each implementation work package names its governing blueprint decisions, automated acceptance evidence, and one explicit learning question. Record walkthrough evidence compactly by scenario, build, environment, outcome, observed confusion, and follow-up; do not capture Harness transcripts or sensitive workspace content.

The first production Reviewing slice must pass the complete learning gate from [Choose the first dogfoodable vertical slice](./WF-047-choose-first-dogfood-slice.md): three real Review Passes covering no findings, a real Pi Question with human disposition, and restart recovery, plus induced Snapshot staleness and one non-normal Pi outcome proving durable retention and no replay. It cannot expand merely because its automated suites pass.

Release walkthroughs with representative terminal-oriented developers cover standalone Planning, standalone Reviewing, linked Plan-to-Review, Workflow Resume, and Continue in Another Session from setup and contextual help. Repeated confusion about approval, disclosure, start, settlement, human disposition, or unresolved outcomes blocks release. Classify observations instead of weakening tests: an implementation defect returns to its owner; an Interface or ordering violation returns to architecture work; repeated contradictory behavior in a correctly implemented semantic rule triggers an explicit product-blueprint amendment.

Use named invariants, scenarios, contracts, and learning evidence rather than a line-coverage percentage as the quality gate. Coverage reports may locate blind spots, but generated percentages cannot prove truth-critical behavior. No product terminology changed, and this decision exposes no new ticket or fog.
