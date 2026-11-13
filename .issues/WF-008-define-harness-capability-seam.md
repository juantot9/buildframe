---
id: WF-008
title: "Define the harness capability seam"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: [WF-003, WF-004, WF-007]
created: 2026-07-14
assets:
  - "docs/blueprint/harness-capability-seam.md"
---

## Question

What is the smallest honest harness interface and capability model that keeps Neoflow’s workflows consistent while accommodating the real differences between Pi and Claude Code, including unsupported operations, failures, cancellation, and reconnects?

## Blocked by

- [Establish Claude Code’s integration envelope](./WF-003-establish-claude-code-integration-envelope.md)
- [Establish Pi’s integration envelope](./WF-004-establish-pi-integration-envelope.md)
- [Define artifact and annotation semantics](./WF-007-define-artifact-annotation-semantics.md)

## Follow-up candidates

- Prioritize and shape lightweight Code Inquiry—source navigation, immutable Source Snapshots, and discussion-only Inquiry Batches without a full Review—through [Discover capabilities that reinforce the core workflows](./WF-014-discover-reinforcing-capabilities.md) and [Set the v1 boundary and priorities](./WF-015-set-v1-boundary-priorities.md).

## Resolution comment

Use one deep Harness Interaction Module between Neoflow’s workflows and first-party Pi and Claude Adapter packages. Its small semantic Interface inspects Handoff proposals, atomically materializes exact immutable Workflow Handoffs, associates exact harness-originated Offers with explicit Workflow targets, decides associated Offers, records interruption intent, and exposes durable normalized state and change notifications. Workflows never call Adapters, format prompts, consume native event streams, inspect arbitrary error strings, or select capability identifiers directly.

Capabilities are versioned per-Handoff contracts rather than harness-wide Booleans. Each contract names a Direct, User Pull, or Native Gate route; separate available, blocked, or unknown current Availability; enforced, communicated-only, or absent Effect Constraint; a fact-by-fact Evidence Profile; an Interruption Route; route-specific expiry; and known limitations. Optional streaming, tool activity, model labels, and busy hints are Harness Observability only. Each commitment freezes the exact Capability Snapshot it relied on.

`inspect` is advisory and `commit` atomically revalidates identity, capability, availability, and route prerequisites before materializing the exact Handoff and selected path records. A compatible full-guarantee route may follow the coherent default path, but weaker guarantees, destination changes, and Manual Handoff require explicit user choice. Commitment returns a tagged durable path outcome rather than waiting for harness settlement. Duplicate handling of the exact command is idempotent; another attempt follows the selected path’s prepared, correlated-resubmission, or Manual repetition lifecycle rather than one universal retry rule.

Harness Offers and Offer Decisions remain separate from Invocations, and decision commitment remains separate from delivery. Failures normalize to unsupported, blocked, rejected, failed, or unresolved. Interruption requests never imply interruption. V1 is single-flight per Attachment Identity; reconnect requires identity revalidation, restores no missing evidence without verified replay, and never resends automatically.

Pi’s verified direct routes use observed start and settlement. Discussion-only Planning and Review may use the cooperative request-scoped read-tool gate; a future post-v1 Inquiry contract could use it only after separate validation. Mutation-authorizing Review and Implementation communicate bounded authority while Pi retains tool and permission policy. Pi has Direct Request interruption but no Native Gate or replay.

Claude Planning is Native Gate-driven: uncorrelated outbound exploration or generation remains Manual Handoff, an exact live Offer durably captures a candidate whose explicit Offer Association materializes a Plan Revision, deny can carry Feedback, and allow follows exact Approval and Implementation Handoff. Claude Review is correlated User Pull through `/neoflow:review`, with communicated-only effects, normal `Stop` and `StopFailure` evidence, User Action interruption, no trustworthy Ctrl+C terminal evidence, and no replay. Code Inquiry is post-v1 and has no v1 route.

Free-form Chat is absent from the seam because harnesses own conversation. Lightweight anchored Code Inquiry is a named follow-up capability rather than a generic message escape hatch. A scripted in-memory Adapter is test-only and never a production fallback.

Detailed conceptual Interface, invariants, matrices, package posture, and rejected designs: [`docs/blueprint/harness-capability-seam.md`](../docs/blueprint/harness-capability-seam.md). Canonical product language is recorded in [`CONTEXT.md`](../CONTEXT.md).
