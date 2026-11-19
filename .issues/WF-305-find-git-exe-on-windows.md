---
id: WF-305
title: "Find git.exe on Windows"
status: closed
labels:
  - wayfinder:task
parent: WF-304
assignee: juanan
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

## Resolution and evidence (2026-11-19)

- Executable resolution moved out of `gitProcess.ts` into a new
  `packages/workspace/src/gitExecutable.ts`; `gitProcess.ts` re-exports the
  same names, so no importer changed, and it shrank from about 7,700 to
  6,800 tokens. The moved code is unchanged except for one rule: on Windows
  the candidate is `git.exe` and mode bits are not checked; elsewhere it is
  `git` with the execute-bit check, as before. `access(X_OK)`, the
  before/after `realpath` comparison and `git-resolution-changed` apply on
  every platform.
- `createGitExecutableResolver` takes an optional platform, so the Windows
  rule is tested on macOS and Linux CI too: `git.exe` selected through a
  linked directory and never a bare `git`, `git.cmd`/`git.bat` never selected
  (`git-missing`), a directory named `git.exe` (`git-not-file`), and a
  changed search path. One Windows-only case resolves the installed Git for
  Windows. The three POSIX cases (execute bits, file symlinks) skip on
  Windows with the reason stated.
- **The `PATH`/`Path` direction above was wrong.** The 19
  `git-resolution-changed` failures came from one test: "retires hung
  identity Git inspection at the package-owned deadline" sets `PATH` to a
  directory holding a shell-script Git and pauses with `/bin/sleep`. On
  Windows the pause throws inside its `finally` before `PATH` is restored, so
  every later test ran with the stand-in `PATH`, and the resolver correctly
  reported a changed search path. That test now skips on Windows. To skip it
  without growing the frozen `workspaceIdentity.test.ts`, it moved verbatim
  to `workspaceIdentityHungGit.test.ts`, and the file's shared setup moved
  verbatim to `workspaceIdentityScenarios.ts` (the frozen file went from about
  8,900 to 7,200 tokens). The lost Windows coverage is recorded in
  [Run the development scripts and tests on Windows](./WF-306-run-the-development-scripts-and-tests-on-windows.md).
- With the other bootstrap blockers patched locally (refusal, overlay,
  directory `fsync`; not committed), `workspaceIdentity.test.ts` passes 17 of
  21 on Windows, including the fsmonitor, include, hook and clean-filter
  cases (nothing from checkout config runs). The rest: a symlink alias (WF-306),
  a lock left by a reused process id (recorded in
  [Identify processes and stop the runtime on Windows](./WF-311-identify-processes-and-stop-the-runtime-on-windows.md)),
  and the native-Windows refusal test itself (WF-315).
- Full suite on Windows, nothing patched: 607 tests, 268 pass (259 before),
  4 skipped; no `git-missing` failure remains. Most of the rest stop at the
  native-Windows refusal, as intended until WF-315.
- Checks run on Windows: workspace typecheck, `tsconfig.tests.json`
  typecheck, oxlint, oxfmt, dependency firewall, the fast suite (the same 10
  failures as before, all runtime location and symlink tests owned by other
  children). Not run here: macOS and Linux; CI runs only on `main`, so
  confirm with a manual `Verify` run on the `windows` branch.
