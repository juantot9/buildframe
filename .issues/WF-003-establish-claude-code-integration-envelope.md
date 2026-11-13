---
id: WF-003
title: "Establish Claude Code’s integration envelope"
status: closed
labels:
  - wayfinder:research
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: []
created: 2026-07-14
assets:
  - "git branch research/claude-code-integration at 1f4ada2"
  - "docs/research/claude-code-integration.md on that branch"
---

## Question

Which officially supported Claude Code integration surfaces and lifecycle events can Neoflow rely on for context exchange, request submission, streaming status, cancellation, tool activity, Planning, Reviewing, and session identity, and which desired interactions are unsupported or unsafe to promise?

## Resolution comment

Claude Code offers two distinct envelopes. An Agent SDK-owned subprocess is full duplex but is not attachment to the user’s foreground Claude process and carries separate authentication/product constraints. A foreground Claude Code session exposes rich plugin hooks, skills, and MCP interactions, but no stable general host API for arbitrary message injection, cancellation, authoritative busy state, or event replay.

The honest attached v1 is pull-based: a Claude plugin observes lifecycle events, captures and synchronously gates `ExitPlanMode` proposals, and provides a user-invoked namespaced Review skill that pulls an immutable Neoflow batch into the active conversation. Neoflow may correlate line-batched assistant output, tool observations, permission attention, normal `Stop`, and `StopFailure`; it must retain state on interrupts, missing terminal evidence, disconnects, or identity ambiguity. Immediate Review push remains prototype-gated, and host-initiated Chat/Plan, foreground cancellation, remote permission decisions, and Pi-style parity must be advertised as unavailable.

Primary-source report: `docs/research/claude-code-integration.md` on branch `research/claude-code-integration`, commit `1f4ada2`, covering Claude Code v2.1.209 and Agent SDK v0.3.209 as observed on 2026-07-14.
