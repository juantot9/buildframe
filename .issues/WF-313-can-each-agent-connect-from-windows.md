---
id: WF-313
title: "Can each agent connect from Windows?"
status: open
labels:
  - wayfinder:research
parent: WF-304
assignee: null
blocked_by: [WF-310, WF-312]
created: 2026-11-19
---

## Question

With the runtime on a named pipe and the package installable, does each
connector reach its host on Windows: Claude Code, Pi, OpenCode and Codex?
What, per host, behaves differently from macOS and Linux?

## Blocked by

- [Connect to the runtime over a named pipe](./WF-310-connect-to-the-runtime-over-a-named-pipe.md)
- [Package BuildFrame and start the Claude helper on Windows](./WF-312-package-buildframe-and-start-the-claude-helper-on-windows.md)

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
