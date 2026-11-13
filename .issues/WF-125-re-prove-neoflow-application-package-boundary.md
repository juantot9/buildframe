---
id: WF-125
title: "Re-prove the Neoflow Application package boundary"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-124]
created: 2026-08-27
---

## Question

Does the completed Neoflow Application deepening turn still leave one private terminal Application over the Workspace Interface, with a narrow semantic root, an explicit developer launcher, and private rendering, input, configuration, filtering, and process mechanics?

## Acceptance evidence

- The Application manifest remains private strict ESM on the settled Node envelope, declares only the inward Workspace and Local Runtime packages plus OpenTUI, and exposes exactly two package paths and one developer dogfood bin.
- A production-source AST census finds exactly 12 TypeScript files and 41 module specifiers: 17 owner-relative, 12 `node:` built-in, six Workspace, two Local Runtime, and four OpenTUI uses. No Pi Adapter, legacy package, or other bare dependency appears.
- The dependency firewall passes over Application source and tests. A temporary Application-to-Pi-Adapter import makes it fail at that exact control file, then is removed.
- The source semantic root exposes exactly `createReviewingApplication`; the launcher exposes exactly `openDeveloperReviewing` and `openDeveloperWorkspaceRuntime`. Rendering, model, input, User Configuration, no-color, test-harness, executable, and runtime-process modules remain private package paths.
- A temporary root export of `createNoColorOutput` makes the source-island contract fail with that leaked value. Restoring `index.ts` returns the source root to its exact one-value surface.
- A clean build emits 12 JavaScript and 12 declaration files. Every manifest development, compiled, types, main, and bin target exists; both compiled package paths independently retain the exact 1 / 2 runtime value surfaces; private subpaths reject through package resolution; and the declaration graph resolves through only declared inward and OpenTUI dependencies.
- The compiled developer bin retains its shebang and successful help path, while the compiled dogfood risk probe retains runtime discovery, terminal ownership, and cleanup behavior through the supported launcher seam.
- A-01, A-04, S-05, S-07, A-05's Application half, and A-02 are linked and closed. Accepted A-03/S-04 and deferred A-06 remain unchanged, and the root-owned support-manifest work is not claimed here.
- Application tests, package typecheck/build, source-island and compiled smoke checks pass. Canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.
- The checkpoint introduces no production, test, manifest, lockfile, package-Interface, or verification-script change.

## Authority

- Parent package-order checkpoint: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Inward dependency direction and presentation-local state: [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
- Executable ownership and private source-package seams: [Shape packaging, setup, and release topology](./WF-050-shape-packaging-setup-release.md)
- Compiled-process and semantic verification: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)
- Dependency enforcement: [`scripts/check-v1-dependencies.mjs`](../scripts/check-v1-dependencies.mjs)

## Seam decision

This is an evidence checkpoint, not a new Module. It judges the existing package Interface, inward dependencies, process entrypoints, and live guards after all fixed Application obligations close. If a census or guard fails, stop and file the established mismatch against its owner rather than broadening this child into cleanup. If they stand, close with evidence only; do not add exports, wrappers, tests, package paths, or configuration to manufacture work.

## Constraints

- Do not change production source, tests, package manifests, the lockfile, or verification scripts merely for this checkpoint.
- Exercise source and compiled package surfaces independently; a development-condition import does not prove the built Application or bin.
- Negative controls must fail for the intended reason and be removed before canonical verification.
- Keep Pi independently host-loaded; do not create an Application-to-Pi dependency or expose private terminal/process mechanics.
- Do not reopen accepted A-03/S-04, deferred A-06, or root-owned support-manifest work.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The Neoflow Application remains a private strict-ESM source package on the declared `>=26.4.0 <26.6.0` Node envelope. Its three production dependencies are exactly the inward Workspace and Local Runtime packages plus OpenTUI. Its manifest exposes only the semantic root and developer launcher, with one `neoflow-v1-dogfood` bin; Pi remains independently host-loaded.

The production AST census finds 12 TypeScript files and exactly 41 module uses: 17 owner-relative, 12 across nine `node:` built-ins, six on the Workspace root / Base64 subpath, two on the Local Runtime launcher, and four on OpenTUI. No other bare import exists. The dependency firewall passes source and tests. Planting `@neoflow/pi-adapter-source` under the Application test tree makes it fail at that exact file as an outward v1 dependency; removing the control returns the guard to green. Root finding S-03's future third-party allowlist remains root-owned rather than being claimed by this census.

The source-island contract passes 1/1 with exactly `createReviewingApplication` at the root and `openDeveloperReviewing` / `openDeveloperWorkspaceRuntime` on `./launcher`. Temporarily exporting `createNoColorOutput` from the root makes that contract fail with exact received keys `['createReviewingApplication', 'createNoColorOutput']`; restoring `index.ts` returns it to green. Nine physical/private paths, including the no-color, model, view, configuration, process, and test-harness files plus a `dist` bypass, all reject through package resolution with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

A clean build emits 12 JavaScript and 12 declaration files, and every development, compiled, declaration, main, and bin target exists. Direct compiled-file imports and package self-references independently retain the exact 1 / 2 value surfaces. The root declaration closure reaches five owner files and only Workspace/OpenTUI; the launcher closure reaches four owner files and only Local Runtime, Workspace, and OpenTUI. Neither reaches rendering or process declarations. The compiled bin retains its shebang, exits zero on `--help`, writes the expected usage frame, and writes no stderr.

WF-098 and WF-120 through WF-124 close every fixed Application obligation: A-01, A-04, S-05, S-07, A-05's Application half, and A-02. Accepted A-03, S-04, and S-06 and deferred A-06 remain unchanged; support-manifest and dependency-policy work remains with the root turn.

On Node 26.5.1 with pnpm 11.20.0, all five Application files / 26 tests pass with package typecheck and build. Canonical `pnpm v1:verify` passes the dependency firewall, all 25 files / 145 tests, typecheck, builds, and smoke. All four compiled risk probes pass, including the full dogfood executable, and `git diff --check` is clean. This checkpoint changes no production source, test, manifest, lockfile, package Interface, or verification script. The unrelated root `package.json` bump remains excluded.
