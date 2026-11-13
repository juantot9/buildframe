---
id: WF-208
title: "Signpost the repository root"
status: closed
labels:
  - wayfinder:task
parent: WF-205
assignee: null
blocked_by: []
created: 2026-09-07
---

## Question

Finding F5's in-scope residue: the repository root mixes source with the
dogfooding workflow database (199 `.issues/` files, a 63 KB `CONTEXT.md`, root
handoff documents). Relocating them was ruled out of scope at charting — they
are the working method itself. What remains is making the layout legible to a
newcomer: extend the README (or add a short root signpost section) that says
what each top-level entry is — source packages vs. workflow machinery vs.
audit records — without moving anything or changing the workflow.

## Resolution

The README's `Active source topology` section becomes `Repository layout`:
three grouped tables — source and its entry points, the tracked working method,
and the ignored operator-owned directories — plus a sentence that root
configuration files carry only toolchain settings. The stale `pnpm 11.20.0`
requirement is corrected to the declared `11.10.0` package manager. Nothing
moves and no workflow behavior changes.

## Acceptance

- [x] The README names every top-level entry and its role (source, workflow
      machinery, evidence, or ignored local data) without moving anything.
- [x] The stated toolchain versions match `package.json` and
      `support/manifest.json`.
- [x] Formatting and the repository's own checks pass.

## Completion evidence (2026-09-17)

- Implemented in `5e5bc47`. The README keeps three groups: the source entries
  (`apps/neoflow`, `packages/{workspace,local-runtime,pi-adapter}`, `scripts/`,
  `support/manifest.json`, `.github/`), the tracked working method (`.issues/`,
  the four root documents, and the four `docs/` subtrees), and the ignored
  operator-owned directories (`.local/`, `.neoflow/`); root configuration
  files are declared as a group carrying only toolchain settings.
- Version match: Node `>=26.4.0 <26.6.0` matches the root and all four package
  `engines`, with `26.5.1` named as the verified pin from `.nvmrc`; pnpm
  `11.10.0` matches `package.json#packageManager` and
  `support/manifest.json#sourceRequirements.packageManager`. The manifest's
  looser `sourceRequirements.node` floor (`>=22.19.0`, asserted by
  `scripts/smoke-build-v1.mjs`) declares what the unreleased source tree needs
  and is deliberately distinct from the consumer range; `supportedNodeRanges`
  is empty pending release assembly
  (`docs/audit/pre-p17-codebase-findings.md`, A-04/P54 note).
- Checks: `v1:lint` and `v1:format:check` pass locally on Node 26.5.1 at this
  tree, and the full `v1:verify` chain passed in CI run `35202527525` on
  `4467595`, whose history includes `5e5bc47`; the README is unchanged since
  that commit.
