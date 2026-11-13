---
id: WF-177
title: "Atomically preserve an imported legacy Review source"
status: closed
labels:
  - wayfinder:task
parent: WF-174
assignee: juanan
blocked_by: [WF-176]
created: 2026-09-02
---

## Outcome

One explicit closed Workspace command can preserve one exact, previously
previewed current legacy Review source as migration evidence. One Authoritative
State Durable Commit stores the byte-exact source BLOB, immutable occurrence and
command records, and a bounded revisioned migration index. The source view then
reports that exact digest as imported, or reports changed bytes as a new
undecided occurrence. The source itself remains byte-for-byte and metadata
unchanged, and none of the evidence can satisfy a v1 Reviewing invariant.

## Grounding

- Parent map: [Implement the explicit legacy Review importer](./WF-174-implement-explicit-legacy-review-importer.md)
- Source capture/recognition owner: [Recognize stable legacy Review source bytes](./WF-175-recognize-stable-legacy-review-source-bytes.md)
- Explicit current-source view: [Discover current legacy Review sources explicitly](./WF-176-discover-current-legacy-review-sources.md)
- Import durability and exact-content authority: [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md) and [Choose the Authoritative Workflow State architecture](./WF-043-choose-authoritative-state-architecture.md)

## Interface

Deepen the existing private legacy Review import Module rather than placing a
pass-through coordinator over discovery. Extend the closed Workspace command
union with one operation shaped by semantic intent, not persistence mechanics:

```text
legacy-review.source.import
  commandIdentity
  expectedStateVersion
  sourceIdentity
  expectedDigest
```

The command re-resolves and re-captures the source behind `sourceIdentity`; a
caller never submits bytes, paths, parsed values, record identities, parser
configuration, or timestamps. The result names the exact imported source
occurrence and current State version. Stable typed rejection distinguishes
invalid/unknown source identity, missing or unsafe/unreadable source, changed
digest, State version mismatch/conflict, and the bounded occurrence limit.
Command normalization, recall, and result decoding stay inside the owner.

## Durable model

- Give each occurrence a deterministic identity from Workspace Identity,
  locator-bound source identity, and exact digest. Changed bytes therefore
  cannot inherit consent.
- Store one immutable `legacy-review.source-occurrence` record whose payload
  carries source kind/location/canonical locator, observed metadata, digest,
  byte length, recognition/diagnostic, parser version, and import provenance.
  Store the original bytes once as an exact-content role.
- Maintain one Workspace-scoped, bounded, revisioned legacy import index and one
  immutable normalized command/result record. Keep all three in the same State
  commit. Use dedicated legacy migration record kinds and identities; never use
  a Review, Snapshot, Draft, Annotation, Batch, Handoff, Invocation, evidence,
  disposition, Result, or Workspace Identity record kind.
- A safe stable source with malformed or unsupported content may still be
  explicitly preserved with its closed diagnostic, but it creates no parsed
  history or candidate. Missing, unsafe, racing beyond the capture bound, or
  otherwise uncaptured bytes commit nothing.
- Exact command replay returns the committed result. A separately identified
  repeat over the same locator and digest may record command idempotency but
  must not duplicate the occurrence, BLOB, or index entry. Index/record
  conflicts fail closed.
- The discovery view may add only bounded migration status for the observed
  digest: undecided, imported, or changed since an imported occurrence. It must
  not expose stored bytes, legacy text, parser values, command identities, or
  unbounded prior occurrences.

## Acceptance

- [x] A valid sanitized queue import commits exact golden bytes and complete
      content-silent provenance atomically; direct State reads prove the BLOB
      digest/bytes and dedicated record classes/kinds.
- [x] A safely captured malformed/unsupported source can be preserved only by
      the same explicit command and remains diagnostic-only.
- [x] Same-command replay is exact; a second command for the same occurrence
      does not duplicate source bytes or index membership; restart reconstructs
      imported status.
- [x] Source replacement after preview rejects as changed without a commit;
      later discovery reports a changed undecided occurrence and a newly
      confirmed exact digest can be preserved independently.
- [x] Missing, symlinked, unstable, over-bound, unknown source identity,
      malformed request, stale State version, command-identity conflict, and
      index bound all fail closed with no preservation claim.
- [x] Source bytes, mode, mtime, ctime, locator directory membership, v1 Review
      index/records, and all unrelated State remain unchanged except the one
      migration-evidence commit.
- [x] Fault evidence before Durable Commit leaves no index, occurrence, BLOB, or
      command record; an unknown outcome after Durable Commit reconstructs the
      exact accepted result without replaying filesystem or State effects.
- [x] The command/result and updated source view cross Local Runtime's existing
      version-1 generic operation transport without protocol, framing, ordering,
      replay, timeout, pending-bound, or subscription changes.
- [x] Focused contracts fail when the import dispatch or atomic occurrence write
      is restored to pre-WF-177 behavior, then package/canonical verification and
      all four compiled risk probes pass on the pinned toolchain.

## Non-goals and constraints

- Do not yet project queue candidates, receipt history, legacy text, Anchor
  suggestions, or any v1 Draft; do not implement defer/dismiss or moved-source
  discovery in this child.
- Do not alter Authoritative State store format 2 or expose its Interface. Use
  its existing revisioned/immutable records, exact-content roles, optimistic
  version checks, command idempotency, and fault seams.
- Do not read on startup, Home, or ordinary Reviewing paths. Do not cache,
  prefetch, scan, infer association/intent/Anchor, or touch a source.
- Do not import a deletion-bound package or inspect real user data. Tests use
  only pinned sanitized goldens and disposable roots.
- Keep source capture bounds, source order, Workspace Interface version 1, Local
  Runtime wire shapes, existing Reviewing bytes/records, and the unrelated root
  `package.json` bump unchanged.

## Resolution comment

Yes. The WF-176 discovery implementation was deepened, not wrapped, into one
private `LegacyReviewImportOwner`. Its two operations remain the closed
`legacy-review.sources` read and one semantic
`legacy-review.source.import` command carrying only command identity, expected
State version, locator-bound source identity, and expected digest. The owner
re-resolves and stabilizes bytes itself. Invalid, stale, unknown, missing,
symlinked, oversized, repeatedly racing, changed, conflicting, and over-bound
inputs commit no preservation claim.

One accepted first import commits a deterministic `lso_…` immutable
`legacy-review.source-occurrence`, its exact `legacy-source` BLOB, a bounded
revisioned `legacy-review.import-index`, and an immutable normalized `lmc_…`
command/result record atomically. The occurrence stores exact locator,
stat metadata, digest, byte length, parser version, content-silent recognition
or diagnostic, and import provenance under a migration-only `lmi_…` authority.
No v1 Review record is created. A 4,096-occurrence production bound applies
before materialization. Exact command recall validates the index and occurrence
without touching the source; a separately identified repeat commits only its
command fact and returns `already-preserved` without another occurrence, BLOB,
or index member.

The source view now reports `undecided`, exact `imported`, or bounded
`changed-since-import` status. Before making an imported claim it validates the
referenced immutable occurrence. It still exposes no source bytes, annotation
text, excerpts, Harness/session/model fields, parsed values, command identities,
or unbounded prior records. Missing sources remain simple source failures.
Source discovery still occurs only on this explicit view, and import capture
only on this explicit command.

Ten direct Workspace contracts prove exact sanitized golden-byte and metadata
preservation, dedicated record classes/kinds/content, no Review index, stable
restart reconstruction, exact and separately identified idempotency,
unsupported/malformed diagnostic-only preservation, changed-digest consent,
all requested failure classes, the occurrence bound, a pre-existing record
conflict, transaction rollback, post-commit unknown-outcome recall after the
source is removed, and a three-attempt source race. Two focused Local Runtime
contracts prove the typed view, command/result, malformed-call rejection, and
unchanged version-1 compatibility over the existing opaque operation transport.
Removing Workspace dispatch fails with `Unknown Workspace command`; removing
the atomic occurrence write fails recall with
`legacy-review-import-state-invalid`.

On Node 26.5.1 with pnpm 11.20.0, 38 focused source/import/runtime and package
seam tests pass. Canonical `v1:verify` passes 29 files / 183 tests, dependency
firewall, all typechecks, builds, and smoke. The four compiled State, Local
Runtime, reviewed Pi 0.80.6, and dogfood probes pass, and `git diff --check` is
clean. No real legacy/user data was inspected or changed; State remains format
2, Workspace/Local Runtime remain version 1 with unchanged ordering and framing,
no deletion-bound dependency entered active source, and the unrelated root
`package.json` bump remains untouched.
