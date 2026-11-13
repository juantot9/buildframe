---
id: WF-180
title: "Project imported legacy queue candidates safely"
status: closed
labels:
  - wayfinder:task
parent: WF-174
assignee: juanan
blocked_by: [WF-179]
created: 2026-09-02
---

## Outcome

An explicitly imported, recognized current queue occurrence yields stable,
bounded migration candidates through closed Workspace reads. Every candidate is
structurally migration-only, retains exact source/legacy provenance and
unmodified intent, text, path, excerpt, and coordinate hints behind bounded
windows, and has a deterministic new candidate identity. It is not a v1
Annotation Draft, belongs to no Review, grants no authority, and cannot be
submitted or promoted by these reads.

## Grounding

- Parent map: [Implement the explicit legacy Review importer](./WF-174-implement-explicit-legacy-review-importer.md)
- Exact BLOB/index authority: [Atomically preserve an imported legacy Review source](./WF-177-atomically-preserve-imported-legacy-review-source.md)
- Receipt projection precedent: [Project imported legacy receipt history safely](./WF-179-project-imported-legacy-receipt-history.md)
- Candidate and promotion rules: [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)

## Interface

Deepen `LegacyReviewImportOwner` and its private exact-BLOB loader. Add two
queue-specific read projections, not a generic migration/record browser:

```text
legacy-review.queue-candidates
  sourceOccurrenceIdentity
  candidateOffset
  candidateLimit

legacy-review.queue-candidate
  sourceOccurrenceIdentity
  candidateIdentity
  textUtf8Offset
  textUtf8Limit
  excerptUtf8Offset
  excerptUtf8Limit
```

The list returns source-ordered candidate summaries. Detail returns one exact
candidate with independently pageable text and excerpt windows. UTF-8 offsets
must lie on scalar boundaries; every page reports exact total, offset, shown,
and completion facts. Caller-provided paths, bytes, parser/record/content roles,
legacy ids, kinds, text, and anchor hints are impossible.

## Candidate shape and invariants

- Derive only from a validated imported immutable queue occurrence and its exact
  State `legacy-source` BLOB. Re-run the frozen parser over those bytes and
  verify stored recognition. Never inspect the current queue file.
- Give each candidate a deterministic `lgc_…` identity from Workspace Identity,
  source occurrence, and exact legacy annotation identity. Preserve source
  order and expose candidate absolute position separately.
- Structurally label every view `LEGACY QUEUE CANDIDATE`,
  `migration-candidate-not-v1-draft`, and no-authority. State that old
  kind/path/line/excerpt values are hints only; intent and an exact v1 Anchor
  require later explicit confirmation against a newly verified-current Review
  Snapshot.
- Project only bounded, explicitly `legacy…`-labelled id/kind/file/anchor/text
  and excerpt fields plus exact source identity/occurrence/digest provenance.
  Never infer Question intent, downgrade `change`/`edit`, construct a
  replacement payload, resolve a path, choose a side/line, or merge receipt
  copies.
- Cap candidate list windows and every string/page before output mapping. Include
  adversarial JSON escaping in a proof that maximum views remain comfortably
  below Local Runtime's one-megabyte frame body bound.
- Unknown/unimported/deferred/dismissed identities, receipt occurrences,
  diagnostic imports, missing/quarantined content, absent candidates, invalid
  UTF-8 page boundaries, and projection limits fail closed with stable reasons;
  malformed request shapes throw.
- Reads are pure: no candidate/index record, candidate decision, parsed cache,
  State commit, source read, startup/Home work, subscription, v1 record, or
  effect.

## Acceptance

- [x] All three sanitized queue forms project deterministic candidate
      identities, exact source order/counts/provenance, and unchanged legacy
      kinds/hints; source deletion/replacement and restart do not affect imported
      results. (The fourth settled importer golden is the receipt form, not a
      queue form.)
- [x] List/detail disclosure and field names prove candidates cannot be mistaken
      for v1 Drafts/Annotations/Anchors or submitted through any command.
- [x] Complete short strings remain exact; long/multibyte/control-heavy values
      page at scalar-safe UTF-8 boundaries with exact totals/offsets/completion,
      and worst-case encoded views stay below the unchanged frame bound.
- [x] List/detail offsets, limits, empty end windows, invalid scalar offsets,
      absent candidate, malformed request, unknown/unindexed/deferred/dismissed,
      receipt, malformed/unsupported queue, and quarantined BLOB cases fail
      closed without filesystem fallback or fabricated candidates.
- [x] Repeated reads and restart leave State version, index/occurrence/BLOB,
      source metadata, and every v1 record unchanged.
- [x] Both typed projections cross unchanged Local Runtime version-1 transport
      as frozen ordered bounded results.
- [x] Focused regressions fail without queue-view dispatch and when projection
      uses current queue bytes, then canonical verification and all four compiled
      risk probes pass on the pinned toolchain.

## Non-goals and constraints

- Do not add candidate defer/dismiss, Draft promotion, Review/Snapshot lookup,
  Anchor suggestions, moved-source association, or Application UI in this child.
- Do not persist parsed candidates, infer legacy lifecycle from receipts, expose
  full unbounded text in one frame, or add generic pagination/storage/renderer
  abstractions.
- Do not import deletion-bound code or inspect real user data. Use only pinned
  sanitized and disposable fixtures.
- Preserve State format 2, Workspace/Local Runtime version 1, all source/import
  bytes and decisions, existing Reviewing records, wire/frame/order/pending
  bounds, and the unrelated root `package.json` bump.

## Resolution comment

Yes. `LegacyReviewImportOwner` now owns two closed exact-BLOB reads.
`legacy-review.queue-candidates` returns at most 32 source-ordered summaries,
and `legacy-review.queue-candidate` selects one deterministic `lgc_…` identity
with independently pageable legacy text and excerpt. The owner's private
imported-source loader resolves only a validated `lso_…` index occurrence,
loads its `legacy-source` BLOB from Authoritative State, verifies content role,
length, digest, occurrence provenance, and frozen recognition, and permits
candidates only for an imported current-checkout queue. It never consults a
current source path.

Every available result structurally carries `LEGACY QUEUE CANDIDATE`,
`migration-candidate-not-v1-draft`, and `authority: none`; all imported fields
remain explicitly `legacy…`-labelled hints. The view supplies source identity,
occurrence, digest, and original queue format, but no Review, Snapshot, Draft,
Annotation, Anchor, intent, replacement, or command authority. A runtime
negative contract confirms that no candidate-submit command exists.

Candidate identities bind Workspace Identity, exact source occurrence, and
legacy annotation identity. Lists retain exact source order and absolute
positions across all three recognized queue forms, source deletion or
replacement, and restart. IDs are windowed at 128 UTF-8 bytes, files at 1,024,
text previews at 1,024, excerpt previews at 512, list pages at 32 candidates,
full text pages at 32 KiB, and excerpt pages at 16 KiB. Pages accept only scalar
boundaries and report exact total, offset, shown, and completion facts. A
32-candidate adversarial fixture combines multibyte values and maximum JSON
control escaping; list and detail wire values remain below the existing
one-megabyte body bound with a 2 KiB envelope reserve.

Four direct Workspace scenarios prove all queue goldens, exact short fields,
deterministic identities, source order, source deletion/replacement and
restart, unchanged metadata and State, empty end pages, source decisions,
wrong-kind receipts, malformed/unsupported diagnostic imports, unknown and
absent identities, malformed requests, projection bounds, scalar-safe pages,
and frame size. Corrupting retained BLOB content yields `content-unavailable`
while a valid current queue remains present, proving no filesystem fallback.
One focused Local Runtime contract carries both typed frozen reads over
unchanged protocol and Workspace Interface version 1. Removing queue dispatch
fails with `Unknown Workspace projection request`; mutating the private loader
to use current queue bytes makes the quarantine scenario fabricate candidates
and fail.

On Node 26.5.1 with pnpm 11.20.0, 53 focused source/import/history/candidate,
Local Runtime, and package-seam tests pass. Canonical `v1:verify` passes 31 files
/ 198 tests, the dependency firewall, all typechecks, builds, and smoke. All
four compiled State, Local Runtime, reviewed Pi 0.80.6, and dogfood probes pass,
and `git diff --check` is clean. Reads add no State record, cache, subscription,
source access, startup/Home work, or legacy dependency. State remains format 2,
Workspace and Local Runtime remain version 1 with unchanged framing, ordering,
and bounds, no real legacy/user data was inspected or changed, and the unrelated
root `package.json` bump remains untouched.
