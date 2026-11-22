---
id: WIN-003
title: "Concurrent Workspace opens can fail on Windows"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: juanan
blocked_by: []
created: 2026-11-22
---

## Finding

In CI run 44958983631 (Windows, Node 26.4.0 only),
`workspaceIdentity.test.ts:160` opened one repository four times at once
and one attempt was refused:
`{"code":"workspace-authority-unavailable","operation":"lock-registry"}`.
The other Windows job and every macOS and Linux job passed the same test.

The registry lock (`withRegistryLock` and its helpers in
`packages/workspace/src/workspaceIdentity.ts`) creates and removes a lock
directory and an owner file, and treats any error other than `ENOENT`,
`EEXIST` or `ENOTEMPTY` as `lock-registry`. Unconfirmed: on Windows,
creating, opening or listing a directory or file that another process is
still deleting fails with `EPERM` (delete pending), where POSIX succeeds or
reports `ENOENT`. That would turn ordinary contention into a refusal.

It matters beyond tests: an agent host and the terminal app can open the
same Workspace at the same moment.

## Work

- Reproduce on the reference machine (many concurrent opens in a loop) and
  record which call fails with which code.
- Treat the delete-pending error as contention on Windows (retry within the
  existing attempts), the way WF-308 retries renames.
- `workspaceIdentity.ts` is frozen: the Windows rule goes in a new file, and
  the edit there moves out at least as much as it adds.

## Progress (2026-11-22)

- Reproduced on the reference machine: rounds of concurrent opens of one
  repository in one process were refused at `lock-registry` 2 times in 600
  opens four at a time, and 8 in 800 eight at a time.
- Traced (wrapping `fs/promises`, no source change): `mkdir` of the lock
  directory, `readdir` of it and `readFile` of an owner record failed with
  `EPERM` while another contender was removing them. Plain `unlink` and
  `rmdir` in Node remove the name at once on Windows 11, so something else
  holds a handle without delete sharing (likely antivirus); not confirmed.
- The registry lock moved out of the frozen `workspaceIdentity.ts`
  (38,700 → 28,722 bytes) into `registryLock.ts`, with `BootstrapProblem`
  in `bootstrapProblem.ts`. On Windows, `EPERM` from creating the lock
  directory, listing it, or reading or removing an owner record now waits
  and retries within the existing attempts. macOS and Linux are unchanged.
- After the change: 4,400 concurrent opens (widths 4, 8 and 16), all ready;
  the trace still shows the `EPERM`s, now waited out.
- `registryLock.test.ts` injects one `EPERM` into the lock's `mkdir` and
  into an owner `readFile`: Windows enters the lock, macOS and Linux still
  refuse. Both fail with the Windows rule disabled.

## Verification

- A stress test of concurrent opens on Windows never reports
  `lock-registry`.
