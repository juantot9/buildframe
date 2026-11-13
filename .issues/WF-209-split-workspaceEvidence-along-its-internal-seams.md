---
id: WF-209
title: "Split workspaceEvidence along its internal seams"
status: closed
labels:
  - wayfinder:task
parent: WF-205
assignee: juanan
blocked_by: [WF-199]
created: 2026-09-07
---

## Question

Finding F1, part one: `packages/workspace/src/workspaceEvidence.ts` is 6,324
lines with 111 type/interface declarations — capture, verification, scoping,
limits, and identity all in one file. Decide the subdirectory module map along
the file's existing internal seams (capture vs. verification vs. scope vs.
limits), same package, no public Interface changes, and implement the split.
Same-package subdirectory modules are the default; a new package or export is
permitted only if this ticket argues the seam is load-bearing. The evidence
scenario tests travel with the split.

## Blocked by

- [Implement context source discovery and exact capture](./WF-199-implement-context-source-discovery-and-exact-capture.md) — its open children actively modify `workspaceEvidence.ts`, the file this ticket splits.

## Interface decision

Same-package subdirectory modules, no new package and no new export. The
6,557-line flat file becomes `packages/workspace/src/workspaceEvidence/` with
`index.ts` as its entry: the `WorkspaceEvidence` class, the internal
construction options, the identity/window asserts, and an explicit re-export
list of exactly the 91 names the flat file exported. In-package importers move
from `./workspaceEvidence.js` to `./workspaceEvidence/index.js`; the package
root barrel, the package `exports` map, and every consumer beyond the package
are untouched, and no behavior, protocol, or durable shape changes. A package
subpath export is deliberately not added — WF-215 curates the barrel once the
splits have settled what the surface even is.

## Module seam

Fourteen modules (`index.ts` plus thirteen) along the seams the file already
had:

| Module | Lines | Owns |
| --- | --- | --- |
| `contracts.ts` | 707 | Exported contract types, limits (`DEFAULT_LIMITS`, `checkedLimits`, `MEBIBYTE`), and `stage` |
| `internalTypes.ts` | 280 | Shared internal records and drafts (`Inspection`, `FileDraft`, `CapturedEvidence`, `PairedFacts`, …) |
| `utils.ts` | 98 | Generic helpers (`exactObject`, `deepFreeze`, byte parsing, `validateRelativePath`, `objectFormat`, `pathListCanonical`) |
| `inspection.ts` | 235 | Git process wrappers (`runGit`, `withGitInspection`), status parsing, git-object readers |
| `selection.ts` | 275 | Comparison selection normalization and validation |
| `resolution.ts` | 414 | Ref/commit/tree resolution and dynamic-reference witnesses |
| `enumeration.ts` | 426 | Status/index/tree/untracked/unstaged/diff enumeration and `inspect` |
| `scope.ts` | 315 | File-scope resolution, membership, filtering, canonical fingerprints, revision scope preparation |
| `comparisonIdentity.ts` | 499 | Endpoint identity and fingerprints, resolution identity, verification-target validation |
| `comparisonFacts.ts` | 828 | Paired enumeration and drafts, fresh working facts, resolved revision comparison inspection |
| `content.ts` | 608 | Side content facts: kinds/modes/special entries, streams, LFS pointers and payloads, gitlink checkouts, attributes |
| `capture.ts` | 845 | Draft preparation, capture planning/execution, revalidation, manifest summary and fingerprints |
| `views.ts` | 276 | Public view construction (`evidencePath`, `publicSide`/`publicFile`, `fileIdentity`, `verification`, `basis`, commit graph) |
| `index.ts` | 1,226 | The class, internal options, asserts, and the preserved export surface |

Four couplings the file had hidden inside one module were separated while
splitting, keeping the module graph acyclic: `inspect` joined enumeration (it
composes index enumeration and sparse-absence canonicalization), the git-object
readers joined inspection (they are plumbing both enumeration and capture use),
`pathListCanonical` joined utils (content and enumeration both need it), and
`stage` joined contracts (it maps a Git status code to `CurrentChangeStage`).

## Resolution

A pure move. All 271 top-level declarations were verified against the original
text: the only differences are the added `export` modifiers that cross-module
references require and seven explicit annotations that `isolatedDeclarations`
demands once a formerly private function crosses a seam (`MEBIBYTE`,
`FULL_OBJECT_ID_PATTERN`, `WORKING_FINGERPRINT_PATTERN`, the two enumeration
`maximumFiles` defaults, `recordSideBytes`' `digest`/`classification` defaults,
and `captureLargeFilePayloads`' `initialVerificationBytes`). The explicit
re-export list in `index.ts` produces the same 91 exported names as before.

The evidence scenario tests travel with the split: `workspaceEvidence.test.ts`
(2,929 lines, five describes) becomes
`workspaceEvidence{CurrentChanges,FileScoped,PerSideDegraded,Paired,Scale}.test.ts`
over a shared `workspaceEvidenceScenarios.ts` (the extracted fixtures plus an
explicit `installWorkspaceEvidenceHygiene()` that replaces the file-level
`afterEach`). The concatenated describe bodies were verified identical to the
original, and the suite keeps all 40 evidence tests.

## Acceptance

- [x] The module map follows the file's existing capture/scope/verification/
      limits seams, same package, no new package or export.
- [x] The exported surface of `workspaceEvidence` is unchanged (91/91 names)
      and consumers only moved the import path.
- [x] The evidence scenario tests travel with the split (5 files, 40 tests,
      shared fixtures) with no test loss.
- [x] Lint, format, dependency firewall, package and test typechecks, the full
      suite, builds, build smoke, and the four compiled risk probes pass.

## Completion evidence (2026-09-17)

- Tree: `workspaceEvidence.ts` is deleted; the directory holds 14 files
  (7,032 lines, largest `index.ts` at 1,226; was one 6,557-line file with 111
  type/interface declarations). Implemented in `2ef1054`.
- Move proof: 271/271 declarations matched the original modulo the added
  `export` modifiers and the seven `isolatedDeclarations` annotations; the
  five test files' concatenated describe bodies matched the original exactly;
  the `index.ts` export set equals the original 91 names with no additions or
  omissions.
- macOS Node 26.5.1: 48 files / 381 tests pass (test count unchanged; the
  split adds four scenario files), lint, format, and the dependency firewall
  pass, package and test typechecks pass, clean builds and build smoke pass,
  and all four compiled risk probes pass (`risk:state`, `risk:runtime`,
  `risk:pi` on Pi 0.80.6, `risk:dogfood`).
- CI run [`35268112886`](https://github.com/juantot9/neoflow/actions/runs/35268112886)
  is green on both engines boundaries (`verify (Node 26.5.1)` passed on the
  first attempt in 4m43s; `verify (Node 26.4.0)` passed on rerun in 5m10s, on
  `macos-latest`). The first attempt of the 26.4.0 job failed in the untouched
  `legacyReviewQueueCandidates` concurrent promotion timing scenario
  (`snapshot-unverified` instead of `state-version-mismatch`); it passes 3/3 in
  isolation on Node 26.4.0 and the rerun passes, so it is recorded as a timing
  flake, not a WF-209 regression.
- Not rerun: the manual WF-244/WF-245 pass (owner-driven, unrelated).
