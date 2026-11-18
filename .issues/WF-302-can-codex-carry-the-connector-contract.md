---
id: WF-302
title: "Can Codex carry BuildFrame's connector contract?"
status: open
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
