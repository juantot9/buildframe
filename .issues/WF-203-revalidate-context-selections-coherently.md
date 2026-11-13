---
id: WF-203
title: "Revalidate context selections coherently"
status: closed
labels:
  - wayfinder:task
parent: WF-199
assignee: juanan
blocked_by: [WF-202]
created: 2026-09-07
---

## Pre-implementation resolution (2026-09-07)

- **One closed verify read.** `workspace.context.verify` (read) takes one retained `captureIdentity`, re-derives the complete manifest for the capture's selections with the settled bounded retry (two consecutive equal derivations before verdicts publish; continued movement returns `status: 'unstable'` with no mixed-time verdicts), and derives for every captured item exactly one currency: `current`, `changed`, `missing`, `unavailable`, or `over-limit`. Incomplete or unknown scope returns `status: 'unverifiable'` with the exact reason and blocks any downstream commitment rather than becoming an acknowledged omission.
- **Currency is evidence, never timestamps.** Equality is decided by exact witnesses: working-size and tracked source identity from re-derivation plus the SHA-256 of current working bytes (bounded by `maxVerifiedFileBytes`) compared against the capture's `contentDigest`. A captured item whose source vanished is `missing` when the working path is absent and `unavailable` when the path exists but is unreadable or special. A captured item that grew beyond the capture limit is `over-limit` with its exact size. A formerly `unavailable` or `over-limit` item stays in that currency while its reason persists and becomes `changed` the moment its evidence becomes capturable again. Selection classifications and sensitivities never affect currency.
- **Refresh stays a proposal.** The verdicts are the delta: `changed` and `missing` items are the proposal surface for a successor, which is always a NEW capture request minting a new `cctx_` identity — no refresh ever rewrites a retained capture, and an all-`current` verify reuses existing records and advances no State. Additions (paths now present beneath the selections but absent from the capture) continue to surface through manifest re-inspection per WF-200; the verify view stays scoped to the captured items.
- **Read-only, bounded.** Verify performs no Git mutation, fetch, or filter execution; its reads stay within the bounded inspection context and the verified byte limits, and no watcher, prefetch, or cache is introduced.

## Outcome

Workspace Evidence makes context capture and revalidation coherent. One revalidation resolves the normalized selection, records the manifest and admitted bytes, then revalidates every included identity, membership fact, range, mode, size, and digest with the settled bounded retry before publishing. Each item derives exactly one of current, changed, missing, unavailable, and over-limit; a changed source proposes a successor capture without rewriting any prior capture; continuing movement publishes no mixed-time result, and unknown scope blocks downstream commitment instead of becoming an acknowledged omission.

## Interface

Extend the closed Workspace Evidence context family with one coherent verify request over a normalized selection:

```text
context-selection-verify
  normalized selection identity (from normalization)
```

The result carries per-item current/changed/missing/unavailable/over-limit facts with exact reasons, the aggregate stability verdict for the whole selection, and, when stable, the resolved manifest plus admitted bytes as one self-contained successor record. Relevant movement receives the settled small bounded retry (at most the existing three attempts); continued instability preserves prior evidence and publishes diagnostics instead of a mixed-time successor. Refresh semantics remain re-proposals: nothing rewrites an immutable capture, and unchanged revalidation reuses existing records without advancing State.

## Module seam

`WorkspaceEvidence` owns the one coherent capture-then-revalidate walker and fact derivation, private behind the existing seam; Reviewing and Planning (P21) will consume the closed verdicts rather than composing their own checks.

## Acceptance

- [x] Stable selections derive exact current facts; identity, membership, range, mode, size, or digest movement derives changed; removed paths derive missing; unreadable or unstable sources derive unavailable with the exact reason; over-limit derives its named limit.
- [x] Bounded retry absorbs transient movement; continuing movement publishes diagnostics and preserves prior evidence with no mixed-time successor.
- [x] A changed item proposes a successor capture as a new immutable record; unchanged revalidation reuses existing records and advances no State; timestamps never establish equality.
- [x] Incomplete membership or unknown scope blocks commitment with an explicit reason instead of an acknowledged omission.
- [x] Focused Workspace/Runtime suites, canonical verification, the four compiled risk probes, dependency/package seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with the unrelated root package-manager bump unstaged.

## Constraints

- One walker feeds verification; no per-caller verification recipes, no watcher, prefetch, background scan, broad cache, or production instrumentation.
- Read-only, bounded, no-fetch/no-filter; provenance recorded on every check, but verification stays a projection over immutable facts.

## Implementation (2026-09-07)

Landed in `packages/workspace/src/contextEvidence.ts` behind the unchanged three-method Interface. Retained captures now carry the settled candidate-fact fingerprints at capture time; `workspace.context.verify` re-derives the complete manifest for the capture's selections until two consecutive derivations agree (within `maxCaptureAttempts`), then derives one exact currency per captured item: digest comparison against the capture's `contentDigest` (size and tracked source identity as witnesses) for `current`/`changed`, `missing` for vanished or absent working paths, `unavailable` with the current absence reason, and `over-limit` with the exact size beyond the capture limit. Formerly unavailable or over-limit items become `changed` the moment their evidence is capturable again. Incomplete or unknown scope publishes `unverifiable` with its reason; continued instability publishes `unstable` with no verdicts; nothing is rewritten and State never advances.

Scenario coverage in `packages/workspace/test/scenarios/workspaceContextEvidence.test.ts`: settled all-current verification with byte-identical repeats; equal-size content changes detected by digest comparison for tracked and untracked sources; removal, special-entry, and exact over-limit movement; an under-limit-again source reporting `changed`; a single-derivation budget failing closed as `unstable`; and a sealed directory blocking verification as `unverifiable` until readable. Canonical `v1:verify` passed (35 files / 299 tests), all four compiled risk probes passed, and `git diff --check` is clean with the unrelated root `packageManager` bump unstaged.
