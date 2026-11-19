---
id: WF-308
title: "Keep saved State durable under Windows file semantics"
status: closed
labels:
  - wayfinder:task
parent: WF-304
assignee: juanan
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

## Resolution and evidence (2026-11-19)

- New `packages/workspace/src/durableFiles.ts` holds the publishing steps both
  writers use: `renameFile`/`renameFileSync` (on Windows, retry EPERM, EBUSY
  and EACCES with waits of 10–640 ms, about 1.3 s in all, then report the last
  error; elsewhere a plain rename), `syncDirectory`/`syncDirectorySync`
  (skipped on Windows), and the worker's `fsyncPath` and
  `writeBytesDurably`, moved verbatim. Every rename in the State worker and
  the registry rename use it, not only the replacing ones: antivirus holds
  the new source file too.
- **A second Windows rule, found here:** `fsync` also fails with EPERM on a
  *file* opened read-only, because `FlushFileBuffers` needs a writable
  handle. `fsyncPath` opens with `r+` on Windows (`r` elsewhere). My earlier
  local patch swallowed EPERM from every `fsync`, so it silently skipped
  file flushes; that is why those runs looked healthier than they were.
- **The `state-invalid` failures were not a product bug.** The golden fixtures
  (`CURRENT`, `manifest.json`) are byte-exact, and Git for Windows checked them
  out with CRLF; the State correctly refused a `CURRENT` with `\r\n`. A new
  `.gitattributes` marks `packages/workspace/test/fixtures/**` as `-text`;
  an existing Windows clone needs those files checked out again once.
- The State worker has no runtime imports of its own, because in development
  Node loads it by type stripping, which does not map `.js` to `.ts`. It now
  imports `./durableFiles.ts`, and `tsconfig.base.json` sets
  `rewriteRelativeImportExtensions`, so `dist` gets `./durableFiles.js`
  (checked) and the esbuild release bundle includes it (checked).
- What Windows guarantees is written in `HANDOFF.md` ("Durability on
  Windows"): a Durable Commit is a SQLite transaction and as durable as on
  macOS and Linux; a whole-file publish (CURRENT, generations, quarantine,
  registry, marker) can roll back to the previous file after a power loss,
  never to a torn one.
- Frozen files shrank: `authoritativeStateWorker.ts` (59,569 → 59,253
  bytes), `workspaceIdentity.ts` (41,532 → 41,399). The two "fails closed when
  … directory durability cannot be confirmed" tests fault a directory flush,
  which Windows does not do; they moved verbatim to
  `workspaceIdentityDurability.test.ts` and skip on Windows, which also
  shrank the frozen `workspaceIdentity.test.ts` (7,177 → 5,948 tokens).
- Tests: `durableFiles.test.ts` (8; 2 of them Windows-only): the retry rule through an
  injected rename (busy codes retried, bounded at 8 attempts, other codes and
  other platforms never retried); a real second process holding `CURRENT`
  open for 200 ms, after which both renames replace it; one holding it past
  the bound, after which the rename reports EPERM and both files are intact;
  a file flush; directory sync skipped on Windows and performed elsewhere.
- On Windows with nothing patched, all State suites pass (41 tests:
  `authoritativeState`, both golden stores, durable codecs, durable files),
  including every migration failpoint, the crash before `CURRENT` was
  written, and a timed-out commit recovered without replay. Full suite with
  only the native-Windows refusal patched locally: 619 tests, 512 pass (498
  after WF-307); no State failure remains.
- Not run here: macOS and Linux; run `Verify` on the `windows` branch. Not
  measured: how long antivirus holds files in practice.
