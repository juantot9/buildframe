# WF-313: does the OpenCode connector reach its host on Windows?

## Verdict — 2026-11-20

**Yes, up to the Windows refusal that WF-315 lifts.** OpenCode 2.3.2 ships
native Windows builds, and its Bun runtime — where the `@buildframe/opencode`
plugin runs — connects to the runtime's named pipe and completes the
handshake. WF-294 had established Bun's `node:net` only for Unix sockets.
Not yet run: `/buildframe` in a live OpenCode session and a full round trip,
which needs the refusal lifted (WF-315).

## Evidence (Windows 11 LTSC 24H2 x64)

- **Install.** `npm i -g @opencode/cli@2.3.2` (into a scratch prefix)
  installs on Windows: the package lists `win32`, and
  `@opencode/cli-windows-x64` (and `-baseline`, `-arm64`) carry
  `opencode.exe`. npm puts the `.exe` behind a `.cmd` shim, so `buildframe
  doctor` did not see it until the fix in this ticket
  (`apps/buildframe/src/hostVersion.ts`); doctor now reports OpenCode 2.3.2
  (verified).
- **Bun and the pipe.** OpenCode's executable is Bun 1.4.4 (`BUN_BE_BUN=1`
  runs it as the `bun` CLI). Running the connector's own client code in it —
  `validatePrivateRuntimeEndpoint`, `connectRuntimeEndpoint` — against a real
  Windows runtime endpoint: the endpoint validates (the access-list check is
  `unverifiable` there, as in every agent host), the pipe connects, both
  sides prove the secret, and a frame goes each way.
- **The contract.** `openCodePlugin.test.ts` runs the plugin's setup against
  a live runtime over the pipe (in Node); it passes on Windows (refusal
  patched locally).
- **Session directory.** The plugin passes `session.location.directory` to
  `bootstrapWorkspace`; every spelling of a Windows checkout path opens the
  same Workspace.

## Differences from macOS and Linux

- None found in the connector's path. The plugin runs under Bun, not Node,
  on every platform; on Windows that Bun reaches named pipes as well.
- Not checked: what form `session.location.directory` takes in OpenCode on
  Windows (a live session); any absolute spelling works.

## Codex

BuildFrame has no Codex connector (WF-302 is research only), so there is
nothing to check on Windows; the support manifest does not list Codex.
