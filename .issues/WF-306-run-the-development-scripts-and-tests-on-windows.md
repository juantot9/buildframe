---
id: WF-306
title: "Run the development scripts and tests on Windows"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: null
blocked_by: []
created: 2026-11-19
---

## Finding

- `pnpm test`, `pnpm test:fast` and `pnpm verify` stop at once on Windows:
  pnpm runs scripts through `cmd.exe`, which rejects
  `NODE_OPTIONS=--experimental-ffi vitest …` (`package.json` scripts).
- About 45 scenario tests in `apps/buildframe/test/scenarios/reviewingApplication.test.ts`
  fail during teardown with `EBUSY: resource busy or locked, rmdir
  …\checkout`. Windows will not remove a directory while a process has it as
  its working directory or holds a handle in it (file watchers, a child
  process still running).
- Tests that build temporary symlinks fail with EPERM without Developer Mode
  (`runtimeLocation.test.ts`, `repositoryContent.test.ts`,
  `gitProcess.test.ts`, `legacyReviewSource.test.ts`).
- Some tests assert POSIX paths (`expected 'C:\configured\legacy-state' to be
  '/configured/legacy-state'`) or spawn `/usr/bin/git`.
- CI runs only `macos-latest` and `ubuntu-latest`
  (`.github/workflows/verify.yml:37`).
- Git for Windows installs with `core.autocrlf=true` in its system config, so
  a clone has CRLF working files (`git ls-files --eol`: `i/lf w/crlf`).
  `pnpm format:check` then flags all 304 files, because oxfmt expects LF.
  The repository has no `.gitattributes`.

## Direction

- Make the scripts run under `cmd.exe` as well. `shell-emulator=true` in
  `.npmrc` is one line and keeps the scripts readable; check it with the
  pre-commit hook and `pnpm verify` on all three platforms.
- Add a `.gitattributes` with `* text=auto eol=lf` so every checkout has LF
  files whatever `core.autocrlf` says; existing Windows clones renormalise
  once (`git rm --cached -r . && git reset --hard`, or a fresh clone).
- Fix teardown order so watchers and children close before temporary
  directories are removed; retry removal briefly on `EBUSY`/`EPERM` in test
  helpers only.
- Give symlink-dependent tests a Windows rule: skip with a stated reason when
  symlinks are unavailable, or test the junction/hard-link path instead.
- Write path expectations with `path.join`/`path.resolve`.
- Add a `windows-latest` job to `verify.yml`. It starts non-blocking and
  becomes required in
  [Lift the native-Windows refusal and prove Windows end to end](./WF-315-lift-the-native-windows-refusal-and-prove-windows-end-to-end.md).

## Verification

- `pnpm format:check` passes on a fresh Windows clone with default Git
  settings.
- `pnpm test:fast` and `pnpm test` start on Windows from PowerShell and Git
  Bash.
- No test leaves directories in `%TEMP%`.
- The Windows CI job runs and reports; the macOS and Linux jobs are unchanged.
