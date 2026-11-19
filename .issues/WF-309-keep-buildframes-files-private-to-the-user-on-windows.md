---
id: WF-309
title: "Keep BuildFrame's files private to the user on Windows"
status: closed
labels:
  - wayfinder:task
parent: WF-304
assignee: juanan
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

## Resolution and evidence (2026-11-19)

Owner decision: `node:ffi`, not an external tool.

- **Where `node:ffi` exists.** Only with `--experimental-ffi`; without it
  `process.getBuiltinModule('node:ffi')` is `undefined` (checked), and worker
  threads inherit the flag. The terminal app has it. The runtime did not: it is
  now started with `--experimental-ffi` on Windows (`lifecycle.ts`; only the
  app starts the runtime, with the same Node 26). **Agent hosts never have it**:
  Pi, the Claude helper and OpenCode each call `bootstrapWorkspace` in their
  own process, which creates the State root and registry. So privacy on
  Windows has two levels, the way POSIX `chmod`s on every open:
  - every process creates BuildFrame's directories under the user's profile,
    which by default only the user, SYSTEM and Administrators can open
    (checked: `%LOCALAPPDATA%` is `O:<user>D:(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FA;;;<user>)`),
    and new directories inherit that;
  - a process with `node:ffi` replaces it with the protected list
    `D:P(A;OICI;FA;;;<user>)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)` and checks it.
- **New `@buildframe/workspace/private-directories`** (`privateDirectories.ts`,
  over `windowsSecurity.ts`, which binds seven advapi32 and five kernel32
  calls and moves security descriptors as SDDL text):
  `protectWindowsDirectory` (set and check; throws without `node:ffi`),
  `tightenWindowsDirectory` (protect when possible, else keep the inherited
  list; nothing outside Windows), `windowsDirectoryPrivacy`
  (`private`/`not-private`/`unverifiable`), the pure `accessIsPrivate`
  (owner is the user or Administrators; the list is protected; every allow
  entry is the user, SYSTEM or Administrators; deny entries are fine), and
  the locations.
- **Locations on Windows:** State and the registry in
  `%LOCALAPPDATA%\BuildFrame`, configuration in `%APPDATA%\BuildFrame`, the
  runtime directory in `%LOCALAPPDATA%\BuildFrame\runtime`. `XDG_*` still wins
  everywhere. macOS and Linux locations are unchanged (same tests).
- **Wired in:** the registry lock tightens the State root (every process);
  saving configuration tightens its directory; `runtimeLocation.ts` gains
  `prepareWindowsRuntimeDirectory` (create, refuse a link, protect, check;
  fails closed without `node:ffi`, since only the runtime prepares it) and
  `validateWindowsRuntimeDirectory` (missing, linked or no-longer-private is
  refused; `unverifiable` in an agent host). `runtimeLocationForWorkspace` still
  refuses Windows: the endpoint and its validation arrive with
  [Connect to the runtime over a named pipe](./WF-310-connect-to-the-runtime-over-a-named-pipe.md).
- **Frozen files** all shrank: `workspaceIdentity.ts` 41,399 → 41,137 bytes
  (`userStateDirectory` now calls the shared location),
  `userConfiguration.ts` 21,457 → 21,107 (its path helpers moved verbatim to
  `userConfigurationPaths.ts` and are re-exported), `lifecycle.ts` 20,323 →
  17,628 (the runtime-process messages and parsers moved verbatim to
  `runtimeProcessMessages.ts`; it is under the budget again).
- **Tests.** Pure, every platform (`privateDirectories.test.ts`): which
  access lists are private, the locations per platform and override, nothing
  outside Windows. Windows with real calls (`windowsPrivateDirectories.test.ts`,
  `runtimeLocation.test.ts`): the user's SID is read; a new directory is
  protected and reported private; a directory widened to `Users: read` is
  reported not private, then tightened; files and directories inside inherit
  only the three accounts; the runtime directory is created private,
  tightened when widened, refused when a junction stands in its place, and
  refused by clients once widened or when missing. The POSIX runtime-location
  cases skip on Windows. The boundary test pins the new subpath's exports.
- Full suite on Windows with only the native-Windows refusal patched locally:
  637 tests, 536 pass (512 after WF-308), no new failure. Fast suite: 5
  failures left (doctor needs WF-310; one symlink test, WF-306).
- **Not covered:** an owner other than the user (needs a second account);
  a runtime actually started with the flag (it cannot start on Windows until
  WF-310); arm64. Not run here: macOS and Linux; run `Verify` on `windows`.
