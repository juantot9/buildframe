---
id: WF-311
title: "Identify processes and stop the runtime on Windows"
status: closed
labels:
  - wayfinder:task
parent: WF-304
assignee: juanan
blocked_by: []
created: 2026-11-19
---

## Finding

- Lock holders are identified by process id plus a start-time identity so a
  reused id is not mistaken for the holder. `inspectProcess`
  (`packages/workspace/src/workspaceIdentity.ts:507`) reads `/proc` on Linux
  (`:513-514`) and runs `/bin/ps` on macOS (`:540`). On Windows it returns
  `running` with no identity. Process ids are reused quickly on Windows.
- Observed 2026-11-19 (WF-305, bootstrap patches applied locally):
  "keeps an old live lock private and clears a lock from another process
  instance" (`workspaceIdentity.test.ts:438`) fails on Windows with
  `workspace-registry-busy`. The test records this process's id with a prior
  instance's identity; with no identity on Windows, the lock is never
  recognised as left behind, so a reused id keeps the registry locked.
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

## Resolution and evidence (2026-11-20)

- **Process identity.** `inspectProcess` and `holderIsGone` moved verbatim
  from `workspaceIdentity.ts` to `processIdentity.ts` (41,137 → 38,718 bytes),
  which adds Windows: `win32:<creation time>` from `GetProcessTimes`
  (`windowsProcesses.ts`, kernel32 through `node:ffi`; no subprocess, no
  localised output). A process that has exited but is still held open by a
  handle reads as gone (`GetExitCodeProcess`), and an id nothing runs under
  as gone. Checked: this process's creation time matches its own start
  (`Date.now() - uptime`), a second process differs, an exited child is gone.
- **Without `node:ffi`** (agent hosts) or for another user's process the
  identity stays `undefined`. Every caller already treats that
  conservatively: a lock recorded without an identity is cleared only once
  `kill(pid, 0)` says ESRCH, and a recorded identity is compared only when the
  inspector can read one. So a host never takes a running holder for gone; at
  worst a reused id keeps the registry busy until that process exits, as
  before. The identity format is new on Windows only; Linux and macOS are
  unchanged.
- The lock scenario from the Finding ("keeps an old live lock private and
  clears a lock from another process instance") now passes on Windows.
- **Shutdown.** Nothing in BuildFrame signals the runtime: it stops when idle,
  or when a launcher from another build asks it through the protocol to step
  aside. It starts detached (its own process group, no console), so a
  console's Ctrl+C never reaches it, as `setsid` keeps it from the terminal on
  macOS and Linux. The one place that signalled a child was the
  `--experimental-ffi` re-exec in `developerExecutable.ts`: on Ctrl+C it
  forwarded SIGINT with `child.kill`, which on Windows is TerminateProcess.
  Now `signalForChild` (`consoleSignals.ts`) forwards nothing on Windows; the
  child receives the console's Ctrl+C itself and the parent waits for it.
  Checked in a real console (`GenerateConsoleCtrlEvent` to a parent and child
  pair): with the old forwarding the child was killed before its handler ran
  (`signal=SIGINT`, no cleanup); with the new rule it ran its handler, cleaned
  up and exited 0. While the TUI owns the console in raw mode, Ctrl+C is a key
  to the TUI and no console event is sent.
- **Tests:** `processIdentity.test.ts` (every platform: same identity each
  time, another process differs, an exited process is gone; on Windows the
  creation time and an unused id); `consoleSignals.test.ts`.
- **Moved on:** "closing the TUI with Ctrl+C restores the console" needs the
  TUI running in a real Windows console, which is
  [Check the TUI in Windows terminals](./WF-314-check-the-tui-in-windows-terminals.md)
  (its checks already list Ctrl+C and closing the window). The Claude
  helper's `child.kill()` on a helper that never answered stays as it is: it
  is meant to end it.
- With the refusal patched locally the four `doctor` fast tests now pass
  (after WF-310); unpatched they wait for WF-315. Not run here: macOS and
  Linux; run `Verify` on `windows`.
