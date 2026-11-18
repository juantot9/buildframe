---
id: WF-292
title: "Make the dependency firewall refuse unlisted packages"
status: open
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
