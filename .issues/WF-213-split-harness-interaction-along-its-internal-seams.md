---
id: WF-213
title: "Split harness interaction along its internal seams"
status: open
labels:
  - wayfinder:task
parent: WF-205
assignee: null
blocked_by: [WF-290]
created: 2026-09-07
---

## Question

Finding F1, part five: `packages/workspace/src/harness-interaction/harnessInteraction.ts`
is 3,744 lines inside an already-extracted subpackage — the subpackage
direction is right, the file mass is not. Decide the module map within the
existing `harness-interaction/` directory (contracts already live separately),
no public Interface changes, and implement the split with its scenario tests
traveling alongside.

## Interface decision

Same-package subdirectory modules, no new package and no new export, in two
stages. Stage 1 (landed) splits the 5,515-line flat file into ten
same-directory modules: `harnessInteraction.ts` keeps
`HarnessInteractionOwnerOptions` and `HarnessInteractionOwner` (the 3,483-line
class body) plus only the imports those need, and nine new internal modules
hold the 121 formerly private declarations. `index.ts`, `contracts.ts`, and
`commitmentPolicy.ts` are untouched; the package subpath export
`./harness-interaction` (contract types only, through `index.ts`), the package
root barrel, and out-of-package consumers (`local-runtime`, `pi-adapter`) see
no change. Stage 2 (open) composes the class along its method families behind
the unchanged `execute`/`read`/`adapterHost` surface; that boundary needs owner
review before it lands.

## Module seam (stage 1)

| Module | Lines | Owns |
| --- | --- | --- |
| `limits.ts` | 89 | Internal byte limits, identifier patterns, `MESSAGE_TEMPLATE_PLACEHOLDER` |
| `internalTypes.ts` | 219 | Index entry/payload records, loaded-index records, prepared inspection/response records, `Subscription`, the two error classes |
| `utils.ts` | 125 | Text codecs, identity, encode/decode, freeze, version/bound checks, `nthLine`, `exactUtf8`, `maximumBacktickRun` |
| `normalization.ts` | 652 | Availability/destination/capability/manifest/attachment/question-anchor/message-location/command/response/evidence normalization |
| `records.ts` | 69 | `immutableRecord`, `revisionedRecord`, `emptyIndex`, and the attachment/invocation index-payload updaters |
| `parsing.ts` | 618 | Persisted destination/availability/index/compatibility/command/evidence parsing |
| `views.ts` | 77 | `rejected`, `unavailableInspection`, `projectionInvocation`, `projectionHandoff` |
| `reviewMessage.ts` | 247 | Repository-state witnesses, origin labels, template shape/render, material composition, inspection identity, commitment input |
| `anchors.ts` | 59 | `exactQuestionAnchorIsValid` |
| `harnessInteraction.ts` | 3,689 | The class body itself, `HarnessInteractionOwnerOptions`, and its imports |

Couplings resolved so the module graph stays acyclic: normalization imports
`rejected` from views (the refusal constructor is shared with the class; views
never imports backward), parsing composes normalization (never the reverse),
utils owns the codecs and the generic byte/text helpers while limits stays
constants-only, internalTypes owns the error classes that utils and parsing
throw, records (writers) is separate from parsing (readers) and is imported
only by the class, and anchors is independent. `SHA256_PATTERN` is
intentionally left duplicated between limits and the pre-existing
`commitmentPolicy.ts`; a pure move does not consolidate it.

## Resolution (stage 1, 2026-09-18)

A pure move. All 123 top-level declarations (121 helpers plus the two owner
declarations) were verified against the original by token stream: the only
differences are the added `export` modifiers, 31 explicit annotations that
`isolatedDeclarations` demands once a formerly private declaration crosses a
seam (19 `RegExp`, 9 `number`, `TextEncoder`, `TextDecoder`,
`ReadonlySet<string>`), and four signatures that oxfmt wraps (with a trailing
comma) because `export ` pushes them past 120 columns. Zero declarations were
added, removed, or altered; the class declaration itself is token-identical.

The scenario suite needs no test travel in stage 1: it imports only
`harness-interaction/index.js` and `harness-interaction/commitmentPolicy.js`,
so no test file moved and no test changed.

## Acceptance (stage 1)

- [x] The module map follows the file's existing constant/type/helper and
      normalization/parsing/projection seams, same package, no new package or
      export.
- [x] The exported surface is unchanged (`index.ts` untouched;
      `harnessInteraction.ts` still exports exactly
      `HarnessInteractionOwnerOptions` and `HarnessInteractionOwner`).
- [x] The scenario suite still pins the class with no test changes.
- [x] Lint, format, dependency firewall, package and test typechecks, the full
      suite, clean build, build smoke, and the four compiled risk probes pass.

## Completion evidence (2026-09-18)

- Stage 1 landed in `89116b8` (source + this ticket); CI run
  [`35285588923`](https://github.com/juantot9/neoflow/actions/runs/35285588923)
  is green on both engines (`verify (Node 26.5.1)` green on the third attempt
  in 4m50s; `verify (Node 26.4.0)` green in 4m25s).
- Modules: `harnessInteraction.ts` 5,515 → 3,689 lines (class body 3,483); the
  directory is 13 files (was 4) with the three pre-existing files
  (`index.ts`, `contracts.ts`, `commitmentPolicy.ts`) untouched.
- Move proof: 123/123 declarations matched the original by token stream modulo
  the added `export` modifiers and the 31 `isolatedDeclarations` annotations.
- macOS Node 26.5.1: scenario file 24/24 (53.04s); full suite 48 files / 381
  tests pass (same counts as the pre-change baseline, 334.65s); lint,
  format:check, dependency firewall, package and test typechecks pass; clean
  build and build smoke pass; all four compiled risk probes pass
  (`risk:state`, `risk:runtime`, `risk:pi` on Pi 0.80.6, `risk:dogfood`).
- Not run: the manual WF-244/WF-245 pass (owner-driven).

CI flake record (both tests untouched by WF-213): the first attempt failed on
Node 26.5.1 in `legacyReviewQueueCandidates`' concurrent promotion timing
scenario (`snapshot-unverified`/stateVersion 2 instead of
`state-version-mismatch`/stateVersion 3 — the same flake WF-209 recorded, on
the other engine); the second attempt failed on Node 26.5.1 in
`apps/neoflow/test/scenarios/reviewingApplication.test.ts`'s wheel-scroll
scenario (`Timed out waiting for hovered Message to expand within bounds`
after 83.4s; the test takes 3.4s in the local full-suite run). Each file
passes 3/3 in isolation on Node 26.5.1 (15/15 and 25/25 per run) and in the
local 381-test full suite, so both are recorded as runner timing flakes, not
WF-213 regressions.

## Stage 2 (open design question)

> **2026-11-17:** stage 2 is now part of
> [WF-289](./WF-289-prepare-the-code-for-parallel-connectors-and-features.md)'s
> shared clean-up and waits for
> [Refuse the retired User Pull write commands](./WF-290-refuse-the-retired-user-pull-write-commands.md),
> which removes ~2,000 lines first. The class is 6,305 lines at `f7e4ac7`.

The class statement is still 3,483 lines and ~50 methods. The proposed
composition follows the method families the class already has: adapter
establishment and evidence acceptance; message inspection/revalidation/commit;
ask inspection and anchor resolution; handoff inspection/commit; interruption;
index/record IO and command recall; projection/subscription scheduling. The
open questions are the collaborator boundaries themselves: one internal
collaborator surface or several, how the prepared-inspection caches and the
index/record IO stay coherent across families, and how the directive/commit
path splits without duplicating the commit sequence. Stage 2 must keep
`execute`/`read`/`adapterHost` unchanged, is pinned by the scenario suite, and
deserves owner review of the collaborator boundaries before it lands.
