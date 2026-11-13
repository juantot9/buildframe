---
id: WF-189
title: "Capture index and working-state comparisons"
status: closed
labels:
  - wayfinder:task
parent: WF-187
assignee: juanan
blocked_by: [WF-188]
created: 2026-09-05
---

## Outcome

Workspace Evidence captures exact commit/tree-to-index, commit/tree-to-effective-working-state, and index-to-working-tree comparisons from explicit local intent. Index staging facts stay independent from effective working bytes, only the endpoint's promised untracked set is included, and every capture revalidates selectors, index facts, paths, modes, sizes, and digests before publishing. The existing HEAD-to-effective-working-state current-change path remains byte-identical.

## Interface

Extend the closed Change Set selection vocabulary with index and working-state endpoint forms that compose with the WF-188 endpoint model: one exact commit/tree side and one index or effective-working-state side, plus index-to-working-tree. Index selection names the canonical checkout's staged state as Change Set intent; effective-working-state selection names staged-plus-unstaged-plus-untracked facts exactly as the existing current-change capture already defines them. No free-form pathspec, staging command, or working-tree mutation is representable.

Captured evidence preserves per side: lossless path bytes, object/content identity, kind, Git mode, size, staging provenance (added/modified/deleted/unmerged stages from the index versus effective working bytes), availability, and evidence source. Index movement, working-byte movement, and selector movement are distinct scope-relevant facts; an index-only change stales an index-involving comparison even when every tree byte is equal. Dynamic ref/HEAD endpoints re-resolve through the WF-188 witness machinery unchanged. Unmerged index entries are explicit unavailable evidence per path, never a chosen stage side.

No new Workspace method, Git expression evaluator, index reader, or filesystem scanner becomes a separate Workspace seam. The same `workspace.review-comparison.capture`, comparison preview, and `review.comparison.start` routes accept the new forms; Reviewing's atomic start binds the previewed resolution identity exactly as for revision pairs.

## Module seam

`WorkspaceEvidence` owns strict endpoint normalization, index enumeration through the bounded inspection context (`git ls-files --stage` family and plumbing only), working-state enumeration, raw-path comparison, untracked-set derivation, and coherent three-attempt capture/revalidation. Keep index parsing, path-byte comparison, and stabilization mechanics private; they may split into internal files but remain one implementation with one external seam. Reviewing, Projection, and Harness Interaction continue delegating comparison currentness to the one owner-local verifier, which now interprets index and working witnesses without new inline logic in callers.

## Acceptance

- [x] Every commit/tree-to-index, commit/tree-to-effective-working-state, and index-to-working-tree pair captures from explicit local intent with exact per-side path bytes, identity, kind, mode, size, staging provenance, availability, and evidence source; index-only and working-only movement each produce the exact stale result.
- [x] Index-involving captures include only the promised untracked set and never consult dirty working bytes for an index endpoint's identity; tree endpoints ignore working bytes entirely.
- [x] Unmerged index stages, absent index state, unborn HEAD with index/working endpoints, and missing required structure return closed diagnostics with no first-stage fallback or invented resolution.
- [x] Capture revalidates selectors, index facts, paths, modes, sizes, and digests before publishing within the existing three attempts; a mid-capture index or working change retries and republishes only coherent successor bytes, and publish-failure races preserve the first exact facts.
- [x] The existing four historical selection forms and the HEAD-to-effective-working-state current-change path keep their exact bytes, semantics, FIFO position, and capture limits; old format-1 records keep parsing with the new fields optional.
- [x] `review.comparison.start` atomically retains index/working comparisons with resolved endpoints, witnesses, complete Snapshot records, and the command result; restart and replay preserve the first exact facts, and preview/start races reject with `comparison-changed`.
- [x] Comparison currentness stays owned once by the existing verifier, extended to index/working witnesses; a focused mutation that omits index-fact revalidation or conflates staging provenance with working bytes makes the relevant focused scenarios fail.
- [x] Local Runtime version 1 transports the new endpoint forms under existing frame bounds. Focused Workspace/Runtime suites, canonical verification, all four compiled risk probes, dependency/package seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with the package-manager bump unstaged.

## Constraints

- Read local evidence only through the existing bounded, provenance-isolated Git inspection context with `GIT_NO_LAZY_FETCH=1` and `GIT_OPTIONAL_LOCKS=0`. Never fetch, checkout, reset, stage, update the index or worktree, run a filter, recurse into nested repositories, or contact a host service.
- Keep manifest/content capture limits, the 1,000-file / 50-MiB textual floor, three attempts, two retained ephemeral captures, the 30-second Git deadline, Interface version 1, State format 2, and format-1 records. Add no path scope, refresh command, special-file expansion beyond what index/working capture requires, watcher, cache, or telemetry.
- Index and working identity come from exact bytes and index facts, never from display text, similarity, rename heuristics, or timestamps. Staging provenance is evidence, not a mutation of anything.
- Use only disposable real Git repositories and sanitized generated objects. Never inspect real user repositories, `.neoflow` state, Configuration, or receipts.

## Authority

- [Complete Change Set and Review Snapshot evidence](./WF-187-complete-change-set-review-snapshot-evidence.md)
- [Resolve exact local revision Change Sets](./WF-188-resolve-exact-local-revision-change-sets.md)
- [Define the workspace and change-set evidence contract](./WF-023-define-workspace-change-set-evidence.md)
- [Shape the Reviewing workflow](./WF-006-shape-reviewing-workflow.md)
- [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
- [Prevent checkout-controlled Git execution](./WF-096-prevent-checkout-controlled-git-execution.md)

## Resolution

Closed on 2026-09-05. `ReviewComparisonSelection` gained three closed exact-resolution forms:
`revision-to-index` and `revision-to-working-state` (basis is a fixed full-OID
`object` endpoint or a dynamic canonical `local-ref`/`HEAD`, re-resolved through
the unchanged WF-188 witness machinery) plus `index-to-working-tree`. Comparison
endpoints now carry enumeration witnesses instead of object identities only: the
`index` endpoint freezes the distinct-path count and an `indexFingerprint` over
the canonical `git ls-files --stage -z` records (mode, oid, stage, raw path
bytes, unmerged stages included); the `effective-working-state` compared state
reuses the existing current-change promise shape plus `entryCount` and a
`workingFingerprint` covering the index records, the promised untracked set
(`ls-files --others --exclude-standard`), the unstaged set (`diff-files
--no-renames`, HEAD-independent), and per-path presence/kind/mode/size/digest
facts of every dirty or untracked scope path; the `working-tree` compared state
freezes the same facts for index paths only. All fingerprints are exact sha256
values over canonical NUL-framed serializations, so any index-only, working-only,
or selector movement changes the resolution identity.

Manifests pair exact path bytes without rename heuristics. Staging provenance
stays split: the index stage is derived only from tree-versus-index facts
(added/deleted/modified/type-changed/unmerged/untracked), the working stage only
from tree/index-versus-working presence, kind, mode, and digests. Unmerged index
stages never choose a side: the index side is unavailable evidence with the new
`unmerged-index` limitation and the new `index` evidence source, while the
working bytes stay capturable. Untracked files appear only where the working
endpoint promises them and are absent from every index endpoint. Identity comes
from object ids, index facts, and exact bytes only — dirty working bytes and
unrelated HEAD movement are invisible to index endpoints, and an index-only
change stales every index-involving comparison even when every byte is equal.

Capture runs inside the same bounded, provenance-isolated inspection context
with `GIT_NO_LAZY_FETCH=1` and `GIT_OPTIONAL_LOCKS=0` and no new Git seam. Each
attempt enumerates facts, builds paired sides (tree/index object sides via
`cat-file`, working sides via bounded stabilized disk reads), plans within the
existing capture limits, then revalidates: selectors and dynamic witnesses
re-resolve, index/untracked/unstaged canonical bytes are re-enumerated, every
working fact is re-statted and re-digested, and the recomputed endpoint
fingerprints must equal the captured bytes before publishing — otherwise the
attempt retries within the existing three attempts and only coherent successor
bytes are republished. One fact walker (`freshWorkingFacts`) computes the
identical fingerprint for preview, capture coherence, and verification, so the
previewed resolution identity, the published witness, and the verified state can
never disagree. Facts whose digest is unavailable (oversized, unreadable,
special kinds) publish explicit unavailable evidence and keep verification
`unverified` instead of claiming currentness.

Currentness stays owned once by `verifyReviewComparison`, now interpreting
index/working witnesses: ref witnesses first, then the resolved revision
endpoint, then fresh enumeration fingerprints, then structural identity
validation — stale on any movement, `unverified` on inspection failure, current
only when every fact matches. Reviewing, Projection, and Harness Interaction
kept delegating without inline logic; the durable parsers accept the three new
endpoint shapes as optional format-1 fields and still parse every old record,
and the preview view now carries owner-computed `basisEndpointIdentity` and
`comparedEndpointIdentity` so the Application binds start commands without
knowing endpoint internals. The existing HEAD-to-effective-working-state path,
the four historical selection forms, FIFO retention, and all capture limits are
byte-identical; `git diff --check` and the unrelated root package-manager bump
remain untouched.

Focused real-Git scenarios prove commit/tree-to-index independence from dirty
and untracked bytes, provenance derived from index facts after a working-file
reversion, staged+unstaged+untracked working-state manifests with exact
index-only and working-only staleness and exact reversions, unmerged per-path
evidence with untracked exclusion, dynamic-ref witnesses with same-tree movement
and deletion, mid-capture index movement retry (`captureAttempts: 2`),
unborn-HEAD and malformed-selection closed diagnostics, tampered-witness
rejection, preview/capture identity equality, durable round-trips for all three
endpoint shapes plus old-record compatibility, `review.comparison.start`
binding with restart/replay preservation and a `comparison-changed` race
rejection, and byte-exact version-1 transport of both new start forms. Two
named mutations — omitting index-fact revalidation in the verifier and deriving
staging provenance from working bytes — each made the relevant focused scenarios
fail and were reverted. Canonical verification (32 files, 239 tests), the four
compiled risk probes, dependency/package seams, and `git diff --check` pass on
Node 26.5.1 / pnpm 11.20.0 with the package-manager bump unstaged.
