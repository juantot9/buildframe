---
id: WF-119
title: "Re-prove the Pi Adapter package boundary"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-118]
created: 2026-08-26
---

## Question

Does the completed Pi Adapter deepening turn still leave one private, independently host-loaded native Adapter package whose default-only package Interface hides reviewed semantics, correlation, event containment, and runtime attachment mechanics behind the Workspace-owned Harness Interaction seam?

## Acceptance evidence

- The manifest remains private strict ESM on the settled Node envelope, declares only the inward Workspace and Local Runtime dependencies plus Pi's host peer/development dependency, and has exactly one package export and one matching Pi extension target: the default host-loaded extension.
- A production-source AST census finds exactly six TypeScript files and 18 module specifiers: seven owner-relative, one `node:` built-in, six on only the declared Workspace root/Harness Interaction/SHA-256 and Local Runtime Harness Adapter subpaths, and four on Pi's SDK. There is no other bare dependency.
- The dependency firewall finds no legacy or outward package/path import in Pi Adapter source or tests. A temporary Pi-Adapter-to-Application import makes it fail at that exact control file, then is removed.
- The source package root exposes exactly `default`. Capability Manifest values, `PiReviewedAdapter`, correlation Entry details, the event guard, native-event binding, runtime attachment, and Pi SDK/native types remain private implementation rather than package exports. A package-resolution probe rejects a private semantic subpath.
- A temporary root export of `PiReviewedAdapter` makes the source-island contract fail with that leaked value. Restoring `index.ts` returns it to the exact default-only surface.
- A clean build emits six JavaScript and six declaration files. Every manifest `import`, `types`, and Pi extension target exists; the compiled package root independently exposes only `default`; its declaration closure reaches only `index.d.ts` and Pi's `ExtensionAPI`, exposing no Workspace, Local Runtime, capability, marker, reviewed Adapter, event, or attachment type.
- Direct file imports used only by the compiled dogfood and Pi compatibility risk probes remain verification internals; they do not become package subpaths or production dependency edges.
- P-01, the Pi half of X-03, and W-13's shared-digest/Pi inheritance are closed by WF-116 through WF-118. No Neoflow Application repair is claimed by this checkpoint.
- Pi Adapter contracts and source-island checks pass 7/7, package typecheck/build pass, build smoke retains the default-only root, and the pinned Pi 0.80.6 live probe retains exact reviewed lifecycle behavior.
- Canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1; the checkpoint introduces no production, test, manifest, lockfile, package-Interface, or verification-script change.

## Authority

- Parent package-order checkpoint: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Native correlation locality and reviewed Adapter seam: [Validate the Harness Interaction Module implementation seam](./WF-044-validate-harness-module-implementation-seam.md)
- Independently host-loaded Pi source package: [Shape packaging, setup, and release topology](./WF-050-shape-packaging-setup-release.md)
- Adapter contracts and live compatibility lane: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)
- Dependency enforcement: [`scripts/check-v1-dependencies.mjs`](../scripts/check-v1-dependencies.mjs)

## Seam decision

This is an evidence checkpoint, not a new Module. It judges the existing package Interface, inward dependencies, and live guards after all Pi Adapter obligations close. If a census or guard fails, stop and file the established mismatch against its owner instead of broadening this child into cleanup. If they stand, close with evidence only; do not add exports, wrappers, tests, package paths, or configuration to manufacture work.

## Constraints

- Do not change production source, tests, package manifests, the lockfile, or verification scripts merely for this checkpoint.
- Exercise source and compiled package surfaces independently; development-condition evidence does not prove the built host extension.
- Negative controls must fail for the intended reason and be removed before canonical verification.
- Keep exact Pi 0.80.6 support evidence separate from the wildcard host peer needed for host ownership; neither one widens the reviewed range.
- Do not mistake risk-probe direct-file access for a supported package Interface or expose those files to make the probes more convenient.
- Do not begin or claim Neoflow Application work in this Pi Adapter checkpoint.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The Pi Adapter remains a private strict-ESM source package on
`>=26.4.0 <26.6.0`. Its only package dependencies point inward to Workspace and
Local Runtime. Pi remains a host-owned wildcard peer while the development
fixture, package support metadata, static Capability Manifest, contracts, and live
probe all keep the reviewed host exact at 0.80.6. The manifest has one export,
ships only `dist`, and points both that compiled root and Pi's sole extension entry
to `dist/index.js`.

The production AST census finds six TypeScript files and exactly 18 module
specifiers: seven owner-relative, one `node:crypto`, six on the declared Workspace
root/Harness Interaction/SHA-256 and Local Runtime Harness Adapter subpaths, and
four on Pi's SDK. No other bare import exists. The dependency firewall passes
source and tests. Planting `@neoflow/app-source` under the Pi test tree makes it
fail at that exact control file as an outward v1 dependency; removing the control
returns the guard to green.

The source-island contract passes 1/1 and the six Adapter contracts pass 6/6
(combined 7/7).
The package root has exactly one runtime value, `default`. Nine values remain
inside physical implementation modules: three Capability facts, the extension
factory, three reviewed Adapter/correlation values, the guarded event registrar,
and the native-event binder. Temporarily exporting `PiReviewedAdapter` from the
root makes the source contract fail 1/1 with exact keys
`['PiReviewedAdapter', 'default']`; restoring `index.ts` returns the root to
`['default']`. Package resolution also rejects all five private implementation
subpaths with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

A clean build emits six JavaScript and six declaration files. Every development
and compiled import/types target plus the Pi extension target exists. The compiled
root independently imports with only `default`; its declaration has no relative
edge and reaches only
Pi's `ExtensionAPI`, exposing no Workspace, Local Runtime, Capability, marker,
reviewed Adapter, event, or attachment type. The Pi and dogfood risk probes retain
their deliberate direct-file access for compiled internal verification without
turning those files into package paths or production dependencies.

WF-116 through WF-118 close P-01, the Pi half of X-03, and W-13's shared-digest /
Pi inheritance. On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the
dependency firewall, all 23 files / 140 tests, typecheck, builds, and smoke. All
four compiled risk probes pass, including the pinned Pi 0.80.6 lifecycle and full
dogfood path, and `git diff --check` is clean. This checkpoint changes no
production source, test, manifest, lockfile, package Interface, or verification
script. The unrelated root `package.json` bump remains excluded. Neoflow
Application work remains with the next package turn.
