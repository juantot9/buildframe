---
id: WF-010
title: "Set persistence, portability, and recovery policy"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: [WF-007, WF-008]
created: 2026-07-14
assets: []
---

## Question

Which Neoflow-owned workflow state must survive restarts, remain workspace-scoped, be inspectable or portable outside the app, and recover safely after partial submissions, harness disconnects, file changes, or crashes?

## Blocked by

- [Define artifact and annotation semantics](./WF-007-define-artifact-annotation-semantics.md)
- [Define the harness capability seam](./WF-008-define-harness-capability-seam.md)

## Follow-up candidates

- Treat Workspace Storage as a secondary one-screen TUI utility: concise usage summary, workflow rows, and only contextual Archive, Export, Delete/Restore, Empty Trash, and Clear Caches actions. Validate its clean interaction treatment through [Choose the terminal interaction system](./WF-012-choose-terminal-interaction-system.md) rather than turning it into a storage dashboard.
- Keep v1 wholly local. Treat any future encrypted personal cloud backup/sync—and especially multi-device conflict handling or collaboration—as a separate product posture rather than an implicit extension of local persistence.
- Reconcile the MVP’s split workspace-local `.neoflow/review.json` and user-state receipt files through a validated one-time import that preserves the originals; route implementation disposition through [Reconcile the current MVP with the blueprint](./WF-016-reconcile-current-mvp.md).

## Resolution comment

V1 keeps one private Authoritative Workflow State in the OS user-state location, wholly local and independent of the repository working tree. Each canonical checkout has a stable local Workspace Identity: aliases, moves, and branch changes retain it, while linked worktrees and separate clones remain distinct. One Workspace Writer orders all Durable Commits; additional processes connect to it or remain read-only. Repository-local `.neoflow/` is never live authority, even as an opt-in mode.

Persistence follows semantic value rather than UI implementation. Workflow identity and lifecycle, explicit context contributions and snapshots, drafts, immutable Artifacts and lineages, Anchors and mappings, Batches, decisions, dispositions, coverage, Capability Snapshots, Offers, Invocations, receipts, Editor Targets, and acknowledged commands survive restart. Cursor, focus, scrolling, Presence, availability, streaming, tool telemetry, busy hints, and notifications do not. Historical Artifacts retain enough exact self-contained content for viewing, recovery, and full-fidelity export after source files or Git objects disappear; content may be deduplicated without merging identities.

Every transition that can authorize an external effect is an all-or-nothing Durable Commit before contact with a harness or editor. Persistence failure leaves prior authority unchanged and blocks the effect. User-authored edits may remain visibly unsaved in memory for copy or retry but carry no durability promise. Evidence that cannot be persisted does not advance authoritative state. Restart classifies awaiting-start and active Invocations, and undelivered Offer Decisions, as unresolved unless the exact Capability provides verified reconciliation or replay; nothing is resent automatically.

Store and bundle formats are versioned. Migration writes and validates a new state generation before switching authority and preserves the prior verified generation. Unknown newer state opens read-only; failed migration or corruption never becomes an empty workspace. Recovery Quarantine isolates the smallest affected record, preserves original bytes, exposes a recovery report, and leaves verified unaffected workflows usable. A compact persistent Recovery Summary blocks only unsafe commitments. Workspace-dependent Artifacts verify as current, stale, or unverified; inability to inspect Git is unverified, never guessed current or stale.

Portability is deliberate rather than synchronization. V1’s sensitive Portable Workflow Bundle is a full-fidelity point-in-time export of selected workflows, exact Artifacts, and required source snapshots. The separately defined Shareable Workflow Report is post-v1 redacted human-readable Markdown with no import promise. Bundle import validates the entire manifest, is idempotent for identical content, rejects identity conflicts, preserves original identities and provenance, and explicitly rebinds to the destination Workspace Identity. Workspace-dependent Artifacts remain stale or unverified until refreshed, and historical Attachments, Offers, and Invocations never resume.

Neoflow never automatically prunes semantic records except through the narrow **Review Retention** policy added by the first Reviewing dogfood gate. A completed or cancelled Review expires atomically only when its outcome is more than 30 days old, it is outside the 20 newest past Reviews, no retained Workflow references it, and no awaiting, active, unresolved, or otherwise truth-critical external activity remains. Uncertain eligibility preserves it. Expiry removes the whole Review closure—including its Artifacts and receipts—without selective cleanup, routine prompting, recoverable Trash, or a per-Review tombstone; a quiet aggregate storage detail may report cleanup. This deliberate low-demand exception prevents Review history from becoming another repository-like structure the developer must curate.

All other semantic cleanup remains explicit. A concise on-demand Workspace Storage view shows usage and whole-workflow Archive, Export, Delete/Restore, Empty Trash, and Clear Caches actions. Explicit deletion moves the complete Workflow to recoverable Trash; only explicit Empty Trash purges it. Reconstructable caches may be removed automatically, while compression, deduplication, warnings, and `Export then delete` precede destructive cleanup.

V1 relies on owner-only local filesystem permissions and normal host disk encryption, stores no credentials or authentication tokens, and does not invent custom key management. Cloud backup, multi-device sync, and collaboration remain a separate future product posture. The MVP’s split workspace queue and user-state receipts require a validated one-time import with originals preserved during later MVP reconciliation.

### Post-dogfood amendment — automatic Review Retention (2026-07-30)

The first Reviewing dogfood gate showed that requiring developers to curate a second long-lived history beside Git creates product-level cognitive load even when storage controls are technically safe. The user explicitly chose the bounded automatic Review Retention exception above over permanent default retention plus manual cleanup. This changes no active Review, unresolved evidence, cross-Workflow dependency, or selective-record integrity rule. Implementation remains with the owning Workspace Storage and State package rather than the P16 launcher correction.
