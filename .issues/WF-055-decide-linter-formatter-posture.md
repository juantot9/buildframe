---
id: WF-055
title: "Decide the linter and formatter posture"
status: closed
labels:
  - wayfinder:grilling
parent: WF-053
assignee: juanan
blocked_by: []
created: 2026-08-05
assets: []
---

## Question

Should this repository adopt a linter and a formatter at all; if so which tool, what does it gate—the canonical `pnpm verify` route, a separate route, or nothing—and which classes of problem does it then own instead of the finding ledger?

## Established facts

- No linter or formatter configuration exists at any depth: no `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `prettier.config.*`, `biome.json*`, `.oxlintrc*`, `dprint.json*`, or `.editorconfig`.
- Root devDependencies are exactly `@opentui/core`, `@types/node`, `tsx`, `typescript`, and `vitest`. Root declares `packageManager: pnpm@11.10.0`.
- `tsconfig` compiler flags are therefore the only static gate. Nothing currently catches unused exports or dead code.

## Notes

- Takeable in parallel with [Audit architecture and risk across every package](./WF-054-audit-architecture-risk-every-package.md): the facts above are settled, and the answer changes what the audit needs to record by hand. If a tool is going to own dead code and unused exports, those do not belong in the ledger as hand-written findings.
- A tool adopted here becomes an execution obligation of the **Deepen the active Modules** package of [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md), not of this map.
- Adopting a formatter is a decision about a gate, not a licence for a repository-wide reformat. A sweeping reformat would be a large diff over source that Gate A and Gate B just proved, so if one is wanted, decide it explicitly here with its own reason and its own re-proving obligation. Otherwise the standing rule against style-only churn holds.
- Whether a new development dependency earns its place is part of this decision, not a given.
- **This ticket now gates [Audit dead code, unused exports, and test quality](./WF-060-audit-dead-code-and-test-quality.md).** If a tool is adopted that reports unused exports, that audit stops hand-enumerating them and records a tool obligation instead.
- One concrete candidate rule arrived from [Decide whether to break the packages/workspace import cycle](./WF-057-decide-workspace-import-cycle.md): within `packages/workspace/src`, every back-edge into `workspace.ts` must stay `import type`. That invariant is currently a review rule with nothing enforcing it. Whether a linter should is part of this decision.

## Resolution comment

**No formatter, no linter, and two `tsconfig` flags instead.** Adopt
`noUnusedLocals` and `noUnusedParameters` on `tsconfig.v1.json`. They cost no new
dependency, need no configuration file, and gate on the canonical `pnpm verify`
route immediately, because `typecheck` is already inside it. Nothing else is
adopted. The one question this could not settle from inside the working directory —
what should own **unused exports** — moved to
[Research unused-export and dead-code detection tooling](./WF-063-research-unused-export-detection-tooling.md).

Both halves were rejected on measurement, not taste. The measurements are below so
that a later session can disagree with the evidence rather than re-run it.

### How this was measured

Prettier `3.9.6`, ESLint `10.8.0`, `typescript-eslint` `8.66.0`, TypeScript
`5.9.3`, `@types/node` `26.1.2` — the last two matched deliberately to the repo's
own versions. Everything was installed in a scratch directory **outside** the
repository. Nothing was added to `package.json`, `pnpm-workspace.yaml`, or the
lockfile; the one temporary ESLint config placed at the repo root was deleted.
Target throughout: the four active roots — 40 files, 29,076 lines.

### The formatter: no

The source is already uniform in every property a formatter mechanically enforces:

| Property | Measured |
| --- | --- |
| String literals | 5,861 single-quoted, **1** double-quoted |
| Tab-indented lines | 0 |
| Three-space-indented lines | 0 |
| Files with trailing whitespace | 0 |
| Files without a final newline | 0 |
| Lines over 80 / 100 / 120 columns | 669 (2.3%) / 67 / 25 |

So a formatter has no inconsistency to remove. What it would do instead is
re-decide every line break. Run at the repository's *own* conventions
(`--single-quote --print-width 80`), Prettier rewrites **4,829 of 29,076 lines
across 29 of 40 files** — 17% of the active source. No print width avoids this:

| Print width | Lines rewritten |
| --- | --- |
| 80 | 4,829 |
| 90 | **3,986** (the minimum) |
| 100 | 5,189 |
| 120 | 7,219 |

The best case is 13.7% of the source, at a width nobody chose, and at Prettier's
defaults all 40 files change. The reason no width fits is that this code is broken
*semantically*, not to a column — one union member per line, one argument per line,
held that way whether or not it would fit. Prettier collapses exactly that:

```
-export type FramedSocketCloseCode =
-  | 'disconnected'
-  | 'malformed-frame'
-  | 'frame-too-large'
-  | 'backpressure';
+export type FramedSocketCloseCode =
+  'disconnected' | 'malformed-frame' | 'frame-too-large' | 'backpressure';
```

That is a 17% diff over source Gate A and Gate B just proved, buying the removal
of zero inconsistencies and the loss of a deliberate convention. The map's standing
rule against style-only churn already forbids it; the measurement is what makes the
rule's application here a fact rather than a preference. **No reformat, and no
gate.**

### The linter: no

Three tiers were run over the same 40 files:

| Configuration | Problems |
| --- | --- |
| `recommended` (no type information) | 25 |
| `recommendedTypeChecked` | 75 |
| `+ strictTypeChecked` | 281 |

Three things sink it.

**1. The rules it would be adopted *for* find nothing.**
`@typescript-eslint/no-floating-promises` and `no-misused-promises` were both
confirmed active at severity 2 via `--print-config`, and both report **zero**
problems. In particular neither catches **P-01** — the confirmed finding that three
unguarded `async` paths in the Pi adapter can crash the user's coding agent — because
two of those three are unguarded `await`s inside `async` handlers, which no lint rule
models, and the third assigns its promise to a property, which `no-floating-promises`
deliberately does not flag. The ledger found this by reading. The linter cannot.

**2. The untyped tier is almost entirely a tool this repo already owns.** Of the 25
problems at `recommended`, **17 are `no-unused-vars`** — which the two `tsconfig`
flags catch for free. The genuine remainder is 5 `prefer-as-const` and 3
`prefer-const`: **eight cosmetic nits across 29,076 lines**. That is the entire
return on a new dependency and a config file to maintain.

**3. The largest rule in the strict tier is actively dangerous here.**
`no-unnecessary-condition` produces 57 problems. All 57 were read. Not one is a
defect, and they fall into four patterns:

- **19 — validation of untrusted input, reported as dead because the *declared
  type* already asserts what the check verifies.** Parsed socket frames, a config
  file read from disk, duck-typed objects crossing a process boundary.
- **16 — liveness and cancellation guards read after a suspension point.**
  TypeScript does not invalidate narrowing across an `await`, so a `#stopped`
  re-check following one reads as "always falsy". Eight are that exact cancellation
  guard; six more are other mutable flags (`#closed`, `connectionClosed`, `#sink`);
  two are `AbortSignal.aborted`, which by definition is set by another party.
- **13 — optional chains and `??` fallbacks on optimistically-typed values**,
  including five `process.stdout.columns ?? …` guards that exist precisely because
  `@types/node` declares `columns: number` (`tty.d.ts:158`) when it is genuinely
  `undefined` off a TTY.
- **8 — filters over a discriminated union that currently has one member**,
  redundant only until it gains a second.
- **1 — a literal `while (true)`.**

Acting on the first two classes would introduce bugs. The worst case is fully traced
and is now recorded as **L-04** in the ledger: `parseBootstrapAcceptedFrame` validates
the protocol version only as "some safe integer" and then casts to a literal type, so
the four comparisons that actually enforce the negotiated version — `client.ts:440`–`:441`
and `harnessAdapter.ts:402`–`:403` — are reported as dead code, *"comparison is always
false, since `1 !== 1` is false"*. Deleting them on that advice would strip the sole
version check from a socket handshake with every gate still green.

### What is adopted, and where

`noUnusedLocals` and `noUnusedParameters` go on **`tsconfig.v1.json`**, not
`tsconfig.base.json`. Base is inherited by the legacy packages, whose TUI carries 9
hits, and `legacy:verify` sits inside `verify` — so putting them in base would fail
the canonical route over code scheduled for deletion. `tsconfig.v1-tests.json`
extends `tsconfig.v1.json`, so the tests come along for free.

The backlog this creates is **8 in active source and 10 in tests**. The eight:
`HarnessInteractionView`, `QUESTION_PATTERN` (`harnessInteraction.ts:73`, `:128`),
`MAX_BATCH_QUESTIONS`, `SHA256_PATTERN` (`projection.ts:61`–`:62`), `decodedBody`
(`reviewingModel.ts:319`), `bg`, `fg`, `ReviewDiffAvailableView`
(`reviewingView.ts:2`, `:4`, `:20`).

None is a latent bug. The two unused constants in `projection.ts` are copy-paste
residue of live constants in `authoritativeStateWorker.ts:49` and `reviewing.ts:499`
— they corroborate **W-13** rather than reveal a missing validation. Checked, because
an unused validation pattern is exactly what a *skipped* check looks like.

**Not implemented here.** No `tsconfig` was edited and `pnpm verify` was not re-run.
Setting the flags is inseparable from deleting those 18 declarations, which is a code
change across Gate-proved source, and this map decides rather than executes. The Node
range decision took an explicit waiver of that rule because everything else was gated
behind it; nothing is gated behind this, so it takes no waiver. Per this ticket's own
note, the flags are an execution obligation of the **Deepen the active Modules**
package of
[Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md).
The whole change is two lines plus 18 deletions, and it should land in one commit
with a full `pnpm verify`.

### What now owns which class of problem

Nothing moves off the ledger, and that is the honest answer to the ticket's third
question. The flags own unused locals, parameters, private members, and imports —
a class the ledger never carried a single finding in. The classes it does carry stay
with it: duplication (**W-02**, **W-13**, **X-06**, **A-03**), and dead code that only
producer-side reachability analysis can find (**A-05**), which no tool measured here
attempts.

The one class that *would* have transferred is unused exports — and that is precisely
the class no linter does. Neither `recommendedTypeChecked` nor `strictTypeChecked`
contains any rule reporting a cross-file unused export; it is a different kind of tool
(`knip`-shaped), whose current behaviour is an external fact and now sits with
[Research unused-export and dead-code detection tooling](./WF-063-research-unused-export-detection-tooling.md).
**This ticket therefore does not unblock
[Audit dead code, unused exports, and test quality](./WF-060-audit-dead-code-and-test-quality.md)
on its own**; that dependency moves to the research ticket rather than disappearing.

### The `import type` invariant: not enforced, and not by a linter

Re-derived rather than inherited, and it holds: seven modules import back into
`workspace.ts` — `reviewing`, `projection`, `workspaceEvidence`, `authoritativeState`,
`workspaceIdentity`, and both `harness-interaction` files — and all seven use
`import type`. Two near-misses are not violations: `runtime.ts` imports
`bootstrapWorkspace` and `openRuntimeWorkspace` as *values*, but `workspace.ts` does
not import `runtime.ts`, so that edge closes no cycle; and `index.ts:177` is the
package's public re-export surface.

Adopting a linter for this single rule fails the same cost test as adopting one for
eight cosmetic nits, so **no**. Two mechanisms remain and neither is decided here: it
stays a review rule, or it becomes a bespoke check on the existing verify route — for
which `scripts/check-v1-dependencies.mjs` is the precedent, a hand-written Node script
already gating `pnpm verify`. The invariant has held without enforcement and nothing
has violated it, so forcing that choice now would be speculative. If it is ever
enforced, the bespoke script is the fit; execution owns the call.

### Premise check

All three **Established facts** hold. No linter or formatter configuration exists at
any depth — the only hit anywhere is a vendored `eslint.config.mjs` inside a
prototype's own `node_modules`. Root devDependencies are exactly the five named.

The third needed sharpening. "`tsconfig` compiler flags are therefore the only static
gate" is true but reads as a gap, and it is closer to the opposite: `tsconfig.v1.json`
already runs `isolatedDeclarations`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, and `noUncheckedSideEffectImports` on top of `strict` —
stricter than most repositories reach *with* a linter, which is the actual reason the
linter finds so little. The gap was never "no linter". It was two unset flags.

### Method note — a measurement that would have been a fabricated finding

The first ESLint run reported **2,450** problems, 87% of them `no-unsafe-*`. All
artifact. The probe lacked `@types/node`, so `createHash` and its neighbours resolved
to the `error` type and every member access on them was reported unsafe — the giveaway
being messages reading *"a type that could not be resolved"* rather than *"of type
`any`"*. Matching the repo's own `@types/node` and TypeScript dropped it to **281 with
zero unresolved-type messages**.

Reporting "2,450 problems" would have been this ledger's catalogued error in a new
costume: a stated condition that does not establish the stated conclusion. **Check any
static-analysis run for unresolved types before believing its counts** — a broken type
environment inflates, it does not fail.

### The reusable conclusion

The linter's value here was as a **probe, not a gate**. It could gate nothing worth
gating, and running it exactly once still produced **L-04** by pointing at a place
where the types lie. That is the shape of the answer: reach for one of these tools
when a specific question is worth asking of the whole codebase at once, run it
outside the repository, read the output as leads rather than verdicts, and add
nothing to `package.json`.
