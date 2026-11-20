---
id: WF-313
title: "Can each agent connect from Windows?"
status: closed
labels:
  - wayfinder:research
parent: WF-304
assignee: juanan
blocked_by: []
created: 2026-11-19
---

## Question

With the runtime on a named pipe and the package installable, does each
connector reach its host on Windows: Claude Code, Pi, OpenCode and Codex?
What, per host, behaves differently from macOS and Linux?

## Blocked by

- [Connect to the runtime over a named pipe](./WF-310-connect-to-the-runtime-over-a-named-pipe.md) (closed 2026-11-20)
- [Package BuildFrame and start the Claude helper on Windows](./WF-312-package-buildframe-and-start-the-claude-helper-on-windows.md) (closed 2026-11-20)

## What to check per host

- The host runs on native Windows at the supported version range in
  `support/manifest.json`, and the connector loads (plugin, extension or
  app-server).
- `/neoflow` (or the host's equivalent) connects; Send reaches the session;
  the Response comes back. This is WF-287's round trip.
- Paths the host reports (working directory, files) arrive in Windows form
  and match the Workspace's canonical checkout, including drive-letter case.
- How the host runs hooks or helpers on Windows (Git Bash, PowerShell,
  `cmd.exe`) and whether that changes quoting or the helper start.

## Output

One short findings note per host in `docs/research/`, and a ticket per host
for any change needed. Hosts that do not run on native Windows are recorded
as such in the support manifest.

## Resolution and evidence (2026-11-20)

Findings per host: [Claude Code](../docs/research/claude-code-windows-wf313.md),
[Pi](../docs/research/pi-windows-wf313.md),
[OpenCode](../docs/research/opencode-windows-wf313.md) (with a note on Codex,
which has no connector to check).

- **All three connectors reach the runtime on Windows**, up to the
  native-Windows refusal: Claude Code 2.1.328 and Pi 1.5.0 as installed here,
  OpenCode 2.3.2 from npm in a scratch prefix. The connectors' pipe client
  (validate, connect, handshake, a frame each way) passes against a real
  runtime endpoint on Node 26, on Pi's Node 22 and on OpenCode's Bun 1.4.4.
  The Mod's tests pass inside Claude Code on Windows (`claude plugin test`).
- **Paths.** Claude reports the session directory as `C:\…` (upper-case
  drive, backslashes); Pi and OpenCode pass their own native paths. Every
  spelling (case, slashes, a subdirectory) opens the same Workspace, whose
  canonical checkout is the true-case backslash path; no connector compares
  the host's path with it.
- **How hosts start things.** Claude's `$.process.run` starts `node` from
  `PATH` with no shell (quotes, spaces and backslashes arrive intact). Pi and
  OpenCode load the connector in process. Pi's installer adds its own Node
  22 early in the user `PATH`, so on such a machine Pi and the Claude helper
  both run on Node 22; they work there (checked), below the Node 26 the CLI
  declares.
- **Fixed here:** `buildframe doctor` reported Pi and OpenCode as not
  installed on Windows (they are `.cmd` shims, which Node does not start by
  name); it now resolves the command on `PATH` and runs a shim through
  `cmd.exe` (`hostVersion.ts`). The connector kit labelled the repository
  with the whole Windows path; it now uses the folder name.
- **Not run:** a live `/buildframe` and a full round trip with a model turn
  for each host. That needs the refusal lifted and accounts on each host, so
  it moves to WF-315, whose verification already asks for one round trip
  per host. No host needs its own follow-up ticket; nothing was found that
  keeps a host off Windows, so the support manifest needs no "not on
  Windows" entries.