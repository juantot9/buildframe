---
id: WF-315
title: "Lift the native-Windows refusal and prove Windows end to end"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: null
blocked_by: [WF-305, WF-306, WF-307, WF-308, WF-309, WF-310, WF-311, WF-312, WF-313, WF-314, WF-320, WIN-001, WIN-002, WIN-003, WIN-004, WIN-005]
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
- [Ctrl+V and right-click do not paste in conhost](./WF-320-paste-on-windows-consoles.md)
  (owner decision, 2026-11-20: a Windows user must be able to paste a Message)
- [Never read through a symlink on Windows](./WIN-001-never-read-through-a-symlink-on-windows.md)
- [Outside-checkout Context paths on Windows](./WIN-002-outside-checkout-context-paths-on-windows.md)
- [Concurrent Workspace opens can fail on Windows](./WIN-003-concurrent-workspace-opens-fail-on-windows.md)
- [A moved receipt changed during a read was missed on Windows](./WIN-004-moved-receipt-change-missed-on-windows.md)
- [Symlink targets as Git records them on Windows](./WIN-005-symlink-targets-as-git-records-them-on-windows.md)

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

## Progress (2026-11-21)

- Refusal lifted: `platformDiagnostic` accepts `win32` beside `darwin`;
  WSL1 and unknown systems are still refused, and the `native-windows`
  reason is gone. The runtime location already served Windows (WF-310).
- The CLI package's `os` always includes `win32` (the `--windows` flag is
  gone), and its README says "Needs macOS, Linux or Windows".
- Windows in the support manifest (`environments`, and two known
  limitations: x64 only and no WSL1/WSL2 claim; a save may roll back after
  a power loss), the README (requirements, data and configuration folders,
  the power-loss note), `PRODUCT.md`, `SECURITY.md`, `CHANGELOG.md` and
  `HANDOFF.md`. `buildframe doctor` needed no change and runs on Windows.
- CI: `verify-windows` runs the full `pnpm verify` at both ends of the Node
  range, with no `continue-on-error`. Branch protection must list its two
  checks for them to gate a merge.
- On the reference machine, `pnpm verify` passes: 683 tests pass, 26 skip
  by stated reason (symlinks, POSIX files, the hung-Git stand-in, which is
  a shell script), and both smokes pass. `pnpm release:assemble` passes.

Still to do: the Verification below on macOS and Linux CI and by hand on
Windows (clean install, round trips).

## After rebasing on `main` (2026-11-21)

- `windows` was rebased onto `main` at `cf81a7e` (force-pushed). `main` had
  published 0.1.0 for macOS and Linux, so the docs say Windows comes with
  the next release.
- `main` brought the Codex adapter, which has not run on Windows:
  [Connect Codex on Windows](./WF-321-connect-codex-on-windows.md). Until
  it closes, Windows does not claim Codex; whether it blocks this ticket is
  still to decide.
- First CI run with the Windows jobs (run 44840903773, on `f91bb71`, before
  the rebase): Linux passed. macOS failed one WF-312 test
  (`findHelper.test.ts`, macOS's `/var` is `/private/var`), fixed. Windows
  refused every Workspace on the GitHub runner, though all of them open on
  the reference machine; the tests now print the whole refusal, so the
  next run says why.
- Second run (44845393414, on `2d2f0c9`): Linux and macOS passed. Windows
  refused at `lock-registry`: the runner runs as the built-in Administrator,
  which SDDL writes as `LA`, not its SID, so the private-directory check
  never matched the owner. Fixed in `a10ecc9`: access lists are compared
  against the user as SDDL spells them (`currentUserInSddl`).
- Third run (44952513278, on `a10ecc9`): Workspaces open on the runner.
  Windows failed only where runtime tests made their scratch folder under a
  hard-coded `/tmp`, which the runner lacks (the reference machine has a
  `C:\tmp`). They now use `os.tmpdir()` on Windows and keep the short `/tmp`
  on macOS and Linux (WF-128).
- Fourth run (44958983631, on `b5c82da`): the runner runs as Administrator,
  so symlinks work there and Git's `mkfifo` is on its PATH; tests that skip
  on the reference machine ran for the first time. Two that need a FIFO are
  now POSIX-only, and one runs its `chmod 0o000` step on POSIX only. The
  rest are product gaps, each blocking this ticket:
  [WIN-001](./WIN-001-never-read-through-a-symlink-on-windows.md) (reads
  follow symlinks), [WIN-002](./WIN-002-outside-checkout-context-paths-on-windows.md)
  (outside-checkout paths joined with `/`),
  [WIN-003](./WIN-003-concurrent-workspace-opens-fail-on-windows.md)
  (concurrent opens refused at `lock-registry`) and
  [WIN-004](./WIN-004-moved-receipt-change-missed-on-windows.md) (a change
  during a read missed).
- Fifth run (45053375627, on `fcd6660`) and sixth (45057917403, on
  `17fe10a`): macOS and Linux pass. A symlink case that also made a FIFO
  is split so its symlink part runs on Windows, which found
  [WIN-005](./WIN-005-symlink-targets-as-git-records-them-on-windows.md)
  (link targets kept `\`). WIN-004 still fails some runs. The shell
  scenario timed out once with no message; its waits now end before the
  test bound and name what they waited for.

## Verification

- `pnpm verify` passes on Windows, macOS and Linux.
- WF-287's promotion gate, repeated on Windows: a clean install from the
  README alone on a fresh Windows user account, and one complete round trip
  from each supported host against the installed build.
