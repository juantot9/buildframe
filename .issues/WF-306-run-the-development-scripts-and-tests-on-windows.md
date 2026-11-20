---
id: WF-306
title: "Run the development scripts and tests on Windows"
status: closed
labels:
  - wayfinder:task
parent: WF-304
assignee: juanan
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

## Resolution and evidence (2026-11-20)

- **Scripts run from PowerShell.** `shellEmulator: true` in
  `pnpm-workspace.yaml` (pnpm 11 reads its settings there, not from
  `.npmrc`) runs `NAME=value command` and `&&` the same way under `cmd.exe`.
  Each package's `clean` is now `node ../../scripts/remove-dist.mjs`. From
  plain PowerShell: `pnpm lint`, `format:check`, `check:dependencies`,
  `typecheck`, `build`, `test:fast` and `test` all start, and `smoke:build`
  runs. `smoke-build.mjs` and `check-dependencies.mjs` turned file URLs into
  paths with `.pathname` (`/C:/…`); both use `fileURLToPath` now.
  `smoke-claude-direct.mjs` stops at the native-Windows refusal and passes
  with it patched out locally.
- **pnpm's own executable refuses `NODE_OPTIONS=--experimental-ffi`.** The
  scripts set it only for vitest. Do not export it in a shell where you run
  `pnpm`.
- **LF everywhere.** `.gitattributes` starts with `* text=auto eol=lf`; the
  fixture rule stays `-text`. The index was already LF, so the commit changes
  no file contents. This clone was renormalised in place (CRLF working files
  rewritten to LF). An older Windows clone needs `git rm --cached -r . && git
  reset --hard` on a clean tree, or a fresh clone. `pnpm format:check` passes.
- **Tests.** Full suite on Windows, refusal patched out locally:
  - At the start: 597 pass, 61 fail, 13 skipped of 671.
  - Now, from Git Bash: 643 pass, 2 fail, 26 skipped.
  - From PowerShell the last full run was 642/6/23. The four failures fixed
    after it pass in targeted runs.
  - The two failures left:
    - "rejects native Windows", which only fails because the refusal is
      patched out.
    - A TUI ordering bug, handed to WF-314. At a past step on a slow
      machine, `a` says "Still loading … press a again" instead of "Press
      Esc to come back to now first."
  - **`EBUSY` at teardown:** teardown order was already right (apps and
    owners close first). Removal now retries briefly (`maxRetries: 10`) in
    `reviewingApplication.test.ts`, `workspaceProjectionScenarios.ts` and
    `workspaceReviewingScenarios.ts`.
  - **Leak, every platform:** the reviewing fixture's directory was removed
    only if the test opened it; now it is registered when created. No
    `buildframe-*`/`neoflow-*` directory is left in `%TEMP%`. The empty
    `<guid>.tmp` files there are not the suite's: they appear outside test
    runs too.
  - **Symlinks:** directory links in tests are junctions (checkout alias,
    legacy locators, moved receipts). Cases that need a real symlink use
    `itWithSymlinks` from `packages/workspace/test/platformCases.ts`, which
    probes once and skips without Developer Mode.
  - **POSIX-only cases** use `itOnPosix`: a FIFO, a Unix socket file,
    `chmod 000`, the executable bit, `"` in a file name. POSIX mode
    assertions are skipped on Windows, where access lists keep files private
    (WF-309 tests that).
  - **Git config paths are written with `/`:** the operator clean-filter,
    fsmonitor and include tests. `unchangedContentRuntime.test.ts` uses
    `os.tmpdir()` and `git` on Windows (still `/tmp` and `/usr/bin/git`
    elsewhere). Legacy state-directory expectations use
    `path.resolve`/`path.join`.
- **Size budget.** Test files at or over the budget would have grown, so
  each gave something up at a seam:
  - Git-configuration identity tests → `workspaceIdentityGitConfig.test.ts`.
  - Operator clean-filter evidence tests →
    `workspaceEvidenceOperatorFilters.test.ts`.
  - Legacy source helpers and locator test → `legacyReviewSourceScenarios.ts`
    and `legacyReviewSourceLocators.test.ts`.
  - The legacy state-directory rule → `test/fast/legacyReviewStateDirectory.test.ts`.
  - Context-evidence manifest helpers → `workspaceContextEvidenceScenarios.ts`
    (its `gitWithInput` copy uses the shared one).
  - Revalidation fixture → `workspaceReviewContextRevalidationFixture.ts`.
  - Receipt documents → `legacyReviewMovedReceiptDocuments.ts`.
  - Renderable-tree helpers → `apps/buildframe/test/scenarios/renderableTree.ts`.
- **CI.** `verify.yml` has a `verify-windows` job: windows-latest, Node
  26.13.1, PowerShell, each step reported, `continue-on-error`. The macOS and
  Linux matrix is unchanged. **Not yet run**: the workflow runs on pushes to
  `main`, on pull requests and by hand, and `gh` isn't installed here.
- **Not done here:** the hung-Git deadline test still skips on Windows (its
  stand-in Git is a shell script); moved to WF-315. Without the refusal
  patch, Windows tests that open a Workspace meet the refusal (e.g. 4 doctor
  tests in `test:fast`) until WF-315.
