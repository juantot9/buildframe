---
id: WF-304
title: "Run BuildFrame natively on Windows"
status: open
labels:
  - wayfinder:map
parent: WF-051
assignee: juanan
blocked_by: []
created: 2026-11-19
---

## Destination

BuildFrame installs and runs on native Windows 10/11 (x64 first, arm64 when
there is a machine to prove it) with the same product as on macOS and Linux:
the TUI in a Windows console, the per-workspace runtime, durable State, git
inspection, and the agent connectors. No WSL2. No Developer Mode, no
administrator rights.

Windows keeps the same guarantees in its own way: the runtime connection and
the saved State stay private to the user who owns them, git inspection never
runs checkout-controlled code, and a reported Durable Commit survives a crash.
Where Windows cannot give the same guarantee (directory `fsync`), the
difference is written down, not hidden.

## Owner decisions (2026-11-19)

- Native Windows, as recorded in
  [Ship the 0.1.0 public preview](./WF-287-ship-the-0-1-0-public-preview.md)
  and the 2026-11-11 amendment to
  [Set the v1 boundary and priorities](./WF-015-set-v1-boundary-priorities.md).
- The `node:ffi` + OpenTUI `win32` probe passed (Evidence below), so the
  renderer choice in WF-059 stays as it is.
- The work runs on its own branch so it does not get in the way of normal
  development (see Branch).

## Branch

Built on the `windows` branch, which merges `main` in often. Nothing from it
lands on `main` until Windows support ships with
[Lift the native-Windows refusal and prove Windows end to end](./WF-315-lift-the-native-windows-refusal-and-prove-windows-end-to-end.md).

## Children and order

Can start now:

1. [Find git.exe on Windows](./WF-305-find-git-exe-on-windows.md) — unmasks most of the test suite
2. [Run the development scripts and tests on Windows](./WF-306-run-the-development-scripts-and-tests-on-windows.md)
3. [Build the git inspection overlay without symlinks](./WF-307-build-the-git-inspection-overlay-without-symlinks.md)
4. [Keep saved State durable under Windows file semantics](./WF-308-keep-saved-state-durable-under-windows-file-semantics.md)
5. [Keep BuildFrame's files private to the user on Windows](./WF-309-keep-buildframes-files-private-to-the-user-on-windows.md)
6. [Identify processes and stop the runtime on Windows](./WF-311-identify-processes-and-stop-the-runtime-on-windows.md)
7. [Package BuildFrame and start the Claude helper on Windows](./WF-312-package-buildframe-and-start-the-claude-helper-on-windows.md)
8. [Check the TUI in Windows terminals](./WF-314-check-the-tui-in-windows-terminals.md)

Blocked:

- [Connect to the runtime over a named pipe](./WF-310-connect-to-the-runtime-over-a-named-pipe.md) — blocked by WF-309
- [Can each agent connect from Windows?](./WF-313-can-each-agent-connect-from-windows.md) — blocked by WF-310, WF-312
- [Lift the native-Windows refusal and prove Windows end to end](./WF-315-lift-the-native-windows-refusal-and-prove-windows-end-to-end.md) — blocked by every other child

Related, not a child:
[A one-line edit in a CRLF-checked-out file shows the whole file rewritten](./WF-288-crlf-files-diff-as-rewritten.md)
is rare on macOS and Linux but the normal case on Windows. WF-315 does not
close until WF-288 is closed.

## Collision rules

- `gitProcess.ts`, `workspaceIdentity.ts`, `authoritativeStateWorker.ts` and
  `lifecycle.ts` are over the file size budget, so they are frozen. Windows
  code goes in new files beside them (one per concern, e.g. a Windows file
  primitives module, a Windows access-control module). The frozen files only
  gain call sites, and each edit moves out at least as much as it adds.
- Prefer one platform switch per concern at a single seam over scattered
  `process.platform` checks. `runtimeLocation.ts` is already the only seam
  for the runtime endpoint (client and server both go through it).
- Keep macOS and Linux behaviour byte-identical: no change to saved bytes,
  record kinds, protocol frames or diagnostics on those platforms.

## Evidence (at `7481381`, Windows 11 LTSC 24H2 x64, Node 26.5.1, Git 2.55.0.windows.3)

- **Renderer probe.** `@opentui/core-win32-x64@0.9.1` ships `opentui.dll`;
  it loads through `node:ffi` and renders frames (wide CJK included) with the
  test renderer. In a real conhost window, `createCliRenderer` with the
  shell's options (mouse, movement, kitty keyboard requested) started in
  18 ms, drew Unicode and box glyphs, delivered keys, hover, movement, click
  and release, and tore down cleanly. Conhost reports no kitty keyboard, RGB
  and 256 colours, focus tracking and bracketed paste.
- **Test suite as is:** 602 tests, 259 pass, 343 fail. 269 failures are one
  cause: `selectGitExecutable` looks for `git`, not `git.exe`, and requires
  POSIX execute bits.
- **With four throwaway patches** (find `git.exe`, tolerate directory
  `fsync` EPERM, build the overlay from junctions and hard links, skip the
  native-Windows refusal), since reverted: 469 pass, 133 fail. A temporary
  repository bootstraps to `ready` with a stable Workspace identity. What is
  left: runtime location and endpoint (~30), Windows test-harness issues
  (~45 `EBUSY` on temporary directory removal, 19 PATH/`Path` resolution),
  State migration and quarantine (4).
- **Node primitives on Windows:** mode bits always read `666`, `uid` is 0,
  `process.getuid` is undefined and `chmod` changes nothing; `symlink`
  (file and directory) fails with EPERM without Developer Mode; junctions and
  hard links work unprivileged; `fsync` on a directory handle fails with
  EPERM; `rename` over a file another handle has open fails with EPERM;
  `listen()` on a socket path fails with EACCES (Node on Windows only listens
  on named pipes); `process.kill(pid, 0)` works and answers ESRCH for a gone
  process; `dev`, `ino` and `birthtimeNs` are populated on NTFS.
- **Scripts:** `pnpm test` runs scripts through `cmd.exe`, which rejects
  `NODE_OPTIONS=--experimental-ffi vitest …`.

## Not yet specified

- **arm64.** `@opentui/core-win32-arm64` exists; nothing has run on it.
- **Antivirus and indexers** briefly holding files open. WF-308's retry rule
  should cover them; no measurement yet.
- **Install route** beyond npm/pnpm (winget, Scoop). Later, with the curl
  bootstrap and Homebrew.
