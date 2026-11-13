# Unused-export and dead-code detection tooling

Research input for [WF-063](../../.issues/WF-063-research-unused-export-detection-tooling.md).

Date: 2026-08-07
Status: primary-source survey complete; one candidate measured hands-on against this
repository. No decision taken, nothing installed, no repository file changed.

## Question

Is there a tool that can own **unused exports and unreachable code** for this
repository, which one, at what dependency cost, and with what false-positive profile
against this repository's specific shape?

## Method and its limits

Every maintenance claim below is taken from the tool's own repository or its npm
registry metadata, read on 2026-08-07. Every behavioural claim marked *measured* was
produced by running the tool; the exact command is given. Claims taken from
documentation rather than observation are marked as such.

The measured runs used **knip 6.32.0** installed into a scratch directory outside the
repository and pointed at the repository with `--directory`. The repository's
`package.json`, lockfile, `pnpm-workspace.yaml`, and tsconfigs were not touched, and
`git status` was identical before and after the knip runs. `--fix` was never used and
is out of scope for this note.

Only knip was measured hands-on. The other candidates were ruled out on maintenance
status before a measurement could earn its cost; that is a survey result, not a
measured comparison, and is called out as such below.

## Which tools are live in August 2026

| Tool | Status | Concrete evidence |
|---|---|---|
| **knip** | Live | Latest release `6.32.0` published 2026-08-06; last push to `main` 2026-08-06; **11 open issues** against 11,906 stars; ISC |
| **ts-prune** | **Archived 2025-09-19** | Repository read-only; last npm release `0.10.3` on **2021-12-12** |
| **tsr** (`line/tsr`) | **Archived 2025-10-23** | README banner "This project has ended."; last npm release `1.3.4` on 2025-01-08 |
| **@line/ts-remove-unused** | Renamed | npm deprecation: "This package has been renamed to 'tsr'." — inherits tsr's archive |
| **ts-unused-exports** | Dormant, not archived | Last commit **and** last release both 2024-11-25; **52 open issues**; no archive or deprecation notice |
| **unimported** | **Archived 2024-03-10** | npm deprecation field: "deprecated, please see readme for more info" |

The ticket asked to confirm rather than assume the ts-prune situation. Confirmed, and
it is stronger than assumed: **two** of the candidate tools are archived and **both
name knip as the replacement**.

ts-prune's README, under "📢 Maintenance Notice":

> **ts-prune is now in maintenance mode** — For new projects, we recommend
> [knip](https://github.com/webpro/knip) which carries forward the same mission with
> more features.

tsr's README banner:

> This project has ended.

…recommending "similar tools such as Knip."

Sources: [nadeesha/ts-prune](https://github.com/nadeesha/ts-prune),
[line/tsr](https://github.com/line/tsr),
[pzavolinsky/ts-unused-exports](https://github.com/pzavolinsky/ts-unused-exports),
[webpro-nl/knip](https://github.com/webpro-nl/knip), and the npm registry metadata for
each package.

### The linter class does not cover this

WF-055 established that no typescript-eslint rule reports a cross-file unused export.
That generalises to the other two live linters, so the "adopt a linter instead" route
is closed on capability, not only on posture:

- **Biome** — the JavaScript rule index contains no `noUnusedExports`,
  `noPrivateExports`, or equivalent. Every `noUnused*` rule is single-file. Biome does
  ship cross-file rules (`noImportCycles`, `noPrivateImports`, `noUnresolvedImports`),
  so the absence is a gap in coverage, not in capability.
  [Biome JavaScript rules index](https://biomejs.dev/linter/javascript/rules/)
- **oxlint** — ships multi-file analysis as a first-class feature and 847 rules
  including a large `import` plugin, but `import/no-unused-modules` is **not among
  them**. [oxlint rules](https://oxc.rs/docs/guide/usage/linter/rules.html),
  [multi-file analysis](https://oxc.rs/docs/guide/usage/linter.html)

## knip against this repository's shape

All results in this section are measured. Node 26.5.1 (the repository's pinned
version) was used throughout; knip 6 declares `engines.node` of
`^20.19.0 || >=22.12.0`, which that satisfies.

### The zero-configuration run

```
node <scratch>/node_modules/knip/bin/knip.js \
  --directory . --no-progress
```

Exit code **1**. Whole repository, all nine packages, no configuration file of any
kind. Runtime **0.48–0.51 s** over three runs.

It resolved the pnpm workspace correctly: the debug output enumerates all nine
packages from `pnpm-workspace.yaml` with their derived entry patterns. No resolution
errors, no parse errors, empty stderr.

Scoped to the four active workspaces:

```
node <scratch>/node_modules/knip/bin/knip.js \
  --directory . --no-progress \
  -W packages/workspace -W packages/local-runtime -W packages/pi-adapter -W apps/neoflow
```

| Configuration | Unused files | Unused exports | Unused exported types |
|---|---|---|---|
| Zero config, whole repo | 2 | 20 | 88 |
| Zero config, four active workspaces | 1 | 8 | 80 |
| Active workspaces + `ignoreExportsUsedInFile: true` | 1 | **0** | **13** |

The third row is the important one. **75 of the 88 findings in active source are
exports consumed only inside their own file** — the `export` keyword is unnecessary,
the symbol is not dead. knip separates these from genuinely unreferenced symbols via
`ignoreExportsUsedInFile`, documented as: "In files with multiple exports, some of them
might be used only internally. If these exports should not be reported, there is a
`ignoreExportsUsedInFile` option available."
([configuration reference](https://knip.dev/reference/configuration))

After that separation the entire genuinely-unreferenced set in active source is **13
type re-exports in one block of one file**, `packages/workspace/src/authoritativeState.ts`
lines 22–43, which re-exports types from `authoritativeStateProtocol.ts` that nothing
imports. Whether those are dead or deliberate is a judgement for WF-060; knip's claim
is only that nothing references them, and that claim is correct.

### The decisive capability: public Interface versus dead code

**Measured, and it works by default.** knip does not report unused exports in entry
files: "By default, Knip does not report unused exports in entry files."
([configuration reference](https://knip.dev/reference/configuration)) Each package's
`src/index.ts` is an entry file, so the explicit re-export list that constitutes the
package Interface is exempt without any configuration.

This is not merely inferred from the docs. Cross-checking the zero-config report
against `packages/workspace/src/index.ts`: every one of the ~170 names that file
re-exports from `./workspace.js` is absent from the report, while names exported from
`workspace.ts` but *not* on that list (`WorkspaceIdentityViewRequest`,
`UnsupportedPlatformDiagnostic`, `NotGitWorktreeDiagnostic`, and others) are reported.
The tool is drawing exactly the line the repository draws.

Turning the exemption off with `--include-entry-exports` adds only 11 findings across
the whole repository, **all of them in `packages/core`** — legacy, deletion-bound.
Zero additional findings in the four active packages. So the active packages' declared
Interfaces are, as of today, fully consumed by callers or tests.

An isolated fixture (see below) confirms the mechanism discriminates correctly rather
than merely staying silent: with `--include-entry-exports`, an Interface member
imported by a sibling package was **not** reported while an Interface member imported
by nobody **was**.

Three further escape hatches exist if a wider-than-callers Interface ever needs
asserting, all documented at
[JSDoc/TSDoc tags](https://knip.dev/reference/jsdoc-tsdoc-tags):

- `/** @public */` on a non-entry export suppresses its report. **Measured** in the
  fixture: adding the tag removed the finding.
- `/** @internal */` marks exports that exist only for tests, so they are not flagged
  in production mode.
- Arbitrary tags plus `--tags=-mytag` for a project-specific convention.

The docs caution against reaching for these first: hiding issues "is often a sign of
code smell or ambiguity and ends up harder to maintain."

### The four non-obvious entry points

Measured individually, three in an isolated fixture built to mirror this repository's
manifest and tsconfig shape.

| Entry point | Handled? | Mechanism |
|---|---|---|
| Worker thread (`authoritativeStateWorker.ts`) | **Yes** | knip follows `new URL('./worker.js', import.meta.url)` and maps the `.js` specifier to the `.ts` source. Fixture: the worker file was never reported. Repository: `authoritativeStateWorker.ts` was never reported. |
| Launcher binary (`bin` → `./dist/developerExecutable.js`) | **Yes, conditionally** | Requires `outDir`/`rootDir` in the package tsconfig. Fixture without them: `binMain.ts` reported unused plus a "Package entry file not found" hint. Fixture with `outDir: dist`, `rootDir: src` added — exactly what every active package here has — the finding and the hint both disappeared. |
| Pi extension (`pi.extensions` → `./dist/index.js`) | **Yes, incidentally** | knip does not read the `pi` manifest field, but `src/index.ts` is a default entry pattern and `extension.ts` is reachable from it. Not reported. The `pi` field itself is invisible to knip. |
| Five `scripts/*.mjs` probes | **Four of five** | See below. |

**The one reproducible false positive.** `scripts/probe-dogfood-v1.mjs` is reported as
an unused file; the other four probes are not. Cause isolated in a dedicated fixture:
its `package.json` script is `node --experimental-ffi scripts/probe-dogfood-v1.mjs`,
and knip's node plugin carries a hardcoded allowlist of boolean node flags —

```
'deprecation', 'experimental-strip-types', 'experimental-transform-types',
'harmony', 'inspect-brk', 'inspect-wait', 'inspect', 'test-only', 'test',
'warnings', 'watch'
```

— in [`packages/knip/src/plugins/node/index.ts`](https://github.com/webpro-nl/knip/blob/main/packages/knip/src/plugins/node/index.ts).
A flag not on that list is treated as value-taking and swallows the following
positional argument, which is the script path. A fixture with seven scripts confirmed
the boundary exactly: `--import`, `--conditions=`, `--experimental-strip-types` and
`--no-warnings` all resolve their script; `--experimental-ffi` and
`--experimental-permission` do not. The behaviour is consistent with the documented
script-parser heuristic that "the first positional argument is usually an entry file"
([script parser](https://knip.dev/features/script-parser)); the flag list is simply
incomplete. No open issue tracks it. A one-line `entry` pattern for `scripts/*.mjs`
removes it entirely.

**The second false positive is not knip's fault.**
`apps/neoflow/src/launcherTestHarness.ts` is reported unused. Its only reference in
the repository is the *string literal* `'../apps/neoflow/dist/launcherTestHarness.js'`
inside `scripts/probe-dogfood-v1.mjs`. No static analyser can follow that. It needs an
explicit entry declaration or a `@public`-style assertion whichever tool is used.

### NodeNext, `.js` specifiers, `customConditions`, and the strict flags

- **`.js` specifiers resolving to `.ts` sources** — works. Every cross-file finding in
  the fixture and the repository depends on it; nothing was misresolved.
- **`customConditions: ["development"]`** — works, but **not for the reason the
  tsconfig states**, and this is worth recording. A fixture whose `development`
  condition pointed a subpath export at a *different* file than any `dist`→`src`
  guess showed knip following the condition target. But renaming that condition key
  to `zzznotacondition` — a name the fixture's tsconfig does not list in
  `customConditions` — produced identical results. **knip does not filter export
  conditions by tsconfig `customConditions`; it walks the map and takes what
  resolves.** In practice that is more permissive than `tsc` and lands on `src` here,
  so it produces the right answer. The residual risk is bounded: with a *visible*
  `dist/` present, the fixture showed knip still preferring the `development` target
  for resolution and merely listing the `dist` files as additional unused-file noise —
  not flipping resolution and condemning `src`. In this repository `dist/` is
  gitignored and knip respects `.gitignore` by default, so it never sees it.
- **`isolatedDeclarations`, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`,
  `strict`, `noUncheckedIndexedAccess`** — irrelevant to knip, because knip 6 does not
  typecheck. Its v6 release replaced "the TypeScript backend entirely with
  `oxc-parser` and `oxc-resolver`"
  ([knip v6 announcement](https://knip.dev/blog/knip-v6)); knip has no `typescript`
  dependency and no peer dependency on it. Observationally the runs produced no parse
  errors and knip correctly split "Unused exports" from "Unused exported types", which
  is the distinction `verbatimModuleSyntax` makes explicit in source.

The same v6 change is the reason `classMembers` detection was dropped: it "relies on
the JS-based `ts.LanguageService` API," and TypeScript v7 is a Go rewrite. Member-level
dead-code detection is therefore **not** available and, per the maintainer, may not
return.

### Exit codes

Measured, all four:

| Invocation | Exit |
|---|---|
| Issues present, default | **1** |
| `--no-exit-code` | 0 |
| `--max-issues 100` (above the issue count) | 0 |
| `--include exports`, issues present | 1 |

So "what gates it" is decidable in both directions: it gates by default, and it can be
made a non-gating report with one flag. `--treat-config-hints-as-errors` and
`--treat-tag-hints-as-errors` additionally opt stale configuration and stale
suppressions into the failure signal.

### Dependency cost

Measured by installing `knip@6.32.0` alone into an empty scratch project:

- **20 packages total**, transitive tree included.
- **20 MB** on disk, of which `zod` 6.3 MB, `knip` 5.1 MB, `jiti` 1.7 MB, the two
  `oxc` native bindings 3.2 MB combined, `yaml` 1.2 MB.
- Direct dependencies (13): `zod`, `fdir`, `jiti`, `yaml`, `unbash`, `formatly`,
  `picomatch`, `smol-toml`, `oxc-parser`, `tinyglobby`, `get-tsconfig`, `oxc-resolver`,
  `strip-json-comments`.
- No peer dependencies. ISC licensed. Single binary `knip`.
- Two of the twenty are **platform-specific native binaries**
  (`@oxc-parser/binding-darwin-arm64`, `@oxc-resolver/binding-darwin-arm64`); a
  different platform pulls a different pair.

Against a root with exactly five devDependencies, this quadruples the direct count and
adds native binaries to a tree that currently has one (`@opentui/core`). Whether it
earns that is the decision, not a fact.

`scripts/check-v1-dependencies.mjs` does not constrain this either way: it enforces
which `@neoflow/*` and legacy packages the four v1 packages may depend on, and does
not police root devDependencies.

### Running it once as a report

Fully supported, and it is what every measurement above did. knip needs no presence in
the repository at all — `--directory` runs it against a tree it is not installed in,
and `-c` accepts a config file that also lives outside the tree. Both were used here;
`git status` was unchanged. The default cache location is
`node_modules/.cache/knip` but caching is off unless `--cache` is passed, and no cache
directory was created in the repository.

The whole one-shot recipe, reproducible from a clean machine:

```sh
mkdir /tmp/knipprobe && cd /tmp/knipprobe
npm install knip@6.32.0
node node_modules/knip/bin/knip.js \
  --directory /path/to/neoflow --no-progress \
  -W packages/workspace -W packages/local-runtime -W packages/pi-adapter -W apps/neoflow
```

## The smallest configuration that reaches a clean report

Measured. With this file, held **outside** the repository and passed via `-c`:

```json
{
  "ignoreExportsUsedInFile": true,
  "workspaces": {
    ".": { "entry": ["scripts/*.mjs"], "project": ["scripts/*.mjs"] },
    "apps/neoflow": { "entry": ["src/launcherTestHarness.ts!"] }
  }
}
```

…scoped to the root plus four active workspaces, the entire report is the **13 type
re-exports** in `authoritativeState.ts`. Both false positives are gone. knip's own
configuration hints confirm nothing else needed declaring: it flagged
`src/index.ts!`, `src/runtime.ts!`, `src/launcher.ts!`, `src/harnessAdapter.ts!`,
`src/developerExecutable.ts!` and `src/harness-interaction/index.ts!` as **redundant**
entry patterns, because it already derives all of them from the `exports` and `bin`
manifest fields.

## Candidate-by-candidate against the checklist

| | knip | ts-prune | tsr | ts-unused-exports |
|---|---|---|---|---|
| Live Aug 2026 | Yes | **Archived** | **Archived** | Dormant since 2024-11 |
| pnpm workspaces | Measured: all 9 detected | — | Not documented | Not documented; takes one tsconfig |
| NodeNext + `.js` specifiers | Measured: works | — | — | — |
| `customConditions` | Measured: resolves, but not read from tsconfig | — | — | — |
| Non-`main` entry points | Measured: 3 of 4 automatic, 1 needs a line | — | Regex entrypoints, all manual | tsconfig `include` only |
| Public-Interface distinction | Entry-file default + `@public`/`@internal`/custom tags | — | `// tsr-skip` per export | `// ts-unused-exports:disable-next-line` per export |
| Exits non-zero | Measured: yes, controllable | — | CLI exit not documented | — |
| Dependency cost | 20 packages / 20 MB | 6 direct deps incl. `lodash`, `ts-morph` | 2 direct deps, 98 kB | 2 direct deps |
| One-shot report | Measured: yes, zero repo footprint | — | Yes | Yes |

Only knip's column is measured. The other three columns are documentation and
metadata; they were not run, because an archived tool and a tool with no workspace
story do not justify the measurement cost. If that judgement is wrong, tsr is the one
worth revisiting — it was 2.14× faster and 60× smaller than knip by its own
now-archived benchmark, and `// tsr-skip` is a per-export public marker. Its archive
notice points at knip regardless.

## What the evidence supports

- **knip is the only live tool in this class.** Two of its three plausible competitors
  are archived and both name knip as the successor; the third has not shipped since
  November 2024. This is not a close call and does not depend on judgement.
- **The decisive capability is satisfied, by default, with no configuration.** knip
  treats each package's `index.ts` re-export list as the public surface and does not
  report it. Measured against this repository's actual Interfaces, not inferred.
- **The false-positive profile against this repository is two findings**, both
  understood: one from a missing node flag in knip's allowlist, one from a
  dist-path string literal that no static tool can follow. A three-line config removes
  both.
- **Signal-to-noise is good once `ignoreExportsUsedInFile` is set** — from 88 findings
  to 13, with the 75 suppressed ones being a real but different finding
  ("this `export` keyword is unnecessary") that can be surfaced separately.
- **It exits 1 by default and can be made to exit 0**, so both the gate and the
  report-only posture are available.
- **It can be run with zero repository footprint.** Everything in this note was
  produced that way.

## What the evidence does not support

- **It does not say knip should be adopted.** 20 packages and two native binaries
  against a five-devDependency root with a dependency firewall is a cost question this
  note deliberately leaves open.
- **It does not settle whether the 13 remaining findings are dead code.** knip proves
  they are unreferenced. Whether `authoritativeState.ts`'s type re-export block is a
  deliberate Interface belongs to WF-060.
- **It does not establish tsr or ts-unused-exports' behaviour against this
  repository.** Neither was run. Their rows above are documentation claims.
- **It does not validate knip against the legacy packages.** The five deletion-bound
  packages were included in the whole-repo run and produced findings, but those were
  not checked for correctness.
- **It does not cover `--fix`.** Never run, never assessed.
- **It cannot predict maintenance.** Release cadence (32 minor releases in the 6.x line,
  most recent the day before this note) and an 11-open-issue backlog against 11,906
  stars are the facts; durability is an inference from them.
- **One thing is worth watching rather than trusting.** knip does not read tsconfig
  `customConditions`. It happens to resolve this repository's `development` condition
  correctly because that is what exists on disk. If the resolution story changes —
  a new condition, a checked-in `dist`, an un-ignored build output — the assumption
  should be re-measured rather than assumed to hold.
