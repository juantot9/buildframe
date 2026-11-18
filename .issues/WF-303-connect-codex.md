---
id: WF-303
title: "Connect Codex"
status: open
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
