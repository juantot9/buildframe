---
id: WF-293
title: "Build the connector kit and move Pi and Claude onto it"
status: closed
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

## Resolution (2026-11-18, before code)

Designed three ways (smallest interface, most flexible, common case trivial);
the owner took the recommended hybrid and one shared correlation rule.

**Interface** — `openConnectorSession(options)` on
`@buildframe/local-runtime/harness-adapter` returns a `ConnectorSession` that
*is* the `ReviewedHarnessAdapter` and also keeps itself connected:

- `attach(onStatus?)` resolves with the first status and keeps reconnecting
  (250 ms doubling to 5 s; only `runtime-unavailable` not-running /
  connection-failed / timeout retry; `replaced` never reconnects);
  `close()` stops it. Statuses carry ready-made text.
- `observe(fact)` takes host facts, applied in call order: `turn-started`
  (`own`, `turnId?`), `turn-ended` (`outcome` incl. `unknown`, `turnId?`,
  `answer?`), `input` (`joins: 'this-turn' | 'next-turn'`),
  `own-input-dropped`, `own-input-unknown`, `session-ending`.
- The host port: `submit(turn, signal)` returns a receipt (`taken`,
  `harness-rejected`, `host-unavailable`, `unknown`), sync or async, so a
  two-step handshake (Claude's Mod) stays in host glue; `interrupt(turn)`;
  optional `isIdle`, `render` (non-message directive kinds), `prepare`
  (Pi's read-only tool gate) and `release(turn, how)` (Pi: restore tools,
  stop a run whose correlation was lost).
- `naming` keeps today's identity strings byte-identical.

**One correlation rule.** An outcome is attributable only when our own turn
started, no foreign input landed or queued before that start, no other turn
started, foreign input never joined our turn, and turn IDs agree when both are
known. Otherwise: `correlation-lost` before our start, `terminal-evidence-lost`
after it (also when our start evidence was never applied). A no-start timeout
is a proven rejection only when `isIdle()` says idle; otherwise unknown.
Availability is derived (ended / busy / available) and reported on change.

**Accepted behaviour changes** (owner, 2026-11-18; none can turn an unknown
into a success): Pi reports `busy` while its own turn runs; Pi reports
`correlation-lost` (not `terminal-evidence-lost`) for an end before its start;
a second start inside a Pi turn loses correlation; Pi refuses dispatch after
session end; Pi refuses invalid material before touching the tool gate; Pi's
tools are restored before its loss evidence is sent; Claude reports
`terminal-evidence-lost` when its start evidence was never applied; Pi's
no-start timer is armed once the send is taken, not before it.

**Layout.** Kit files under `packages/local-runtime/src/connector/`, each
under the file size budget; `harnessAdapter.ts` re-exports.

## Implementation evidence (2026-11-18)

- Kit: `packages/local-runtime/src/connector/` — `session.ts` (turn tracker,
  correlation rule, `perform`), `attachLoop.ts`, `evidenceOutbox.ts`,
  `turnEvidence.ts` (identities, exact message decoding, Response bound),
  `contracts.ts`. `harnessAdapter.ts` adds `openConnectorSession` and
  `exactReviewMessageText`; the kit receives the single-attempt connect
  function, so there is no import cycle and the loop is testable on its own.
- Built during implementation: `submit` answers synchronously (`taken`,
  `pending`, or a refusal) and a pending answer arrives as an ordered fact
  (`own-input-taken` / `-refused` / `-unknown`). A promise receipt would have
  let the next native fact overtake the confirmation. Session end releases a
  turn as `ended`, so Pi does not interrupt a closing session. Pi's no-start
  timer stays armed before its send, as before.
- Connectors (lines): Pi `piAdapter.ts` 819 → 446, `extension.ts` 329 → 221;
  Claude `claudeDirectAdapter.ts` 596 → ~165, `helperEntry.ts` 229 → 155.
  Public classes and methods are unchanged.
- Tests: Claude's 27 pass unchanged. Pi's pass with three assertions moved for
  the accepted availability change (an availability item now follows the
  start or loss evidence). New kit tests at its interface:
  `connectorCorrelation.test.ts` (the rule as a fact-sequence table,
  Response bound, single flight, no-start, pending receipts, runtime and
  session loss, two sessions in one process) and `connectorAttach.test.ts`
  (retry, refusal, reconnect vs replaced, evidence held and delivered once,
  acknowledgement retry).
- Checks (macOS, Node 26.5.1): `pnpm verify` passed (74 files / 556 tests,
  lint at the 36-warning baseline, firewall, typecheck, build, build and
  Claude Direct smokes); `risk:pi` (Pi 1.5.0 live probe), `risk:runtime`,
  `risk:dogfood` passed.
- Landed in `5079c68`. Live check on 2026-11-18 with the packed CLI and Pi
  package from that commit, Pi 1.5.2 and Claude Code 2.1.323, in a throwaway
  repository: Pi answered a Message; `/buildframe` in Claude replaced Pi, which
  was told and stayed disconnected; Claude answered; Pi took the connection
  back and Claude was told; `x` interrupted a running Pi turn; a stopped
  runtime left Pi retrying and it reconnected when BuildFrame started again;
  exiting Pi showed it disconnected; `/buildframe readonly` refused an edit and
  Pi's full tools came back afterwards. Not checked live: typing during a
  running Send (covered by the kit's tests).
