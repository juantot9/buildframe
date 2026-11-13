---
id: WF-237
title: "Never reuse a runtime process from a different build"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-15
---

## Outcome

Restarting Neoflow after a rebuild always evaluates the current build. A runtime process left behind by an earlier session is either reused only when its code identity matches the client's, or retired and replaced before the first read.

## Finding

While retesting WF-235, the owner's new Neoflow executable connected to a runtime process started hours earlier (`runtimeProcess.js`, orphaned with PPID 1) because the owner's Pi session had stayed attached to it. The runtime keeps every connection alive for the idle grace, and an attached Harness Adapter reconnects forever, so the old process never became idle. The new UI therefore asked the old Workspace code for the default inspection, the stale candidate filter returned `attachment-selection-required`, and the new notice reported the old behavior. Manual verification was checking the previous build without any indication.

## Interface

The local-runtime discovery handshake gains a code identity for the runtime process (the v1 version marker already centralizes one candidate) and the client retires a discovered runtime whose identity differs before connecting. Identity mismatch must never be silently tolerated.

## Acceptance

- [x] A client refuses to use a runtime process whose code identity differs from its own.
- [x] A mismatched runtime is retired and replaced exactly once, without losing durable State or replaying an invocation.
- [x] The local-runtime lifetime and framing risk probes cover the replacement path.
- [x] Full verification and `git diff --check` pass with unrelated work untouched.

## Resolution

The discovery handshake carries one build identity, and a mismatched runtime retires itself before the client's first Workspace call. The identity is `rtc_<sha256>`: a digest over the exact entrypoint file and the loaded Local Runtime code file (resolved real path, device/inode/mode/size/mtime/ctime incarnation, and bytes), so a clean rebuild reidentifies the build even when a thin entrypoint emits byte-identical JavaScript. The launcher computes it in `ensureWorkspaceRuntime` and again inside `runWorkspaceRuntimeProcess`; a failure is a bounded `runtime-start-rejected` reason rather than a silent fallback.

Discovery remains the launcher-only path: `discoverWorkspaceRuntime` adds the identity plus `runtimeCodeMismatch: 'retire'` to the existing bootstrap frame. The server rejects a mismatch with `runtime-code-mismatch`, flushes the rejection frame, then asks the runtime owner to retire; ordinary `connectWorkspaceRuntime` and the reserved Harness Adapter role never send the fields. Retirement ends the idle wait, drains every connection, releases the Workspace writer lease, and only then removes the owned endpoint, so the client's retry observes `not-running` and converges (through the writer lease) on exactly one replacement with a new Runtime Generation. A runtime built before the handshake answers the extra fields with `invalid-bootstrap`, which the launcher reports as `invalid-runtime-bootstrap`: old code is refused, never silently reused.

## Completion evidence (2026-09-16)

- New `packages/local-runtime/src/runtimeCodeIdentity.ts` (stable re-readable file witness with incarnation revalidation) and identity validation/plumbing across `contracts.ts`, `protocol.ts`, `client.ts`, `server.ts`, `lifecycle.ts`, `index.ts`, `launcher.ts`, and `apps/neoflow/src/runtimeProcess.ts`.
- Contract tests: a mismatched bootstrap is rejected with `runtime-code-mismatch`, the rejection frame arrives before close, and the runtime asks for replacement (`waitForLocalRuntimeServerIdle` → `replacement-requested`); parser pairs, identity digest stability/reidentification, and lifecycle convergence on a single replacement are covered in fast tests.
- The compiled lifetime risk probe (`pnpm v1:risk:runtime`) now starts a runtime from a stale entrypoint, lets it hold durable state and an open CLI client, then runs four parallel current-build launchers: all connect to one new generation, the stale process exits 0 on its own, the stale client is disconnected, the committed Review survives with its exact state version and current-review pointer, and re-executing the same command identity recalls the original result instead of replaying it.
- Verification on Node 26.5.1: canonical `pnpm v1:verify` passes 43 files / 373 tests, lint, format, dependency firewall, typecheck, clean builds, and build smoke; all four compiled risk probes (State, Local Runtime, Pi, dogfood) and `git diff --check` pass.
- The Pi Adapter live probe now pins `authority: 'discussion-only'` for itself, restoring its enforced read-only assertion under the WF-239 write default; no WF-239 source changed.
- Unrelated repository-health backlog (WF-205–WF-215) and the audit document remain untracked and untouched.
