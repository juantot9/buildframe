---
id: WF-186
title: "Serialize wall-clock v1 scenario files"
status: closed
labels:
  - wayfinder:task
parent: WF-185
assignee: juanan
blocked_by: []
created: 2026-09-02
---

## Outcome

The canonical v1 Vitest lane runs test files serially, so its explicit
wall-clock interaction, polling, process-timeout, and p95 assertions measure the
owning behavior rather than contention from dozens of concurrent Git, SQLite,
worker-process, and OpenTUI fixtures. Test logic, product timeouts, latency
budgets, and production code remain unchanged.

## Evidence

During the P18 cutover gate, unchanged active tests repeatedly failed in
unrelated combinations only in the default file-parallel full lane: the
500-millisecond exact-click assertion ranged above its bound, projection update
polls exhausted, and otherwise healthy Application scenarios hit their outer
timeouts while concurrent scenario files took two to four times their isolated
duration. Every named failure passed immediately in isolation. The host was
simultaneously under sustained non-Neoflow CPU and indexing load, making the
unbounded cross-file scheduling assumption observable rather than hypothetical.

A direct four-worker probe reduced some contention but still allowed heavy
Workspace files to starve later Application timers. This is verification
architecture, not a reason to widen product budgets or timeouts.

## Interface decision

Set `fileParallelism: false` in the one canonical `vitest.v1.config.ts`. Vitest
continues to isolate each file and run each file's tests in their existing order;
it simply admits one scenario file at a time. Keep `passWithNoTests: false`, the
same include set, Node environment, 20-second default timeout, all explicit
per-test timeouts, and OpenTUI FFI invocation unchanged.

Do not add a scheduler helper, retry failed tests, classify timing failures as
passes, weaken assertions, alter production polling, or create separate fast and
truth lanes. Root `v1:test:fast`, `v1:test:full`, and generic `verify` continue to
use the same config and therefore one deterministic policy.

## Acceptance

- [x] The exact previously failing projection and Application scenarios pass
      unchanged in isolated focused runs.
- [x] A negative control with file parallelism restored reproduces at least one
      demonstrated contention failure under the same loaded host; the committed
      serial lane passes all 32 files / 221 tests without retrying a failed file.
- [x] No test timeout, wait bound, latency threshold, production source, package
      Interface, protocol, State format, fixture meaning, or include set changes.
- [x] Canonical test/type/build/smoke and `git diff --check` pass on Node 26.5.1 /
      pnpm 11.20.0 before P18 resumes.

## Non-goals

- Do not optimize product behavior, loosen the under-100/500/two-second budgets,
  increase test timeouts, or make loaded-host performance claims.
- Do not introduce test sharding, CI topology, platform matrices, retries,
  telemetry, or benchmark infrastructure.
- Keep every in-progress P18 deletion/root/lock/documentation change unstaged and
  outside this focused repair commit, along with the unrelated package-manager
  bump.

## Resolution

Closed on 2026-09-02. The canonical Vitest configuration now admits one test
file at a time with `fileParallelism: false`; file isolation, test order within
each file, include paths, the 20-second default timeout, all explicit scenario
timeouts, and every product wait/latency bound remain unchanged.

On the loaded host, the unchanged projection and Application failures passed in
focused runs, while restoring default file parallelism reproduced unrelated
wall-clock failures across concurrent Git, SQLite, worker-process, and OpenTUI
fixtures. One fresh serial full invocation then passed all 32 files / 221 tests
without retry logic or failed-file reruns. The dependency firewall, package and
test typechecks, all four active package builds, compiled smoke, and
`git diff --check` also passed on Node 26.5.1 / pnpm 11.20.0.

Only `vitest.v1.config.ts` changed for the repair. No production source,
assertion, timeout, protocol, package Interface, State format, fixture meaning,
or test include changed; the P18 cutover work and unrelated root package-manager
bump remained outside this focused commit.
