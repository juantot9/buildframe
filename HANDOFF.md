# BuildFrame handoff

Last updated: 2026-11-13

## Current checkpoint

BuildFrame is preparing its first public release, a Reviewing-only `0.1.0`
preview. The plan of record is
[`.issues/WF-287-ship-the-0-1-0-public-preview.md`](.issues/WF-287-ship-the-0-1-0-public-preview.md);
read it first. It records the owner's decisions, the children that are done,
and the ones that remain. WF-051 stays the long-range execution plan, amended
by WF-287 for this release.

The active source graph:

```text
apps/buildframe              terminal app, launcher, doctor
packages/workspace        Reviews, Messages, State, Git evidence
packages/local-runtime    background process and local IPC
packages/pi-adapter       Pi connector (Direct, /buildframe)
packages/claude-adapter   Claude Code connector (native Mod plugin, /buildframe)
```

Published as `@buildframe/cli` and `@buildframe/pi` (assembled by
`pnpm release:assemble`), plus the `buildframe` Claude Code plugin from the
`buildframe` marketplace in `.claude-plugin/`.

Public history starts at the 0.1.0 preview commit. Earlier history, and every
older commit ID that `.issues/` and `docs/` mention, lives in the private
`juantot9/neoflow-archive` repository.

## Invariants to preserve

- A harness session connects once with `/buildframe`; every Send then goes
  directly to it. One session per repository: the newest `/buildframe` wins and
  the released session is told and does not reconnect.
- Messages go to the agent exactly as written; Send commits before anything
  leaves BuildFrame; nothing is replayed; an unknown outcome stays unknown; no
  Response is fabricated.
- The Workspace Interface stays `execute`, `read`, `subscribe`.
- Never inspect, copy, print, mutate, or delete real user data. Removing code
  never removes `.neoflow/review.json`, legacy receipts, State, or
  Configuration.
- `support/manifest.json` is generated from `apps/buildframe/src/supportManifest.ts`
  (`pnpm release:manifest`); a test fails if it drifts.
- Same-user programs are trusted (the 0.1.0 safety bar); the Claude helper
  still refuses every caller without its launch token.

## Durability on Windows (`windows` branch, WF-304)

- A Durable Commit is a SQLite transaction with `synchronous = FULL`; SQLite
  makes it durable on Windows itself.
- Publishing a whole file is weaker there: the `CURRENT` pointer, a new or
  migrated generation, quarantine copies, the identity registry and the
  Workspace marker. Windows cannot flush a directory, so after a power loss or
  OS crash NTFS may roll back a rename (or the marker's link) its journal had
  not written. Contents are flushed first, so what comes back is the previous
  file, never a torn one; a lost marker means the next start makes a new
  Workspace identity. A crash of BuildFrame alone loses nothing.
- These steps live in `packages/workspace/src/durableFiles.ts`. Windows
  flushes a file only through a writable handle, and renames retry for about
  1.3 s while another process (antivirus, the indexer) holds a file open.

## Privacy on Windows (`windows` branch, WF-309)

- State and the registry live in `%LOCALAPPDATA%\BuildFrame`, configuration in
  `%APPDATA%\BuildFrame`, the runtime in `%LOCALAPPDATA%\BuildFrame\runtime`.
- The app and the runtime (started with `--experimental-ffi`) set and check a
  protected access list (the user, SYSTEM, Administrators) through `node:ffi`.
  Agent hosts that load a connector have no `node:ffi`; there the directories
  keep the privacy they inherit from the user's profile. See
  `packages/workspace/src/privateDirectories.ts`.

## Runtime endpoint on Windows (`windows` branch, WF-310)

- The runtime listens on a named pipe, `\\.\pipe\buildframe-<digest>`, and
  publishes a fresh random secret beside it in the private runtime directory
  (`w-<workspace>.key`) once the listen succeeds.
- Pipes have no owner-private mode and their names are machine-global, so
  every connection opens with a challenge–response on that secret
  (`packages/local-runtime/src/runtimeHandshake.ts`) before the first frame.
  Neither side sends a frame to a peer that has not proven it. Frames and
  protocol versions are unchanged; macOS and Linux do not run the handshake.
- Lock holders are identified on Windows by process start time
  (`packages/workspace/src/processIdentity.ts`, WF-311); without `node:ffi`
  a running holder is never taken for gone. Nothing signals the runtime; on
  Windows the re-exec parent leaves Ctrl+C to its child.
- `node scripts/assemble-release.mjs --windows` builds a CLI package that
  installs on Windows, for testing (WF-312). The Claude plugin runs the
  installed helper's entry file with Node, found behind its npm/pnpm shim
  (`packages/claude-adapter/plugin/helper/findHelper.js`).
- Agents on Windows (WF-313): Claude Code, Pi and OpenCode reach the runtime
  pipe; Pi and the Claude helper may run on Pi's own Node 22, which is first
  on `PATH` after Pi's installer. Notes in `docs/research/*-windows-wf313.md`.
- Use PowerShell on Windows. Node 26.5.1 is the nvm default, and nvm sits
  ahead of Pi's Node 22 on the user `PATH`, so `node` is 26.5.1 in a new
  terminal (Pi runs on it too). `pnpm` must be pnpm's own
  (`%LOCALAPPDATA%\pnpm\bin`): nvm's directory also holds a `pnpm.exe` that
  fails with `CommandNotFound`.
- Development on Windows (WF-306): every `pnpm` script runs from PowerShell
  (`shellEmulator: true` in `pnpm-workspace.yaml`; `clean` is
  `scripts/remove-dist.mjs`). `* text=auto eol=lf` in `.gitattributes` gives
  LF checkouts; an older Windows clone renormalises once. Many tests still
  meet the native-Windows refusal until WF-315; the Windows CI job reports
  without gating. Tests that need symlinks or POSIX files use `itWithSymlinks`
  and `itOnPosix` (`packages/workspace/test/platformCases.ts`). Never set
  `NODE_OPTIONS=--experimental-ffi` in the shell: pnpm's executable refuses
  it.

## Development environment

Node `26.5.1` (`nvm use`), pnpm `11.10.0`. The canonical checks:

```bash
pnpm verify
pnpm risk:state
pnpm risk:runtime
pnpm risk:pi
pnpm risk:dogfood
pnpm release:assemble
```

`pnpm dogfood -- <repository>` rebuilds on launch; start Pi or Claude Code
sessions after BuildFrame is up. A runtime left from an older build blocks a new
launch; `buildframe doctor` names it.

## Frontier

See WF-287's children. At this checkpoint the remaining release work is
running the release gate on the packed tarballs, then publishing those same
tarballs as `latest` (no `next` channel for 0.1.0).
Publishing needs the owner's `@buildframe` npm organization. Node support is
`>=26.4.0 <27.0.0`; CI runs macOS and Linux on 26.4.0 and the newest 26.x.
