# Repository health findings — 2026-09-07

A surface-level structural survey of the active v1 tree (72,437 LOC across 91
TypeScript files, 255 commits, baseline `98fafd7`), conducted the same session
that settled [Make Scroll position truth visible in the Reviewing panes](../../.issues/WF-198-make-scroll-position-truth-visible.md).
It is a look at **how the code is organized**, not a semantic review: naming,
file mass, nesting depth, test layout, tooling, and repository root hygiene.
The behavioral audits remain
[`active-v1-antipatterns-2026-09-01.md`](./active-v1-antipatterns-2026-09-01.md)
and [`pre-p17-codebase-findings.md`](./pre-p17-codebase-findings.md).

## Baseline shape

- pnpm monorepo: `packages/workspace` (31,523 LOC src / 18,780 test),
  `apps/neoflow` (9,359 / 4,759), `packages/local-runtime` (3,405 / 2,926),
  `packages/pi-adapter` (1,066 / 603), `scripts/` (2,268).
- Hygiene is exceptional: one `as any` in the whole tree (a test), zero
  TODO/FIXME markers, zero `console.log` in production code, oxlint + oxfmt
  adopted tree-wide, `dist/` correctly ignored, strict TypeScript, ~37% of all
  code is tests.
- Disposition of these findings is charted by
  [Resolve the repository health findings](../../.issues/WF-205-resolve-the-repository-health-findings.md).

## Findings

### F1 (High) — God modules in the Workspace domain core

`workspaceEvidence.ts` (6,324 lines, 111 type/interface declarations),
`legacyReviewImport.ts` (5,566), `reviewing.ts` (5,103), and
`projection.ts` (3,378) each concentrate an entire subsystem in one file.
`harness-interaction/harnessInteraction.ts` (3,744) is the same pattern in an
already-extracted subpackage. The internal structure is sound; the mass is not.
Splitting must follow the existing internal seams (capture vs. verification vs.
scope; import vs. queue vs. receipts) through the owning Module's existing
Interface, with no speculative abstraction.

### F2 (Medium) — The Workspace root barrel hides the real API

`packages/workspace/src/index.ts` is 320 lines of ~316 re-exports. The true
public surface is unreadable from the barrel; load-bearing types are
indistinguishable from incidental ones. The package already has subpath
exports (`./runtime`, `./harness-interaction`, `./bytes-base64`, `./sha256`)
that can carry the discipline.

### F3 (Medium) — Extreme nesting in projection and view code

`projection.ts` reaches ~32 indentation levels (nested conditional-type and
ternary chains mapping view requests to components); `reviewingView.ts`
reaches ~24 with 18 lines over 120 characters. Lookup tables, early returns,
and one-level-per-function refactors flatten these without behavior change.

### F4 (Medium) — Monolithic scenario tests

`apps/neoflow/test/scenarios/reviewingApplication.test.ts` is 4,057 lines;
several workspace scenario files run 800–2,900 lines. Coverage is excellent;
the lumpiness slows local iteration and invites copy-paste drift. Test
restructuring travels with the source splits it belongs to.

### F5 (Medium) — Repository root doubles as workflow database

199 git-tracked markdown files in `.issues/`, a 63 KB `CONTEXT.md`, plus
`HANDOFF.md`, `DESIGN.md`, `WORKFLOW_RESEARCH.md` at the root and ten documents
under `docs/research/`. **Disposition at charting:** the workflow artifacts are
the dogfooding method itself and are load-bearing — relocation is ruled out of
scope (see the map's Out of scope). The residue in scope is a README signpost
so newcomers can tell source from machinery.

### F6 (Low) — "v1" baked into identifiers everywhere

`v1:` prefixes on 20+ npm scripts, `tsconfig.v1.json`, `tsconfig.v1-tests.json`,
`vitest.v1.config.ts`, probe scripts (`probe-dogfood-v1.mjs`, …), and the bin
name `neoflow-v1-dogfood`. A v2 migration would touch dozens of files for no
functional reason. The version marker belongs in one place.

### F7 (Low) — Duplicated `reviewing*` naming across layers

The `reviewing*` family exists in both `apps/neoflow/src` (view, model, input,
scroll, highlight, application) and `packages/workspace/src` (`reviewing.ts`).
Which layer owns which concept is not visible from filenames alone. This
decision hangs on how the view and model splits land; see the map's Not yet
specified.

### F8 (Low) — No CI pipeline, and a razor-thin engines pin

No `.github/` or CI configuration despite a CI-shaped composite
`pnpm v1:verify` (lint → format → deps → tests → typecheck → build → smoke).
A GitHub remote exists (`juantot9/neoflow`), so Actions is viable. The
`engines` pin `>=26.4.0 <26.6.0` is really the same question: what
environments does the project promise to run on — answered where the CI matrix
exercises it.

## Non-findings worth recording

- `dist/` folders exist locally but only 2 git-tracked `dist` matches exist,
  both false positives inside `.issues/` filenames.
- `packages/local-runtime` and `packages/pi-adapter` are exemplars: small
  files, explicit protocol/contract separation, versioned wire negotiation.
- Immutable discipline (521 `readonly` occurrences in `workspaceEvidence.ts`
  alone), named constants over magic numbers, layered test strategy
  (`fast/` vs `scenarios/` vs `contracts/`) with golden-fixture migration
  tests, and a self-auditing `docs/audit/` culture.
