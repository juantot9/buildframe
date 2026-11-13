---
id: WF-250
title: "Report a lost State version, not snapshot symptoms, for concurrent Reviewing commands"
status: closed
labels:
  - wayfinder:task
parent: WF-205
assignee: juanan
created: 2026-09-18
---

## Outcome

Concurrent Reviewing commands that lose the serialization race report
`state-version-mismatch` even when their Snapshot verification observed the
concurrent State write first; the `legacyReviewQueueCandidates` concurrent
promotion flake stops passing-on-rerun and becomes deterministic. No
Interface, protocol, or durable shape changes.

## Finding

`imported legacy queue candidates > serializes concurrent promotion and
enforces the aggregate promotion bound` intermittently failed with the losing
command rejected as `snapshot-unverified` at stateVersion 2 instead of
`state-version-mismatch` at stateVersion 3. Reproduced locally under 16 CPU
burners: 6/40 focused runs failed, all with the identical mode.

Mechanism: the two commands race through preparation and Snapshot
verification. `ReviewSnapshotTransition.verifyPersistedContext` takes
optimistic State-version readings (`start` … `final`); when the winning
command's Durable Commit lands between those reads, the loser's context
verification correctly returns `unverified` — and the reviewing handlers
translated that into `snapshot-unverified`, the symptom, although the
command's real fate is the lost compare-and-swap. The translation happened
before `#commit`, so the loser never reached the version check.

## Resolution

One private helper on `ReviewingOwner`, used by all seven command-level
Snapshot rejection sites (`refreshChangeSet` comparison and capture,
`refreshContext` comparison and context, `promoteLegacyQuestionCandidate`,
`commitBatch`, `completeReview`):

- When a Snapshot verification is not `current`, re-read
  `AuthoritativeState.status()`; if the State version has moved since the
  command's expected version, reject with `state-version-mismatch` at the
  current version.
- Otherwise keep the Snapshot rejection unchanged (`snapshot-stale` /
  `snapshot-unverified`), so genuine workspace movement still reports itself.

`state-version-mismatch` takes precedence because the compare-and-swap is the
single serialization authority: a moved version invalidates the command
regardless of the Snapshot verdict. The same pattern exists in
`HarnessInteractionOwner`'s Snapshot rejections (message commit and handoff
paths); there is no failing evidence for those yet, so they are noted, not
changed.

## Acceptance

- [x] 40/40 focused runs pass under the load that produced 6/40 failures
      before.
- [x] The whole `legacyReviewQueueCandidates.test.ts` file passes (15/15).
- [x] Full suite, lint, format:check, dependency firewall, typechecks, build,
      and build smoke pass: `pnpm verify` exit 0, 54 files / 382 tests in
      341.69 s.
- [x] Landed after the owner lifted the local-only hold: run
      [`35398147711`](https://github.com/juantot9/neoflow/actions/runs/35398147711)
      green on the first attempt, no rerun (`verify (Node 26.5.1)` in 6m02s).
      The same push also landed the single-engine Verify matrix (see
      `.github/workflows/verify.yml`), so this run is its first validation.

## Completion evidence (2026-09-18, local)

- Pre-fix under 16 CPU burners: 34/40 focused passes, 6 failures, all
  `snapshot-unverified` at stateVersion 2.
- Post-fix, same load: 40/40 focused passes.
- Whole file: 15/15 tests pass (96.02 s).
- Canonical `pnpm verify`: exit 0, 54 files / 382 tests in 341.69 s, with
  lint, format:check, firewall, package and test typechecks, clean build, and
  build smoke all passing.
- Landed in `91a4d1e`, riding the single-engine Verify matrix (`bb586f4`) in
  the same push; CI run
  [`35398147711`](https://github.com/juantot9/neoflow/actions/runs/35398147711)
  green on the first attempt: `verify (Node 26.5.1)` in 6m02s, no rerun. The
  workflow now runs only the pinned engine and ignores Markdown-only pushes.

## Harness-interaction counterpart (2026-09-19)

The same precedence rule now covers `HarnessInteractionOwner`'s command-level
Snapshot rejections. The class of race is real but its surface is narrower than
this ticket's Reviewing instance:

- **Direct Handoff commit races.** `#commitReviewHandoff` prepared through
  `#prepareInspection` → `#loadReviewDisclosure` → `verifyPersistedContext`,
  whose optimistic State reads turn a concurrent winner's commit into
  `snapshot-unverified` before `#commit`'s compare-and-swap. Reproduced
  deterministically with a test-only `HeldReadState` seam in
  `packages/workspace/test/scenarios/harnessInteraction.test.ts`: the gate
  holds the losing command's context-selection read inside verification until
  the winner commits. Pre-fix the loser reported `snapshot-unverified` at
  stateVersion 5; post-fix it reports `state-version-mismatch` at 6.
- **Message commit does not have the race.**
  `#revalidatePreparedReviewMessageInspection` verifies Workspace Evidence and
  never reads an optimistic State version, so a concurrent commit cannot
  produce a snapshot symptom; the loser always reaches `#commit`'s
  compare-and-swap (40/40 focused runs under 16 burners, loser reporting
  `state-version-mismatch`). No change.
- **Direct Ask has no failing evidence.** For comparison-less Current-Changes
  snapshots the ask preparation verifies Workspace Evidence, not the persisted
  State version, so no pre-commit snapshot symptom was observed (40/40 under
  burners before the fix). The command-level ask rejection site carries the
  same precedence helper as the handoff site because it is the same
  snapshot-symptom surface for comparison-bearing snapshots, but no
  deterministic reproduction exists for it yet.

Resolution: `HarnessInteractionOwner.#snapshotRejection` (same shape as
`ReviewingOwner.#snapshotRejection`) at the handoff and ask command-level
Snapshot rejection sites; `state-version-mismatch` at the current version
outranks `snapshot-stale` / `snapshot-unverified`, and every other rejection
reason is unchanged.

Verification (local, macOS Node 26.5.1):

- Deterministic gated handoff test: pre-fix failure mode recorded; post-fix
  20/20 under 16 CPU burners, calm single runs ~2.1 s.
- Whole `harnessInteraction.test.ts`: 26/26 in 60.46 s.
- Test typecheck (`tsc --noEmit -p tsconfig.tests.json`): exit 0.
- Canonical `pnpm verify`: exit 0 in 6m24s on a loaded box, 54 files / 384
  tests, with lint, format:check, dependency firewall, package and test
  typechecks, clean build, and build smoke all passing.
- `pnpm risk:pi` and `pnpm risk:dogfood`: passed.
- Landed in `39676a0`; CI run
  [`35401391785`](https://github.com/juantot9/neoflow/actions/runs/35401391785)
  green on the first attempt: `verify (Node 26.5.1)` in 5m22s, no rerun.
