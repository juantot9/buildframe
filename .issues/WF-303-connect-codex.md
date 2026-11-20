---
id: WF-303
title: "Connect Codex"
status: closed
labels:
  - wayfinder:task
parent: WF-289
assignee: null
blocked_by: [WF-302]
created: 2026-11-19
---

## Question

Add a Codex connector on the connector kit, through Codex's app-server
protocol, within what WF-302 found Codex supports.

## Direction (from WF-302)

- A BuildFrame helper process that is an app-server client of Codex's shared
  daemon, attaches to the thread the user connects, and maps turn events to
  kit facts by turn ID and `clientUserMessageId`.
- Refuse when the TUI runs its own embedded server; never resend a submit;
  never answer approval requests (they belong to the TUI).
- Run the note's experiments before code, on an isolated `CODEX_HOME` with a
  local fake model, against the Codex version current at that time.

## Verification

- Contract tests through the kit's in-memory host.
- One live connect-and-send round trip on each verified Codex version.
- `pnpm verify` passes; `doctor` reports the connector.

## Branch

`main`.

## Owner decisions (2026-11-19)

- **Trigger:** `!buildframe` (Codex's shell escape), nothing installed into
  Codex. Revisit only if experiment 4 shows its output entering the model's
  context.
- **Send path:** the experimental start-if-idle `thread/queue/*` API; version
  admission accepts only verified Codex versions.
- **WebSocket client:** no new dependency unless Node's built-in client can't
  reach the Unix socket (experiment 8); `ws` needs the owner's go-ahead.

## Experiments (2026-11-19/20)

Run on Codex 0.170.0, whose daemon auto-updated to 0.171.0 mid-run
([results](../docs/research/codex-connector-wf303-experiments.md)). Shared
attach, exact bytes, per-turn attribution, interrupt, withdraw, the embedded
check and a dependency-free Node WebSocket client all hold. Changes to the plan:

- Send with `thread/queue/add` then `thread/queue/start` (the queue stops
  dispatching after an interrupt).
- The daemon updates itself overnight regardless of config, so admission must
  read the server's version on every connect.
- `!buildframe`'s command and output enter the model's context (decision
  revisited below).
- Quitting the TUI sends no signal; Codex keeps the session as a task.

Owner decisions (2026-11-20, after the experiments):

- **Keep `!buildframe`**, printing one line, since its output reaches the
  model's context.
- **Admit a range, checked live:** any Codex from 0.170.0 up within 0.x; on
  every connect, check the queue methods behave as verified and refuse if not.
  Doctor flags untested versions. (Replaces "verified versions only".)

## Resolution (2026-11-20)

- `packages/codex-adapter`: `appServerClient.ts` (JSON-RPC over WebSocket over
  Codex's Unix socket, hand-written, no dependency; never answers approvals),
  `codexAdapter.ts` (turn-ID and `clientUserMessageId` correlation; sends with
  `thread/queue/add` + `thread/queue/start`; never resends), `helper.ts`
  (`!buildframe`, `status`, `disconnect`; a detached helper that refuses
  private-server sessions, checks the server version and the queue API on every
  connect, and reconnects after Codex's self-updates).
- `buildframe` switches to Codex mode when `CODEX_THREAD_ID` is set, so the
  connector ships inside `@buildframe/cli`; no Codex install step. Doctor,
  `support/manifest.json` and the README list Codex.
- Verified live (dev build, Codex 0.170.0 TUI on a 0.171.0 server, fake model):
  connect, exact delivery, answered; Enter mid-turn → unknown; Tab mid-turn →
  answered; `status` / `disconnect`; BuildFrame's header follows. `pnpm verify`
  passes (612 tests); release assembly checks `!buildframe status` on the
  bundled CLI.
- Known: `!buildframe` resolves through the user's login-shell PATH, so it
  needs an `@buildframe/cli` that includes this change (0.1.0 opens the app
  instead). Not covered: approvals during BuildFrame's turn, compaction,
  subagents, Stop hooks.
