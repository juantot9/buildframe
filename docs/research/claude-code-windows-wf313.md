# WF-313: does the Claude Code connector reach its host on Windows?

## Verdict — 2026-11-20

**Yes, up to the Windows refusal that WF-315 lifts.** Claude Code 2.1.328
runs natively on Windows 11 (`claude.exe`). Its Mod runtime runs the
BuildFrame Mod unchanged, its `$.process.run(['node', …])` starts the
helper without a shell, and the helper connects to the runtime's named pipe.
Two Windows bugs stood in the way, both fixed: the plugin could not start
the installed helper (WF-312) and the helper refused every Windows session
directory (WF-312). Not yet run: a full round trip with a model turn, which
needs the refusal lifted (WF-315).

## Evidence (Windows 11 LTSC 24H2 x64)

- **The Mod.** `claude plugin test packages/claude-adapter/plugin` runs the
  Mod's six tests inside Claude Code 2.1.328 on Windows: all pass.
- **What the host reports and runs.** A throwaway Mod loaded for one
  session with `claude -p /bfprobe --plugin-dir <probe>` (its command runs
  locally; no model call, nothing installed) recorded:
  - `$.session.cwd()` is the native path, `C:\Users\…\buildframe`: drive
    letter upper case, backslashes. The helper's attach request used to
    require a leading `/`; it now takes any absolute path (WF-312).
  - `$.process.run(['node', …])` resolves `node` on `PATH` and starts it
    directly (no shell): arguments with spaces, quotes and backslashes arrive
    unchanged, and the child's working directory is the session directory.
  - **Which Node runs is whatever `node` comes first on `PATH`.** Here that
    was Pi's Node 22.23.3 (`%LOCALAPPDATA%\pi-node\current`, which Pi's
    installer puts early in the user `PATH`), not the Node 26 BuildFrame's
    CLI declares. The helper loads, connects and opens a Workspace on Node 22
    (checked); see the Pi note for the same Node.
- **Helper start.** Installed from the marketplace, the plugin finds the
  helper behind npm's `.cmd` shim and runs its entry with that Node (WF-312);
  the helper starts its detached daemon, which reached the Workspace.
- **Paths.** Every spelling of the checkout (`C:\…`, `c:\…`, `C:/…`, a
  subdirectory) opens the same Workspace, whose canonical checkout is the
  true-case backslash path. Nothing compares the host's path with it
  directly.
- **Pipe client.** The connector's client (validate, connect, handshake)
  passes against a real runtime endpoint on Node 26 and Node 22.

## Differences from macOS and Linux

- The helper runs on the first `node` on `PATH`; on a machine with Pi
  installed that is Pi's Node 22. It works, but it is outside the CLI's
  declared range, so a future Node-26-only API in the helper would break it
  here first.
- No directory-privacy check is possible in the helper (no `node:ffi`); it
  relies on the runtime handshake (WF-309, WF-310).
