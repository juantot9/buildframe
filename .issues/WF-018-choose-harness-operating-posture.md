---
id: WF-018
title: "Choose the harness operating posture"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: [WF-003, WF-004]
created: 2026-07-14
assets: []
---

## Question

Should Neoflow v1 work only with user-owned live harness sessions, also offer Neoflow-managed isolated harness sessions where stronger control is required, or support both—and how should that choice preserve the companion boundary and a coherent workflow?

## Blocked by

- [Establish Claude Code’s integration envelope](./WF-003-establish-claude-code-integration-envelope.md)
- [Establish Pi’s integration envelope](./WF-004-establish-pi-integration-envelope.md)

## Resolution comment

Neoflow v1 supports only user-owned live harness sessions. The user starts Pi or Claude Code; the harness retains ownership of its conversation, authentication, models, tools, permissions, and execution policy; Neoflow attaches as a workflow companion.

Neoflow will not launch an SDK/RPC-managed or isolated harness as a hidden fallback. Capability asymmetry is part of the product contract: each attachment advertises only verified behavior, and unsupported actions are disabled or replaced by an explicit manual handoff. In particular, Claude Code may require a user-invoked command in the harness, while Pi may support direct submission if its live probes validate that path.

When an attached harness cannot provide a required safety or lifecycle guarantee, Neoflow must preserve the artifact and fail closed or describe the limitation accurately. Prompt-only restrictions must never be presented as enforced safety. A managed-harness mode is deferred as a separate future product decision rather than treated as part of v1.
