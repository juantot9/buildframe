---
id: WIN-006
title: "Connect Codex on Windows"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: null
blocked_by: []
created: 2026-11-21
---

Filed as WF-321 on 2026-11-21; renamed WIN-006 on 2026-11-23 when `main`
assigned WF-321 to other work.

## Finding

The Codex adapter ([Connect Codex](./WF-303-connect-codex.md)) landed on
`main` after the Windows children were planned, and nothing in it has run
on Windows. Rebasing `windows` onto `main` (2026-11-21) brought it in; it
builds and its tests pass on Windows, but reading
`packages/codex-adapter/src/helper.ts` shows it cannot work there as is:

- **Codex's shared server.** The helper connects to
  `<CODEX_HOME>/app-server-control/app-server-control.sock`, a Unix socket.
  Where Codex's app server listens on Windows (a named pipe, another path,
  or not at all) is unknown.
- **A console window for the whole connection.** `!buildframe` starts the
  helper with `spawn(process.execPath, …, { detached: true })` and no
  `windowsHide`. On Windows a detached Node gets its own console window,
  which stays open while the helper runs (the runtime had the same problem
  with Git, fixed in WF-314).
- **Stopping the helper.** `!buildframe disconnect` and a reconnect send
  `SIGTERM`. Windows has no signals: `process.kill` ends the helper at once,
  so its `SIGTERM` handler never closes the session or removes its pid file.
- **A stale pid file names the wrong process.** A pid file left behind is
  trusted as long as `process.kill(pid, 0)` succeeds. Windows reuses process
  ids readily, so a later `disconnect` could end an unrelated process.
  WF-311's process identity (pid plus start time) is the Windows answer.
- **The pid files' folder.** It is `buildframe-codex-<uid>` in the temp
  folder with mode `0o700`. On Windows `uid` is `-1` and the mode does
  nothing; every other BuildFrame folder gets a protected access list
  (WF-309).
- **`!buildframe` itself** runs through Codex's shell; on Windows that
  reaches the `buildframe` npm shim (`.cmd`). Unverified.

## Direction

Find out how Codex's app server is reached on Windows first; the rest only
matters if Codex can be connected there at all. Then hide the helper's
window, stop it through a request rather than a signal (or with the
WF-311 identity check before any kill), and keep its pid files in a
private BuildFrame folder.

Until this is done, Windows support does not claim Codex. Decide whether
this blocks
[WF-315](./WF-315-lift-the-native-windows-refusal-and-prove-windows-end-to-end.md)
or Windows ships first with Codex listed as not yet supported there.

## Verification

- In a live Codex session on Windows, `!buildframe` connects, a Message is
  sent and its Response comes back, `!buildframe status` and
  `!buildframe disconnect` work, and no console window opens.
- A stale pid file never ends a process that is not the helper.
