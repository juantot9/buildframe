---
id: WF-021
title: "Establish Pi and Claude Code context-budget evidence"
status: closed
labels:
  - wayfinder:research
parent: WF-001
assignee: juanan
blocked_by: [WF-014]
created: 2026-07-16
assets:
  - "git branch research/context-budget-evidence at 0c4abd9"
  - "docs/research/pi-claude-context-budget-evidence.md on that branch"
---

## Amendment (2026-09-08)

[Reframe Reviewing around the current repository](./WF-225-reframe-reviewing-around-the-current-repository.md) and its confirmed child map drop Context Budget Evidence from the ordinary Reviewing flow: no token estimates, no model-capacity/usage pairing, no telemetry-driven UI for review messages. The exact outgoing-message byte and character counts remain, shown through the optional What-will-be-shared preview. The research and freshness/provenance rules above remain valid reference material for any future, separately justified attached-session telemetry work.

## Question

Which current-context usage, context-window capacity, active-model identity, tokenizer identity, compaction, and proposed-payload facts can attached Pi and Claude Code expose through supported first-party APIs, hooks, or extension surfaces reliably enough to become Context Budget Evidence, and which facts must remain estimated or unknown?

## Blocked by

- [Discover capabilities that reinforce the core workflows](./WF-014-discover-reinforcing-capabilities.md)

## Resolution comment

Research against Pi 0.80.7 and Claude Code 2.1.211 establishes a useful but intentionally asymmetric Context Budget Evidence contract. Neoflow always knows exact proposed-Handoff bytes, characters, selected records, and files. Harness telemetry stays separate and carries its active-model binding, declared capacity, source, observation cadence, and freshness; model or session change, compaction, Attachment or bridge loss, and the period before a fresh matching response make current usage `unknown`.

Pi’s attached extension can publish the active provider/model and registry-declared context window through `ctx.model` and `model_select`. `ctx.getContextUsage()` is suitable only as **Pi-estimated current usage**: it anchors to the last valid provider usage, adds trailing messages with Pi’s generic characters/4 heuristic, and returns unknown immediately after compaction. Because the implementation does not ensure its last usage belongs to a newly selected model, the Adapter must invalidate the meter on `model_select` until a matching assistant response arrives. Pi’s before/after compaction events reliably expose manual, threshold, or overflow trigger and completion.

Claude Code’s ordinary plugin hooks expose neither current usage nor capacity, and `SessionStart.model` is optional and does not follow later `/model` changes. A configured status-line command is the only documented attached-session surface carrying live `model.id`, `context_window_size`, current input/cache components, and used/remaining percentages. It reports the most recent API response, uses input-only percentage, and returns null before the first response and after compaction until another response. Plugins cannot ship a main `statusLine` default, so the Claude Adapter may advertise this telemetry only after an explicit verified bridge preserves the user’s existing status line; otherwise usage and capacity remain unavailable. `PreCompact` and `PostCompact` hooks still expose manual/automatic compaction independently of that bridge.

Neither attached path exposes tokenizer identity or a tokenizer-specific preflight count for Neoflow’s proposed payload. Pi’s public fallback is generic characters/4. Anthropic’s separate model-specific Token Count API remains an estimate, requires separate API authentication, and cannot reconstruct Claude Code’s hidden complete request; it is outside the attached, credential-free v1 envelope.

No percentage predicts model quality, and no threshold authorizes automatic compaction, clearing, or session replacement. Last-response readings are stale advisory evidence during an active turn. The UI may pair fresh evidence with user-controlled **Continue in Another Session**, but must never combine Pi and Claude accounting into false parity.

Primary-source report: `docs/research/pi-claude-context-budget-evidence.md` on branch `research/context-budget-evidence`, commit `0c4abd9`. The sharpened freshness and provenance rules are recorded in [`CONTEXT.md`](../CONTEXT.md).
