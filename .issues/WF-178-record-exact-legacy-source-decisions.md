---
id: WF-178
title: "Record exact legacy source defer and dismiss decisions"
status: closed
labels:
  - wayfinder:task
parent: WF-174
assignee: juanan
blocked_by: [WF-177]
created: 2026-09-02
---

## Outcome

A human can explicitly defer or dismiss one currently previewed legacy Review
source digest without preserving its bytes or touching the source. One closed
Workspace command re-captures the locator-bound source, commits an immutable
migration-only decision fact plus the bounded revisioned import index and
normalized command result atomically, and makes exact, changed, and restart
status truthful. Import remains the only source-level decision that stores a
BLOB or enables later entry projections.

## Grounding

- Parent map: [Implement the explicit legacy Review importer](./WF-174-implement-explicit-legacy-review-importer.md)
- Exact durable import and current index: [Atomically preserve an imported legacy Review source](./WF-177-atomically-preserve-imported-legacy-review-source.md)
- Source recognition/discovery: [Recognize stable legacy Review source bytes](./WF-175-recognize-stable-legacy-review-source-bytes.md) and [Discover current legacy Review sources explicitly](./WF-176-discover-current-legacy-review-sources.md)
- Decision semantics: [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)

## Interface

Deepen `LegacyReviewImportOwner`; do not add a decision coordinator or generic
migration registry. Extend the closed Workspace command union with one
source-specific operation:

```text
legacy-review.source.decision.set
  commandIdentity
  expectedStateVersion
  sourceIdentity
  expectedDigest
  decision: deferred | dismissed
```

The caller supplies neither bytes, path, metadata, record identity, reason text,
nor parser values. Stable typed acceptance returns the exact source identity,
digest, decision identity, decision, and committed State version. Existing
source-capture/state/command rejection semantics remain shared and exhaustive.

## Durable decision model

- Re-capture and compare the selected source exactly as import does. Missing,
  unsafe, over-bound, unstable, unknown, stale, or changed sources commit no
  decision.
- Store a deterministic immutable `legacy-review.source-decision` record for
  each Workspace/source/digest/decision tuple. Its payload may retain only
  locator, observed metadata, digest, byte length, content-silent
  recognition/diagnostic, decision, and command/State provenance. It has no
  exact-content role and never stores source bytes or parsed legacy values.
- Add bounded current decision entries beside imported occurrences in the one
  existing revisioned legacy import index. Keep decision fact, index revision,
  normalized command record, and result in one Durable Commit. Bound imported
  occurrences plus current source decisions before materialization.
- A second command for the current exact decision records no duplicate decision
  or index member. Explicitly changing `deferred` to `dismissed`, or vice versa,
  atomically selects the corresponding immutable fact. Deterministic prior facts
  may be reused, but an index must never point to a missing or invalid fact.
- Exact import is irreversible at the source-decision level: defer/dismiss of an
  already imported exact digest rejects rather than pretending its BLOB or
  migration evidence disappeared. A deferred or dismissed exact digest may
  later be explicitly imported; imported status then wins without deleting the
  prior decision fact.
- Discovery reports exact `deferred` or `dismissed`, exact `imported`, and
  changed-since-prior-decision as a fresh undecided digest. It exposes no
  command identity, decision history, BLOB, text, parsed value, or unbounded
  prior digest list.

## Acceptance

- [x] Exact defer and dismiss commands each commit one no-content immutable
      decision fact, one bounded index update, and one command/result atomically;
      no BLOB or v1 Reviewing record is created.
- [x] The source view and Local Runtime report deferred/dismissed after commit
      and restart, while changed bytes report undecided with only the prior
      decision class.
- [x] Same-command replay is exact; separately identified same-decision repeats
      do not duplicate facts or membership; switching decisions is atomic and
      idempotently reuses an existing deterministic fact.
- [x] Import after defer/dismiss preserves exact bytes and becomes authoritative
      source status; defer/dismiss after exact import rejects without changing
      State.
- [x] Missing, symlinked, unstable, over-bound, unknown, changed, stale,
      malformed-command, command-identity-conflict, invalid-index/fact, and
      aggregate-bound cases fail closed without a decision claim.
- [x] Source bytes/mode/mtime/ctime/directory membership remain exact throughout
      decisions. Existing imported BLOBs, occurrence records, command results,
      and every v1 State record remain byte-identical.
- [x] Before-commit failure leaves no decision/index/command fact; an unknown
      post-commit outcome recalls the exact decision without touching the now
      unavailable source.
- [x] Focused regressions fail without decision dispatch and without the atomic
      decision fact, then canonical verification and all four compiled risk
      probes pass on the pinned toolchain.

## Non-goals and constraints

- Do not project queue candidates, receipt history, legacy text, Anchor/intent
  suggestions, or Drafts. Candidate-level defer/dismiss belongs to a later
  focused child and must not be conflated with this source decision.
- Do not add moved-source scanning/association, startup migration, source
  markers, deletion, chmod, rename, writes, caching, telemetry, or a filesystem
  Interface.
- Do not weaken WF-175 capture bounds or WF-177 exact-content/index/recall
  validation. Keep Authoritative State format 2, Workspace/Local Runtime version
  1, transport/order/frame/pending semantics, and existing Reviewing records
  unchanged.
- Use only sanitized fixtures and disposable roots; inspect no real user data
  and import no deletion-bound package. Preserve the unrelated root
  `package.json` bump outside the commit.

## Resolution comment

Yes. `LegacyReviewImportOwner` now accepts one additional closed
`legacy-review.source.decision.set` command with exactly the locator-bound source
identity, expected digest, expected State version, command identity, and the
closed `deferred | dismissed` decision. It shares import's strict normalization,
recall, source re-resolution, three-attempt stable capture, digest comparison,
State conflict handling, and content-silent recognition. Callers cannot submit
bytes, paths, metadata, parser values, record identities, or free-form reasons.

A first decision atomically writes a deterministic `lsd_…` immutable
`legacy-review.source-decision` record with no content roles, updates the one
revisioned `lmi_…` index, and stores the normalized `lmc_…` command/result. The
fact contains bounded locator/stat/digest/recognition and command/State
provenance but no source bytes or parsed legacy value. Current imported
occurrences plus source decisions share the 4,096-entry materialization bound.
Exact replay is read-only; a new command for the same current decision writes
only its command fact; switching decisions selects a deterministic immutable
fact, and switching back reuses the prior one.

The index remains backward-readable when WF-177's payload has no decision list.
Import removes only the current decision index entry for that exact digest,
stores the exact BLOB, and wins source status while retaining prior immutable
decision evidence. An exact imported digest cannot be deferred or dismissed.
Changed bytes remain undecided and disclose only `imported`, `deferred`, or
`dismissed` as a prior decision class. Exact source views validate whichever
occurrence or decision fact supports the displayed status.

Four new direct Workspace scenarios prove defer/dismiss status, no-content
records, source metadata preservation, exact/separately identified replay,
command conflicts, atomic switching and deterministic fact reuse, restart,
changed-digest behavior, import-after-decision, import irreversibility, aggregate
bounds, invalid fact containment, rollback, and unknown post-commit recall after
the source is removed. A focused Local Runtime contract proves the decision and
result cross the unchanged version-1 opaque transport and malformed extra bytes
are rejected. Removing decision dispatch fails at Reviewing with `Unknown
Workspace command`; removing the immutable decision fact fails exact recall with
`legacy-review-import-state-invalid`.

On Node 26.5.1 with pnpm 11.20.0, 43 focused source/import/runtime and package
seam tests pass. Canonical `v1:verify` passes 29 files / 188 tests, dependency
firewall, all typechecks, builds, and smoke. All four compiled State, Local
Runtime, reviewed Pi 0.80.6, and dogfood probes pass, and `git diff --check` is
clean. No real legacy/user data was inspected or changed, no BLOB or v1 Review
fact is created by defer/dismiss, State remains format 2, Workspace and Local
Runtime remain version 1 with unchanged wire/order/bounds, no deletion-bound
dependency entered active source, and the unrelated root `package.json` bump
remains untouched.
