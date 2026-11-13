---
id: WF-181
title: "Record exact legacy queue candidate decisions"
status: closed
labels:
  - wayfinder:task
parent: WF-174
assignee: juanan
blocked_by: [WF-180]
created: 2026-09-02
---

## Outcome

A human can explicitly defer or dismiss one exact imported legacy queue
candidate without changing its retained source bytes or creating any v1 fact.
The decision is atomic, bounded, restart-safe, deterministic for the exact
candidate occurrence, and visible through the existing candidate list/detail
reads. A different imported source occurrence never inherits it, and later
promotion remains a separate confirmation command.

## Grounding

- Parent map: [Implement the explicit legacy Review importer](./WF-174-implement-explicit-legacy-review-importer.md)
- Candidate projection: [Project imported legacy queue candidates safely](./WF-180-project-imported-legacy-queue-candidates.md)
- Exact source decisions: [Record exact legacy source decisions](./WF-178-record-exact-legacy-source-decisions.md)
- Candidate lifecycle authority: [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)

## Interface

Deepen `LegacyReviewImportOwner` with one closed command:

```text
legacy-review.queue-candidate.decision.set
  commandIdentity
  expectedStateVersion
  sourceOccurrenceIdentity
  candidateIdentity
  decision: deferred | dismissed
```

The accepted typed result reports the committed State version, exact source
occurrence, candidate identity, decision, and whether that immutable decision
fact was newly recorded or already retained. Rejections use the existing
legacy command result seam and stable reasons. Caller-provided source paths,
bytes, digests, annotation ids/positions/content, parser facts, record roles,
or v1 identities are impossible.

## Durable transition and invariants

- Resolve the source occurrence only through the validated bounded migration
  index, load and verify its exact Authoritative State `legacy-source` BLOB, run
  the frozen parser, and prove `candidateIdentity` belongs to that imported
  current-checkout queue. Never inspect a current queue path.
- Add a dedicated immutable `legacy-review.candidate-decision` fact with a
  deterministic `lcd_…` identity derived from Workspace Identity, source
  occurrence, candidate identity, and decision. Its payload contains only
  migration identity/provenance and `deferred | dismissed`; it contains no BLOB,
  legacy annotation id/path/text/excerpt/coordinates, v1 Anchor, intent, Review,
  Snapshot, Draft, Annotation, or authority.
- Extend the revisioned migration index backward-compatibly with one bounded
  latest-decision entry per exact candidate. Keep old WF-177/WF-178 indexes
  readable as an empty candidate-decision set. Bound retained source
  occurrences, source decisions, and candidate decisions before mapping or
  committing; do not create a generic record registry.
- One Authoritative State transaction writes any new immutable decision fact,
  the next index revision, normalized immutable command evidence, and typed
  result. A failed transaction leaves all absent; an unknown committed outcome
  is recalled from command evidence without source access or replay.
- Repeating the same command is exact command recall. A new command with the
  same exact decision reuses and validates the immutable fact. Switching
  deferred ↔ dismissed deterministically moves only the index's latest pointer
  while retaining both immutable facts.
- Existing candidate list/detail projections validate the supporting indexed
  fact and report `migrationDecision: undecided | deferred | dismissed`.
  Missing, conflicting, quarantined, or semantically inconsistent facts fail
  closed; the view never trusts an index label by itself.
- Candidate decisions are occurrence-scoped. Different bytes produce a new
  source occurrence and candidate identities with `undecided`; decisions never
  mutate or erase the exact imported BLOB. This child makes no claim about
  whether a later explicit promotion requires first switching a current
  defer/dismiss status; that policy belongs to the confirmation child and must
  require fresh human confirmation.

## Acceptance

- [x] Defer and dismiss each commit one exact content-free `lcd_…` fact plus the
      bounded index/command/result records atomically, expose the exact status in
      list/detail, and leave source bytes/metadata and all v1 records unchanged.
- [x] Same-command replay, separately identified same-decision commands,
      deterministic switching/reuse, restart reconstruction, and concurrent
      stale versions have exact outcomes without duplicate facts or effects.
- [x] A decision for one imported digest does not appear on a changed-source
      occurrence or another annotation, and source deletion/replacement after
      import cannot affect decision execution or projection.
- [x] Unknown/unimported/deferred-source, receipt, malformed/unsupported,
      absent/mismatched candidate, invalid command shape/identity/decision,
      aggregate-bound, missing/conflicting/quarantined fact, and BLOB corruption
      cases fail closed without current-filesystem fallback.
- [x] Transaction failpoints prove pre-commit rollback; a post-commit timeout is
      recalled after restart and source removal without re-reading or replaying
      the source.
- [x] The typed command/result and changed candidate views cross unchanged Local
      Runtime version-1 transport in accepted order, with replay and malformed
      frames bounded by the existing protocol.
- [x] Focused regressions fail if candidate-decision dispatch or its immutable
      fact is removed, then canonical verification, all four compiled risk
      probes, dependency/package boundaries, and `git diff --check` pass on the
      pinned toolchain.

## Non-goals and constraints

- Do not create a v1 Draft, confirm Question intent or Anchor, suggest a target,
  mark a candidate promoted, add moved-source association, or add Application
  UI in this child.
- Do not delete candidate/source evidence, rewrite import history, mutate legacy
  files, infer decisions from receipts, or persist parsed candidates.
- Do not add generic migration commands, decision registries, storage helpers,
  caches, filesystem ports, subscriptions, startup scans, or telemetry.
- Preserve State format 2, Workspace/Local Runtime version 1, source order,
  existing import/source-decision bytes, wire/frame/order/pending bounds, and
  the unrelated root `package.json` bump.

## Resolution comment

Yes. `LegacyReviewImportOwner` now accepts one closed
`legacy-review.queue-candidate.decision.set` command containing only command
identity, expected State version, imported source occurrence, candidate
identity, and `deferred | dismissed`. It resolves the occurrence through the
validated migration index, loads and verifies only the exact Authoritative
State `legacy-source` BLOB, re-runs the frozen queue parser, and proves the
candidate belongs to that current-checkout occurrence. It never accepts or
reads a source path, digest, annotation id, position, kind, text, excerpt,
coordinate, intent, Anchor, or v1 identity from the caller or current file.

Each first decision atomically commits a deterministic content-free `lcd_…`
`legacy-review.candidate-decision` fact, an optional backward-readable
`candidateDecisions` section in the revisioned migration index, normalized
immutable command evidence, and the typed result. The fact binds Workspace,
source identity/occurrence/digest, candidate identity, decision, first command,
and committed version but carries no legacy annotation content or BLOB.
Existing WF-177/WF-178 indexes remain byte-compatible until a candidate
decision exists. Source occurrences, source decisions, and current candidate
decisions share the existing 4,096-entry aggregate bound.

The candidate list and detail reads now report `undecided`, `deferred`, or
`dismissed` only after validating the indexed immutable fact. Same-command
replay returns the original result; a separate same-decision command validates
and reuses the fact; switching creates at most the other deterministic fact;
switching back reuses the first. Candidate status is scoped to the exact
occurrence and candidate, so another annotation and a changed imported source
remain undecided. Source deletion and replacement do not affect commands or
views.

Nine direct queue/candidate scenarios now include atomic content-free record
inspection, both decisions, list/detail status, replay and command conflict,
deterministic switching/reuse, changed-occurrence isolation, concurrent stale
versions, restart without a source, deferred-source/unimported, receipt,
malformed/unsupported diagnostic imports, absent candidates, malformed
commands, aggregate bounds, conflicting/missing/quarantined facts, BLOB
quarantine without filesystem fallback, transaction rollback, and unknown
post-commit recall after source removal. The exact queue BLOB and source
metadata remain unchanged. The Local Runtime contract carries the typed
command/result and successor frozen list/detail reads in command order over the
unchanged version-1 transport and rejects caller-injected content.

Removing Workspace candidate-decision dispatch fails with `Unknown Workspace
command`. Removing the immutable candidate-decision write commits an invalid
index and makes the status contract fail with
`legacy-review-import-state-invalid`. On Node 26.5.1 with pnpm 11.20.0, 58
focused source/import/history/candidate, Local Runtime, and package-seam tests
pass. Canonical `v1:verify` passes 31 files / 203 tests, dependency firewall,
all typechecks, builds, and smoke. All four compiled State, Local Runtime,
reviewed Pi 0.80.6, and dogfood probes pass, and `git diff --check` is clean.
State remains format 2; Workspace and Local Runtime remain Interface/protocol
version 1 with unchanged framing, ordering, and bounds; no candidate cache,
subscription, v1 record, source mutation, legacy dependency, startup/Home work,
or effect was added. No real legacy/user data was inspected or changed, and the
unrelated root `package.json` bump remains untouched.
