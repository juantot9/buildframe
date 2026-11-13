---
id: WF-174
title: "Implement the explicit legacy Review importer"
status: closed
labels:
  - wayfinder:map
parent: WF-051
assignee: juanan
blocked_by: [WF-140]
created: 2026-09-02
---

## Destination

P17 of [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md) is complete. The Workspace-owned Reviewing Module can discover and preserve legacy Review sources without writing them, present captured receipt bytes only as labelled legacy history, present queue entries only as migration candidates, and create a fresh Question Draft only after explicit human confirmation against an exact verified-current v1 Review Snapshot. Repetition is idempotent, crashes cannot fabricate preservation or v1 history, moved-checkout association is explicit, and no legacy package enters the active dependency graph.

## Authority

- P17 outcome and learning gate: [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)
- Exact ownership, formats, candidate rules, and cutover gate: [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)
- State transaction and exact-content rules: [Choose the Authoritative Workflow State architecture](./WF-043-choose-authoritative-state-architecture.md)
- Current retained legacy facts and deletion inventory: [Review the legacy packages for blockers](./WF-135-review-legacy-packages-for-blockers.md)
- Canonical Review, Snapshot, Anchor, Draft, and intent vocabulary: [`CONTEXT.md`](../CONTEXT.md)

## Route

1. Build one v1-owned, read-only legacy-source Module inside `packages/workspace`. It safely stabilizes bounded regular-file bytes and recognizes the raw version-1 annotation array, version-1 and version-2 queue objects, and version-1 receipt object from sanitized immutable golden files. Malformed, duplicate, unsupported-newer, over-bound, symlinked, and racing sources fail closed. It imports no deletion-bound package.
2. Add one revisioned migration index plus immutable source-occurrence records and exact source BLOBs behind Authoritative State. Current-checkout discovery remains read-only. Closed Workspace commands explicitly import, defer, or dismiss one exact digest; committed import is atomic and idempotent, and changed bytes require a new decision.
3. Project only bounded migration views: source metadata and status, queue candidates with exact legacy provenance, and clearly labelled receipt history. Neither form can satisfy a v1 Workflow, Review, Snapshot, Annotation, Batch, Handoff, Invocation, evidence, disposition, or Result invariant.
4. Add explicit moved-source discovery. A bounded scan or user-supplied former checkout path displays embedded old workspace paths and requires deliberate association with the current Workspace Identity. Repository name, remote, content, recency, and path similarity never establish association.
5. Add one Reviewing-owned confirmation command for a supported legacy `question`. It requires an existing Current Review, its exact latest verified-current Snapshot, a user-selected exact old/new-side v1 Anchor, and explicit Question intent. One Durable Commit creates a fresh revisioned Draft with candidate provenance and marks that candidate promoted; stale, ambiguous, unsupported-intent, or changed inputs leave it intact.
6. Present discovery, preview, import/defer/dismiss, labelled history, candidate inspection, exact target selection, and confirmation through the existing private Application model/View. Add no generic migration UI, filesystem picker framework, renderer Interface, or automatic startup migration.
7. Re-prove golden bytes, source metadata preservation, restart reconstruction, Local Runtime transport, State commit-before-effect/idempotency, death before/after commit, bounded views, and the complete installed dogfood path. Prepare a content-silent operator route for a disposable byte-for-byte copy of this checkout's known seven-entry queue. The agent must not read or copy real user data; the human-held final check may report only expected metadata, digest, status, and invariant counts.

## Interface decision

Keep the external Module deep: callers still learn only `Workspace.execute`, `Workspace.read`, and `Workspace.subscribe`, extended with a closed legacy-Review command and view vocabulary. Source locators, path hashing, filesystem stabilization, parsers, exact-byte storage, indexes, retry policy, and source association remain implementation. The local filesystem is exercised through disposable real files rather than a public filesystem port, and Authoritative State remains the existing private transaction Interface. Internal source-recognition and transition seams may be package-private, but they do not become package exports.

## Constraints

- Work one focused child at a time; create, link, commit, and push it before implementation.
- Preserve legacy source bytes and metadata exactly. Never rename, rewrite, chmod, delete, mark, or otherwise mutate a queue or receipt source.
- Never inspect, print, copy, or parse real user queue/receipt content in agent-run work. Use only sanitized fixtures and disposable roots; reserve the known real-source check for explicit human execution.
- Do not import `apps/tui`, `apps/cli`, `packages/core`, `packages/ai-harness`, `packages/pi-connector`, `nvim`, or their types from active source. Copy only validated mechanics into the new owner.
- Do not turn migration evidence into v1 history, infer intent or an Anchor, merge receipt copies with queue entries, infer workspace association, replay a legacy Harness action, or write on ordinary discovery/startup.
- Keep raw legacy identifiers and paths provenance-labelled and private to migration views. Bound files, scans, parsed entries, projected windows, text windows, retries, and retained indexes before materialization.
- Preserve Workspace Interface version 1, production wire framing, Authoritative State format 2, existing Reviewing records and bytes, Local Runtime ordering, no replay, accepted UX, and latency budgets unless one focused child explicitly proves an owning change is required.
- P18 deletion begins only after this map closes. P54 release assembly remains untouched.
- Run on Node 26.5.1 with pnpm 11.20.0 via `/tmp/neoflow-pnpm-11.20/pnpm`, using experimental FFI for OpenTUI evidence. Preserve the unrelated root `package.json` bump outside every commit.

## Blocked by

- [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)

## Decisions so far

- [Recognize stable legacy Review source bytes](./WF-175-recognize-stable-legacy-review-source-bytes.md) — closed: one package-private bounded operation now stabilizes exact no-follow bytes and recognizes all four settled legacy formats from pinned sanitized goldens without State, package exports, or legacy imports.
- [Discover current legacy Review sources explicitly](./WF-176-discover-current-legacy-review-sources.md) — closed: one explicit content-silent read now returns the current queue then current legacy receipt source with stable identities, exact metadata, bounded summaries, unchanged State, and unchanged Local Runtime protocol.
- [Atomically preserve an imported legacy Review source](./WF-177-atomically-preserve-imported-legacy-review-source.md) — closed: one explicit command now atomically retains exact source bytes, bounded migration index membership, and idempotent command evidence without creating any v1 Review record.
- [Record exact legacy source defer and dismiss decisions](./WF-178-record-exact-legacy-source-decisions.md) — closed: exact-digest defer/dismiss decisions are now atomic, content-free, switchable before import, restart-safe, and powerless to touch sources or fabricate v1 records.
- [Project imported legacy receipt history safely](./WF-179-project-imported-legacy-receipt-history.md) — closed: bounded history and batch-detail reads now derive only from an imported exact receipt BLOB, carry structural incompleteness disclosure, and remain non-v1.
- [Project imported legacy queue candidates safely](./WF-180-project-imported-legacy-queue-candidates.md) — closed: bounded list/detail reads now derive deterministic migration-only candidate identities, provenance, hints, and scalar-safe pageable legacy text only from imported exact current-queue BLOBs.
- [Record exact legacy queue candidate decisions](./WF-181-record-legacy-queue-candidate-decisions.md) — closed: explicit defer/dismiss commands now atomically retain bounded content-free status for one exact imported candidate, validate it in list/detail views, and grant no v1 authority.
- [Discover moved legacy receipt sources explicitly](./WF-182-discover-moved-legacy-receipt-sources.md) — closed: bounded directory/former-path reads now find old-hash receipt locator slots, report exact current source observations, and page every embedded legacy workspace path without inferring association or changing State.
- [Associate and import one moved legacy receipt source](./WF-183-associate-and-import-moved-legacy-receipt-source.md) — closed: one explicit confirmed-Workspace command now atomically binds and preserves an exact recognized moved receipt, validates immutable association/occurrence/BLOB evidence, and grants no inferred v1 authority.
- [Promote one legacy Question candidate into an exact v1 Draft](./WF-184-promote-legacy-question-candidate.md) — closed: one Reviewing-owned confirmation command now atomically creates a fresh exact-Anchor Question Draft and content-free `lcp_…` provenance from one validated imported-BLOB candidate against the latest verified-current Snapshot.

## Resolution

Closed on 2026-09-02 through WF-175–WF-184. The Workspace-owned importer now
recognizes four bounded legacy formats, discovers only explicit known sources,
atomically preserves exact BLOBs or content-free decisions, projects BLOB-only
labelled receipt history and non-authoritative queue candidates, discovers and
explicitly associates moved receipt locators, and promotes only one explicitly
confirmed legacy Question into a fresh exact-Anchor v1 Draft against the current
Review's latest verified-current Snapshot.

All migration identities and records remain structurally non-v1. Current and
moved discovery never writes; import/association/promotion each uses one exact
expected-version commit; replay and unknown outcomes never revisit mutable
source bytes; malformed, unsupported, unsafe, changed, stale, ambiguous,
conflicting, missing, or quarantined evidence fails closed. Workspace and Local
Runtime retain their three-method/version-1 Interface, State remains format 2,
and no deletion-bound package entered the active graph.

Sanitized golden and disposable-root evidence now covers 32 canonical files /
221 tests. Focused mutations proved every new dispatch and authority-bearing
write, all four compiled risk probes passed, and dependency firewall,
typechecks, builds, smoke checks, and `git diff --check` passed on Node 26.5.1 /
pnpm 11.20.0. The content-silent Workspace route is ready for the separately
human-held disposable-copy check; this work neither read nor copied the known
real queue, whose retained metadata/digest and source bytes remain untouched.
The unrelated root `package.json` bump stayed outside every P17 commit.

## Out of scope

- P18 legacy source/package/command deletion.
- Portable Workflow Bundle import, generic data migration, automatic migration on startup, or migration of any non-Review legacy data.
- Legacy `change` or `edit` promotion before their corresponding v1 intent workflows exist.
- Public package coordinates, support manifest, installer, upgrade/rollback assembly, CI platform matrix, or publishing.
