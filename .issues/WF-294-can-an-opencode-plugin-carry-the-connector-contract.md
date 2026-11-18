---
id: WF-294
title: "Can an OpenCode plugin carry BuildFrame's connector contract?"
status: closed
labels:
  - wayfinder:research
parent: WF-289
assignee: null
blocked_by: []
created: 2026-11-17
---

## Question

Before any OpenCode code: can an OpenCode plugin or extension give BuildFrame
what Pi and Claude give it today, inside the session the user explicitly
connects?

## What must be true

Answer each from OpenCode's primary sources (docs, source, changelog), with
the version each answer holds for:

1. **Connect.** A user command (like `/buildframe`) in one existing session
   that the plugin can bind to; one session per repository, newest wins.
2. **Exact delivery.** The plugin can submit a message as a normal user turn
   in that exact session, with the bytes unchanged.
3. **Turn lifecycle.** The plugin observes, for that exact turn, start, normal
   end, failure and interruption, without guessing from text or timing.
4. **Interrupt.** The plugin can stop that turn.
5. **Concurrency.** What happens when the user types while BuildFrame's turn
   runs; can the plugin tell the turns apart?
6. **Process model and transport.** Where plugin code runs (in-process,
   separate process, language), and whether it can open a Unix socket to the
   local runtime or needs a helper like Claude's.
7. **Install and versioning.** How users install it, how BuildFrame pins the
   verified versions, and how a plugin learns the host version.
8. **Permissions.** Whether the delivered turn runs with the user's normal
   permissions.

## Output

`docs/research/opencode-connector-wf294.md` with sources, a yes/no/partial per
point, and what the connector kit (WF-293) must add, if anything. Stop and
report if point 2 or 3 is a no: that decides whether OpenCode is possible
without an honest "unknown" outcome on every Message.

## Resolution (2026-11-17)

Answered from source and docs at OpenCode `2.3.0` (`a6b15d3`) and `1.19.6`
(`f4e363c`); nothing was run. Full note:
[`docs/research/opencode-connector-wf294.md`](../docs/research/opencode-connector-wf294.md).

- **Possible, on OpenCode 2 only.** Exact delivery (point 2) is yes: a
  BuildFrame-chosen message ID, idempotent on retry, text unchanged. Turn
  lifecycle (point 3) is conditional: enqueued, delivered and cancelled name
  BuildFrame's ID, but finished, failed and interrupted name only the session,
  so an outcome is attributable only when no other input landed inside
  BuildFrame's turn; otherwise it is unknown.
- **Main risks:** more unknown outcomes than Pi or Claude (background subagent
  reports and mid-turn typing land in the session); one shared, possibly
  remote, long-lived host process; a fast-moving API with no compatibility
  gate.
- **Kit requirements** (feed WF-293): turn identity minted before submission;
  one exclusive-window correlation rule shared by all connectors; status that
  can be absent; no process-global state; runs under Bun as well as Node;
  locality checks; per-host version admission.
- **Before WF-295 code:** the note's seven zero-cost experiments with a local
  mock provider, and two owner decisions — block or queue prompts typed during
  BuildFrame's turn, and whether OpenCode 1 is supported at all
  (recommendation: no).
