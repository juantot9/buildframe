---
id: WF-309
title: "Keep BuildFrame's files private to the user on Windows"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: null
blocked_by: []
created: 2026-11-19
---

## Question

BuildFrame proves its directories and files are private with POSIX owner and
mode checks. None of that means anything on Windows. Where does it keep its
files there, and how does it make and prove them private to the user?

## Evidence (2026-11-19)

- On Windows, `stat` reports `uid` 0 and mode `666` for every file and
  directory; `chmod(…, 0o600)` leaves mode `666`; `process.getuid` is
  undefined.
- `currentUserId` (`packages/local-runtime/src/runtimeLocation.ts:47`)
  throws `unsupported-platform`; `isPrivateDirectory` (`:88`) would refuse
  every directory.
- State and configuration default to XDG locations or `~/Library`:
  `userStateDirectory` (`packages/workspace/src/workspaceIdentity.ts:460`),
  user configuration (`apps/buildframe/src/userConfiguration.ts:394-397`).
  On Windows these resolve to `%USERPROFILE%\.local\state` and
  `%USERPROFILE%\.config`.
- `chmodSync` calls in the State worker (`authoritativeStateWorker.ts`
  `:361-1004`) are no-ops on Windows.
- `icacls` output is localised (Spanish on the probe machine), so it cannot
  be parsed reliably.

## Direction

- Default locations on Windows: `%LOCALAPPDATA%\BuildFrame\` for State and the
  runtime secret (WF-310), `%APPDATA%\BuildFrame\` for configuration. An
  explicit `XDG_*` value still wins, as on Linux.
- Privacy means: the owner is the current user's SID, and the access list
  grants only the current user, `SYSTEM` and `Administrators`, with
  inheritance turned off for the directory. Read and set it through
  `node:ffi` to `advapi32` (`GetNamedSecurityInfoW`/`SetNamedSecurityInfoW`
  and the current token's SID), which the app already loads for the
  renderer. Owner decision: confirm `node:ffi` for this rather than an
  external tool.
- One Windows access-control module beside `runtimeLocation.ts`; the existing
  `runtime-directory-insecure` and `runtime-endpoint-insecure` diagnostics
  keep their meaning.

## Verification

- A directory created by BuildFrame carries the expected owner and access
  list; one with an extra entry (e.g. `Users: read`) is refused with
  `runtime-directory-insecure`.
- `runtimeLocation.test.ts` has a Windows variant of each privacy case.
