---
id: WF-004
title: "Establish Pi’s integration envelope"
status: closed
labels:
  - wayfinder:research
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: []
created: 2026-07-14
assets:
  - "git branch research/pi-integration at 58d1405"
  - "docs/research/pi-integration.md on that branch"
---

## Question

Which officially supported Pi extension and SDK capabilities can Neoflow rely on for context exchange, request submission, streaming status, cancellation, tool activity, Planning, Reviewing, and session identity, and which desired interactions need explicit fallback behavior?

## Resolution comment

Pi 0.80.6 supports the primitives Neoflow needs to submit ordinary messages, observe assistant and tool streaming, query session-wide busy state, request best-effort cancellation, identify session/workspace, and detect terminal idle through `agent_settled`. An attached extension preserves the live Pi environment, but Pi supplies no remote-attach transport, request correlation, reconnect protocol, or Neoflow workflow semantics; those remain Neoflow-owned.

Pi has no built-in Planning or Reviewing model, generic permission status, or enforced read-only mode. The honest attached v1 envelope is one canonical workspace, one Pi session, one in-flight host-to-Pi request, explicit bridge/start/settled milestones, minimal redacted observation, no automatic resend or cross-session continuation, and retained artifacts on ambiguous outcomes. Review success can mean only that Pi settled, not that feedback was applied correctly. Safe Planning and question-only Review require an audited per-request gate or an isolated Neoflow-managed SDK/RPC session; prompt-only safety must not be advertised as enforcement.

Primary-source report: `docs/research/pi-integration.md` on branch `research/pi-integration`, commit `58d1405`, covering installed Pi 0.80.6 and the current connector as non-authoritative evidence.
