---
id: WF-312
title: "Package BuildFrame and start the Claude helper on Windows"
status: closed
labels:
  - wayfinder:task
parent: WF-304
assignee: juanan
blocked_by: []
created: 2026-11-19
---

## Finding

- The published CLI declares `os: ['darwin', 'linux']`
  (`scripts/assemble-release.mjs:108`), so npm refuses to install it on
  Windows. Its native dependencies come from the app's dependencies
  (`:71-73`); check that `@opentui/core-win32-x64` and `-win32-arm64` resolve
  as optional dependencies on install.
- The Claude plugin starts the helper with
  `spawn('buildframe-claude-helper', [], { stdio: 'inherit' })`
  (`packages/claude-adapter/plugin/helper/launch.js:19`). npm installs bins
  on Windows as `.cmd` and `.ps1` shims, and Node refuses to spawn a `.cmd`
  without a shell (since the 2024 `.bat`/`.cmd` argument-injection fix).
- The CLI re-executes Node with `--experimental-ffi`
  (`apps/buildframe/src/developerExecutable.ts:19-27`), using
  `process.execPath`; that works the same through npm's Windows shims.

## Direction

- Add `win32` to the CLI's `os` list only in
  [Lift the native-Windows refusal and prove Windows end to end](./WF-315-lift-the-native-windows-refusal-and-prove-windows-end-to-end.md);
  until then the release assembly can build a Windows package for testing
  behind a flag.
- Start the helper without a shell: resolve the installed package's helper
  entry point and run it with `process.execPath`, on every platform. No
  `shell: true`.
- `pnpm release:assemble` runs on Windows (paths, `chmod` of bins).

## Verification

- `npm i -g ./buildframe-cli-<version>.tgz` on Windows installs, and
  `buildframe --version` and `buildframe doctor` run from PowerShell, cmd and
  Git Bash.
- The Claude plugin starts the helper on Windows and on macOS/Linux.

## Resolution and evidence (2026-11-20)

- **Release assembly runs on Windows.** `scripts/assemble-release.mjs` runs
  npm and pnpm through the shell on Windows only (they are `.cmd` scripts
  there; the arguments are fixed words), links `node_modules` into its
  install check as a junction (`symlink(…, 'junction')`, a plain symlink
  elsewhere), and imports the assembled packages by file URL. `chmod` of the
  bins is a no-op on Windows and harmless. `node scripts/assemble-release.mjs
  --windows` adds `win32` to the CLI's `os` list for testing; without the flag
  the package is unchanged. `pnpm build` ran here because Git Bash puts `rm`
  on `PATH` (the packages' `clean` scripts; WF-306).
- **A dependency that compiled on install, replaced.** The first
  `npm i -g` of the tarball failed on Windows: `tree-sitter-toml` 0.5.1 ships
  a `binding.gyp` and no prebuilds, so npm runs `node-gyp rebuild` and needs
  a C++ toolchain (it does on macOS and Linux too). BuildFrame only read its
  `highlights.scm`; the TOML `.wasm` came from `tree-sitter-wasms` 0.1.13.
  Both are replaced by `@tree-sitter-grammars/tree-sitter-toml` 0.7.0
  (exact pin, like YAML from the same organisation), which ships its own
  `.wasm`, its matching queries, and prebuilds for all six platforms; builds
  stay off in `pnpm-workspace.yaml` and the dependency firewall lists it.
  WF-195's live probe still passes: the real `TreeSitterClient` renders the
  TOML fixture with palette spans and exact fallback text. TOML highlighting
  now comes from the newer grammar on every platform.
- **The npm install on Windows.** The tarball (with `--windows`) installs with
  `npm i -g --prefix <scratch>` (npm with Node 26.5.1); OpenTUI's
  `@opentui/core-win32-x64` resolves as an optional dependency, and every
  grammar package carries `prebuilds/win32-*`. This npm runs no dependency
  install scripts unless allowed and prints an `allow-scripts` warning for
  the grammars; the scripts would only select native bindings BuildFrame
  never loads, so nothing is lost. `buildframe --version`, `bframe --version`
  and `buildframe doctor` run from PowerShell, cmd and Git Bash; doctor
  reports Node, BuildFrame 0.1.0 and the hosts, and the repository as
  `unsupported-platform: native-windows` until WF-315.
- **The Claude helper starts without a shell, on every platform.** Installed
  from the marketplace, `plugin/helper/launch.js` used to
  `spawn('buildframe-claude-helper')`, which on Windows finds no `.exe` and
  reported "BuildFrame isn't installed". The new `plugin/helper/findHelper.js`
  walks `PATH` for the command (`.cmd` first on Windows), follows npm's
  symlink on macOS and Linux, or reads the entry path out of the npm or pnpm
  shim (`%dp0%`, `%~dp0`, `$basedir`), checks the entry file exists, and the
  launcher runs it with its own `process.execPath`. Checked on Windows
  against the real npm install: the launcher, copied without a built
  `dist` beside it as a marketplace install is, found the helper behind
  `buildframe-claude-helper.cmd`, which started its detached daemon. Without
  BuildFrame on `PATH` it still answers "BuildFrame isn't installed".
- **Found on the way, fixed:** the helper refused every attach request whose
  session directory did not start with `/`, so every Claude session on
  Windows (`C:\…`). It now takes any absolute path on its platform
  (`path.isAbsolute`). With that, the daemon got as far as opening the
  Workspace and stopped at the native-Windows refusal (WF-315), writing
  nothing.
- **Tests:** `findHelper.test.ts` (npm's and pnpm's `.cmd` shims on Windows,
  the sh shim everywhere, npm's symlink on macOS and Linux, first match on
  `PATH`, relative and empty entries skipped, a shim naming a missing entry or
  another file refused); `modProtocol.test.ts` (absolute session directory
  per platform, relative refused). The Claude adapter, app fast and highlight
  tests pass on Windows (refusal patched locally).
- **Not covered:** a pnpm global install on Windows (the shim format is
  covered by a fixture); arm64; Claude Code itself running the Mod on
  Windows (WF-313). Not run here: macOS and Linux; run `Verify` on `windows`.
