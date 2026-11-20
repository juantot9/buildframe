# WF-313: does the Pi connector reach its host on Windows?

## Verdict — 2026-11-20

**Yes, up to the Windows refusal that WF-315 lifts.** Pi 1.5.0 runs natively
on Windows through its managed installer, on its own Node 22. The `@buildframe/pi`
extension loads there, opens a Workspace and completes the runtime
handshake over the named pipe. Not yet run: `/buildframe` in a live Pi
session followed by a full round trip, which needs the refusal lifted
(WF-315).

## Evidence (Windows 11 LTSC 24H2 x64)

- **Install.** Pi's installer puts `pi`, `pi.cmd` and `pi.ps1` in
  `%USERPROFILE%\.pi\agent\bin`; each runs `pi-launcher.js` with the first
  `node` on `PATH`, which is Pi's own Node 22.23.3 in
  `%LOCALAPPDATA%\pi-node\current` (both directories near the front of the
  user `PATH`). Pi 1.5.0 is inside the supported range (`>=0.80.6 <2.0.0`),
  newer than the verified 1.3.0, and the version the adapter is developed
  against.
- **`buildframe doctor` could not see it**: it ran `pi --version` without a
  shell, and Node starts only `.exe` files by name. Fixed in this ticket:
  on Windows doctor finds the command on `PATH` and runs a `.cmd` shim
  through `cmd.exe` (`apps/buildframe/src/hostVersion.ts`). Doctor now
  reports Pi 1.5.0.
- **The extension on Pi's Node.** The packed `@buildframe/pi` loads on
  Node 22.23.3; under Node 22, `bootstrapWorkspace` opens the same Workspace
  from every spelling of the checkout path, and the connector's pipe client
  passes the handshake against a real runtime endpoint.
- **The contract with Pi's own code.** `piExtension.test.ts` drives Pi
  1.5.0's extension API in process against a live runtime over the pipe; it
  passes on Windows (refusal patched locally).
- **Session directory.** Pi passes `ctx.cwd`, the process's native
  `C:\…` path, to `bootstrapWorkspace`.
- **Found and fixed:** the connector named the repository by splitting the
  canonical checkout on `/`, so on Windows the label was the whole path. It
  now uses the folder name (`connector/session.ts`).

## Differences from macOS and Linux

- Pi runs on Node 22, below the Node 26 BuildFrame declares; the connector
  works there today. A Node-26-only API in connector code would break Pi on
  Windows first.
- No directory-privacy check in Pi's process (no `node:ffi`); it relies on
  the runtime handshake.
