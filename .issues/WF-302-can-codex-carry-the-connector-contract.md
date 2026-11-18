---
id: WF-302
title: "Can Codex carry BuildFrame's connector contract?"
status: closed
labels:
  - wayfinder:research
parent: WF-289
assignee: null
blocked_by: []
created: 2026-11-18
---

## Question

Before any Codex code: can OpenAI's Codex CLI (through a plugin, hook,
extension, MCP server, or its app-server protocol) give BuildFrame what Pi,
Claude Code and OpenCode give it today, inside the interactive session the
user explicitly connects?

## What must be true

The same eight points as [WF-294](./WF-294-can-an-opencode-plugin-carry-the-connector-contract.md),
answered from Codex's primary sources with the version each answer holds for:

1. **Connect.** A user command (like `/buildframe`) in one existing session.
2. **Exact delivery.** A message submitted as a normal user turn in that exact
   session, bytes unchanged.
3. **Turn lifecycle.** Start, normal end, failure and interruption of that
   exact turn, without guessing from text or timing.
4. **Interrupt.** Stopping that turn.
5. **Concurrency.** What happens when the user types during BuildFrame's turn.
6. **Process model and transport.** Where connector code runs, and whether it
   can reach the local runtime's Unix socket or needs a helper.
7. **Install and versioning.** How users install it, how versions are pinned,
   how the connector learns the host version.
8. **Permissions.** Whether the turn runs with the user's normal approvals and
   sandbox.

## Output

`docs/research/codex-connector-wf302.md` (plus an `-evidence.md` file if it
runs long), shaped like the OpenCode note: verdict, versions, a yes/no/partial
table, what the connector kit must add, and live experiments to run before
code. Stop and report if point 2 or 3 is a no.

## Branch

Connector work lives on `main`; Planning work lives on `planning`.

## Resolution (2026-11-19)

Answered from source and docs at Codex CLI `0.170.0` (`rust-v0.170.0`,
`29eb79e`); nothing was run. Full note:
[`docs/research/codex-connector-wf302.md`](../docs/research/codex-connector-wf302.md).

- **Possible, through Codex's app-server protocol, not a plugin.** The TUI is
  itself an app-server client of a shared background server (the daemon); a
  BuildFrame helper can attach to the same live thread over the daemon's Unix
  socket. Exact delivery (2) and turn lifecycle (3) are yes, and every event
  names the turn, which is stronger than OpenCode.
- **Conditions:** the TUI must be on the daemon (`--no-daemon`, `--profile`
  and `-c` overrides run a private server: refuse); no custom `/buildframe`
  (unknown slash commands are rejected), so the trigger is `!buildframe` or a
  plugin hook; BuildFrame must queue its turn with the experimental
  start-if-idle `thread/queue/*` API; the helper needs a WebSocket client over
  the Unix socket; Codex ships about one stable release a day.
- Spot-checked against source (2026-11-19): the tag's commit, the embedded
  fallback conditions, the slash-command rejection, `clientUserMessageId`.
- Follow-up: [WF-303](./WF-303-connect-codex.md).
