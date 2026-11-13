---
id: WF-025
title: "Probe Pi’s Plan Revision capture guarantees"
status: closed
labels:
  - wayfinder:task
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: [WF-017]
created: 2026-07-16
assets:
  - "git branch research/pi-plan-revision-capture at 9da0c2a"
  - "docs/research/pi-plan-revision-capture.md on that branch"
  - "docs/probes/pi-plan-revision-capture/ reproducible probe harness on that branch"
---

## Question

Using the supported attached Pi runtime, can Neoflow correlate one direct Plan-generation Handoff with one complete, exact assistant result suitable for an immutable Plan Revision across ordinary settlement, multiple assistant messages, low-level retries, partial output, tool activity, failure, interruption, no-start, session replacement, disconnect, and restart—and which observed event or stored value, if any, authoritatively establishes those exact bytes and their completeness?

## Blocked by

- [Test the blueprint for completeness](./WF-017-test-blueprint-completeness.md)

## Resolution comment

Pi 0.80.10 does not expose one request-correlated result or one value that proves both exact assistant content and complete run settlement. It exposes separate facts: finalized structured `AssistantMessage.content`, most safely read from the settlement-time session branch after every `message_end` handler and Pi persistence step, and a payload-free `agent_settled` event proving that no automatic retry, compaction retry, or queued continuation remains. Pi supplies neither canonical result bytes nor semantic Plan completeness; Neoflow must define a lossless content-block encoding and durably capture it itself.

A direct result is therefore only conditionally capturable in one uninterrupted, exclusively owned Attachment epoch: correlate through Neoflow’s single-flight Handoff state, observe `agent_start`, exclude or detect unrelated continuations, wait for `agent_settled`, and select an unambiguous final stored assistant message with `stopReason: "stop"`. This establishes one transport-complete candidate value, not that it is a complete or correct Plan. Capturing an early `message_end`, `agent_end`, streamed deltas, or Pi’s lossy last-assistant-text projection is insufficient.

Tool loops, extension follow-ups, and low-level retries can all produce multiple assistant entries before one settlement. Intermediate `toolUse` and provisional retry-error messages are not results; a terminating tool can settle without a final assistant-text message. Finalized `length`, `error`, and `aborted` messages may preserve exact partial content, but none can create a complete Plan Revision. No-start and active session replacement produce no result; a natural `stop` may win an interruption race only when the full correlated settlement evidence remains intact.

Pi has no attached-host disconnect protocol, event replay, or persisted settlement record. A normal-`stop` assistant can survive process death and restart even when `agent_settled` never occurred, while a fresh-session pre-send custom marker may remain unflushed if no assistant is produced. Disconnect or restart is recoverable only when Neoflow already durably recorded a settled receipt binding the Handoff, selected session entry/content, encoding or digest, and observed settlement; otherwise the Invocation remains unresolved and must never be replayed automatically.

Primary-source report and reproducible Pi 0.80.10 probes: `docs/research/pi-plan-revision-capture.md` and `docs/probes/pi-plan-revision-capture/` on branch `research/pi-plan-revision-capture`, commit `9da0c2a`. All deterministic scenarios passed, including exact CRLF/Unicode/NUL content, tools, follow-ups, retry, truncation, failure, abort, no-start, active replacement, settled restart, and process death after a persisted normal assistant but before settlement.
