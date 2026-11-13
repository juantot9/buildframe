---
id: WF-220
title: "Revalidate and refresh Review supporting context"
status: closed
labels:
  - wayfinder:task
parent: WF-216
assignee: juanan
blocked_by: [WF-219]
created: 2026-09-07
---

## Resolution

Settled for implementation (2026-09-08). Context currentness is one owner-local derivation beside the existing Change Set comparison, never a merge of the two. A new package-private Workspace Evidence revalidation accepts the persisted selection rules and the Snapshot basis's exact per-occurrence witnesses and publishes, after two consecutive equal derivations, the complete live candidate membership, per-occurrence currency verdicts (`current|changed|missing|unavailable|over-limit`) compared through the same segment-concatenation digest as retained-capture verification, and closed incomplete reasons (`candidate-limit|traversal-failed|inspection-failed|unstable-workspace`). Membership is complete: candidates newly present beneath included locators are enumerated and pass through the same pure admission decision, so an addition is stale exactly when the selection would admit it; movement of excluded candidates—or of candidates the selection would exclude—is irrelevant and never stale. Direct-override candidates stay relevant. Immutable contribution occurrences are never re-resolved and never stale. Reviewing's verifier returns three facts per Snapshot—comparison verdict, context verdict, and one truthful aggregate (`unverified` > `stale` > `current`)—and never asks Projection or Harness Interaction to compose checks; incomplete or unstable inspection yields `unverified`, never a silent `stale`.

Explicit refresh stays human-invoked. The existing `review.change-set.refresh` command keeps its exact-resolution comparison gate and its combined comparison-plus-context successor behavior. One new closed command, `review.context.refresh`, refreshes context alone for a current-phase Review whose latest Snapshot carries a context basis—including fixed-endpoint comparisons whose Change Set evidence is frozen; a Snapshot with neither resolvable comparison intent nor a context basis still rejects with `change-set-refresh-unavailable` semantics through the existing closed reasons. An unchanged revalidation reuses the latest Snapshot and State version and replays deterministically; a changed one commits exactly one complete successor through the shared preparation path with the same frozen comparison, the new context basis, and bounded lineage; races, replays, restarts, and failed commits never create partial or duplicate successors.

Both refresh outcomes carry one bounded, deterministic delta: comparison movement plus context per-occurrence movement (lossless locators and closed reasons) derived at the observed State version, so unchanged and changed results are equally inspectable without re-running a command. The Ask inspection identity additionally binds the selection identity/revision and the captured context semantic digest, so a selection edit between inspection and commitment invalidates the inspection. Projection reports owner-derived verdicts and deltas through bounded review views and headers, and Harness Interaction consumes the same owner-derived facts without composing checks: every accepted mutation is user-visible through Projection without callers re-deriving anything.

Pinning is one new closed selection rule action `pin` referencing one exact durable prior occurrence (`rsi_`) of the same Review's Snapshots; cross-Review context reuse remains out of scope. A pinned occurrence is treated like a contribution: frozen bytes copied from the referenced State records, provenance recording the prior occurrence, never re-resolved, never stale. At equal path specificity `pin` replaces a live `include` through the existing equal-specificity replacement; `exclude` remains a distinct corrective action. Pinning writes one selection revision only—no Snapshot rewrite, no record mutation, no history movement. Until WF-221, Harness disclosure continues to fail closed for non-empty Snapshot context.

Closed (2026-09-08). Landed as: `readContextSourceRevalidate` derives membership-complete revalidation from persisted locator intent plus exact per-occurrence witnesses (status, scope segments, concatenated-segment digest, source kind/mode/size) under two-consecutive-equal stabilization and an owner-supplied pure admission, publishing per-occurrence verdicts that include `added` for newly admitted candidates; excluded occurrences and excluded candidates never stale, and unstable/unverifiable derivations stay explicit. `ReviewSnapshotTransition.verifyPersistedContext` returns the owner-local context verdict with selection-movement and per-occurrence facts; `#verifySnapshot` aggregates comparison and context into one truthful current/stale/unverified commitment status in Reviewing, Projection headers (`snapshotStatus` plus the separate `contextStatus`), and Harness verification, and the Ask inspection identity binds the captured selection identity/revision and semantic digest. The new closed `review.context.refresh` command reuses the latest Snapshot byte-for-byte when both bases are unchanged, and otherwise atomically commits one complete context-only successor: the prior Snapshot's verified-current comparison evidence is reconstructed from its own immutable records and re-emitted under the successor identity, so no Anchor moves and no record is rewritten; both outcomes carry one bounded deterministic delta. Pinning is a closed `pin` selection action referencing one exact prior `rsi_` occurrence of the same Review: the pinned occurrence is copied from State records, marked with `pinnedFrom` provenance, never re-resolved, never stale, and replaces same-location rules through the existing equal-specificity replacement. Four scenarios in `workspaceReviewContextRevalidation.test.ts` cover additions/byte-change/excluded-irrelevance with successor lineage and Projection surfacing, pin survival across source change and deletion, dynamic-basis gate widening with comparison-movement rejection and empty-basis refusal, and mode movement with restart lineage integrity.

## Outcome

Review Snapshot currentness includes selected mutable context without collapsing it into Change Set evidence. Additions beneath included directories, source identity/content/range/mode movement, deletion, or new unavailability makes the context basis stale or unverified; movement under effective exclusions is irrelevant; immutable Editor and Artifact contributions remain fixed. Explicit refresh reuses an exactly unchanged Snapshot or atomically commits one complete successor under the same Change Set and selection rules, while deliberate pinning retains a prior exact occurrence as historical context.

## Interface

Deepen the owner-local Snapshot verifier and refresh transition to return separate comparison and context verdicts plus one truthful aggregate commitment status. Revalidation sends persisted locator intent and exact witnesses through Workspace Evidence's closed context collaboration, compares complete membership and admitted occurrence identity without timestamps, and never asks Projection or Harness Interaction to compose checks.

Extend the existing explicit refresh vocabulary rather than adding an implicit watcher: an inspection identity binds Review, latest Snapshot, selection revision, complete proposed context capture, Change Set evidence, and exact delta. An unchanged command advances no State; a changed accepted command writes one bounded successor lineage entry. A pin action references one exact durable prior capture and therefore stops following its live locator without rewriting history.

## Module seam

Reviewing owns stale/unverified interpretation and successor creation. Workspace Evidence owns coherent source derivation and retry. Projection and Harness Interaction consume the one owner-derived verdict but retain detailed blocker reasons.

## Acceptance

- [x] Included directory additions, file/range identity or byte changes, recreation, deletion, mode/availability movement, and incomplete/unstable inspection derive exact stale or unverified context reasons without mixed-time evidence.
- [x] Effective exclusions make descendant movement irrelevant; direct override candidates remain relevant; immutable Editor/Artifact occurrences do not stale when their external origins change.
- [x] Exact unchanged refresh reuses the latest Snapshot and State version; changed context commits one complete successor with the same Change Set intent and no rewritten records or moved Anchors.
- [x] Explicit pinning preserves prior exact bytes/provenance after source change or deletion; exclude and retry remain distinct corrective actions.
- [x] Context and Change Set may move together only through one coherent successor transition; race, replay, restart, and failed commit create no duplicate or partial lineage.
- [x] Focused Workspace/Projection/Harness scenarios, canonical verification, four compiled risk probes, dependency/package seams, and `git diff --check` pass with unrelated work unstaged.

## Constraints

- No watcher, silent refresh, timestamp equality, cached-byte substitution, Re-anchor Mapping, or Review Coverage behavior.
- Historical Snapshots remain fully inspectable even when no longer current or selected.
