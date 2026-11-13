---
id: WF-042
title: "Choose the local runtime and Workspace Writer topology"
status: closed
labels:
  - wayfinder:prototype
parent: WF-039
assignee: juanan
blocked_by: [WF-041]
created: 2026-07-17
assets:
  - "ab9e1ce:apps/runtime-topology-prototype/ on evidence/validated-implementation-probes (disposable evidence only)"
  - "ba374d1:evidence/validated-implementation-probes/README.md on evidence/validated-implementation-probes"
---

## Question

Which local process and package topology should own the Workspace Writer, TUI, CLI or launcher, Harness Adapters, Editor Adapter, background lifecycle, and IPC; and can a thin disposable topology probe demonstrate clean startup, single-writer exclusion, reconnect, crash, version mismatch, and shutdown behavior without exposing transport mechanics through product Module Interfaces?

## Blocked by

- [Define the target Module architecture](./WF-041-define-target-module-architecture.md)

## Resolution comment

Choose **one on-demand background runtime process per Workspace Identity**. It is the only process allowed to instantiate that workspace's Workspace Module and acquire its Authoritative State writer lock. The TUI, CLI, Harness Adapters, and Editor Adapter are clients; none can browse or write state directly.

```text
TUI process ────────────────┐
CLI / launcher process ─────┤
Pi / Claude host process ───┼── private local IPC ──▶ workspace runtime
Neovim process ─────────────┘                           │
                                                        ▼
                                               Workspace Interface
                                                        │
                                                        ▼
                                           one Workspace Module + writer
```

This rejects a TUI-owned writer because TUI exit would destroy attachment reachability, and rejects one user-wide multi-workspace daemon because its routing layer, shared crash domain, and lifecycle coordination buy little for one developer. A process per logical Module is also rejected: all semantic Modules remain in one workspace runtime and use in-process Interfaces.

### Process ownership and lifecycle

- The **workspace runtime** owns the Workspace Module implementation, semantic command ordering, scoped Projection subscriptions, State and Evidence access, Harness Interaction orchestration, Editor Companion semantics, background lifecycle, and the server side of local IPC. External effects still occur through thin native Adapters after their owning semantic command has Durably Committed.
- The foreground **`neoflow` launcher** resolves or validates the requested Workspace Identity, starts its runtime when absent, waits for readiness, and then starts or connects the requested CLI or TUI surface. The TUI is a separate foreground client process and owns only rendering plus fast local interface state.
- **Harness Adapters** remain inside their Pi or Claude host processes, and the **Neovim Adapter** remains inside Neovim. They translate native events and effects into typed Workspace commands, reads, and scoped subscriptions; reconnect never grants attachment identity, consent, or replay authority.
- The runtime starts on first client demand. Closing the TUI merely disconnects that client. The runtime remains while another client is attached or volatile correlation still needs observation, and may exit after a grace period only when no client or active route needs it. A client can ensure a stopped runtime again.
- Before advertising readiness, the runtime acquires the State Adapter's exclusive writer lock for the Workspace Identity and then owns a user-private endpoint keyed by that opaque identity. Parallel starters converge on the winner; a loser connects to it rather than becoming a second writer. The State Adapter—not socket-path convention—is the final exclusion authority; [Choose the Authoritative Workflow State architecture](./WF-043-choose-authoritative-state-architecture.md) chooses the crash-safe lock mechanism.
- After a crash, the next client may start a replacement runtime and establish a fresh session. Reads and subscriptions may be re-established from a committed state version, but an `execute` call or native effect is never replayed automatically. Missing external-effect evidence remains rejected, interrupted, or unresolved according to its owning Module.
- Graceful shutdown stops accepting new commands, lets an in-progress Durable Commit reach an all-or-nothing result, closes clients, removes the endpoint, and releases the writer lock. Idle shutdown is disallowed while a live client or volatile correlation requires observation. Forced termination follows the same conservative crash recovery as any other process loss.

### Runtime and IPC seam

Use Node.js ESM with a declared floor of **Node 22.19.0**, retaining TypeScript, pnpm, and the Unix platform envelope already settled for macOS, Linux, and single-environment WSL2. Local IPC uses a user-private Unix-domain endpoint with a closed, bounded, versioned protocol. The exact framing is private implementation, not a product Interface.

Bootstrap handles endpoint discovery, Workspace Identity, client role, process generation, and protocol compatibility before returning a Workspace session. Once connected, callers see only the semantic `execute(command)`, `read(viewRequest)`, and `subscribe(viewScope)` Interface from [Define the target Module architecture](./WF-041-define-target-module-architecture.md). Runtime controls and diagnostics remain on a separate launcher-only seam. No socket path, frame, native event, process id, or protocol error enters a workflow command, record, or projection.

An unknown or incompatible protocol fails closed during bootstrap with a structured runtime-compatibility diagnostic before any Workspace call. The launcher does not silently kill or replace an incompatible active runtime; coordinated upgrade and operator recovery belong to later packaging planning.

### Source-package topology

Use package seams for deployment or dependency reasons, not one package per logical Module:

- **`packages/workspace`** contains the deep Workspace Module, its narrow Interface, and the in-process Planning, Reviewing, Harness Interaction, Editor Companion, Projection, State, Evidence, organization, portability, policy, and configuration implementations. Internal folders preserve ownership and locality; there is no revived generic core package.
- **`packages/local-runtime`** contains the deep process-lifecycle Module and private server/client IPC Adapters. Its client Interface establishes a session and returns the Workspace Interface; callers never assemble sockets, framing, reconnection, or version negotiation.
- **`apps/neoflow`** is one local executable source package with launcher/CLI, TUI, and internal writer-process entrypoints. Process roles do not require separate release packages.
- Separate **Pi and Claude Adapter packages** exist only where those hosts require independently loaded code. The native Neovim Adapter stays under `nvim/` and reaches the runtime through a stable launcher bridge. Shared native-protocol or transport grab bags are forbidden.

The later packaging ticket may choose how these source packages are bundled and installed, but it should not reopen their dependency direction: surfaces and native Adapters depend inward on the runtime client and Workspace Interface; the Workspace implementation never imports them.

### Probe verdict

The disposable runtime-topology probe preserved at `ab9e1ce:apps/runtime-topology-prototype/` on `evidence/validated-implementation-probes` ran real child processes and a scratch Unix socket. Its automated route passed clean startup, live competing-writer exclusion, crash detection, explicit reconnect to a replacement generation, fail-closed version mismatch, clean shutdown with endpoint removal, and a check that the returned Workspace projection contains no transport or process fields. The same semantic state version was observed before and after restart without selecting a persistence technology. The evidence report at `ba374d1:evidence/validated-implementation-probes/README.md` records the exact `pnpm prototype:runtime-topology -- --all` reproduction route.

The probe intentionally does not validate launch storms, persistence locks, command recovery, installation, or release upgrade. Those remain with the existing State, verification, and packaging tickets. No product language, new ticket, or fog changed.
