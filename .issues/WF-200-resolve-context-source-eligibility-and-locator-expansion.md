---
id: WF-200
title: "Resolve context source eligibility and expand bounded Context Locators"
status: closed
labels:
  - wayfinder:task
parent: WF-199
assignee: juanan
blocked_by: []
created: 2026-09-07
---

## Pre-implementation resolution (2026-09-07)

- **One closed inspect request.** `workspace.context.manifest` (Workspace Evidence read) carries `selections` (closed list, at most 64, per-path at most 4096 bytes) plus `offset`/`limit` windows bounded by the existing `maxManifestWindowFiles`. The view echoes the normalized selections, reports `status: 'complete' | 'incomplete'` with one exact `incompleteReason` (`'candidate-limit'`, `'traversal-failed'`, `'inspection-failed'`), and returns candidates in windows with `totalCandidates` and `nextOffset`. Enumeration is non-eager: metadata only (`lstat`/`readdir`), never content reads; expansion bounds itself at the settled 250,000-candidate discipline.
- **Selection intent.** Four closed forms: `workspace-file` and `workspace-directory` (repository-relative lossless path bytes, Base64), `workspace-ignored` (same, explicit bounded ignored inclusion), and `outside-checkout` (`form: 'file' | 'directory'`, host absolute path). Every selection may carry `classification: 'generated' | 'binary'` — explicit caller classification, never a guess. An ignored-untracked path chosen as `workspace-file` is accepted and marked sensitive; no rejected grey zone.
- **Facts per candidate.** `origins` (selection indices), path bytes, `sourceKind` (`regular` | `symlink` | `gitlink` | `nested-repository` | `special`), `eligibility` (`tracked` | `untracked` | `ignored-explicit` | `outside-checkout`), `gitMode`/`contentIdentity` for tracked candidates (one scoped `git ls-files -v -z`, reusing the existing index-record parser: tag S is skip-worktree, stage > 0 is unmerged), working size from `lstat`, `availability` (`available` | `working-missing` | `unavailable`) with exact absence reasons (`skip-worktree`, `missing-working-file`, `index-unmerged`, `gitlink`, `nested-repository`, `special-entry`, `unreadable`), and advisory `sensitive` (ignored-explicit and outside-checkout). Untracked candidates carry no content identity until capture; timestamps never identify. Within one request a path produced by several selections carries its smallest origin; multi-origin normalization is WF-202's job.
- **Membership.** Directory expansion walks the subtree with bounded `readdir` + `lstat`, never dereferencing symlinks (recorded as symlink candidates), never descending into directories containing `.git` (one `nested-repository` candidate each), and never broadening past the selected root. Tracked membership comes from the scoped index enumeration; ignored-untracked membership from the existing ignored `ls-files --others` enumeration; non-ignored untracked membership is walked files outside both sets. Ignored-directory selections admit everything beneath them (tracked stays eligible; ignored content flagged sensitive). A failed `readdir`/inspection makes the whole result explicitly incomplete; enumerated candidates remain visible for diagnosis. Directory selections do not list themselves; root (`''`) selects the whole checkout.
- **Outside-checkout.** The explicit host path's content is enumerated by the same walk without Git facts; the root is never followed through a symlink. Its candidates are sensitive and carry no Git identity.

## Outcome

Workspace Evidence resolves Context Source Eligibility from explicit selection intent and expands bounded Context Locators into complete per-candidate manifests. In-checkout files, bounded directories, explicit outside-checkout sources, and bounded ignored paths each resolve from caller-named intent; directory membership is complete progressive evidence over tracked files plus non-ignored untracked files; ignored untracked content is excluded by default and appears only through one bounded explicit sensitive selection. Expansion never dereferences symlinks, escapes the checkout through one, enters submodules or nested repositories, or broadens past its selected root, and incomplete membership can never look complete.

## Interface

Extend the closed Workspace Evidence view-request family with context inspect requests over explicit intent:

```text
context-source-manifest
  selections: closed list of
    exact workspace file (repository-relative lossless path)
    bounded directory (repository-relative lossless path)
    outside-checkout source (explicit absolute path, sensitive)
    bounded ignored path (explicit repository-relative lossless path, sensitive)
```

Each result carries the stable normalized selections and one manifest whose every candidate records source kind, lossless path bytes, tracked/untracked/ignored eligibility facts, Git mode or filesystem kind, size, content identity or availability, provenance (Git object, index, working tree, or outside-checkout filesystem), inclusion origin, and advisory sensitivity markers. Generated and binary classification appear only from explicit repository evidence or caller-declared user classification. A new descendant of an included directory appears as an addition on re-inspection; a deleted file stays visible as missing. Progressive presentation may defer content reads but the manifest itself is complete or explicitly incomplete with the exact reason.

No generic directory-listing, ignore-rule, or path-walk primitive becomes a Workspace method; ignore membership comes from the bounded local Git inspection context, not product-side pattern guessing.

## Module seam

`WorkspaceEvidence` owns eligibility normalization, bounded directory traversal, ignore evaluation, raw-path handling, and completeness derivation, private behind the existing inspection context. Callers never receive traversal or filesystem primitives.

## Acceptance

- [x] Exact file, bounded directory, outside-checkout, and bounded ignored selections resolve only from explicit intent; unsupported, ambiguous, or malformed selections return closed diagnostics.
- [x] Directory expansion includes tracked plus non-ignored untracked files, keeps tracked files eligible when ignore rules match, excludes ignored untracked content by default, and admits ignored content only through one bounded explicit sensitive selection.
- [x] Expansion never dereferences symlinks (including links escaping the checkout), never enters submodules or nested repositories, and never broadens beyond its selected root; symlink, Gitlink, and special entries appear as candidates with their exact kind facts.
- [x] Manifests record complete lossless path bytes, case distinctions, mode/kind, size, availability, provenance, inclusion origin, and sensitivity; incomplete membership returns an explicit incomplete reason rather than a silently truncated manifest.
- [x] Progressive inspection defers content reads without presenting truncation as completion, and re-inspection surfaces additions and deletions as exact deltas.
- [x] Focused Workspace/Runtime suites, canonical verification, the four compiled risk probes, dependency/package seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with the unrelated root package-manager bump unstaged.

## Constraints

- Read local evidence only through the bounded, provenance-isolated inspection context with `GIT_NO_LAZY_FETCH=1`; never fetch, hydrate, checkout, mutate the index/worktree, execute filters, recurse into nested repositories, or contact services.
- Timestamps and filesystem observation alone never establish equality; identity comes from exact object/content witnesses.
- Bounded traversal with explicit depth and entry limits; no watcher, prefetch, background scan, broad cache, or production instrumentation.

## Implementation (2026-09-07)

Landed as the package-private `packages/workspace/src/contextEvidence.ts` engine behind the unchanged three-method Interface: `workspace.context.manifest` reads normalize the closed selection union, enumerate index and ignored-untracked membership through the existing bounded inspection helpers (`ls-files --stage -v`, `ls-files --others --ignored`), and walk selected subtrees with `readdir`/`lstat` metadata only. One scoped enumeration per request feeds every selection; origins are assigned by selection intent (equality for file selections, subtree membership for directories); windows honor the manifest window limit with `totalCandidates`/`nextOffset`; unmerged index stages, Gitlinks, nested repositories, skip-worktree absence, raw symlinks, special entries, and outside-checkout sources all carry their settled exact facts, with `incomplete` plus an exact reason whenever traversal, inspection, or the 250,000-candidate bound prevents complete membership.

Scenario coverage lives in `packages/workspace/test/scenarios/workspaceContextEvidence.test.ts`: complete membership with default exclusions and stable byte ordering; exact addition/deletion deltas and windowing; explicit ignored and outside-checkout sensitive sources (including a nested-repository link left unfollowed); Gitlink/skip-worktree/unmerged/missing facts without recursion; and closed malformed-intent diagnostics with classification echo. Canonical `v1:verify` passed (35 files / 292 tests), all four compiled risk probes passed, and `git diff --check` is clean with the unrelated root `packageManager` bump unstaged.
