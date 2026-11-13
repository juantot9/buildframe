---
id: WF-115
title: "Re-prove the Local Runtime package boundary"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-114]
created: 2026-08-26
---

## Question

Does the completed Local Runtime deepening turn still leave one inward-dependent, private process-lifecycle package whose semantic client, launcher control, and reviewed Harness Adapter seams hide framing and transport mechanics?

## Acceptance evidence

- The Local Runtime manifest remains private strict ESM, supports the settled Node envelope, declares only `@neoflow/workspace`, and has exactly three explicit export paths: semantic client root, launcher-only lifecycle, and reviewed Harness Adapter integration.
- A production-source AST census finds exactly ten TypeScript files whose bare imports are only `node:` built-ins and the declared Workspace root/runtime/Harness Interaction subpaths. The dependency firewall finds no legacy or outward package/path import from Local Runtime source or tests.
- Source Interface contracts expose exactly three root runtime values, four launcher runtime values, and two Harness Adapter runtime values. Transport framing, socket, endpoint, State, persistence, and generic Adapter mechanics remain private to implementation.
- After a clean build, every manifest `import` and `types` target exists, all three compiled paths import successfully with the same exact runtime value surfaces, and their externally reachable declarations expose no `node:net`, `Socket`, `FramedSocket`, or protocol-frame type.
- Temporary negative controls prove both guards are live: a planted Local-Runtime-to-Pi-Adapter import makes the dependency firewall fail at that exact file, and a planted `FramedSocket` root export makes the Local Runtime source-island contract fail with the leaked value. Both controls are removed before final verification.
- Local Runtime typecheck and build pass, the source-island contract passes 3/3, and build smoke plus the compiled Local Runtime lifecycle probe retain semantic startup, reconnect, exclusion, and failure behavior.
- L-03's prior seam repair and every Local Runtime child from WF-110 through WF-114 are closed. No Pi Adapter work is claimed by this checkpoint.
- Canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1; the checkpoint introduces no production, test, manifest, lockfile, package-Interface, or verification-script change.

## Authority

- Parent package-order checkpoint: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Chosen process/package topology and private transport: [Choose the local runtime and Workspace Writer topology](./WF-042-choose-local-runtime-topology.md)
- Inward dependency direction and semantic Workspace Interface: [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
- Built-process and semantic-client verification: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)
- Dependency enforcement: [`scripts/check-v1-dependencies.mjs`](../scripts/check-v1-dependencies.mjs)

## Seam decision

This is an evidence checkpoint, not a new Module. It judges the existing package seams and their live guards after all Local Runtime repairs. If a guard or census fails, stop and file the established mismatch against its owner rather than broadening this child into cleanup. If they stand, close with evidence only; do not add exports, wrappers, tests, or configuration to manufacture work.

## Constraints

- Do not change production source, tests, package manifests, the lockfile, or verification scripts merely for this checkpoint.
- Exercise source and compiled surfaces independently; development-condition imports do not prove the built package.
- Negative controls must fail for the intended reason and be removed before canonical verification.
- Preserve the legitimate compatibility version and launcher lifecycle facts while excluding private framing and transport mechanics.
- Do not begin or claim Pi Adapter repairs in this Local Runtime checkpoint.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. Local Runtime remains a private strict-ESM package on the declared
`>=26.4.0 <26.6.0` Node envelope. Its sole package dependency is the inward
`@neoflow/workspace` edge, and its manifest still exposes exactly three paths:
the semantic client root, launcher-only lifecycle, and reviewed Harness Adapter
integration.

An AST census of all ten production TypeScript files finds 22 relative module
uses, 15 `node:` uses across eight built-in specifiers, and 12 uses of only the
declared Workspace root, runtime, and Harness Interaction subpaths. There are no
other bare dependencies. The dependency firewall passes source and tests. A
temporary `@neoflow/pi-adapter-source` import under the Local Runtime test tree
makes that guard fail at the exact control file as an outward v1 dependency; the
control was removed and the guard passes again.

The source-island contract passes 3/3 and retains exact runtime value surfaces:
three values at the root (`LOCAL_RUNTIME_PROTOCOL_VERSION`,
`LocalRuntimeSessionError`, `connectWorkspaceRuntime`), four on `./launcher`, and
two on `./harness-adapter`. A temporary root export of `FramedSocket` makes the
root contract fail 1/1 with that leaked name; restoring the root returns it to
3/3. No source guard needed widening.

A clean build emits ten JavaScript and ten declaration files. Every manifest
`import` and `types` target exists; direct compiled imports and package-resolution
imports from the Neoflow Application report the same exact 3 / 4 / 2 value
surfaces. Declaration-closure inspection reaches only `client` and `contracts`
from the root, `lifecycle`, `server`, and `contracts` from the launcher, and
`harnessAdapter` plus `contracts` from the integration path. None reaches private
`framing`, `protocol`, or `runtimeLocation` declarations, or exposes `node:net`,
`Socket`, `FramedSocket`, or a protocol-frame type.

L-03 remains closed by WF-081, and WF-110 through WF-114 close L-04, X-04,
L-01, L-02, and X-06's Local Runtime work. Pi Adapter work remains with the next
package turn rather than being claimed here.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the dependency
firewall, all 22 files / 137 tests, typecheck, builds, and smoke. All four compiled
risk probes pass, including the Local Runtime lifecycle probe, and
`git diff --check` is clean. This checkpoint changes no production source, test,
manifest, lockfile, package Interface, or verification script. The unrelated root
`package.json` bump remains excluded.
