# Oxlint vs Biome for WF-196 lint/format adoption

Date: 2026-09-07

Status: primary-source and empirical research complete; decision recorded in
`.issues/WF-196-adopt-lint-and-format-tooling.md` (oxlint + oxfmt, on the
maintainer's call — see Decision).

## Question

WF-196 asks for enforced lint and format tooling across the v1 workspace, with
Biome as the default recommendation and `oxlint + Prettier` (or `oxlint + a
formatter`) as the recorded alternative. Which tool actually fits the settled
constraints: one fast tool (or the minimal tool set) providing both lint and
format, TypeScript/ESM-native, a single versioned config, dev-only at the root,
no material lane slowdown, and a formatter whose output is stable enough that
mechanical reformat churn stays a one-time event?

## Sources and versions

All facts checked 2026-09-07 against primary sources:

- npm registry (versions, publish dates, engines):
  - `oxlint` 1.81.0 (published 2026-09-01), engines `^20.19.0 || >=22.12.0`.
  - `oxfmt` 0.66.0 (published 2026-09-01) — the oxc formatter ships as a
    **separate package**, still 0.x.
  - `@biomejs/biome` 2.5.12 (published 2026-09-03), engines `>=14.21.3`.
- <https://oxc.rs> first-party docs: linter overview and versioning policy
  (`/docs/guide/usage/linter/versioning`), Oxfmt overview and configuration
  (`/docs/guide/usage/formatter`, `/docs/guide/usage/formatter/config`).
- <https://biomejs.dev> language-support matrix
  (`/internals/language-support/`).
- Empirical probes run in this repo's tree (118 in-scope files), Biome
  2.5.12 — see the WF-196 resolution for the numbers.

## Findings

### Tool count and config surface

The oxlint path is definitionally **two tools**: `oxlint` for lint and `oxfmt`
for format — two dependencies, two configs (`.oxlintrc.json` +
`.oxfmtrc.json`/`oxfmt.config.ts`), two lane steps. Oxc's own docs frame
Oxfmt as "a dedicated formatter": "Choose Oxfmt if you want the best dedicated
formatter." Biome is one binary, one `biome.json`, one lane step covering both.
WF-196's stated preference is a single tool providing both.

### Formatter maturity and output stability

Biome 2.x is a stable series; the language-support matrix shows formatting ✅
for JavaScript, TypeScript, JSX/TSX, JSON, JSONC, CSS, GraphQL (HTML/SVG
experimental — irrelevant here). Oxfmt is 0.x (pre-1.0), so its output can
shift across minor releases; exact-pinning contains this, but every upgrade
risks reformat churn in a tree where the reformat must stay a one-time
recorded event. Oxlint's documented versioning policy is 1.x-semver for the
linter; Oxfmt's own stability story is not yet a 1.x commitment.

### Lint capability vs what the codebase needs

The v1 tree needs a recommended correctness/suspicious ruleset with zero
plugins, zero custom rules, and — per the WF-196 constraints — **no type-aware
linting** (lint may never demand semantic change). Oxlint's differentiators
(ESlint-plugin compatibility, JS plugins, type-aware linting — which Oxlint's
own versioning page marks as not yet semver-stable) are all out of scope. For
the rules that will actually run, both tools are adequate; rule-count parity
was not the deciding factor.

### Performance

Both are far under the lane budget. Measured in this repo: Biome 2.5.12
formatted all 118 in-scope files in ~50 ms. Oxlint/oxfmt claim higher
throughput (Oxfmt docs benchmark ~2x Biome) — irrelevant at 118 files.

### Node 26.5.1 compatibility

Both satisfy it (`oxlint` engines `>=22.12.0` covers 26; `@biomejs/biome`
declares `>=14.21.3`).

## Empirical probe (Biome 2.5.12 on this tree)

Recorded in the WF-196 resolution: 89 of 118 files would change; the
non-whitespace delta class is exactly trailing commas dropped when lists join
to one line plus arrow-parens removed under `asNeeded` — verified per file by
whitespace-stripped byte-stream comparison across all changed files. Test
fixtures are excluded from scope (Biome would otherwise rewrap a JSON
fixture). Zero-diff tuning is impossible: the formatter reprints every file
from its AST.

## Other oxc tools surveyed (2026-09-07, primary sources + npm registry)

The maintainer asked for a survey of the rest of the oxc toolchain. Maturity and relevance to neoflow:

- **oxc-node — "TypeScript Runner"** (`oxc-node` on npm; docs mark it **Experimental**: "APIs and behavior may change between releases"): runs TypeScript/JSX directly without a build step, standard Node CLI workflow. **Watch.** The repo declares `tsx` as a root devDependency, but nothing invokes it anymore (vestigial — candidate for removal in a future task, not WF-196); oxc-node is the natural eventual replacement if it stabilizes, but it must not gate anything while experimental.
- **oxc-transform** 0.148.0 (npm, 2026-09-01): type stripping, decorators, and fast `isolatedDeclarations` `.d.ts` generation. The v1 packages already build with `tsc` and compiled-import smokes assert the emitted output; swapping declaration generation saves little and risks subtle `.d.ts` differences the smokes would have to re-prove. **Not adopted.**
- **oxc-parser** 0.148.0 (npm, 2026-09-01): Rust JS/TS parser with Node bindings, returns ESM import/export info directly. The dependency firewall currently walks module specifiers via the `typescript` compiler API — a possible future swap, but it changes no behavior today and `typescript` is already present. **Not adopted.**
- **oxc-resolver** 11.24.2 (npm, 2026-07-12): module resolver for tool authors (webpack/enhanced-resolve aligned). Neoflow is not a bundler or resolver tool. **Irrelevant today.**
- **oxc-minifier**: minifier/dead-code-eliminator for bundler pipelines; neoflow ships no bundle. **Irrelevant today.** (No first-party npm package found: registry has no `oxc-minifier`.)
- **Type-aware linting** (`oxlint` + tsgolint integration): documented as evolving and explicitly not subject to oxlint's semver policy. WF-196's constraints defer it by design (lint may never demand semantic change; type-aware rules can). **Deferred; revisit when stable** — rules like `no-floating-promises` would be the first candidates.
- **Vite+ / Rolldown ecosystem**: unified toolchain for bundler-based apps; neoflow is a Node CLI/TUI with no bundler. **Irrelevant today.**

Net: only `oxlint` + `oxfmt` are adopted now; `oxc-node` and type-aware linting are the two to watch.

## Decision

**`oxlint` 1.81.0 + `oxfmt` 0.66.0, exact-pinned, dev-only at the root — the maintainer's explicit call over Biome, made after this comparison.** The maintainer's stated rationale: oxlint is built to catch generated-code slop (the Clippy-style `pedantic`/`restriction`/`style` categories, verified against the oxc source's `RuleCategory` enum), and oxfmt keeps the toolchain single-ecosystem. The comparison below remains the recorded evidence base: the trade accepted is two tools/configs and a pre-1.0 formatter in exchange for the stronger slop-catching lint surface. Prettier remains the documented fallback pairing (near-identical output on this tree, 97/98 overlap) if oxfmt's 0.x output ever proves unstable across upgrades.
