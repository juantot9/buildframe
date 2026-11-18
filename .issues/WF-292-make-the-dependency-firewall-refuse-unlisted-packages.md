---
id: WF-292
title: "Make the dependency firewall refuse unlisted packages"
status: closed
labels:
  - wayfinder:task
parent: WF-289
assignee: null
blocked_by: []
created: 2026-11-17
---

## Question

New connector packages are coming. Today a package missing from the
firewall's list is not checked at all.

## Evidence (at `f7e4ac7`)

- `scripts/check-dependencies.mjs:51-98` lists each package's allowed
  dependencies (`v1Packages` / `allowedV1Dependencies`); a package directory
  not in that list is skipped, so its imports and external dependencies go
  unchecked.
- Subpath imports are not checked: any package may import
  `@buildframe/local-runtime/launcher` (`packageMatches`, `:111-113`).

## Direction

- Fail when a directory under `apps/` or `packages/` with a `package.json` is
  not listed.
- Let each entry name the subpaths it may import (connectors:
  `@buildframe/local-runtime/harness-adapter` and the workspace harness
  types only).

## Verification

- A scratch `packages/example` with a `package.json` fails the check with a
  message naming it; removing it passes.
- A connector importing `@buildframe/local-runtime/launcher` fails.
- `pnpm check:dependencies` passes on the current tree.

## Resolution and evidence (2026-11-18)

- Every directory under `apps/` or `packages/` with a `package.json` must be
  listed in `v1Packages`; an unlisted one fails with "unlisted package: add it
  to v1Packages".
- Connectors' production code may import only
  `@buildframe/local-runtime/harness-adapter` and `@buildframe/workspace`
  (`.`, `harness-interaction`, `sha256`): the subpaths Pi and Claude import
  today. Their tests keep their wider access (they start real runtimes).
- Checked by hand: a scratch `packages/example` with a `package.json` fails
  and passes once removed; adding `import '@buildframe/local-runtime/launcher'`
  to `pi-adapter/src/piEvents.ts` fails with "unapproved v1 subpath" and passes
  once reverted. `pnpm check:dependencies` passes on the tree.
