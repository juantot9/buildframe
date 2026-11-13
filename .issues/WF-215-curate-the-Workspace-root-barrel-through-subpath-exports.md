---
id: WF-215
title: "Curate the Workspace root barrel through subpath exports"
status: closed
labels:
  - wayfinder:task
parent: WF-205
assignee: null
blocked_by: [WF-209,WF-210,WF-211,WF-212]
created: 2026-09-07
---

## Question

Finding F2: `packages/workspace/src/index.ts` is 320 lines of ~316 re-exports,
hiding the real public API. Settled at charting: the root barrel shrinks to
entry-point types and the rest moves through the package's existing subpath
exports (`./runtime`, `./harness-interaction`, `./bytes-base64`, `./sha256`,
plus subpaths the module splits make natural). Sequenced after the module
splits so the barrel is curated once, not per split. Decide the final export
surface — which types are entry-point, which are subpath-local, which become
private — update consumers, and prove the canonical verify chain passes.

## Blocked by

- [Split workspaceEvidence along its internal seams](./WF-209-split-workspaceEvidence-along-its-internal-seams.md)
- [Split projection along its internal seams](./WF-210-split-projection-along-its-internal-seams.md)
- [Split legacyReviewImport along its internal seams](./WF-211-split-legacyReviewImport-along-its-internal-seams.md)
- [Split the Workspace Reviewing module along its internal seams](./WF-212-split-the-Workspace-Reviewing-module-along-its-internal-seams.md) — the barrel is curated once, after the splits settle what the export surface even is.

## Reconnaissance (measured at HEAD `efbe023`)

The splits landed: the barrel grew to **448 type names + 2 values**
(`WORKSPACE_INTERFACE_VERSION`, `bootstrapWorkspace`), re-exported from
`workspace.ts` in six blocks — so the ticket's "~316 re-exports" is stale, not
the target.

| Owning module | Root barrel names | Out-of-package consumers |
| --- | --- | --- |
| `workspace.ts` (entry) | 17 (2 values + 15 types) | 14 |
| `projection/index.ts` | 103 | 30 |
| `reviewing/index.ts` | 101 | 10 |
| `legacyReviewImport/index.ts` | 89 | 0 |
| `workspaceEvidence/index.ts` | 57 | 2 |
| `harness-interaction/contracts.ts` | 55 | 5 via root (18 further names already subpath-only) |
| `contextEvidence.ts` | 28 | 0 |

Consumers of subsystem types: `apps/neoflow` sources (3 files) and its
scenario test, `local-runtime`'s contract test; 21 workspace scenario files
imported 83 names from the barrel. `source-island.test.ts` already pinned the
root runtime surface to the 2 values, so the unreadable surface is type-only.

## Interface decision

- **Entry point stays exactly what it is.** `src/index.ts` keeps the 17 names
  the barrel already carried, now as an explicit list: the two values,
  `Workspace`, `WorkspaceIdentity`, `UnsubscribeWorkspace`,
  `WorkspaceCommand`, `WorkspaceCommandResult`, the five `WorkspaceView*`
  driving types, the three `WorkspaceBootstrap*` types,
  `WorkspaceBootstrapDiagnostic`, and `WorkspaceIdentityView`. No name is
  added and none removed. The bootstrap diagnostic *interfaces* and the
  `RuntimeWorkspace*` fault seams stay unexported, as before.
- **The rest moves, not prunes.** Every subsystem type keeps a public address
  at its owning module, so the union of the package's public surface is
  unchanged except for one deliberate disposition:
  - `./projection` → `src/projection/surface.ts` (103 names)
  - `./reviewing` → `src/reviewing/surface.ts` (101 names)
  - `./legacy-review-import` → `src/legacyReviewImport/surface.ts` (89 names)
  - `./workspace-evidence` → `src/workspaceEvidence/surface.ts` (57 names)
  - `./harness-interaction` → `harness-interaction/index.ts` grows 22 → 73
    (the 55 root re-exports plus the 18 names that were already subpath-only)
- **`contextEvidence`'s 28 names become private.** Nothing outside the package
  names them; they are capture/parsing plumbing reached through the evidence
  and projection view shapes. The one in-package test that names them imports
  `src/contextEvidence.js` directly.
- **Subpaths stay type-only.** The class owners, options, limits, and parsers
  remain composed behind `Workspace`; the new entry files are re-export lists
  over each module's `index.js` and emit `export {}` JS + type-only
  declarations.
- Pruning the subpath surfaces to "what consumers use today" (which would make
  ~360 further names private) is left as a separate, evidence-driven pass; the
  knip survey in `docs/research/unused-export-detection-tooling-2026-08-07.md`
  is the tool for it, and F2's complaint is the root's readability.

## Resolution

A pure re-partition. All 433 subsystem re-exports were generated from the six
blocks being deleted, so no declaration, order, or spelling changed.

- `workspace.ts`: the six re-export blocks deleted (lines 41–490, 451 lines
  removed); the entry declarations are untouched.
- `src/index.ts`: 452 lines → a 20-line explicit entry list.
- `src/<module>/surface.ts`: four new type-only files re-exporting exactly
  their block's names from `./index.js`.
- `harness-interaction/index.ts`: from 22 to 73 names, sorted.
- `packages/workspace/package.json`: four new `exports` entries mirroring the
  existing `development` / `types` / `import` shape.
- Consumers re-addressed with zero behavior change: the three app sources, the
  app scenario test, the local-runtime contract test, and 18 in-package test
  files (83 imported names); `source-island.test.ts` gains one assertion that
  the four new subpaths expose no runtime values.

Surface proof (token-level, old barrel at HEAD vs working tree):

```
old root 448 types + 2 values
new root  15 types + 2 values   (the 17 entry names)
harness-interaction 73 = 55 moved + 18 already subpath-only
projection 103, reviewing 101, legacy-review-import 89, workspace-evidence 57
contextEvidence 28 recorded private
no name lost; no name at two public addresses; every new entry file type-only
```

## Acceptance

- [x] The root barrel exposes exactly the 17 entry-point names, explicitly
      listed, with no re-export blocks left in `workspace.ts`.
- [x] Every name previously on the root barrel has exactly one public address
      or a recorded `private` disposition (the 28 `contextEvidence` names).
- [x] The runtime surface is unchanged: root still exports only
      `WORKSPACE_INTERFACE_VERSION` and `bootstrapWorkspace`; the four new
      subpaths export no values.
- [x] Consumers and tests moved to the owning subpaths; no declaration or
      behavior changed.
- [x] Lint (33 pre-existing warnings, unchanged), format:check, dependency
      firewall, full suite (54 files / 382 tests), package and test
      typechecks, clean build, build smoke, and the four compiled risk probes
      pass on macOS Node 26.5.1.

## Completion evidence (2026-09-18)

Local, Node 26.5.1, load 4.2 at suite start:

- Surface proof: root 15 + 2, subpaths 73/103/101/89/57, context 28 private,
  no losses, no duplicates, all entry files type-only; `source-island.test.ts`
  now 3 tests (root values, runtime/Adapter islands, subpath type-only).
- Full suite: 54 files / 382 tests pass (360.65s; +1 test from the new island
  assertion, same file count).
- `lint` 33 warnings (same count as the stashed baseline), `format:check`
  clean, firewall passed, package + test typechecks passed, clean build and
  build smoke passed, `risk:state`, `risk:runtime`, `risk:pi` (Pi 0.80.6), and
  `risk:dogfood` all passed.
- CI: run
  [`35354635006`](https://github.com/juantot9/neoflow/actions/runs/35354635006)
  green on both engines after one rerun. `verify (Node 26.5.1)` green first
  attempt in 5m49s; `verify (Node 26.4.0)` attempt 1 failed on the known
  `reviewingApplication.test.ts` wheel-scroll hover-expansion timeout
  (`Timed out waiting for hovered Message to expand within bounds without
  replacing the selected Message`) while 26.5.1 passed the same run, and is
  green on the rerun in 5m24s.
