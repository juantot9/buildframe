---
id: WF-312
title: "Package BuildFrame and start the Claude helper on Windows"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: null
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
