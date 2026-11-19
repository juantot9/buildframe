---
id: WF-310
title: "Connect to the runtime over a named pipe"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: null
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
