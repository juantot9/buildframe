---
id: WF-293
title: "Build the connector kit and move Pi and Claude onto it"
status: open
labels:
  - wayfinder:task
parent: WF-289
assignee: null
blocked_by: []
created: 2026-11-17
---

## Question

The Pi and Claude connectors each carry ~300 lines that are copies of each
other. OpenCode would copy them a third time. Deepen
`@buildframe/local-runtime/harness-adapter` so a connector writes only its
host glue, and move both existing connectors onto it with no behaviour
change.

## Evidence (at `f7e4ac7`)

What `harnessAdapter.ts` gives today: `connectHarnessAdapterRuntime(request)`
(`:288`) — one connection attempt (socket, bootstrap, establish, forwarding
directives, evidence request IDs). No retry, no evidence queue, no
replacement handling.

What each connector re-implements (Pi / Claude):

| Piece | Pi | Claude |
|---|---|---|
| Reconnect constants, `wait()`, `retryable()` (byte-identical) | `extension.ts:17-57` | `helperEntry.ts:17-45` |
| `diagnosticLabel()` | `extension.ts:92-108` | `helperEntry.ts:47-55` |
| Reconnect loop (connect → retry or refuse → connected → await close → replaced vs disconnected → wait) | `extension.ts:115-176` | `helperEntry.ts:172-228` |
| Evidence `#emit`/`#queueEvidence`/`#flushEvidence` (identical apart from line breaks) | `piAdapter.ts:743-816` | `claudeDirectAdapter.ts:526-595` |
| Bridge evidence identity (third copy in `local-runtime/src/protocol.ts:602-611`) | `piAdapter.ts:233-242` | `claudeDirectAdapter.ts:107-116` |
| Exact Review Message decode/verify | `piAdapter.ts:186-199` | `claudeDirectAdapter.ts:71-85` |
| Attachment identity | `piAdapter.ts:264-285` | `claudeDirectAdapter.ts:146-166` |
| `runtimeConnected` / `runtimeDisconnected` | `piAdapter.ts:444-489` | `claudeDirectAdapter.ts:265-308` |
| `#perform` preamble (attachment check, interrupt, manifest version) | `piAdapter.ts:505-534` | `claudeDirectAdapter.ts:310-344` |
| Lost correlation, finish, availability evidence | `piAdapter.ts:677-741` | `claudeDirectAdapter.ts:461-524` |

Also inside local-runtime: `harnessAdapter.ts` repeats `connectSocket`,
`mapLocationProblem` and `mapBootstrapRejection` from `client.ts`
(`client.ts:260-341` vs `harnessAdapter.ts:85-142`). A `released` frame
becomes close reason `replaced` but never calls `connection.release()`
(`:213-215`).

Real per-host logic that stays in each connector: Pi's tool gating and
correlation marker; Claude's Mod-fact state machine
(`claudeDirectAdapter.ts:177-242`), helper HTTP server and plugin.

## Direction

- One deep module behind `@buildframe/local-runtime/harness-adapter`: a
  connector session that stays connected. It owns attach/reconnect/backoff,
  the replaced-vs-disconnected rule (`replaced` never reconnects), the
  evidence queue and flush with acknowledgement retry, bridge-loss evidence,
  exact message decoding and the `perform` preamble.
- A connector supplies a small host port: its manifest, a way to report
  status to the user, and how to start, observe and interrupt a turn.
- Two real adapters (Pi, Claude) sit at the seam from day one; an in-memory
  host is the test adapter.
- No change to the Workspace contracts (`ReviewedHarnessAdapter`,
  `ReviewedHarnessConnection`, directive and evidence kinds), the wire
  protocol, or the protocol version.
- Design the host port twice before coding (codebase-design
  `DESIGN-IT-TWICE`), checked against what WF-294 learns about OpenCode.

## Verification

- Pi and Claude contract and scenario tests pass unchanged.
- New tests at the kit's interface: retry and refuse rules, replacement,
  evidence queued across a disconnect and flushed once, acknowledgement
  retry on `state-version-changed`.
- Each connector's remaining source is only host glue (line counts recorded).
- `pnpm verify`, `pnpm risk:pi`, `pnpm smoke:build` pass; one live
  connect-and-send round trip per host.
