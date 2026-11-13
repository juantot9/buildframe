---
id: WF-134
title: "Converge through self-launched endpoint hardening"
status: closed
labels:
  - wayfinder:bug
parent: WF-093
assignee: juanan
blocked_by: [WF-131]
created: 2026-08-27
---

## Problem

WF-133's repeated launch-storm probe exposed a second, semantic race before fixture teardown. Seven callers converged on one runtime generation while one returned:

```json
{"status":"rejected","diagnostic":{"code":"runtime-unavailable","reason":"insecure-runtime"}}
```

The winning server's Unix socket exists briefly between `listen` and owner/mode verification. Direct clients correctly fail closed while the endpoint is not yet `0600`. During `ensureWorkspaceRuntime`, however, each caller has already observed no usable runtime and launched a bounded convergence attempt. Treating that one hardening window as a terminal result lets a launch-storm participant fail even though the same generation becomes secure and ready within the existing startup deadline.

## Acceptance evidence

- A deterministic lifecycle regression proves an `ensureWorkspaceRuntime` attempt that first observes `not-running`, launches its private runtime process, then observes `insecure-runtime` continues to the same secure connected generation. The old branch returns the insecure rejection.
- An endpoint that is already insecure on the initial discovery remains an immediate fail-closed rejection and does not launch a child.
- Only the post-launch convergence loop treats `insecure-runtime` as transient. Protocol, Workspace Interface, identity, role, invalid-frame, and other diagnostics retain their exact terminal behavior.
- Preserve the existing startup deadline, 20 ms convergence poll, cancellation, child detachment, diagnostics, wire shapes, roles, and package Interfaces.
- The compiled Local Runtime launch-storm probe passes repeatedly. Canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.
- Change only owner-local Local Runtime lifecycle source/test evidence and issue records. Do not change manifests, lockfiles, durable bytes, legacy code, or user data.

## Authority

- Discovering cleanup child: [Make Local Runtime probe cleanup race-safe](./WF-133-make-local-runtime-probe-cleanup-race-safe.md)
- Owning lifecycle Module: [`packages/local-runtime/src/lifecycle.ts`](../packages/local-runtime/src/lifecycle.ts)
- Compiled risk gate: [`scripts/probe-local-runtime-v1.mjs`](../scripts/probe-local-runtime-v1.mjs)
- Local Runtime topology: [Choose the Local Runtime topology](./WF-042-choose-local-runtime-topology.md)

## Seam decision

Keep direct endpoint validation fail-closed. Add the narrower distinction inside `ensureWorkspaceRuntime`: only after that call has decided to launch and entered its bounded convergence loop may a private endpoint's not-yet-hardened state be retried. This is readiness convergence, not a relaxation of endpoint security and not a new public state.

## Constraints

- Do not weaken `validatePrivateRuntimeEndpoint`, accept a non-`0600` socket, add a sleep, change server bind/shutdown order, or mutate process-wide `umask`.
- Do not retry `insecure-runtime` before launching or outside the existing startup bound.
- Keep regression helpers Local Runtime test-owned; do not export a test seam.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

`ensureWorkspaceRuntime` now distinguishes initial discovery from post-launch convergence. An initially insecure endpoint still returns immediately without spawning; after the call has observed no usable runtime and launched, only `insecure-runtime` joins the existing `not-running`/`connection-failed` retry set under the unchanged deadline, 20 ms poll, and cancellation path.

The focused two-case Interface regression passes, while restoring the old loop predicate fails only the hardening-window case with the exact insecure rejection. Ten consecutive compiled launch storms converged without `insecure-runtime`. Canonical verification passes 26 files / 147 tests, and all four compiled risk probes pass on Node 26.5.1 with pnpm 11.20.0. No wire shape, diagnostic, timeout, direct endpoint validation, package Interface, manifest, or durable byte changed.
