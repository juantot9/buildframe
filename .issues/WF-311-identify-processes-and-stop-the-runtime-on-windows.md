---
id: WF-311
title: "Identify processes and stop the runtime on Windows"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: null
blocked_by: []
created: 2026-11-19
---

## Finding

- Lock holders are identified by process id plus a start-time identity so a
  reused id is not mistaken for the holder. `inspectProcess`
  (`packages/workspace/src/workspaceIdentity.ts:507`) reads `/proc` on Linux
  (`:513-514`) and runs `/bin/ps` on macOS (`:540`). On Windows it returns
  `running` with no identity. Process ids are reused quickly on Windows.
- `process.kill(pid, 0)` works on Windows and answers ESRCH for a gone process
  (`holderIsGone`, `:484`), so liveness is fine.
- Shutdown relies on signals: the runtime listens for SIGTERM and SIGINT
  (`packages/local-runtime/src/lifecycle.ts:503-504`), and the developer
  executable forwards them to its FFI re-exec child
  (`apps/buildframe/src/developerExecutable.ts:32-35`). On Windows
  `kill(pid, 'SIGTERM')` ends the process at once (TerminateProcess); no
  handler runs. Ctrl+C in a console reaches every process attached to it.
- The runtime starts detached and hidden (`lifecycle.ts:204-209`,
  `windowsHide: true`), which is correct on Windows.

## Direction

- Process identity on Windows: creation time from `GetProcessTimes` through
  `node:ffi` (no subprocess, no localised output). If that is not wanted,
  keep `identity: undefined` and confirm that every caller treats it
  conservatively, never as "gone".
- Runtime shutdown on Windows goes through the runtime protocol, not a signal.
  The parent never sends SIGTERM to a child it expects to clean up.
- New code in new files; `workspaceIdentity.ts` and `lifecycle.ts` are
  frozen.

## Verification

- Lock-holder scenarios: holder alive, holder gone, id reused by another
  process (simulated) on Windows.
- Closing the TUI with Ctrl+C restores the console and leaves the runtime in
  the same state as on macOS and Linux.
