---
id: WF-308
title: "Keep saved State durable under Windows file semantics"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: null
blocked_by: []
created: 2026-11-19
---

## Question

The State worker and the Workspace identity registry rely on POSIX file
semantics for durability: `fsync` on a directory after a rename, and
`rename` that atomically replaces a file even if someone has it open. What
does a Durable Commit promise on Windows, and how do the writers keep it?

## Evidence (2026-11-19)

- `fsync` on a directory handle fails with EPERM on Windows. It is called
  after every publishing rename: `fsyncPath`
  (`packages/workspace/src/authoritativeStateWorker.ts:212`) and
  `syncDirectory` (`packages/workspace/src/workspaceIdentity.ts:975`). This
  makes the marker write fail (`workspace-authority-unavailable`,
  `write-marker`).
- `rename` over a file that another handle has open fails with EPERM. The
  `CURRENT` pointer (`authoritativeStateWorker.ts:368`) and the registry
  (`workspaceIdentity.ts:1005`) are replaced this way; antivirus and the
  search indexer open files briefly.
- With directory `fsync` tolerated, 4 State tests still fail with
  `state-invalid` where `state-migration-failed` is expected
  (`authoritativeState.test.ts`), plus one each in the two golden-store
  tests. Not yet diagnosed.
- `link` (`workspaceIdentity.ts:873`), `open(…, 'wx')` and SQLite locking
  work.

## Direction

- Put Windows file primitives in one new module (directory sync, replacing
  rename, removal), used by both writers. The frozen files only gain calls.
- Directory sync is a no-op on Windows. NTFS journals metadata, so a
  completed rename survives a crash, but the order of writes is weaker than
  `fsync` of the directory. Write down what that means for a Durable Commit
  in `HANDOFF.md` rather than claiming the POSIX guarantee.
- A replacing rename retries for a short bounded time on EPERM, EBUSY or
  EACCES, then fails with the existing diagnostic. It never deletes the
  target first.
- Diagnose the `state-invalid` vs `state-migration-failed` failures before
  choosing anything for quarantine.

## Verification

- The crash and fault-injection evidence from WF-015 runs on Windows: a
  reported Durable Commit survives immediate termination of the worker.
- A reader holding `CURRENT` open while a commit publishes: the commit
  completes after the retry, or fails visibly.
- `authoritativeState*.test.ts` passes on Windows; macOS and Linux bytes
  unchanged.
