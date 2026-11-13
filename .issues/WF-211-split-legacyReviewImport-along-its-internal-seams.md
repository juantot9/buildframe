---
id: WF-211
title: "Split legacyReviewImport along its internal seams"
status: closed
labels:
  - wayfinder:task
parent: WF-205
assignee: null
blocked_by: [WF-199]
created: 2026-09-07
---

## Question

Finding F1, part three: `packages/workspace/src/legacyReviewImport.ts` is
5,566 lines concentrating import, queue, receipts, and receipt-history
concerns. Decide the subdirectory module map along the file's existing seams
(import vs. queue vs. receipts), same package, no public Interface changes,
and implement the split with its scenario tests traveling alongside.

## Interface decision

The 5,566-line flat file becomes `packages/workspace/src/legacyReviewImport/`:
`index.ts` keeps `LegacyReviewImportOwnerOptions` and
`LegacyReviewImportOwner` and re-exports exactly the 110-name surface the flat
file exported, and twelve same-directory modules hold the 262 helper
declarations. Same package, no new package and no new export; the package root
barrel and `exports` map are untouched, and the in-package importers
(`workspace.ts`, `reviewing.ts`, the four scenario files, and the moved-receipt
scenarios helper) only move to `./legacyReviewImport/index.js`.

## Module seam

| Module | Lines | Owns |
| --- | --- | --- |
| `limits.ts` | 72 | Internal byte limits, identity/digest patterns, decimal bounds |
| `utils.ts` | 209 | Field validators, text windows, decimals, `deepFreeze`, `encode`/`decode`, text codecs |
| `contracts.ts` | 850 | Exported identity brands, source/queue/receipt view and command contracts, promotion request types, and the exported projection version constants |
| `internalTypes.ts` | 269 | Internal descriptors, index entries/payloads, loaded and unavailable records, the state-problem class |
| `projections.ts` | 238 | Disclosure constants, text windows and pages, receipt summaries, queue-candidate summaries |
| `records.ts` | 52 | `importRecordIdentity` and the immutable/revisioned record builders |
| `identities.ts` | 112 | Exported identity derivations and `legacyReviewStateDirectory` |
| `sources.ts` | 276 | Source descriptors, moved-receipt directory inspection, recognition summaries |
| `parsing.ts` | 748 | Every persisted and command payload parser |
| `normalization.ts` | 310 | Request and command normalizers |
| `commands.ts` | 302 | Accepted/rejected result parsers and the refusal constructor |
| `observations.ts` | 114 | Migration status, file observations, moved-receipt source summary |
| `index.ts` | 2,609 | The class, the options interface, and the preserved export surface |

The import/queue/receipts concerns map onto the modules rather than cutting
across them: import lives in sources/identities/records plus the
occurrence/decision parsers; queue in the candidate parsers, summaries, and
queue request normalizers; receipts in the receipt projections, moved-
association parsing, and observations. The module graph is acyclic:
`limits` and `contracts` are leaves, `internalTypes → contracts`, `utils →
contracts/internalTypes/limits`, and the behavior modules layer on top
(`records`, `identities`, `projections`, `sources`, `parsing`, `normalization`,
`commands`, `observations`) with `index` last. `parsing` recomputes identity
witnesses through `identities` (never the reverse) and `observations` composes
`sources` + `projections`.

## Resolution

A pure move. All 264 declarations were verified against the original by token
stream: the only differences are the added `export` modifiers, 23 explicit
annotations that `isolatedDeclarations` demands once a formerly private
declaration crosses a seam (15 `RegExp`, 4 `number`, `TextEncoder`,
`TextDecoder`, and the two `deepFreeze<…>` disclosure constants), and any
oxfmt wrapping the new import blocks require. Zero declarations were added,
removed, or altered.

The scenario suite was already organized by the ticket's seams — import
(`legacyReviewImport.test.ts`), queue (`legacyReviewQueueCandidates.test.ts`),
receipt history (`legacyReviewReceiptHistory.test.ts`), and moved receipts
(`legacyReviewMovedReceiptSources.test.ts` over
`legacyReviewMovedReceiptAssociation.scenarios.ts`) — so the tests travel as
the seven import-path lines in those files and in `workspace.ts`/`reviewing.ts`;
no test body changed and every per-file test count is unchanged.

## Acceptance

- [x] The module map follows the file's existing constant/type/helper and
      parse/normalize/project seams, same package, no new package or export.
- [x] The exported surface is unchanged (110/110 names; `index.ts` keeps the
      class and options and re-exports the rest).
- [x] The scenario tests travel with the split and every test is kept.
- [x] Lint, format, dependency firewall, package and test typechecks, the full
      suite, clean build, build smoke, and the four compiled risk probes pass.

## Completion evidence (2026-09-18)

- The split landed in `aae365a` (source + this ticket); CI run
  [`35289409102`](https://github.com/juantot9/neoflow/actions/runs/35289409102)
  is green on both engines on the first attempt (`verify (Node 26.5.1)` in
  4m16s; `verify (Node 26.4.0)` in 6m35s).
- Modules: `legacyReviewImport.ts` 5,566 → `legacyReviewImport/` with 13 files
  / 6,161 lines (largest `index.ts` at 2,609, class body 2,326; was one
  5,566-line file).
- Move proof: 264/264 declarations matched the original by token stream modulo
  the added `export` modifiers and the 23 `isolatedDeclarations` annotations;
  the index export surface equals the original 110 names with no additions or
  omissions.
- macOS Node 26.5.1: focused legacy scenario batch 5 files / 55 tests pass
  (27.83s, per-file counts identical to baseline); full suite 48 files / 381
  tests pass (333.11s, same counts as the pre-change baseline); lint (same 33
  pre-existing warnings), format:check, dependency firewall, package and test
  typechecks pass; clean build and build smoke pass; all four compiled risk
  probes pass (`risk:state`, `risk:runtime`, `risk:pi` on Pi 0.80.6,
  `risk:dogfood`).
- Not run: the manual WF-244/WF-245 pass (owner-driven).
