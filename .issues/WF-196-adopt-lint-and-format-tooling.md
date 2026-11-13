---
id: WF-196
title: "Adopt lint and format tooling across the v1 workspace"
status: closed
labels:
  - wayfinder:task
parent: WF-051
assignee: juanan
blocked_by: [WF-195]
created: 2026-09-07
---

## Resolution (2026-09-07)

**Tool choice: `oxlint` 1.81.0 (lint) + `oxfmt` 0.66.0 (format), exact-pinned as root devDependencies — the maintainer's explicit call over the Biome default recommendation.** The deciding rationale, recorded at the maintainer's direction: oxlint's Clippy-style category taxonomy (`correctness`, `suspicious`, `pedantic`, `perf`, `style`, `restriction` — verified against the oxc source's `RuleCategory`) is the AI-slop-catching surface the project wants armed on new code, with `pedantic`/`restriction` available for curation later; oxfmt completes the single-ecosystem chain from the same project (exact-pinned, so its 0.x output stays frozen between deliberate upgrades). The oxlint-vs-Biome comparison — primary sources plus empirical probes, including the finding that oxfmt and Prettier produce near-identical output on this tree (97 of 98 Prettier-changed files overlap) — is recorded in `docs/research/oxlint-vs-biome-lint-format-tooling-2026-09-07.md`. The cost accepted with this choice: two tools, two configs, and a pre-1.0 formatter, versus Biome's single-tool shape.

**Enforcement design (settled before adoption).** `v1:lint` runs `oxlint` with the blessed `--init` shape — recommended `correctness` category at error — so any violation in the gated set fails the lane with a nonzero exit. Seven rules currently fire on the existing tree; none may be fixed here (their fixes are source edits outside this issue's change surface, and one cannot be fixed without editing tests), so each is configured with a recorded severity: `no-control-regex` **off** (nine intentional sites — the product matches terminal ANSI/control sequences by design, and the rule offers no intent expression short of inline comments); `prefer-as-const`, `no-useless-spread`, `no-useless-fallback-in-spread`, `no-useless-escape`, `no-unused-vars`, `no-async-promise-executor` **warn** (deferred — visible in every lint run, not gating; `no-unused-vars` is the first candidate to promote to error once its single finding is cleaned up in a future task). The `suspicious`/`pedantic`/`style`/`perf`/`restriction` categories stay off: enabling them wholesale was probed and produces ~25,000 findings (rules like `one-var`, `no-ternary`, `sort-keys` contradict deliberate codebase style), including 98 non-recommended `correctness`+`suspicious` errors that would demand semantic edits — deferred for rule-by-rule curation, not silently dropped. `v1:format:check` runs `oxfmt --check` (nonzero exit on any non-canonical file); `v1:format` is its write-mode twin. Format scope: every TypeScript/ESM source, test, and `scripts/*.mjs` file plus the JSON configs, at 120 columns with the codebase's established settings (single quotes, `asNeeded` arrow parens, always-semicolons, trailing commas); excluded as out of scope or byte-stability-critical: `dist/`, `node_modules/`, `.neoflow/` (gitignored local state), `test/fixtures/**` (golden/fixture bytes must never move), `**/*.md`, and pnpm YAML files (oxfmt flips quote style in `pnpm-workspace.yaml`).

**Initial application: exactly one mechanical reformat commit (zero-diff was probed first and is impossible).** A probe of oxfmt 0.66.0 with the checked-in configuration touches **88 of 112 in-scope files**: the formatter reprints every file from its AST, so no configuration reproduces the mixed hand-rolled layout. The probe classified the non-whitespace delta across all changed files (whitespace-stripped byte-stream comparison): the only classes are trailing commas dropped when a list joins onto one line, parentheses added around comparisons when expressions join, and paren/union-paren moves — all syntactically neutral punctuation the formatter owns; 83 files carry punctuation deltas, 5 are whitespace-only. String bytes, golden content, identities, and fixtures are untouched (fixtures verified byte-identical in the probe), and byte-identical behavior on both sides of the reformat is proven by running the canonical verification before and after with identical outcomes.

**Landed.** `0cf6a07` = tooling adoption (`.oxlintrc.json`, `.oxfmtrc.json`, `v1:lint`/`v1:format:check`/`v1:format` scripts, `v1:verify` wiring, exact-pinned root devDependencies, resolution + comparison research note); `46e5927` = the mechanical reformat (90 files: the 88 probed sources/tests/scripts plus the two JSON configs canonicalizing themselves; +11,334/−19,069 lines, net reduction from line joining; `git show --check` clean). Byte-identical outcomes on both sides of the reformat: pre-reformat baseline and post-reformat verification both pass typecheck, 34 files / 285 tests, build, compiled-import smoke, all four compiled risk probes, dependency firewall, and `git diff --check`; the reformat introduced no new lint findings (same six deferred rules, same counts, zero errors); both new gates pass in `v1:verify`. The unrelated root `packageManager` bump (11.10.0 → 11.20.0) remained unstaged through both commits.

## Outcome

The v1 workspace gains enforced lint and format tooling. As of 2026-09-07 the repo has none: the only static gates are `tsc --noEmit` typecheck, the test lanes, `v1:check:dependencies`, and `git diff --check`. This task chooses the tool(s) (default recommendation: Biome as one fast tool providing both lint and format, TypeScript/ESM-native with a single config; ESLint + Prettier or oxlint + Prettier are the recorded alternatives — the choice is settled in this issue's resolution before adoption), installs them as root dev-only tooling, checks in a versioned configuration covering every v1 source, test, and `scripts/*.mjs` file across `packages/`, `apps/`, and the root, and adds `pnpm v1:lint` and `pnpm v1:format:check` (plus a fix-mode format script) wired into the canonical verification route so unclean output fails the lane exactly like a failing test. The initial application over the existing tree is either a zero-diff proof (configuration tuned to the established style) or exactly one recorded mechanical reformat commit whose diff contains no semantic change; the chosen outcome is stated in the resolution.

## Interface

No product Interface, State format, record format, limit, deadline, budget, or command-surface changes. Tooling, configuration files, package scripts, and (if reformat is chosen) whitespace/layout-only deltas across source and test files are the entire change surface. Every lint rule that would demand a semantic change is either configured off with a recorded reason or deferred; lint never rewrites behavior.

## Module seam

No Module seam changes. Lint and format tooling is workspace-level developer tooling outside the closed Workspace Interface; it must stay out of all package exports, published entrypoints, runtime code, and the dependency firewall's production-closure rules (dev-only root dependency, no runtime import).

## Acceptance

- [x] The tool choice and its rationale are recorded in this issue's resolution before adoption lands.
- [x] A versioned lint and format configuration covers all v1 TypeScript/ESM sources, tests, and `scripts/*.mjs`; the configuration itself is checked in and reproducible.
- [x] `pnpm v1:lint` and `pnpm v1:format:check` pass on the whole workspace, and the canonical verification route (or `pnpm v1:verify`) fails when either is violated.
- [x] The initial application is a proven zero-diff against the existing style, or exactly one mechanical reformat commit recorded here with a clean `git diff --check` and byte-identical test/build/probe outcomes on both sides of the reformat.
- [x] Canonical verification (fast/full lanes, typecheck, build, compiled import smokes), all four compiled risk probes, dependency/package seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0.
- [x] The unrelated root `packageManager` bump stays unstaged through every commit.

## Constraints

- Keep Node 26.5.1 / pnpm 11.20.0, State format 2, Interface version 1, the three-method Workspace Interface, and all limits/deadlines/budgets unchanged.
- New tooling is dev-only at the root; it must never enter a package's runtime dependencies, exports, or the dependency firewall's production closure, and must not slow the canonical lane materially (the verification budget stays as settled).
- A lint rule may not be satisfied by editing tests to pass or by weakening assertions; style-only reformat must never alter string bytes, identities, fixtures, or golden content.
- Never inspect real user repositories or `.neoflow` state; no network services or CI integrations are introduced — enforcement stays local to the scripts and the lane.
- Keep the unrelated root package-manager bump unstaged through every commit.

## Authority

- [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)
- [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)
