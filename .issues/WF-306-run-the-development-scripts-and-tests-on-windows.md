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
- About 45 scenario tests (40 after WF-308) in `apps/buildframe/test/scenarios/reviewingApplication.test.ts`
  fail during teardown with `EBUSY: resource busy or locked, rmdir
  …\checkout`. Windows will not remove a directory while a process has it as
  its working directory or holds a handle in it (file watchers, a child
  process still running).
- Tests that build temporary symlinks fail with EPERM without Developer Mode
  (`runtimeLocation.test.ts`, `repositoryContent.test.ts`,
  `legacyReviewSource.test.ts`, and the checkout-alias case in
  `workspaceIdentity.test.ts`). `gitProcess.test.ts` was handled in
  [Find git.exe on Windows](./WF-305-find-git-exe-on-windows.md).
- Tests whose stand-in Git is a shell script cannot run on Windows. WF-305
  skips "retires hung identity Git inspection at the package-owned deadline"
  there, so the hung-Git deadline has no Windows coverage yet; a stand-in
  that is a real `git.exe` (e.g. a small compiled or Node-based launcher)
  would restore it.
- Two evidence tests write a `.gitconfig` with an unescaped Windows path,
  and Git refuses it (`fatal: bad config line 2`):
  `workspaceEvidenceCurrentChanges.test.ts` ("runs an operator-owned global
  clean filter …") and `workspaceEvidencePerSideDegraded.test.ts` ("captures
  raw working bytes …"). Write config paths with forward slashes or escaped
  backslashes. Found 2026-11-19 in WF-307.
- Some tests assert POSIX paths (`expected 'C:\configured\legacy-state' to be
  '/configured/legacy-state'`) or spawn `/usr/bin/git`.
- CI runs only `macos-latest` and `ubuntu-latest`
  (`.github/workflows/verify.yml:37`).
- Git for Windows installs with `core.autocrlf=true` in its system config, so
  a clone has CRLF working files (`git ls-files --eol`: `i/lf w/crlf`).
  `pnpm format:check` then flags all 304 files, because oxfmt expects LF.
  WF-308 added a `.gitattributes` marking only the byte-exact test
  fixtures `-text`; the repository-wide rule is still to do.

- (WF-312) `pnpm build` works on Windows only because Git Bash puts `rm` on
  `PATH`: each package's `clean` script is `rm -rf dist`, and pnpm runs
  scripts through `cmd.exe`.

- (WF-313) From plain PowerShell, which is the shell to support: `pnpm build`
  fails at `rm -rf dist` and `pnpm test` at `NODE_OPTIONS=… vitest` (cmd.exe
  runs pnpm's scripts). Both worked only from Git Bash. Node 26.5.1 is
  installed with nvm; Pi's Node 22 comes first on the user `PATH`, so
  `node` there is not the repository's Node.

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
