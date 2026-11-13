---
id: WF-063
title: "Research unused-export and dead-code detection tooling"
status: closed
labels:
  - wayfinder:research
parent: WF-053
assignee: juanan
blocked_by: []
created: 2026-08-07
assets:
  - docs/research/unused-export-detection-tooling-2026-08-07.md
---

## Question

Is there a tool that can own **unused exports and unreachable code** for this
repository, and if so which one, at what dependency cost, and with what false-positive
profile against this repository's specific shape?

This is the one half of
[Decide the linter and formatter posture](./WF-055-decide-linter-formatter-posture.md)
that could not be settled from inside the working directory. That ticket measured
and rejected both a formatter and a linter, and established that **no rule in
typescript-eslint's `recommendedTypeChecked` or `strictTypeChecked` sets reports
cross-file unused exports** — it is a different class of tool
(`knip`/`ts-prune`-shaped), whose current behaviour is an external fact.

## What the answer has to cover

- **Which tools are live in August 2026**, and which are unmaintained or superseded.
  `ts-prune` was already recommending its own replacement before this repository
  existed; confirm rather than assume.
- **Whether the tool handles this repository's shape**, each of which can silently
  break resolution:
  - pnpm workspaces, nine packages, of which four are active and five legacy
  - `"moduleResolution": "NodeNext"` with explicit `.js` specifiers in source
  - `customConditions: ["development"]`, which points package entry points at
    `src` rather than `dist`
  - `isolatedDeclarations` and `verbatimModuleSyntax`
  - entry points that are not `main` — a Pi extension loaded by a host process,
    a worker thread, a launcher binary, and five `scripts/*.mjs` probes
- **Whether it can distinguish a deliberately-public Interface export from dead
  code.** This is the decisive capability, not a nicety:
  [Audit dead code, unused exports, and test quality](./WF-060-audit-dead-code-and-test-quality.md)
  records that the package Interfaces are deliberately wider than today's callers
  and that `index.ts` re-exports are the public surface. A tool that cannot be told
  this reports the entire public API as dead and is worse than nothing.
- **Whether it exits non-zero**, so the answer to "what gates it" is decidable.
- **Dependency cost and transitive weight.** The root has exactly five
  devDependencies and a dependency firewall (`scripts/check-v1-dependencies.mjs`).
  A tool with a large transitive tree has to earn it.
- **Whether it can be run once as a report rather than adopted as a gate.** A
  one-shot run feeding the audit is a materially different commitment from a
  permanent dependency, and may be the whole answer.

## Notes

- **Research tickets are exempt from the map's one-resolution-per-session rule.**
- The posture this must fit is already decided and is deliberately minimal: no
  formatter, no linter, and unused *locals* owned by two `tsconfig` flags inside
  the existing `pnpm verify` route. Do not reopen that; the measurements behind it
  are in the resolution comment of
  [Decide the linter and formatter posture](./WF-055-decide-linter-formatter-posture.md).
- Prefer primary sources: the tools' own documentation and repositories, and their
  release history for maintenance status.
- The answer feeds a **disposition**, not a change. Nothing here installs anything.

## Resolution comment

**Yes — `knip`, run as a one-shot probe from outside the repository, and not added
to `package.json`.** Findings are in
[`docs/research/unused-export-detection-tooling-2026-08-07.md`](../docs/research/unused-export-detection-tooling-2026-08-07.md),
which measured knip against this repository rather than reading its documentation.

### What the research settled

- **It is the only live tool in the class, and this is not a close call.** `ts-prune`
  archived 2025-09-19 and `tsr` archived 2025-10-23, and **both README notices name
  knip as the replacement**. `unimported` archived 2024-03-10. `ts-unused-exports` is
  not archived but has not shipped since 2024-11-25. knip shipped 6.32.0 on 2026-08-06.
- **The decisive capability works by default, with zero configuration.** knip does not
  report exports in entry files, and each package's `src/index.ts` is one — so all 175
  names the Workspace Interface re-exports are absent from the report, while names
  exported from `workspace.ts` and *not* on that list are reported. That it
  discriminates rather than merely staying silent was confirmed with a fixture, which
  is the difference between this and an assumed pass.
- **Signal is small and specific.** With `ignoreExportsUsedInFile`, the entire report
  across the four active roots is **13 type re-exports in one block**,
  `authoritativeState.ts:22`–`:43`. The 75 suppressed findings are a *different* and
  real observation — "this `export` keyword is unnecessary" — not dead code.
- **Two false positives, both understood, both removable by a three-line config held
  outside the repo.** One is a missing `experimental-ffi` entry in knip's node-plugin
  flag allowlist; the other is a `dist/` path referenced as a string literal, which no
  static tool can follow.
- **One-shot with zero repository footprint is fully supported** and is how every
  measurement in the note was produced — `--directory` against a tree knip is not
  installed in, `-c` pointing at an external config, `git status` unchanged throughout.

### The disposition, which the research deliberately left open

The note declines to say knip should be adopted, correctly — it costs **20 packages,
20 MB, and two platform-specific native binaries** against a root with exactly five
devDependencies. That is a decision, not a fact, so it is made here.

**Do not adopt it. Run it once.** Three reasons, in order of weight:

1. **There is nothing to ratchet against.** A permanent gate earns its cost by stopping
   a problem from accumulating. The measured problem is 13 type re-exports in a single
   block in one file. That is not an accumulation curve; it is a one-time cleanup.
2. **The posture is already decided and this is the same question.**
   [Decide the linter and formatter posture](./WF-055-decide-linter-formatter-posture.md)
   settled that static-analysis tools here are worth an occasional probe run outside the
   repository and nothing inside it. knip is a better tool than the linter was — it
   actually finds something — but that changes the value of *running* it, not the value
   of *installing* it.
3. **The cost is concrete and the run is free.** Quadrupling the direct devDependency
   count and introducing native binaries is a real change to a deliberately small tree.
   The one-shot recipe costs the repository nothing at all and takes about half a second.

**Revisit only on evidence**, not on schedule: if a later sweep finds unused exports
have grown well beyond 13, the accumulation argument becomes real and this should be
re-decided. Re-running the probe is how that would be discovered, which is the same
recipe either way.

### What this hands the dead-code audit

[Audit dead code, unused exports, and test quality](./WF-060-audit-dead-code-and-test-quality.md)
is now unblocked, and it inherits a measured starting point rather than a blank sweep:
the 13 candidates, the recipe that produced them, and the config that reaches a clean
report. **knip proves those 13 are unreferenced; it does not prove they are dead** —
whether that type re-export block is a deliberate Interface is exactly the judgement
that ticket's Notes already reserve, and it stays there.

### Carried forward as a caveat, not a fact

knip **does not read tsconfig `customConditions`**. It resolves this repository's
`development` condition correctly, but by walking the `exports` map and taking what
resolves — the right answer for the wrong reason. Bounded today, and `dist/` is
gitignored. If the build layout changes, re-measure rather than assume.

Not established, and stated so the next session does not mistake silence for coverage:
`tsr` and `ts-unused-exports` were never run and their comparison rows are documentation
claims only; knip's output against the five legacy packages was produced but never
checked for correctness; and `--fix` was never assessed.
