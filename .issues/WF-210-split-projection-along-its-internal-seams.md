---
id: WF-210
title: "Split projection along its internal seams"
status: closed
labels:
  - wayfinder:task
parent: WF-205
assignee: null
blocked_by: [WF-199]
created: 2026-09-07
---

## Question

Findings F1 and F3, part two: `packages/workspace/src/projection.ts` is 3,378
lines and reaches ~32 indentation levels in nested conditional-type and
ternary chains mapping view requests to components. Decide the subdirectory
module map along the projection's internal seams (files, diff rows, questions,
views) and flatten the request→component pyramid with lookup tables or
one-decision-per-function refactors — no public Interface changes, projection
scenario tests travel with the split.

## Blocked by

- [Implement context source discovery and exact capture](./WF-199-implement-context-source-discovery-and-exact-capture.md) — projection is shared state the context-source work mutates.

## Reconnaissance (2026-09-18)

The file has since grown to 5,370 lines and 177 top-level declarations. Its
only in-package consumer is `workspace.ts` (one import block); the scenario
`workspaceProjection.test.ts` (987 lines, one describe, 9 tests) pins it
through public paths.

Anatomy:

| Region | Lines | Contents |
| --- | --- | --- |
| Constants | 98–128 | Limits and identity patterns |
| Contracts | 130–1460 | 25 view-request types, 25 view types, the failure/update types, and the 25-branch nested conditional `WorkspaceProjectionViewFor` |
| Options | 1462–1470 | `ProjectionOptions` |
| Internal types | 1472–1530 | `LoadedIndex`, search-index records, `ProjectionSubscription`, `LiveCaptureEntry`, two error classes |
| Helpers | 1532–1608, 1879–1897 | `permanentProjectionRecordFailure`, `deepFreeze`, identity derivations, snippet/window helpers |
| Normalization | 1610–1877 | `normalizeRequest`, a 268-line if-chain over the 25 kinds with shared identity/window checks |
| View helpers | 1899–2189 | `contentStatus` through `homeItem` |
| Class | 2192–5370 | `WorkspaceProjection`, 3,179 lines and ~60 methods |

The measured deepest indentation is 26, at the `WorkspaceProjectionViewFor`
conditional type (lines 1403–1454) — the F3 pyramid. The runtime chains
(`normalizeRequest` and `#readOnce`) are long but flat (deepest runtime
nesting is 11), and `#readOnce` already stages its 25 arms in three phases:
`review.command-result` before the index, `home`/`comparison-preview`/
`commit-graph` before the entry lookup, the rest after it. The app-side
request→component chains live in `apps/neoflow/src/reviewing{Model,Application}.ts`
and are outside this ticket.

Class method families: subscription/live-invalidation scheduling (7);
index/record IO (4); context/snapshot reads (9); review views —
home/manifest/versions/bases/messages (14); live capture and diff (9);
search (5); questions (3); dispatch/header/cache (5).

## Proposed design (draft — owner review before implementing)

**Stage 1 — module map (pure move).** `projection.ts` becomes
`packages/workspace/src/projection/`: `index.ts` keeps `WorkspaceProjection`
and `ProjectionOptions` plus an explicit re-export of the unchanged surface,
and six modules hold the rest verbatim.

| Module | Approx. lines | Owns |
| --- | --- | --- |
| `limits.ts` | 31 | Limits and patterns |
| `contracts.ts` | 1,330 | All exported contracts and the view map |
| `internalTypes.ts` | 59 | Internal records and error classes |
| `utils.ts` | 96 | `deepFreeze`, identities, snippet/window helpers |
| `normalization.ts` | 268 | `normalizeRequest` |
| `views.ts` | 291 | Projection helpers (`contentStatus` … `homeItem`) |
| `index.ts` | ~3,250 | The class, options, and the preserved surface |

The ticket's "files, diff rows, questions, views" are the class's view
families, not helper-module boundaries; the helper region has no diff-row
functions (those are class methods today), so the proposed modules follow the
file's actual type/helper seams and the families stay visible in the class's
method groups. Move proof and export-surface checks reuse the WF-211/212
pipeline.

**Stage 2 — F3 flattening.** (a) Replace the nested conditional with a flat
lookup map: `interface WorkspaceProjectionViewByKind { 'workspace.home':
WorkspaceHomeView; … }` and
`type WorkspaceProjectionViewFor<Request extends WorkspaceProjectionViewRequest> =
WorkspaceProjectionViewByKind[Request['kind']]`. Same exported name and
signature; 25 nesting levels removed. (b) Rewrite `normalizeRequest` as a flat
`switch (request.kind)` with one normalizer function per kind over shared
`assertReviewIdentity`/`assertWindow` helpers, `default` throwing the same
`TypeError`. (c) Rewrite `#readOnce` with a typed handler table keyed by kind
(a mapped type over the kind union makes totality compile-time) plus the three
existing phase guards; each handler delegates to the existing private method,
so behavior is identical. Both runtime refactors are pinned by the scenario
suite; the compile-time totality check covers kinds the suite does not
exercise.

**Stage 3 — class composition (open decision).** The 3,179-line class can stay
in `index.ts` after stages 1–2 (~3,250 lines), or its families can be extracted
into module-scope functions over a shared `ProjectionContext`
(state/evidence/snapshot transition/caches plus the shared readers), or into
internal collaborator classes. The family extraction is what the ticket's
module words describe but it is the design-heavy part: the families share the
live-capture, search-index, and snapshot-status caches and the
`#snapshot`/`#snapshotStatus`/`#header` readers. Recommend deciding it at a
second gate after stages 1–2 land and are pinned.

**Scenario travel.** `workspaceProjection.test.ts` splits order-preserving into
three files over a shared scenarios module with an explicit hygiene installer,
the WF-212 pattern: `workspaceProjectionLive.test.ts` (tests 1–3: hints,
coalescing, continuation), `workspaceProjectionWindows.test.ts` (tests 4–6:
envelopes, manifest/diff windows, exact source line),
`workspaceProjectionSearch.test.ts` (tests 7–9: search, actions, capture
reuse). Test bodies travel token-identical in the original order.

**Verification plan.** Stage 1: move proof (177/177 token-identical), export
surface equality, test-travel proof (9/9), focused projection batch, full
suite, lint/format/firewall, package and test typechecks, build + smoke + the
four risk probes. Stage 2: the same suite plus the compile-time totality of
the handler table and the unchanged `.d.ts` name/semantics for
`WorkspaceProjectionViewFor`. Each stage is its own implementation commit.

**Open questions for the owner.** (1) Scope: stages 1+2 only, or include the
stage-3 composition? (2) Runtime dispatch in stage 2: typed handler table (as
proposed) or an exhaustive switch? (3) Test travel: proceed with the
three-file split?

Decided 2026-09-18: stages 1+2 now with the class composition deferred to a
second gate; runtime dispatch flattened as an exhaustive switch (the cast-free
total lookup); test travel as the three-file split.

## Implementation (2026-09-18)

Stage 1 — the pure move. `projection.ts` (5,370 lines) becomes
`projection/` (7 files, 5,814 lines): `index.ts` keeps `WorkspaceProjection`
and `ProjectionOptions` plus the explicit re-export of the unchanged surface,
and `limits` (63), `contracts` (1,354), `internalTypes` (68), `utils` (109),
`normalization` (419), and `views` (331) hold the helper declarations. Move
proof: 177/177 declarations token-identical to the original modulo the added
`export` modifiers and 15 `isolatedDeclarations` annotations (7 `RegExp`, 8
`number` — fourteen constants and the one `textPreview` window default);
export surface 106 = 106; only `workspace.ts` moved to
`./projection/index.js`.

The scenario tests travel: `workspaceProjection.test.ts` (987 lines, one
describe, 9 tests) becomes
`workspaceProjection{Live,Windows,Search}.test.ts` (3/3/3) over the shared
`workspaceProjectionScenarios.ts` (fixtures, the four open helpers, and an
explicit `installWorkspaceProjectionHygiene()` replacing the in-describe
`afterEach`); the 9 test bodies are token-identical in the original order.

Stage 2 — the F3 flattening.

- `contracts.ts`: the 25-branch nested conditional is replaced by the flat
  `WorkspaceProjectionViewByKind` map and `WorkspaceProjectionViewFor<Request> =
  WorkspaceProjectionViewByKind[Request['kind']]` (same name and signature);
  the deepest indentation in contracts drops from 26 to 4.
- `normalization.ts`: `normalizeRequest` becomes a flat 25-case switch with one
  normalizer function per kind plus the shared `assertReviewIdentity`; each
  normalizer body is the original if-block verbatim, and `default` throws the
  same `TypeError`.
- `index.ts`: `#readOnce`'s 25-arm if-chain becomes a flat exhaustive switch
  (no type assertions; totality is compile-time), preserving the original
  phase behavior: `review.command-result` returns before the index load,
  `workspace.home`/`review.comparison-preview`/`review.commit-graph` skip the
  entry lookup, and every other kind keeps the same lookup and method. The
  switch is the total lookup the proposal wanted and keeps the module
  cast-free instead of bridging a handler table with an assertion.

Stage-2 delta proof: of the 177 original declarations, 174 remain
token-identical; exactly `WorkspaceProjectionViewFor`, `normalizeRequest`, and
`WorkspaceProjection` changed, and 26 declarations were added — the view map,
the 24 per-kind normalizers, and the shared assert.

## Completion evidence (2026-09-18)

- Focused projection batch: 3 files / 9 tests pass (17.90s).
- Full suite: 54 files / 381 tests pass (356.18s; the test travel adds two net
  files, same test count).
- lint (same 33 pre-existing warnings), format:check, dependency firewall,
  package and test typechecks pass; clean build and build smoke pass; all four
  compiled risk probes pass (`risk:state`, `risk:runtime`, `risk:pi` on Pi
  0.80.6, `risk:dogfood`).
- CI: stage 1 (`86fca7c`) is run
  [`35339654902`](https://github.com/juantot9/neoflow/actions/runs/35339654902)
  and stage 2 (`3f72ec2`) is run
  [`35341314625`](https://github.com/juantot9/neoflow/actions/runs/35341314625),
  both green on both engines. The app-side `reviewingApplication.test.ts`
  wheel-scroll scenario is now the dominant load-sensitive CI flake: it failed
  stage 1's first 26.5.1 attempt, stage 2's first 26.4.0 attempt (90s test
  timeout), and WF-213's second attempt, while the file passes in every local
  full-suite run and in 2/3 isolation runs under a 9.2 load average (the one
  local failure was a different wait in the same file). WF-210 touches neither
  the app nor those waits, and stage 1 is a pure move that flaked too, so both
  reruns are recorded as runner timing flakes; stabilizing that scenario
  deserves its own follow-up.
- Not run: the manual WF-244/WF-245 pass (owner-driven).
