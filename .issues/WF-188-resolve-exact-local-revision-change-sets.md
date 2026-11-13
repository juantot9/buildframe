---
id: WF-188
title: "Resolve exact local revision Change Sets"
status: closed
labels:
  - wayfinder:task
parent: WF-187
assignee: juanan
blocked_by: []
created: 2026-09-02
---

## Outcome

Workspace Evidence resolves and captures explicit local commit/tree endpoint pairs and one selected-local-ref merge-base comparison. Fixed objects and dynamic refs are distinct caller intent, every dynamic input is frozen as exact evidence, and all currentness readers agree when a ref moves or disappears. Existing historical convenience selections remain byte-compatible and unchanged.

## Interface

Extend the closed `ReviewComparisonSelection` union with two semantic forms:

```text
revision-pair
  basis: fixed full object identity or dynamic full local ref / HEAD
  compared: fixed full object identity or dynamic full local ref / HEAD
  each endpoint declares commit or tree

local-ref-merge-base
  selected local full ref / HEAD
  exact full compared commit identity
```

A fixed endpoint accepts one complete lowercase object identity and exact `commit` or `tree` kind; it never infers dynamic behavior from hash/ref spelling. A dynamic endpoint accepts only `HEAD` or one bounded canonical `refs/heads/*`, `refs/tags/*`, or `refs/remotes/*` name and declares the resolved endpoint kind. Short or ambiguous ref names are not dynamic authority. Existing `last-commit`, `head-ancestry`, `commit`, and `commit-to-head` forms retain their current one-time canonicalization and behavior.

Captured comparison evidence carries the stable normalized selection, exact resolved basis and compared endpoints, and a bounded ordered dynamic-input witness containing each canonical ref, its exact direct ref object identity, and its exact peeled commit/tree identity. A merge-base capture additionally freezes its unique exact merge-base commit as the basis. The witness is optional in existing format-1 durable payloads so old Snapshot and Change Set bytes remain valid.

No Git expression evaluator, revision browser, object reader, merge-base primitive, or verification recipe becomes a separate Workspace method. The same existing `workspace.review-comparison.capture`, comparison preview, and `review.comparison.start` routes accept the new closed forms through `Workspace.read`/`execute`; no Application UI is added in this child.

## Module seam

`WorkspaceEvidence` owns strict selection normalization, local object/ref resolution, unique merge-base resolution, raw commit/tree manifest capture, dynamic-input evidence, and exact fixed/dynamic verification. Keep all Git argv and parser mechanics private behind the existing bounded inspection context.

Deepen the package-private Snapshot transition collaboration so Reviewing, Projection, and Harness Interaction ask one owner-local verifier for comparison currentness instead of independently interpreting the new witness. This is an internal seam inside the Workspace implementation, not a public verification coordinator. Reviewing remains the owner of Review/Change Set/Snapshot records and the one atomic start command.

## Acceptance

- [x] A `revision-pair` captures all four commit/tree endpoint-kind combinations from exact local objects, preserves exact endpoint kinds/identities and manifest bytes, and ignores dirty working bytes plus unrelated HEAD/branch movement for fixed objects.
- [x] Dynamic `HEAD`, local branch, tag (including annotated tag), and remote-tracking ref endpoints preserve canonical ref/direct-object/peeled-object witnesses. Moving a ref to a distinct commit with an equal tree is stale; exact reversion is current; deletion is stale; unreadable/missing required object structure is unverified.
- [x] `local-ref-merge-base` captures exactly one locally available merge-base commit against the exact compared commit. Ref movement is stale even when the merge-base/tree remains equal; missing history, no merge base, and multiple merge bases are explicit unavailable reasons with no first-result fallback.
- [x] Wrong-kind, absent, malformed, uppercase/short fixed identities, short/ambiguous/unsupported refs, extra object keys, and bounded-output/process failures return closed diagnostics. An exact zero-change pair may remain inspectable evidence but cannot start a Review or write State.
- [x] Existing four historical selection forms, root-parent behavior, merge-parent choice, commit graph, capture FIFO, immutable content windows, and old format-1 Change Set/Snapshot parsing remain unchanged.
- [x] `review.comparison.start` can atomically retain a new exact selection, resolved endpoints, dynamic witness, complete Snapshot records, and command result. Preview/start races reject rather than silently changing any endpoint; restart and replay preserve the first exact facts.
- [x] Comparison currentness is owned once and used consistently by Reviewing commands, Projection headers/actions, and Harness inspection. A focused mutation that omits dynamic direct-ref evidence or merge-base uniqueness makes the relevant scenarios fail.
- [x] Local Runtime version 1 transports the new strict selection/evidence shape under existing frame bounds. Focused Workspace/Runtime suites, canonical verification, all four compiled risk probes, dependency/package seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0.

## Constraints

- Read local evidence only. Keep `GIT_NO_LAZY_FETCH=1`, `GIT_OPTIONAL_LOCKS=0`, the absolute bounded Git runner, and the provenance-isolated configuration overlay. Do not fetch, contact a remote/host service, checkout, update refs/index/worktree, invoke a filter, or infer a pull-request target.
- A fixed endpoint is fixed because its Interface variant says so, not because its text looks hash-like. A dynamic endpoint is dynamic because its Interface variant names an eligible canonical local ref, not because Git happened to resolve a revision string.
- Ref direct-object identity and peeled endpoint identity are separate. Do not let an annotated tag, same-tree commit, or unchanged merge base hide selector movement.
- Commit and tree identities remain distinct even when they expose the same tree bytes. Do not identify endpoints, files, or renames by path, subject, display text, similarity, or content equality.
- A merge-base is valid only when exactly one locally provable result exists. No recursive/octopus heuristic, arbitrary first result, network acquisition, or prior observation supplies missing authority.
- Keep manifest/content capture limits, three attempts, two retained ephemeral captures, 30-second Git deadline, Workspace/Local Runtime Interface version 1, State format 2, and existing durable format-1 records. Add no path scope, index/working endpoint, special-file expansion, partial/LFS behavior, refresh command, UI, watcher, cache, or telemetry in this child.
- Use only disposable real Git repositories and sanitized generated objects. Do not inspect real user repositories or data. Preserve the unrelated root package-manager bump unstaged.

## Authority

- [Complete Change Set and Review Snapshot evidence](./WF-187-complete-change-set-review-snapshot-evidence.md)
- [Define the workspace and change-set evidence contract](./WF-023-define-workspace-change-set-evidence.md)
- [Shape the Reviewing workflow](./WF-006-shape-reviewing-workflow.md)
- [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
- [Prevent checkout-controlled Git execution](./WF-096-prevent-checkout-controlled-git-execution.md)

## Resolution

Closed on 2026-09-05. `ReviewComparisonSelection` gained two closed forms:
`revision-pair` with fixed full-OID `object` endpoints or dynamic canonical
`local-ref`/`HEAD` endpoints (each endpoint declares `commit` or `tree`), and
`local-ref-merge-base` with one selected canonical local ref plus one exact
compared commit. Normalization accepts only full lowercase 40/64-hex object
identities and bounded canonical `refs/heads|tags|remotes/*` or `HEAD` refs
with strict component rules; short or ambiguous names are never dynamic
authority. Fixed objects stay fixed because the variant says so — dirty
working bytes and unrelated HEAD/branch movement are irrelevant.

Dynamic evidence freezes one ordered witness per endpoint: the canonical ref,
its exact direct ref object identity (distinct from the peeled endpoint
identity, so annotated tags cannot hide movement), and the resolved
endpoint kind/identity. Merge-base resolution requires exactly one locally
provable `merge-base --all` result; none, missing history, and multiple
results are explicit unavailable reasons with no first-result fallback.
`ResolvedReviewComparison` carries `comparisonDynamicInputs` plus an exact
`rcp_<sha256>` resolution identity derived deterministically from the
normalized selection and all resolved facts; strict structural validation
requires each endpoint's `selector` to equal its selection input.

Comparison currentness is owned once by `verifyReviewComparison` on the
Workspace Evidence owner: ref witnesses first (stale on same-tree movement,
deletion, or a moved direct ref; current on exact reversion), then resolution
validity, then endpoint/manifest equality, then witness/identity equality for
unverified. Reviewing's Snapshot transition, Projection headers, and Harness
inspection all delegate to that one owner; `review.comparison.start` requires
`expectedComparisonResolutionIdentity` for exact-resolution selections, the
preview binds it into the start action's `targetIdentities`, and preview/start
races reject with `comparison-changed` instead of moving any endpoint.
`prepareCommitDrafts` now records the per-side `evidenceSource` (`commit` or
`tree`), and capture retry compares object kinds and dynamic inputs, not just
OIDs. New durable fields are optional in format-1, so old Snapshot and Change
Set bytes keep parsing; State format 2 and both Interface versions are
unchanged, and no fetch, filter, checkout, path scope, index/working endpoint,
or refresh path was added.

Focused real-Git scenarios prove all four fixed endpoint-kind combinations
(HEAD/dirty-byte independence, missing object unverified), annotated-tag
direct-versus-peeled witnesses, same-tree movement/deletion/reversion, unique
and unavailable merge bases, criss-cross ambiguity, mid-capture ref movement
retry (`captureAttempts: 2`), every selection-shape rejection, preview-bound
identity retention across start/restart/replay, durable dynamic-snapshot
codec validity, and byte-for-byte version-1 transport of the new command.
Three focused mutations — omitting the dynamic direct-ref witness, dropping
merge-base uniqueness, and bypassing the owner-local currentness delegation —
each made the relevant scenario fail and were reverted. The serialized
canonical verification lane, dependency/package seams, all four compiled risk
probes (State, Local Runtime, Pi, dogfood), and `git diff --check` pass on
Node 26.5.1 / pnpm 11.20.0 with the unrelated root package-manager bump kept
unstaged. 71 focused tests across six Workspace/Runtime files plus 21 scripted
Terminal Application tests pass, including the OpenTUI FFI runtime.
