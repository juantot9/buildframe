---
id: WF-171
title: "Contain Pi no-start timeout failures"
status: closed
labels:
  - wayfinder:task
parent: WF-140
assignee: juanan
blocked_by: [WF-170]
created: 2026-09-01
---

## Question

Can the Pi Adapter make its scheduled no-start callback non-rejecting while retaining conservative invocation truth and exact tool restoration?

## Acceptance evidence

- The no-start scheduler installs a rejection owner when the callback is created; a native host failure cannot become `unhandledRejection` or escape into Pi.
- A contract captures the timer, injects a throwing native host during expiration, and proves one conservative existing semantic outcome, exact prior-tool restoration, no active invocation/live timer, and no replay; current source fails with an observed unhandled rejection.
- Ordinary idle no-start rejection, busy correlation loss, start-vs-timeout races, terminal settlement, interruption, disconnect, evidence retry/queue behavior, and disposal remain exactly-once.
- No evidence kind, Capability Manifest, timeout/retry count, native event binding, package Interface, or Pi `0.80.6` contract changes.
- Focused Pi Adapter evidence, canonical verification, all four compiled probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- [Active v1 anti-pattern audit, AV-04](../docs/audit/active-v1-antipatterns-2026-09-01.md#av-04--pis-scheduled-no-start-callback-escapes-callback-containment)
- [Contain Pi extension event failures](./WF-116-contain-pi-extension-event-failures.md)
- [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)

## Seam decision

The scheduler callback is a second host-bound callback creation site beside `guardPiEvents`. Contain it locally at creation and reuse existing conservative Adapter semantics; add no generic scheduler, event bus, or outward error Interface.

## Constraints

- Preserve the advertised no-start timeout, three evidence attempts, 128 pending bound, correlation fields, exact tools, and no-replay rule.
- Never fabricate start, normal settlement, Response, or interruption proof after host failure.
- Preserve the unrelated root `package.json` bump.

## Resolution comment

Yes. The no-start scheduler now attaches a terminal rejection handler when it
creates the async callback, matching WF-116's creation-time containment rule.
`#noStartTimeout` separately treats a throwing `isIdle()` as unknowable host
state: it attempts native abort without claiming interruption, emits the existing
stable `harness.invocation.correlation-lost` evidence, clears the exact timer,
retires the active invocation, and restores the captured tool set in `finally`.
Any still-unexpected callback rejection is observed and contained rather than
escaping into Pi. Ordinary proven-idle rejection and proven-busy correlation
loss retain their prior paths.

The focused Adapter contract arms a real scripted no-start callback, injects an
`isIdle()` failure only after dispatch, and observes zero
`unhandledRejection`s, one correlation-loss fact, one best-effort abort, exact
prior tools, a cleared scheduler, and no owned invocation. Restoring the old
callback yields the injected error as an actual `unhandledRejection`, so the
regression fails before any of those owner outcomes can be asserted.

On Node 26.5.1 with pnpm 11.20.0, both Pi Adapter files / eight tests pass.
Canonical `v1:verify` passes 27 files / 157 tests, typecheck, builds, and smoke;
all four compiled State, Local Runtime, reviewed Pi 0.80.6, and dogfood probes
pass, and `git diff --check` is clean. Evidence kinds/identities, the advertised
no-start timeout, three evidence attempts, pending bound, tools, package
Interface, no-replay semantics, user data, and the unrelated `package.json` bump
remain unchanged.
