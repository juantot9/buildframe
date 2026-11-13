---
id: WF-109
title: "Re-prove the Workspace package boundary"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-108]
created: 2026-08-26
---

## Question

Does the completed Workspace deepening turn still leave one inward-pointing, private source package with its intended small external seams, closed semantic root, and full compiled evidence intact?

## Acceptance evidence

- The Workspace manifest remains private strict ESM with zero declared package dependencies and exactly four explicit export paths: the semantic root, runtime owner, canonical `bytesBase64` representation, and type-only Harness Interaction seam.
- A production-source AST census finds no bare dependency other than `node:` built-ins. The v1 dependency firewall finds no legacy or outward package/path import from Workspace source or tests.
- The source and compiled semantic roots expose exactly `WORKSPACE_INTERFACE_VERSION` and `bootstrapWorkspace`; the runtime subpath exposes only `openWorkspaceRuntimeOwner`; Harness Interaction has no runtime values; and `bytes-base64` exposes only its encoder/decoder pair.
- Temporary negative controls prove the guards are live: one planted Workspace-to-Local-Runtime import makes the dependency firewall fail at that exact file, and one planted root value export makes the Workspace source-island contract fail. Both controls are removed before final verification.
- Workspace typecheck and build pass, every declared compiled export path imports successfully, and build smoke preserves the same runtime surfaces.
- Every Workspace-ranked repair is linked and closed. The still-package-owned portions of X-03, W-06, X-04, and X-06 remain explicitly assigned to Pi Adapter, Application, or Local Runtime rather than being hidden by this checkpoint.
- Canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1; the checkpoint introduces no production, test, manifest, lockfile, or package-Interface change.

## Authority

- Parent package-order checkpoint: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Target inward dependency direction and closed Workspace Interface: [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
- Owner-local verification lanes and compiled-process evidence: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)
- Dependency enforcement: [`scripts/check-v1-dependencies.mjs`](../scripts/check-v1-dependencies.mjs)

## Seam decision

This is an evidence checkpoint, not a new Module. It judges the existing package seams and guards after the complete Workspace turn. If a guard or census fails, stop and file the newly established mismatch against its owner; do not broaden this child into cleanup. If they stand, close with evidence only rather than adding duplicate tests, exports, wrappers, or configuration.

## Constraints

- Do not change production source, tests, package manifests, the lockfile, or verification scripts merely to manufacture checkpoint work.
- Exercise source and compiled surfaces independently; a development-condition import alone does not prove the built package.
- Negative controls must fail for the intended reason and be removed before canonical verification.
- Do not claim the cross-package portions of X-03, W-06, X-04, or X-06 complete; preserve their later owning-package turns.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The Workspace package remains private strict ESM with zero dependencies and
four deliberate export paths. An AST census of all 17 production TypeScript files
finds only ten `node:` built-in specifiers and no third-party, legacy, or outward
v1 package import. The dependency firewall passes over source and tests. A planted
`@neoflow/local-runtime` import under the Workspace test tree makes that guard fail
at the exact control file, proving the declared no-dependency direction is enforced;
the control was then removed.

Source contracts pass 5/5 and retain the intended runtime values: the semantic
root has only `WORKSPACE_INTERFACE_VERSION` and `bootstrapWorkspace`, the runtime
subpath only `openWorkspaceRuntimeOwner`, Harness Interaction no values, and the
representation subpath only `decodeBytesBase64` / `encodeBytesBase64`. A temporary
root value export makes the source-island scenario fail 1/1 with that leaked name,
and restoring the root makes it pass. After a clean Workspace build, every one of
the four manifest `import` and `types` targets exists, imports directly, and has
the same exact value surface; the repository build smoke passes too.

All 15 implementation children from WF-094 through WF-108 are closed. The Pi
Adapter half of X-03, Application half of W-06, and Local Runtime portions of X-04
and X-06 remain traceable to their later package turns rather than being claimed
here. No unexplained compatibility path or new seam was found.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the dependency
firewall, all 20 files / 134 tests, typecheck, builds, and smoke. All four compiled
risk probes pass, and `git diff --check` is clean. This checkpoint changes no
production source, test, manifest, lockfile, package Interface, or verification
script. The unrelated root `package.json` bump remains excluded.
