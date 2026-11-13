---
id: WF-116
title: "Contain Pi extension event failures"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-115]
created: 2026-08-26
---

## Question

Can one private Pi event-registration wrapper make every extension callback settle without propagating a synchronous throw or rejected promise into the user's Pi process, while also handling the detached runtime-attachment loop at creation time?

## Acceptance evidence

- One private `piEvents` Module wraps Pi's exact overloaded `on` Interface. It awaits each registered handler, preserves successful return values such as session cancellation, and converts a synchronous throw or rejection to `undefined`.
- All ten production event registrations across `extension.ts` and `piNativeEvents.ts` route through that wrapper. No direct `pi.on` registration remains outside the wrapper implementation.
- The five async event handlers that cover failing Workspace reads, Pi host calls, Adapter calls, and shutdown cleanup therefore cannot propagate. The detached `attachLoop` promise receives its rejection handler in the same expression that creates it, rather than only during later session shutdown.
- The late shutdown `.catch` is removed; shutdown awaits the already-contained loop. Session replacement, cancellation returns, status updates, abort ordering, connection disposal, and reconnect policy remain otherwise unchanged.
- A TypeScript-AST census proves the single raw `pi.on` access is inside the wrapper, all ten registrations use the guarded Interface, the wrapper owns the event-handler `catch`, and the detached loop owns its immediate `catch`. The old source fails that census with ten raw registrations and only a late loop guard.
- Per P-01's settled ruling, no Pi host double or duplicate behavioral test is introduced: the repair is structural. Existing Pi Adapter contracts and source-island checks remain green, and the compiled Pi 0.80.6 live probe exercises the wrapped native lifecycle.
- No package export, capability, correlation rule, protocol version, evidence shape, runtime deadline, or supported Pi version changes.
- Pi Adapter typecheck/build, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled six-path structural repair: [`P-01`](../docs/audit/pre-p17-codebase-findings.md#p-01--three-unguarded-async-paths-can-crash-the-users-pi-session)
- Corrected count, fault sources, and no-host-double decision: [Disposition the Local Runtime and Pi Adapter findings](./WF-066-disposition-local-runtime-and-pi-adapter-findings.md)
- Reviewed native compatibility lane: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)

## Seam decision

The error-containment seam belongs immediately around Pi event registration, before host scheduling semantics can matter. A private Module returns Pi's existing overloaded `on` Interface rather than inventing event types or widening the package Interface. Both registration owners consume it, while the unrelated detached attachment task remains explicitly contained at its creation site. No Adapter semantic method gains defensive catches that would blur its existing evidence rules.

## Constraints

- Preserve the pinned Pi 0.80.6 event types and successful handler return values, especially `{ cancel: true }` from session replacement guards.
- Catch only at the host-callback seam and detached-loop creation; do not scatter new per-handler guards.
- Keep `bindPiReviewedAdapterEvents` usable by the compiled live probe without exporting the wrapper from the package root.
- Do not add a Pi host double or reinterpret the structural ruling as a test-coverage project.
- Do not combine this child with X-03's `markerMatches` field comparison.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The new private `piEvents` Module returns Pi 0.80.6's exact overloaded `on`
Interface while hiding the untyped overload bridge. Its registered callback
awaits the original handler inside `try` / `catch`: successful values, including
session cancellation, pass back to Pi, while synchronous throws and rejected
promises settle as `undefined` rather than escaping the extension callback.

Both registration owners now construct that guarded Interface. All ten production
events—session start/shutdown, input, three native agent events, tool call, and
three session replacement guards—use `events.on`; the only raw `pi.on` access is
inside `piEvents`. The detached `attachLoop` now attaches `.catch` in the same
assignment that creates it, and shutdown awaits that already-contained promise
without adding the old late handler. Reconnect delays, abort/dispose order, status
messages, event payloads, and successful cancellation values are otherwise
unchanged.

The structural AST census distinguishes the repair directly. Before it, the two
files contained ten raw registrations, zero guarded registrations, and one late
shutdown catch. After it, there is one raw host access in the wrapper, ten guarded
registrations with the exact expected event names, two wrapper constructions, one
wrapper catch clause, and one immediate detached-task catch. Per P-01's settled
ruling, no Pi host double or duplicate behavioral test was added.

The existing Pi Adapter contracts and source-island check pass 6/6, typecheck and
build pass, the compiled package root still exposes only its default extension,
and the pinned Pi 0.80.6 live probe passes through the wrapped native lifecycle.
On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the dependency firewall,
all 22 files / 137 tests, typecheck, builds, and smoke. All four compiled risk
probes pass, and `git diff --check` is clean. No package export, reviewed
capability, correlation rule, protocol/evidence shape, deadline, or supported Pi
version changed. The unrelated root `package.json` bump remains excluded. X-03's
Pi Adapter comparison remains separate.
