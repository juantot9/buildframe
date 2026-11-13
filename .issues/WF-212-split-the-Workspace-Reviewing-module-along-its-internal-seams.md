---
id: WF-212
title: "Split the Workspace Reviewing module along its internal seams"
status: closed
labels:
  - wayfinder:task
parent: WF-205
assignee: null
blocked_by: [WF-199]
created: 2026-09-07
---

## Question

Finding F1, part four: `packages/workspace/src/reviewing.ts` is 5,103 lines
concentrating the Reviewing domain state machine. Decide the subdirectory
module map along its internal seams, same package, no public Interface
changes, and implement the split with its scenario tests traveling alongside.

## Interface decision

The 10,435-line flat file becomes `packages/workspace/src/reviewing/`:
`index.ts` keeps `ReviewingOwnerOptions` and `ReviewingOwner` (the 2,503-line
class) and re-exports exactly the 182-name surface the flat file exported, and
thirteen same-directory modules hold the 322 helper declarations. Same
package, no new package and no new export; the package root barrel and
`exports` map are untouched, and the in-package importers move to
`./reviewing/index.js`.

## Module seam

| Module | Lines | Owns |
| --- | --- | --- |
| `identities.ts` | 188 | Identity brands, identity contract types, and the identity derivations |
| `contracts.ts` | 672 | Exported context/anchor/command/result contracts and `ReviewBasisCommit` |
| `internalTypes.ts` | 678 | Index entries/payloads, captured and prepared records, the state-problem class |
| `limits.ts` | 53 | Internal byte limits and identity patterns |
| `utils.ts` | 122 | Text codecs, freeze, `encode`/`decodeReviewingPayload`, bounded identity, timestamps, `contentEqual`, `nthLine` |
| `context.ts` | 542 | Context source/contribution normalization, rule ranking, candidate decisions |
| `normalization.ts` | 491 | Anchor and command normalization |
| `parsingEvidence.ts` | 953 | Evidence, comparison, and changed-file parsers |
| `parsingCommands.ts` | 1,377 | Context selection/contribution, accepted-command, and index parsers, plus `parseReviewBasisCommit` |
| `parsingReview.ts` | 1,459 | Snapshot context, basis, message, snapshot, question, draft, and response parsers |
| `records.ts` | 83 | State-record builders, the refusal constructor, and index replaces |
| `diff.ts` | 419 | Line/diff builders, exact anchors, snapshot-context matching, projected capture records |
| `transition.ts` | 1,379 | `ReviewSnapshotTransition` and `capturedSnapshotMatches` |
| `index.ts` | 2,860 | `ReviewingOwner`, the options interface, and the preserved export surface |

Four couplings needed a seam decision to keep the graph acyclic:
`ReviewBasisCommit` moved into contracts because an exported accepted view
embeds it; `ProjectedReviewCaptureFile`/`ProjectedReviewCapture`/
`PreparedReviewSnapshot` moved into diff because they are typed by
`ReturnType<typeof buildReviewDiff>`; the parsers split by dependency layer
rather than input kind — evidence parsers are a leaf, command/index parsers
compose the context parsers, and review parsers compose both, with
`parseReviewBasisCommit` joining the command group because
`parseReviewingCommandAccepted` composes it; and `contentEqual`/`nthLine`
joined utils so utils no longer depends on records. The module graph is
acyclic: identities/limits/contracts are leaves, internalTypes and utils layer
on them, and the behavior modules layer on top with index last.

## Resolution

A pure move. All 324 declarations were verified against the original by token
stream: the only differences are the added `export` modifiers and 12 explicit
annotations that `isolatedDeclarations` demands once a formerly private
declaration crosses a seam (6 `number`, 3 `RegExp`, `TextEncoder`,
`TextDecoder`, and `typeof reviewingRecordIdentity`), plus the oxfmt wrapping
the new import blocks require. Zero declarations were added, removed, or
altered.

The scenario tests travel with the split: `workspaceReviewing.test.ts`
(3,060 lines, one describe, 25 tests) becomes five seam-aligned files —
`workspaceReviewing{Diff,Basis,Comparison,Context,Questions}.test.ts` (2, 7, 9,
3, and 4 tests) — over a shared `workspaceReviewingScenarios.ts` that holds the
fixtures, helpers, owners/roots state, and an explicit
`installWorkspaceReviewingHygiene()` replacing the in-describe `afterEach`. The
25 `it` bodies are token-identical to the original in the original order.

## Acceptance

- [x] The module map follows the file's existing identity/contract/parse/diff/
      transition seams, same package, no new package or export.
- [x] The exported surface is unchanged (182/182 names; `index.ts` keeps the
      owner and options and re-exports the rest).
- [x] The scenario tests travel with the split and every test is kept.
- [x] Lint, format, dependency firewall, package and test typechecks, the full
      suite, clean build, build smoke, and the four compiled risk probes pass.

## Completion evidence (2026-09-18)

- The split landed in `7221c77` (source + this ticket); CI run
  [`35329656738`](https://github.com/juantot9/neoflow/actions/runs/35329656738)
  is green on both engines on the first attempt (`verify (Node 26.5.1)` in
  5m59s; `verify (Node 26.4.0)` in 3m58s).
- Modules: `reviewing.ts` 10,435 → `reviewing/` with 14 files (largest
  `index.ts` at 2,860, class body 2,503; was one 10,435-line file).
- Move proof: 324/324 declarations matched the original by token stream modulo
  the added `export` modifiers and the 12 `isolatedDeclarations` annotations;
  the index export surface equals the original 182 names with no additions or
  omissions.
- Test travel proof: the five split files hold 25/25 tests whose bodies are
  token-identical to the original, in the original order.
- macOS Node 26.5.1: focused reviewing batch 5 files / 25 tests pass (38.46s);
  full suite 52 files / 381 tests pass (368.31s, same test count as the
  pre-change baseline); lint (same 33 pre-existing warnings), format:check,
  dependency firewall, package and test typechecks pass; clean build and build
  smoke pass; all four compiled risk probes pass (`risk:state`,
  `risk:runtime`, `risk:pi` on Pi 0.80.6, `risk:dogfood`).
- Not run: the manual WF-244/WF-245 pass (owner-driven).
