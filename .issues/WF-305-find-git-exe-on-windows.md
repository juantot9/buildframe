---
id: WF-305
title: "Find git.exe on Windows"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: null
blocked_by: []
created: 2026-11-19
---

## Finding

On Windows, every Workspace that needs Git fails with `git-missing`. This is
269 of the 343 failing tests (evidence in
[Run BuildFrame natively on Windows](./WF-304-run-buildframe-natively-on-windows.md)).

`selectGitExecutable` (`packages/workspace/src/gitProcess.ts:50`) looks for a
file named `git` in each `PATH` directory (`:57`). Git for Windows installs
`git.exe`. It then refuses a candidate without POSIX execute bits (`:79`); on
Windows every file reads as mode `666`
(`C:\Program Files\Git\mingw64\bin\git.exe mode=666`).

## Direction

- On Windows, look for `git.exe` only. Do not walk `PATHEXT`: a `git.bat` or
  `git.cmd` would run through `cmd.exe`, which the resolver exists to avoid.
- On Windows, skip the mode-bit check. Keep the regular-file check, the
  `realpath` before/after comparison and `git-resolution-changed`.
- Treat `PATH` and `Path` as one variable on Windows. `process.env` lookups
  ignore case, but a copied environment object does not; this is behind
  19 `git-resolution-changed` failures in `workspaceIdentity.test.ts`.
- Keep the hardening from
  [Resolve the Git executable and retest the Node ceiling](./WF-095-resolve-git-executable-and-retest-node-ceiling.md)
  and [Prevent checkout-controlled Git execution](./WF-096-prevent-checkout-controlled-git-execution.md):
  an empty or relative `PATH` entry still resolves against the start
  directory rather than the checkout.
- `gitProcess.ts` is frozen (over budget). Put the Windows candidate rule in a
  new file and move out at least as much as the call adds.

## Verification

- `gitProcess.test.ts` covers `git.exe` found, `git.exe` missing, a
  directory named `git.exe`, and a `git.cmd`-only `PATH` (refused).
- The tests that create symlinks to fake executables skip on Windows without
  Developer Mode, or use a copy, and say which.
- macOS and Linux results unchanged.
