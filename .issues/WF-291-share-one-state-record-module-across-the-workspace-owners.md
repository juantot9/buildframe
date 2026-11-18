---
id: WF-291
title: "Share one State record module across the Workspace owners"
status: open
labels:
  - wayfinder:task
parent: WF-289
assignee: null
blocked_by: [WF-213]
created: 2026-11-17
---

## Question

Every Workspace owner that writes State repeats the same record handling. A
Planning owner would be the fourth copy. Decide one internal module that owns
it, so an owner only states which records it writes for which command.

## Evidence (at `f7e4ac7`)

- The command sequence (recall a recorded command → check the State version →
  commit → map failure → decode the result) is written three times:
  `reviewing/index.ts:806-860`, `harnessInteraction.ts:6184-6260`,
  `legacyReviewImport/index.ts` near `:2503`.
- `encode`/`decode`: `reviewing/utils.ts:6-16`,
  `harness-interaction/utils.ts:10-20`, `legacyReviewImport/utils.ts:145-155`
  (only the thrown error class differs).
- `immutableRecord`: `reviewing/parsingReview.ts:1435`,
  `harness-interaction/records.ts:15`, `legacyReviewImport/records.ts:10`.
- `revisionedRecord`: `reviewing/records.ts:9`,
  `harness-interaction/records.ts:33`, `legacyReviewImport/records.ts:28`.
- Domain-salted identity hashing: `reviewing/identities.ts:128`,
  `harness-interaction/utils.ts:6`, `legacyReviewImport/records.ts:6`,
  `commitmentPolicy.ts:56`.
- `rejected()`: `reviewing/records.ts:28`, `harness-interaction/views.ts:22`,
  `legacyReviewImport/commands.ts:269`.
- The `rev_` identity pattern: `projection/limits.ts:54`,
  `legacyReviewImport/limits.ts:58`, `harness-interaction/limits.ts:76`.
- The shared `recordCodec.ts` (67 lines) has only structural checks.

## Direction

- One internal module beside `authoritativeState.ts`. It takes a command
  identity, the expected State version and the records to write, and owns
  recall, the version check, commit, failure mapping and result decoding.
  Owners keep their own record contents and parsers.
- Tested against the real SQLite worker (no fake); the owners' scenario
  suites prove nothing changed.
- No change to saved bytes, record kinds, checksums or command identities.

## Not decided here

Harness interaction writes Reviewing's records (`review.message`,
`review.question`, `review.response`, `review.index`, …;
`harnessInteraction.ts:6039-6042`). Whether a record kind gets exactly one
writing owner is a separate decision; this ticket only removes the copies.

## Verification

- The format-1 and format-2 golden stores open and read byte-identically.
- Owner scenario suites pass unchanged.
- `pnpm verify`, `pnpm risk:state` pass.
