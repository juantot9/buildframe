---
id: WF-183
title: "Associate and import one moved legacy receipt source"
status: closed
labels:
  - wayfinder:task
parent: WF-174
assignee: juanan
blocked_by: [WF-182]
created: 2026-09-02
---

## Outcome

One explicit Workspace command confirms the current Workspace Identity and one
exact recognized moved-receipt digest, then atomically records their deliberate
association and preserves that exact source BLOB as non-v1 migration evidence.
The existing bounded legacy-history reads can use the resulting occurrence after
the mutable source disappears. No path, hash, embedded workspace value, content,
repository metadata, or prior discovery infers association.

## Grounding

- Parent map: [Implement the explicit legacy Review importer](./WF-174-implement-explicit-legacy-review-importer.md)
- Association authority: [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)
- Explicit locator/path views: [Discover moved legacy receipt sources explicitly](./WF-182-discover-moved-legacy-receipt-sources.md)
- Exact atomic preservation: [Atomically preserve an imported legacy Review source](./WF-177-atomically-preserve-imported-legacy-review-source.md)
- BLOB-only history: [Project imported legacy receipt history safely](./WF-179-project-imported-legacy-receipt-history.md)

## Interface

Deepen `LegacyReviewImportOwner` with one closed command:

```text
legacy-review.moved-receipt-source.associate-and-import
  commandIdentity
  expectedStateVersion
  confirmedWorkspaceIdentity
  sourceIdentity
  legacyCheckoutHash
  expectedDigest
```

The accepted result returns the exact `lgs_…` source, deterministic `lma_…`
association, deterministic `lso_…` source occurrence, receipt digest, and
`recorded | already-recorded` / `preserved | already-preserved` dispositions.
A content-free immutable association fact and exact source occurrence/BLOB are
committed together with migration-index membership and command recall. There is
no standalone association, implicit import, or generic cross-owner write API.

## State and trust invariants

- Require the caller to echo the runtime's exact current Workspace Identity.
  Reject a mismatch before touching a locator. The Workspace owner remains the
  authority; the field makes human association intent explicit rather than
  deriving it from the selected source.
- Require one lower-case 64-hex old locator hash, its matching opaque moved
  `sourceIdentity`, and the exact expected digest. Reject the current checkout's
  receipt hash. Reconstruct only
  `<legacy-state>/neoflow/workspaces/<hash>/review-receipts.json`; accept no
  caller path, source bytes, embedded path, repository name, remote, timestamp,
  or similarity claim.
- Re-capture through the existing no-follow regular-file-only, 16 MiB,
  4,096-entry, three-attempt source operation. Only stable recognized
  `receipts-v1` bytes with the expected digest are eligible. Changed,
  disappeared, malformed, unsupported, unsafe, oversized, and racing sources
  leave State unchanged.
- Derive `lma_…` from Workspace Identity, source identity, and exact digest.
  The immutable association payload is content-free and binds that identity,
  occurrence, old hash, current Workspace Identity, and command/version facts.
  It cannot satisfy any v1 Review invariant or associate a changed digest.
- In the same expected-version transaction, write the association fact, a moved
  `legacy-review.source-occurrence`, exact `legacy-source` BLOB, revisioned
  migration index, command record, and result. A failure before commit records
  none; an unknown post-commit outcome is recalled without source access or a
  second preservation claim.
- Extend the backward-compatible format-1 migration index with optional bounded
  association entries. Preserve them through every current import/source
  decision/candidate decision writer. Validate uniqueness, exact occurrence
  membership, immutable association facts, source kind/location/hash/digest,
  and BLOB checksums before projecting imported status or history.
- Exact association/import is irreversible. Same-command replay returns the
  committed result; a new command for the same exact source reuses both facts.
  Changed bytes are a separate unassociated occurrence requiring fresh explicit
  confirmation. No defer/dismiss command can override an imported occurrence.
- Count active association and occurrence entries under the existing aggregate
  4,096 migration bound. Keep command/result payloads content-free and bounded.
  Add no scan cache, automatic startup work, side effect, subscription,
  telemetry, source mutation, or production test instrumentation.

## Acceptance

- [x] A sanitized discovered moved receipt can be associated/imported only with
      the exact current Workspace Identity, moved `lgs_…` identity/hash, digest,
      and State version; one commit creates deterministic `lma_…` + `lso_…`
      evidence and increments State exactly once.
- [x] The moved list/detail report structurally validated
      `unassociated | associated-and-imported` exact-digest status without
      treating embedded paths as authority; the current source views/order and
      undiscovered ordinary paths are unchanged.
- [x] After source deletion and runtime restart, receipt history/detail derive
      exclusively from the imported exact BLOB and retain explicit legacy
      disclosure. Changed replacement bytes remain unassociated and cannot
      alter the imported history.
- [x] Same-command replay, a second exact command, command-identity conflict,
      concurrent attempts, and restart reconstruct deterministic results without
      duplicate facts or BLOBs. Exact import wins irreversibly.
- [x] Wrong Workspace, current hash, identity/hash mismatch, stale version,
      changed digest, missing, unsafe, non-regular, oversized, racing,
      malformed/unsupported receipt, open request shape, and aggregate limit all
      reject with stable content-free reasons and no State/source change.
- [x] Transaction failpoints prove rollback of association/index/occurrence/BLOB
      and command evidence; unknown committed outcomes recall after source
      removal. Missing, conflicting, or quarantined association/occurrence/BLOB
      evidence fails closed instead of claiming association or history.
- [x] The strict command/result and both updated frozen moved views cross Local
      Runtime protocol/interface version 1 unchanged, with no path or bytes in
      the command and no framing/order/pending changes.
- [x] Focused mutations fail if Workspace command dispatch or the immutable
      association/occurrence writes are removed. Canonical verification, all
      four compiled risk probes, package/dependency seams, and `git diff --check`
      pass on the pinned toolchain.

## Non-goals and constraints

- Do not infer association, auto-select a source, import moved queue files,
  promote queue candidates, create/revise a v1 Draft, or add Application UI in
  this child.
- Do not add a standalone association lifecycle, reassociation, unimport,
  content-bearing decision record, generic migration registry, filesystem
  picker, shared transaction coordinator, or new State/Workspace/transport
  version.
- Do not mutate a source or inspect real user data. Use sanitized receipts and
  disposable roots only.
- Preserve current queue/receipt import behavior and identities, exact BLOB
  authority, receipt bounds/disclosure, command ordering/recall, State format 2,
  and the unrelated root `package.json` bump.

## Resolution

Closed on 2026-09-02. `LegacyReviewImportOwner` now owns the strict
`legacy-review.moved-receipt-source.associate-and-import` transition. It
re-captures one explicitly selected old locator, requires the exact current
Workspace Identity/source identity/hash/digest/version, and commits one
content-free `lma_…` fact with one exact moved `lso_…` occurrence/BLOB, bounded
index membership, and replay evidence. Moved source list/detail status is
reconstructed only after validating all immutable evidence; imported receipt
history remains BLOB-only after deletion and restart.

Seven sanitized association scenarios cover exact import, replacement bytes,
replay/reuse/conflict/concurrency, every index writer, strict rejection and
bounds, failpoints and unknown outcomes, and corrupted/quarantined evidence.
They are loaded beside moved discovery in one Vitest worker to serialize their
disposable Git/SQLite process load. Workspace dispatch and both durable writes
were independently removed and each focused mutation failed.

On Node 26.5.1 and pnpm 11.20.0, canonical `v1:verify` passed 32 files / 215
tests plus dependency firewall, typechecks, builds, and smoke checks. The State,
Local Runtime, Pi Adapter, and installed dogfood risk probes passed, as did
`git diff --check`. Workspace and Local Runtime remain Interface version 1,
State remains format 2, no legacy package entered the active graph, no real
legacy source was accessed, and the unrelated root `package.json` change stayed
outside this work.
