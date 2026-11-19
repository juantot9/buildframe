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

## Verification

- `pnpm verify` passes on Windows, macOS and Linux.
- WF-287's promotion gate, repeated on Windows: a clean install from the
  README alone on a fresh Windows user account, and one complete round trip
  from each supported host against the installed build.
