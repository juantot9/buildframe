---
id: WF-002
title: "Learn from Plannotator’s artifact-review loop"
status: closed
labels:
  - wayfinder:research
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: []
created: 2026-07-14
assets:
  - "git branch research/plannotator-artifact-review at 2ab3ed2"
  - "docs/research/plannotator-artifact-review.md on that branch"
---

## Question

Which Planning and Reviewing interaction patterns, artifact structures, annotation semantics, and harness-handoff behaviors from current Plannotator primary sources should Neoflow adopt, adapt, or explicitly reject given its terminal-first companion boundary?

## Resolution comment

Adopt Plannotator’s core artifact gate: immutable revisions, visible revision diffs, structured anchored feedback, explicit decisions, durable generation-aware drafts, user-controlled stale-diff handling, capability-driven handoff, stable asynchronous decision identities, and submission preflight.

Adapt it by keeping Planning and Reviewing as distinct lifecycles over shared artifact/annotation primitives; using stable workspace-scoped identities; reducing annotations to explicit intent; delegating direct editing to `$EDITOR`; separating approval from execution handoff; and recording connector acceptance, harness outcome, and local queue disposition independently.

Reject its browser/server application shape, embedded providers and editors, companion-owned execution phases, weak title/content identity, silent auto-approval, feedback rerouting, automatic diff refresh, and optimistic completion before the receiving harness reaches a correlated terminal outcome.

Primary-source report: `docs/research/plannotator-artifact-review.md` on branch `research/plannotator-artifact-review`, commit `2ab3ed2` (Plannotator v0.23.1 at pinned commit `29513e1984805a582e644b192b82a8d9cec31943`).
