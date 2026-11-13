---
id: WF-007
title: "Define artifact and annotation semantics"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: [WF-005, WF-006]
created: 2026-07-14
assets:
  - "docs/research/github-gitlab-large-diff-review.md"
---

## Question

What canonical meanings, identities, lifecycles, and invariants should plans, plan revisions, change sets, annotations, submission groups, harness outcomes, and resolutions share across Planning and Reviewing?

## Blocked by

- [Shape the Planning workflow](./WF-005-shape-planning-workflow.md)
- [Shape the Reviewing workflow](./WF-006-shape-reviewing-workflow.md)

## Follow-up candidates

- Evaluate an Artifact Lineage history view that compares exact Plan Revisions or Review Snapshots without implying that newer Artifacts replaced older ones; route prioritization and interaction treatment through [Discover capabilities that reinforce the core workflows](./WF-014-discover-reinforcing-capabilities.md).

## Resolution comment

Neoflow uses distinct concrete Artifact kinds rather than one generic lifecycle. Every durable workflow record has stable occurrence identity independent of content and display labels. Artifacts add immutable content, observed provenance, exact historical lineage, and stable anchoring; successors coexist without superseding predecessors or implying semantic derivation. A Plan is the stable lineage of immutable Plan Revisions. A Review owns one stable Change Set and may contain lightweight successor Review Passes, immutable Review Snapshots, and immutable Review Results.

A Change Set records explicit comparison intent rather than a live diff. Workspace evolution under that intent creates successor Review Snapshots; changing checkout, base, compared state, or scope creates a new Review. Implementation Handoff may first capture a first-class Implementation Baseline so Review can compare workspace changes since handoff without attributing them exclusively to the harness or forcing branch discipline. Context Drift warns about Plan fit without invalidating a revision or silently revoking approval.

Annotations begin as mutable local drafts with one authoritative Anchor. Commitment freezes one or more drafts into immutable Annotations and one immutable workflow-specific Submission Batch against one exact Artifact. Intent is explicitly selected—Question, Note, Change Request, or Concrete Replacement—and is never inferred from prose. Notes are non-blocking; mutation-authorizing intents remain bounded by their anchor and workflow. Supporting Evidence References add context without authority. Original anchors never move; human-confirmed Re-anchor Mappings relate them to successor Artifacts.

Harness transport never mutates a Batch or resolves an Annotation. Each correlated attempt that creates an Invocation has its own Invocation Identity and conservative evidence-derived status; connector acceptance, observed start, normal settlement, semantic correctness, and human disposition remain separate. The immutable Batch, Workflow Handoff, Commitment Receipt, and selected path’s Preparation, Invocation, Offer Decision, or exact Manual material Durable-Commit before any dependent external contact or reveal. Missing correlated evidence stays unresolved. Explicit Resubmission governs another correlated attempt after an uncertain Invocation; a proven-unclaimed Preparation may instead be prepared again, while another Manual attempt is a new destination-scoped Handoff. Every path preserves its complete history.

Planning Feedback and Review Findings are workflow roles of the same committed Annotation, not duplicate records. Only humans create dispositions: resolved, still open, or dismissed. Planning feedback receives the same re-review treatment as code findings; unresolved disposition-requiring feedback blocks Plan Approval. Approval, withdrawal, and Implementation Handoff remain separate durable decisions. Review completion freezes exact Findings, dispositions, and Review Coverage into a Review Result; `Continue review` opens a lightweight successor pass rather than rewriting history.

Review Snapshots degrade per file like GitHub and GitLab: preserve file navigation, collapse expensive content, label unrenderable content, track viewed state against exact file content, and never treat coverage as correctness. Cancellation archives workflows without deleting drafts, Artifacts, Batches, decisions, or receipts.

Research asset: [`docs/research/github-gitlab-large-diff-review.md`](../docs/research/github-gitlab-large-diff-review.md). Canonical vocabulary and invariants are recorded in [`CONTEXT.md`](../CONTEXT.md).
