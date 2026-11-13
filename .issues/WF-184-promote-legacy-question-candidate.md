---
id: WF-184
title: "Promote one legacy Question candidate into an exact v1 Draft"
status: closed
labels:
  - wayfinder:task
parent: WF-174
assignee: juanan
blocked_by: [WF-181, WF-183]
created: 2026-09-02
---

## Outcome

One Reviewing-owned confirmation command promotes one exact imported legacy
`question` candidate into a fresh v1 Question Draft against the current Review's
exact latest verified-current Snapshot and a human-selected v1 Anchor. The same
Authoritative State transition records content-free migration provenance and
marks that candidate promoted. No legacy path, line, excerpt, kind, or text can
choose the Review, Snapshot, Anchor, or v1 intent.

## Grounding

- Parent map: [Implement the explicit legacy Review importer](./WF-174-implement-explicit-legacy-review-importer.md)
- Candidate authority and confirmation rules: [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)
- Imported-BLOB-only candidates: [Project imported legacy queue candidates safely](./WF-180-project-imported-legacy-queue-candidates.md)
- Content-free candidate decisions: [Record exact legacy queue candidate decisions](./WF-181-record-legacy-queue-candidate-decisions.md)
- Reviewing and State ownership: [Choose the Authoritative Workflow State architecture](./WF-043-choose-authoritative-state-architecture.md)

## Interface

Extend the closed Workspace command vocabulary with one Reviewing-owned command:

```text
review.legacy-question-candidate.promote
  commandIdentity
  expectedStateVersion
  sourceOccurrenceIdentity
  candidateIdentity
  expectedSourceDigest
  reviewIdentity
  expectedReviewSnapshotIdentity
  intent: question
  anchor: exact v1 Review Anchor input
```

An accepted `review.legacy-question-candidate.promoted` result returns the fresh
`qdr_…` Draft, deterministic `lcp_…` promotion identity, exact Review/Snapshot,
candidate/source occurrence, and resolved Anchor. Rejections remain closed,
content-free reasons. The command never accepts source bytes, candidate text, a
legacy path/line/excerpt as target authority, or a caller-selected Draft body.

## Module seam

`ReviewingOwner` owns command normalization/recall, Current Review and latest
Snapshot selection, currentness verification, Anchor resolution, fresh Draft
identity and record construction, and the one Durable Commit. Deepen
`LegacyReviewImportOwner` with one package-private semantic preparation method
that validates the imported exact BLOB/candidate and returns its exact Question
body plus the migration promotion writes that must join that commit.

This is direct collaboration between the two existing owners, not a generic
transaction coordinator or public migration Interface. The preparation method
is not re-exported from the package. Authoritative State still interprets only
record classes, revisions, BLOBs, expected State version, and atomicity.

## State and trust invariants

- Require the candidate's exact imported current-checkout queue occurrence,
  opaque `lgc_…` identity, and echoed source digest. Rebuild the candidate only
  from its validated `legacy-source` BLOB. No mutable filesystem fallback is
  allowed before commit, on replay, or after restart.
- Accept only a recognized legacy `question` whose exact text is a valid v1
  Question body. `change`, `edit`, empty/whitespace, NUL-bearing, or over-64-KiB
  bodies remain visible migration candidates and create no v1 record.
- Require `intent: question` literally. The legacy kind is eligibility evidence,
  never inferred v1 intent. The exact candidate text becomes the Draft body
  byte-for-byte; callers cannot revise it during promotion.
- Require `reviewIdentity` to be the current Review pointer and the echoed
  Snapshot to be that Review's latest immutable Snapshot. Re-read and verify it
  current through Reviewing before resolving the supplied exact old/new-side
  Anchor. Missing, ambiguous, unavailable, stale, unverified, changed, or
  non-current targets leave candidate and Review unchanged.
- Derive the Draft identity from the command and `lcp_…` from Workspace Identity,
  source occurrence, and candidate. Add bounded optional promotion membership to
  the format-1 migration index and one immutable content-free promotion fact
  binding source/digest/candidate, Review/Snapshot/Draft, explicit intent,
  command, and committed State version.
- Add candidate provenance to the revisioned Draft payload without changing its
  format version or older bytes. Draft revision and Batch commit preserve that
  provenance; migration evidence itself cannot satisfy any Review, Snapshot,
  Anchor, Draft, Question, or Result invariant.
- One expected-version commit writes the new Draft revision, updated Review
  index, updated migration index, immutable promotion fact, Reviewing command
  record, and result. Failure writes none. Unknown committed outcomes recall the
  result without filesystem access or a second Draft.
- Promotion is irreversible for that exact candidate. Same-command replay
  returns the first result. A different command cannot create another Draft.
  Prior defer/dismiss is non-authoritative and may be superseded by explicit
  promotion; later candidate decision commands cannot override promotion.
- Every migration-index writer preserves optional promotion membership. Validate
  uniqueness, candidate/source/digest membership, deterministic identity, and
  immutable fact fields before projecting `promoted`; damaged or quarantined
  evidence fails closed. Count promotions under the existing aggregate 4,096
  migration bound.
- Keep Workspace and Local Runtime Interface version 1, State format 2, operation
  ordering, subscription publication, pending/frame bounds, and package direction
  unchanged. Add no cache, watcher, prefetch, telemetry, background scan,
  filesystem write, or production test instrumentation.

## Acceptance

- [x] One exact imported sanitized legacy `question` promotes only with its source
      occurrence/candidate/digest, explicit Question intent, current Review,
      latest Snapshot, exact State version, and resolvable exact v1 Anchor.
- [x] The atomic commit creates exactly one fresh revision-1 Draft whose body is
      byte-identical candidate text and whose provenance points to the exact
      candidate/promotion, while advancing State exactly once.
- [x] Reviewing verifies the echoed latest Snapshot as current before Anchor
      resolution; wrong/non-current Review, changed Snapshot identity, stale or
      unverified source, and every invalid Anchor reject without any record.
- [x] Legacy `change`/`edit` and invalid v1 Question bodies remain candidates.
      No legacy file/path/line/excerpt selects or weakens the exact Anchor.
- [x] Same-command replay, distinct-command reuse, concurrency, restart, and
      pre/post-commit failpoints produce no duplicate Draft or promotion and do
      not require the original queue file.
- [x] Promotion supersedes prior defer/dismiss status irreversibly; subsequent
      decisions reject. Candidate list/detail expose validated promotion status
      and destination identities without granting candidate authority.
- [x] Missing/conflicting/quarantined index, candidate BLOB, promotion fact,
      Reviewing command, Draft, or provenance evidence fails closed. All current
      import/decision/association writers preserve promotion membership and its
      aggregate bound.
- [x] The strict command/result and updated candidate views cross Local Runtime
      version 1 unchanged. Focused mutations fail when promotion dispatch,
      verified-current gating, Draft write, or promotion write is removed.
- [x] Canonical verification, all four compiled risk probes, package/dependency
      seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 while the
      unrelated root `package.json` bump remains untouched.

## Non-goals and constraints

- Do not promote legacy `change` or `edit`, create a Question directly, commit a
  Batch, invoke a Harness, infer an Anchor, revise a pre-existing Draft, or add
  Application UI in this child.
- Do not create a generic cross-owner transaction Interface, migration registry,
  candidate cache, Draft factory export, State schema migration, or second
  Workspace method.
- Do not read or mutate real user legacy data. Use sanitized immutable fixtures,
  imported BLOBs, and disposable roots only.
- Preserve ordinary Question Draft behavior, historical records, current queue
  discovery/import semantics, source and candidate decisions, moved receipt
  association, exact BLOB authority, and all existing projection bounds.

## Resolution

Closed on 2026-09-02. The closed Workspace vocabulary now includes
`review.legacy-question-candidate.promote`, owned by `ReviewingOwner`.
`LegacyReviewImportOwner` contributes one package-private preparation/validation
seam: it reconstructs the exact eligible Question only from the imported BLOB
and prepares bounded `lcp_…` fact/index writes, while Reviewing alone owns the
current Review/latest Snapshot checks, verified-current gate, exact Anchor,
fresh `qdr_…` Draft, provenance, recall validation, and atomic commit.

Promotion writes the revision-1 Draft, both owner indexes, immutable content-free
promotion fact, Reviewing command record, and result in one expected-version
transition. Candidate projections validate and expose `promoted` destination
status; prior defer/dismiss becomes non-authoritative, later decisions reject,
and all import/decision/moved-association index writers preserve promotion
membership. Replays validate the exact BLOB, promotion fact, Draft, provenance,
and Review membership without consulting the source filesystem.

Six promotion scenarios cover byte-exact Draft creation, strict command shape,
wrong/non-current/latest/stale/unverified targets, invalid Anchors, unsupported
legacy intents and v1 bodies, replay/conflict/restart, prior decisions, every
index writer, concurrent commands, aggregate bounds, unindexed collisions,
transaction rollback, unknown commit recall, and missing/quarantined evidence.
Removing Reviewing dispatch, verified-current gating, the Draft write, or the
promotion write made focused evidence fail independently.

On Node 26.5.1 and pnpm 11.20.0, canonical `v1:verify` passed 32 files / 221
tests plus dependency firewall, typechecks, builds, and smoke checks. The State,
Local Runtime, Pi Adapter, and installed dogfood risk probes passed, as did
`git diff --check`. Workspace and Local Runtime remain Interface version 1,
State remains format 2, no legacy package entered the active graph, no real
legacy source was accessed, and the unrelated root `package.json` change stayed
outside this work.
