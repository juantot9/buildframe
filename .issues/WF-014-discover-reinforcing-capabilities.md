---
id: WF-014
title: "Discover capabilities that reinforce the core workflows"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: juanan
blocked_by: [WF-009, WF-011, WF-012]
created: 2026-07-14
assets: []
---

## Question

Which additional capabilities materially reduce context switching, uncertainty, or lost work around Planning and Reviewing without turning Neoflow into a generic AI terminal or sacrificing its simple default path?

## Blocked by

- [Shape the editor-companion workflow](./WF-009-shape-editor-companion-workflow.md)
- [Set trust and consent guardrails](./WF-011-set-trust-consent-guardrails.md)
- [Choose the terminal interaction system](./WF-012-choose-terminal-interaction-system.md)

## Resolution comment

A reinforcing feature enters consideration only when it supports a named point in Planning or Reviewing, works from Neoflow’s durable Artifacts or Workflow state, and remains optional on the simple default path. Features should differentiate Neoflow through exact continuity across editor, Harness, Planning, and Reviewing—not through broader AI generation, orchestration, or feature count. “Feature” remains ordinary product language; **Harness Capability** retains its precise integration-contract meaning.

V1 consideration should include **Plan-to-Review Continuity**: `Start review from this implementation` may use the Implementation Baseline as the Change Set basis, keep the approved Plan Revision inspectable beside the Review, and let Review Findings cite exact Plan Anchors through Evidence References. It never attributes changes to the Harness, turns the Plan into tasks, maps changes to Plan steps automatically, scores compliance, or marks Plan items complete.

**Artifact Lineage Comparison** should let the user compare any two exact Plan Revisions or Review Snapshots in one lineage while preserving both identities and provenance. It remains a contextual `Compare with…` action and provides no LLM summary, replacement claim, or implied supersession.

**Continue in Another Session** should make a Workflow independent from Harness-session lifetime. The user may continue in a fresh session of the same Harness or move between Pi and Claude Code without losing Neoflow-owned state. Neoflow neither clears, closes, launches, nor transfers Harness conversations. A compact immutable **Continuation Brief** carries the Workflow goal, current position, unresolved items, an optional transition note, and explicitly selected exact Artifacts through a new destination-scoped Handoff. A capability-aware chooser presents only route, effect-constraint, outcome-evidence, interruption, and context-budget differences relevant to the intended Handoff; it never ranks Harnesses or models.

Changing sessions never rewrites prior Invocation evidence. If prior work is active or unresolved, repeating the same Handoff follows Explicit Resubmission and names duplicate-execution risk; a different Handoff uses one composed gate naming the old session, last trustworthy evidence, and possible overlapping effects. The user remains able to proceed deliberately rather than being deadlocked.

**Context Budget Evidence** should accompany Handoff curation and continuation. Neoflow always exposes exact proposed payload size, adds a tokenizer-specific estimate only when the relevant tokenizer is known, and shows current context usage only when reported reliably by the Attached Harness. These measurements remain separate; missing evidence is `unknown`. `Continue in another session` stays available nearby, but Neoflow never guesses usage from transcript length, predicts behavior from a percentage, interrupts at a default threshold, or changes sessions automatically.

Two quieter features reinforce durability without adding setup: **Workflow Resume** returns from Home to the semantically relevant durable state rather than restoring ephemeral UI or inventing tasks; **Context Reuse** seeds a new draft selection from an existing context snapshot while previewing refreshed, changed, missing, or newly sensitive material under a fresh commitment. Named templates and automatic inheritance are excluded.

The portfolio deliberately excludes workspace-wide full-text or semantic knowledge search, Neoflow-generated summaries or judgments, service-specific issue and PR integrations, generic scratchpads and task lists, folders/tags/arbitrary knowledge graphs, Git mutation, automatic context pruning, automatic session management, multi-Harness execution or orchestration, transcript transfer, and generic agent or terminal behavior. Existing contextual history, Code Inquiry, Context Import, storage, recovery, export, editor navigation, and progressive capability detail remain supporting parts of previously settled decisions rather than new standalone product directions.
