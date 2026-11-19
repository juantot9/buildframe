---
id: WF-310
title: "Connect to the runtime over a named pipe"
status: closed
labels:
  - wayfinder:task
parent: WF-304
assignee: juanan
blocked_by: [WF-309]
created: 2026-11-19
---

## Question

The TUI and the connectors reach the per-workspace runtime through an
owner-private Unix socket. Node on Windows cannot listen on one. What is
the Windows endpoint, and how do both sides know the other is the same user's
BuildFrame?

## Blocked by

- [Keep BuildFrame's files private to the user on Windows](./WF-309-keep-buildframes-files-private-to-the-user-on-windows.md),
  which provides the private directory that holds the shared secret.

## Evidence (2026-11-19)

- `listen()` on a filesystem path fails with EACCES on Windows; Node (libuv)
  listens only on named pipes (`\\.\pipe\…`) there.
- `runtimeLocation.ts` is the single seam: client
  (`packages/local-runtime/src/client.ts:375-389`) and server both get the
  endpoint from `runtimeLocationForWorkspace`. About 30 tests fail on it
  (`localRuntime.test.ts` 21, `harnessAdapterRuntime.test.ts` 3,
  `bootstrapAbort.test.ts` 2, `runtimeLocation.test.ts`, the OpenCode, Pi and
  Claude connector tests).
- Today's privacy proof is the socket's owner and mode
  (`validatePrivateRuntimeEndpoint`, `secureBoundEndpoint`, the `umask`
  bind in `listenPrivateEndpoint`, `:224-247`). None of it applies to a pipe.
- A pipe created with Node's defaults has the default pipe security: full
  control for the creator, `SYSTEM` and `Administrators`, and **read** for
  Everyone and anonymous. Pipe names are machine-global, so another user can
  create the name first.
- Node creates the first instance with `FILE_FLAG_FIRST_PIPE_INSTANCE`, so a
  second runtime cannot bind the same name.
- Precedent: the Claude helper already authenticates a local connection with
  a port and a token (`packages/claude-adapter/plugin/hooks/register.js:14`).

## From WF-309 (2026-11-19)

- The runtime directory is `windowsRuntimeDirectoryFor()`
  (`%LOCALAPPDATA%\BuildFrame\runtime`; whether `XDG_RUNTIME_DIR` overrides it
  on Windows is for this ticket to decide);
  `prepareWindowsRuntimeDirectory` and `validateWindowsRuntimeDirectory` in
  `runtimeLocation.ts` make and check it. `runtimeLocationForWorkspace` and
  `validatePrivateRuntimeEndpoint` still refuse Windows; wiring them is this
  ticket.
- The runtime starts with `--experimental-ffi` on Windows, so it can read and
  protect access lists. **Connectors cannot**: agent hosts have no `node:ffi`,
  and `validateWindowsRuntimeDirectory` returns `unverifiable` there. The
  secret file therefore relies on the directory sitting in the user's profile,
  and the challenge–response must authenticate both sides on its own.

## Direction

- Endpoint `\\.\pipe\buildframe-<user SID digest>-<workspace digest>`.
- A per-runtime random secret written to the private runtime directory from
  WF-309 before the pipe listens. Both sides prove they know it with a
  challenge–response in the first frames, so neither a squatting server nor
  a foreign client learns or sends anything. The Everyone-read access then
  exposes nothing.
- Stale-endpoint removal (`removeStaleRuntimeEndpoint`, `:195`) does not
  apply: a pipe disappears with its process. A failed handshake is
  `runtime-endpoint-insecure`.
- Keep framing and protocol versions unchanged. On macOS and Linux nothing
  changes.

## Verification

- `localRuntime.test.ts` and the connector contract tests pass on Windows.
- A server that does not know the secret is refused by the client, and a
  client that does not know it is refused by the server, with no Workspace
  frame exchanged.
- Two runtimes for the same workspace: the second one fails to bind.

## Resolution and evidence (2026-11-20)

- **Endpoint.** `\\.\pipe\buildframe-<digest>`, where the digest covers the
  runtime directory (lower-cased) and the Workspace digest. The directory is
  per user, so each user, and each test's runtime directory, gets its own
  pipe; no user SID is needed, which matters because connectors have no
  `node:ffi` to read one. The Workspace identity sits in the user's private
  State, so another user cannot work out the name to squat it.
- **`XDG_RUNTIME_DIR`** wins on Windows too when it is absolute, like the
  other `XDG_*` settings (WF-309); otherwise `%LOCALAPPDATA%\BuildFrame\runtime`.
  The tests rely on it to keep their runtimes apart.
- **Secret.** 32 random bytes per runtime in `w-<workspace digest>.key` in the
  private runtime directory. It is published **after** the listen succeeds,
  written aside and renamed (with WF-308's Windows rename retry, now exported
  as `@buildframe/workspace/durable-files`). A second runtime that fails to
  bind never replaces the running one's secret, and a runtime that is shutting
  down removes the file only if it is still its own (same file identity), so it
  never removes its successor's.
- **Handshake** (`runtimeHandshake.ts`, before any frame): runtime → greeting
  and a nonce; client → its nonce and an HMAC-SHA256 proof; runtime → its own
  proof. The runtime greets only once its secret is published, so a client
  connecting in that gap waits instead of reading a stale secret; the client
  reads the secret only after the greeting. The exchange is lock-step,
  bounded in size (64 bytes) and time (the bootstrap timeout); extra bytes,
  a wrong greeting or a wrong proof fail it. Neither proof reveals the secret.
  A failed handshake is `insecure-runtime`; a runtime that hangs up before
  greeting is `connection-failed`, as a refused Unix socket is.
- **Seams.** `runtimeLocation.ts` stays the single switch:
  `runtimeLocationForWorkspace`, `validatePrivateRuntimeEndpoint` (directory
  private or unverifiable, secret present, else `runtime-endpoint-missing`),
  `listenPrivateEndpoint` (now takes the location), `secureBoundEndpoint` (the
  secret's identity) and `removeOwnedEndpoint` dispatch to
  `windowsRuntimeEndpoint.ts`. `removeStaleRuntimeEndpoint` does nothing on
  Windows: a pipe goes with its process. On the server side the listen moves
  the server's connection handlers behind the handshake, so `server.ts`
  needs no Windows code. On the client side the two copies of `connectSocket`
  in `client.ts` and `harnessAdapter.ts` became one `connectRuntimeEndpoint`
  (`endpointConnection.ts`), which runs the handshake when the location has a
  secret. `FramedSocket` resumes the socket the handshake leaves paused.
- **Found on the way, fixed:** releasing a replaced harness session sent
  `harness.adapter.released` and destroyed the connection at once. A Windows
  pipe writes asynchronously, so the frame was lost and the session saw a
  plain disconnect (and would reconnect). `FramedSocket.end()` now closes
  after the write, as bootstrap rejection already did.
- **Frozen files:** `server.ts` 31,140 → 31,127 bytes;
  `localRuntime.test.ts` 76,636 → 74,791 (its raw frame peer moved to
  `rawRuntimePeer.ts` and now connects through the handshake). The
  location types moved to `runtimeLocationProblem.ts`.
- **Tests.** Every platform (`runtimeHandshake.test.ts`, over loopback TCP):
  two sides with the secret then exchange frames; a runtime without it is
  refused and receives only the client's 64-byte proof, no frame; a client
  without it never reaches the handler and receives only the greeting; a
  flooding or silent client is refused; no greeting before the secret is
  published, and a close if publishing failed; a hang-up before greeting is
  `connection-failed`; a foreign greeting is refused. Windows
  (`windowsRuntimeEndpoint.test.ts`): missing until published; a proven client
  is served and a raw client sending a bootstrap frame reaches no handler; a
  second runtime gets `EADDRINUSE` and the first one's secret is unchanged; a
  squatter holding the pipe without the secret is refused
  (`insecure-runtime`); a runtime shutting down leaves its successor's secret.
  The location rules run everywhere. `localRuntime.test.ts`,
  `harnessAdapterRuntime.test.ts` and `bootstrapAbort.test.ts` pass on Windows
  (the fake runtime in the last one now listens through the real endpoint).
- Full suite on Windows with only the native-Windows refusal patched locally:
  652 tests, 575 pass (536 after WF-309); every `unsupported-platform` failure
  is gone. Of the rest, the `EBUSY` teardown failures in
  `reviewingApplication.test.ts` and `workspaceProjectionLive.test.ts`
  (WF-306) move between tests from run to run; those tests run the Workspace
  in process and never reach a pipe (that file alone: 36 such failures
  on the previous commit, 37 with this change).
- **Not covered:** a second Windows account connecting or squatting (Node's
  default pipe security gives Everyone only read, which should not even let
  them connect read-write, unverified); a runtime started by the launcher end
  to end, which still needs the refusal lifted (WF-315) and runtime stop on
  Windows (WF-311); arm64. A connection still in the handshake does not count
  as runtime activity, so an idle runtime may shut down under a connecting
  client, which then retries like any refused connection. Not run here: macOS
  and Linux; run `Verify` on `windows`.
