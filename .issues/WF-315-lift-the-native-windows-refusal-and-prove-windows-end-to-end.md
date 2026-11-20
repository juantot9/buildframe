---
id: WF-315
title: "Lift the native-Windows refusal and prove Windows end to end"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: null
blocked_by: [WF-305, WF-306, WF-307, WF-308, WF-309, WF-310, WF-311, WF-312, WF-313, WF-314]
created: 2026-11-19
---

## Outcome

BuildFrame claims native Windows support, and the `windows` branch merges into
`main`.

## Blocked by

- [Find git.exe on Windows](./WF-305-find-git-exe-on-windows.md)
- [Run the development scripts and tests on Windows](./WF-306-run-the-development-scripts-and-tests-on-windows.md)
- [Build the git inspection overlay without symlinks](./WF-307-build-the-git-inspection-overlay-without-symlinks.md)
- [Keep saved State durable under Windows file semantics](./WF-308-keep-saved-state-durable-under-windows-file-semantics.md)
- [Keep BuildFrame's files private to the user on Windows](./WF-309-keep-buildframes-files-private-to-the-user-on-windows.md)
- [Connect to the runtime over a named pipe](./WF-310-connect-to-the-runtime-over-a-named-pipe.md)
- [Identify processes and stop the runtime on Windows](./WF-311-identify-processes-and-stop-the-runtime-on-windows.md)
- [Package BuildFrame and start the Claude helper on Windows](./WF-312-package-buildframe-and-start-the-claude-helper-on-windows.md)
- [Can each agent connect from Windows?](./WF-313-can-each-agent-connect-from-windows.md)
- [Check the TUI in Windows terminals](./WF-314-check-the-tui-in-windows-terminals.md)

Also requires
[A one-line edit in a CRLF-checked-out file shows the whole file rewritten](./WF-288-crlf-files-diff-as-rewritten.md)
to be closed.

## Work

- Remove the refusal: `platformDiagnostic` returns `native-windows`
  (`packages/workspace/src/workspaceIdentity.ts:128`), and the runtime
  location throws `unsupported-platform`. Keep refusing WSL1 and unknown
  platforms.
- Add `win32` to the CLI's `os` list and Windows to `support/manifest.json`,
  the README, `PRODUCT.md`, `SECURITY.md` and `buildframe doctor`.
- Make the `windows-latest` CI job required.

## From WF-312 (2026-11-20)

- `node scripts/assemble-release.mjs --windows` already builds a CLI package
  whose `os` list includes `win32`; shipping means making that the default
  and dropping the flag, and changing the CLI README's "Needs macOS or Linux".
- npm 11 with Node 26 prints an `allow-scripts` warning for the grammar
  packages on install (every platform). Their scripts only pick native
  bindings BuildFrame never loads; decide whether the README says so.

## From WF-313 (2026-11-20)

- The per-host round trips are still to do: `/buildframe` in a live Claude
  Code, Pi and OpenCode session on Windows, Send, Response. The connectors
  already reach the runtime there ([findings](../docs/research/claude-code-windows-wf313.md)).
- On a machine with Pi installed, Pi and the Claude helper run on Pi's Node
  22, not Node 26. Keep a round trip on that setup, and decide whether
  `buildframe doctor` should say which Node the hosts use.

## From WF-306 (2026-11-20)

- Make the `verify-windows` CI job required (drop `continue-on-error`) once
  the refusal is gone; it has not run yet.
- Many Windows tests meet the refusal today (doctor, scenarios that open a
  Workspace); with it patched out locally, 643 of 671 pass and 26 skip by
  stated reason.
- The hung-Git deadline test ("retires hung identity Git inspection at the
  package-owned deadline") still skips on Windows: its stand-in Git is a
  shell script. A stand-in that is a real `git.exe` would restore it.

## Verification

- `pnpm verify` passes on Windows, macOS and Linux.
- WF-287's promotion gate, repeated on Windows: a clean install from the
  README alone on a fresh Windows user account, and one complete round trip
  from each supported host against the installed build.
