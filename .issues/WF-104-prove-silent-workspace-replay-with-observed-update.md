---
id: WF-104
title: "Prove silent Workspace replay with an observed update"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: []
created: 2026-08-13
---

## Question

Can the Workspace prove that replaying an already-accepted command publishes no duplicate subscription envelope without treating 30 milliseconds of silence as evidence?

## Acceptance evidence

- The existing `workspace.home` Interface scenario replays its first accepted Review command and still receives that exact durable result.
- After replay, the scenario executes a third state-changing Review command, waits through the existing predicate helper until the same subscription observes State version 3, then asserts the complete ordered version sequence is exactly `[0, 1, 2, 3]`.
- The observed version-3 update is the positive round-trip barrier for all earlier work on that subscription; an extra envelope caused by replay fails the whole-sequence assertion regardless of machine timing.
- The fixed 30 ms sleep at the settled X-04 Workspace site is deleted. No production source, Workspace Interface, test seam, polling margin, or shared test helper changes.
- Focused mutation evidence demonstrates that the positive barrier catches a replay-caused duplicate that can arrive outside the former fixed sleep.
- The complete Workspace Projection scenarios, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent route and package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled three-part repair, scoped here to site 1: [`X-04`](../docs/audit/pre-p17-codebase-findings.md#x-04--retired-stream-guarantees-are-asserted-after-a-fixed-sleep-or-not-at-all)
- Workspace test-source disposition: [Disposition the Workspace test-source findings](./WF-074-disposition-workspace-test-source-findings.md)

## Constraints

- Assertions and synchronization must cross only `Workspace.execute`, `Workspace.read`, and `Workspace.subscribe`; do not expose Projection scheduling internals.
- Preserve durable recall-before-version-check behavior and exact no-replay semantics.
- Leave X-04's two Local Runtime repairs for the Local Runtime package turn.
- Do not broaden this child into the separate 100 ms Live Changes assertion or X-06 wait-helper diagnostics.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The existing `workspace.home` scenario still replays the first Review start
and requires its exact durable result, but elapsed silence is no longer evidence.
It now executes a third uniquely identified Review start at expected State version
2, observes the accepted version 3, and waits until the same subscription delivers
that version. Only then does it require the complete envelope sequence to be
exactly `[0, 1, 2, 3]`, with version 3 naming the third Review as Current. The
positive update is the causal barrier for the replay refresh on that subscription.

Focused mutation evidence distinguishes the repair from the old test. A temporary
Projection mutant scheduled a replay-caused duplicate 40 ms later, outside the
former 30 ms sleep. The old scenario passed 1/1 and unsubscribed before the defect
arrived. The repaired scenario remained subscribed while driving its version-3
round trip and failed 1/1 with `[0, 1, 2, 2, 3]`. Restoring production source
leaves the complete Workspace Projection file passing 7/7.

Only the owning Interface scenario changed. No production source, Interface,
internal seam, helper, deadline, or polling margin changed. The unrelated 100 ms
Live Changes assertion and X-04's two Local Runtime sites remain with their
settled owners.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the dependency
firewall, all 19 files / 130 tests, typecheck, builds, and smoke. All four
compiled risk probes pass, and `git diff --check` is clean. The unrelated root
`package.json` bump remains excluded.
