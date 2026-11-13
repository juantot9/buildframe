---
id: WF-019
title: "Probe Pi’s attached-session guarantees"
status: closed
labels:
  - wayfinder:task
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: [WF-018]
created: 2026-07-14
assets:
  - "git branch task/pi-attached-guarantees at d944606"
  - "docs/research/pi-attached-live-probes.md on that branch"
  - "docs/probes/pi-attached/ reproducible probe harness on that branch"
---

## Question

Run focused live probes against the pinned Pi version to record which attached-session guarantees actually hold for submission acceptance, terminal settlement, retries, cancellation races, busy state, session changes, recovery, and any selected read-only gate strategy.

## Blocked by

- [Choose the harness operating posture](./WF-018-choose-harness-operating-posture.md)

## Resolution comment

Ran deterministic probes through the real Pi 0.80.6 agent/session/extension runtime and two PTY-driven live TUI smokes. The asset includes reproducible submission, interception, busy, retry, cancellation, tool-gate, session-switch, and restart/recovery scenarios.

The reliable attached contract is `idle preflight → submit → observed agent_start → zero or more low-level runs/retries → agent_settled`. `sendUserMessage()` returned `undefined` rather than an acceptance result. An extension input handler could consume the request without any run, and a busy submission without `deliverAs` returned normally while Pi emitted an asynchronous extension error in both RPC-driven and real TUI probes. Consequently the connector needs a start timeout and cannot rely on its synchronous `try/catch`.

Retries produced provisional assistant errors and `agent_end(willRetry=true)` before another `agent_start`; only `agent_settled` established terminal idle. Abort during streaming produced a settled `aborted` assistant state, while an abort after natural settlement did not change success, so cancellation must be derived from final evidence rather than local intent.

A request-scoped read-tool gate is viable in a cooperative extension environment: set the exact active tools before submission, deny every non-read `tool_call`, restore on settlement or no-start timeout, and prevent session replacement during the owned run. The probe blocked a deliberately retained mutating tool and never wrote its sentinel. This is registered-tool policy, not OS isolation or protection from arbitrary trusted extensions.

Idle session replacement cleanly created a new session epoch. Replacement during an active run invalidated the old context without an ordinary terminal sequence, so it must be blocked or recorded as interrupted. A Pi custom request marker survived restart and resume, but provides reconciliation evidence only—no missed-event replay or proof of outcome.

Asset: `docs/research/pi-attached-live-probes.md` and `docs/probes/pi-attached/` on branch `task/pi-attached-guarantees`, commit `d944606`.
