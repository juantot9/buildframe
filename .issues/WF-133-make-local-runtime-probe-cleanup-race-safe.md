---
id: WF-133
title: "Make Local Runtime probe cleanup race-safe"
status: closed
labels:
  - wayfinder:bug
parent: WF-093
assignee: juanan
blocked_by: [WF-134]
created: 2026-08-27
---

## Problem

WF-132's final compiled Local Runtime risk run passed every lifecycle assertion, then failed while recursively deleting its private fixture root:

```text
Error: ENOTEMPTY: directory not empty, rmdir '.../neoflow-local-runtime-p08-.../state/neoflow'
```

The launch-storm children are deliberately detached once a semantic connection converges. The probe waits until the winning runtime removes its endpoint, but a losing detached starter can still be unwinding its Workspace owner while the parent removes the common fixture root. Node's recursive `rm` performs no transient-error retries by default, so cleanup races a process whose lifecycle result has already been established. An immediate rerun passed, confirming a cleanup race rather than a failed runtime assertion, but a risk gate must not be flaky.

## Acceptance evidence

- Preserve every compiled lifecycle assertion, child-process ownership rule, timeout, diagnostic, and production byte/Interface unchanged.
- Fixture cleanup uses Node's recursive-removal retry contract only for transient removal errors, with an explicit finite retry count and delay; a persistent cleanup failure still rejects the probe.
- The old implementation is evidenced by WF-132's real `ENOTEMPTY` failure after all semantic work. After the repair, the compiled Local Runtime risk probe passes repeatedly from clean builds.
- Canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.
- Only the owning root probe and issue records change. No product source, test suite, package manifest, lockfile, package Interface, legacy code, or user data changes.

## Authority

- Discovering checkpoint: [Close active Module deepening](./WF-132-close-active-module-deepening.md)
- Owning root probe: [`scripts/probe-local-runtime-v1.mjs`](../scripts/probe-local-runtime-v1.mjs)
- Verification bar: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)

## Seam decision

Keep the repair at fixture teardown. Do not add sleeps or process-state policy to Local Runtime, retain detached child handles in the product launcher, weaken the launch-storm case, or swallow cleanup errors. Node already owns bounded retries for the exact transient filesystem errors produced by recursive removal; configure that contract explicitly and let exhaustion remain fatal.

## Constraints

- Preserve Local Runtime polling, idle grace, startup bounds, and shutdown ordering.
- Do not add a reusable cleanup abstraction for one probe call.
- Do not claim a product lifecycle defect from a teardown-only race.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

The root Local Runtime probe now asks Node's recursive `rm` to retry transient teardown errors at most ten times with a 50 ms base delay. This keeps cleanup at its owning call, handles the observed detached-child `ENOTEMPTY` window, and still rejects after the finite built-in retry contract is exhausted; no lifecycle assertion or error is swallowed.

The old zero-retry call produced the real WF-132 `ENOTEMPTY` failure. After the repair and WF-134's separately owned convergence correction, five consecutive risk invocations passed from clean compiled builds. Canonical verification passes 26 files / 147 tests, all four compiled risk probes pass, and `git diff --check` passes on Node 26.5.1 with pnpm 11.20.0. Only this root probe and issue records changed.
