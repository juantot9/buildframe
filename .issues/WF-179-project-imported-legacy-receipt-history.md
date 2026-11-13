---
id: WF-179
title: "Project imported legacy receipt history safely"
status: closed
labels:
  - wayfinder:task
parent: WF-174
assignee: juanan
blocked_by: [WF-178]
created: 2026-09-02
---

## Outcome

An explicitly imported, recognized receipt occurrence can be inspected through
bounded Workspace views as unmistakably labelled read-only **legacy Review
history**. Projection is rebuilt only from the exact State BLOB; it never reads
the mutable source again, writes a parsed cache, converts a legacy field into a
v1 record, or lets an unimported/deferred/dismissed/queue/diagnostic occurrence
masquerade as history.

## Grounding

- Parent map: [Implement the explicit legacy Review importer](./WF-174-implement-explicit-legacy-review-importer.md)
- Exact BLOB/index authority: [Atomically preserve an imported legacy Review source](./WF-177-atomically-preserve-imported-legacy-review-source.md)
- Exact source decisions: [Record exact legacy source defer and dismiss decisions](./WF-178-record-exact-legacy-source-decisions.md)
- Legacy-history invariants: [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)

## Interface

Deepen `LegacyReviewImportOwner` with two closed read projections rather than a
generic record browser:

```text
legacy-review.receipt-history
  sourceOccurrenceIdentity
  batchOffset
  batchLimit

legacy-review.receipt-batch
  sourceOccurrenceIdentity
  batchAbsolute
  annotationOffset
  annotationLimit
```

The first returns bounded batch summaries in source order. The second returns
one exact batch and a bounded annotation window. Both return the current State
version, source identity/occurrence/digest provenance, and the same fixed legacy
history disclosure. Callers provide no path, bytes, role, parser version,
record kind, or content window.

Every projected source string uses an explicit UTF-8 byte window with total,
shown, and truncation facts. Raw IDs and paths remain labelled `legacy*`; they
never become Workspace, Review, Snapshot, Annotation, Batch, Harness, Session,
or other v1 identities. Exact numeric/timestamp/enumerated legacy values may be
shown under their legacy names.

## Projection and safety rules

- Resolve the requested occurrence through the validated import index, require
  an immutable receipt occurrence and exact `legacy-source` content, verify its
  digest/length through State, and recognize those stored bytes with the frozen
  WF-175 parser. Never consult the current filesystem source.
- Reject malformed request shapes and return a stable unavailable reason for an
  unknown/not-imported occurrence, wrong source kind, diagnostic-only import,
  missing/quarantined content, absent batch, or projection bound. State
  corruption itself remains a fail-closed owner error rather than invented
  history.
- Every available view prominently labels provenance as imported legacy receipt
  history and states that the mutable source retained at most 100 terminal
  batches and cannot prove completeness, consent, delivery, Harness start,
  terminal correlation, human disposition, correctness, or v1 workflow facts.
- Batch summaries may expose only bounded legacy batch/workspace/Harness labels,
  timestamps, outcome/queue fields, error windows, and annotation count. Batch
  detail may additionally expose bounded legacy annotation id/kind/file,
  old/new/file anchor hints, text, and excerpt. Preserve source order; do not
  merge receipt annotation copies with queue entries.
- Cap batch and annotation windows before mapping strings. Pin aggregate encoded
  view size comfortably below Local Runtime's existing one-megabyte body bound,
  including adversarial maximum-length source strings. Do not change that frame
  bound or add transport chunking.
- Projection is pure/read-only: no State commit, source read, cache, parsed
  index, startup/Home work, subscription, v1 Review record, or external effect.

## Acceptance

- [x] Importing the sanitized receipt golden then deleting/replacing its source
      still projects exact BLOB-derived batches and annotations with stable
      source order, offsets, counts, outcomes, and provenance labels.
- [x] The disclosure is structural and complete on history and batch detail;
      tests prove no projected item can be mistaken for a v1 record or identity.
- [x] UTF-8 windows preserve exact complete strings below bounds, truncate only
      at scalar boundaries, report exact total/shown bytes, and keep worst-case
      history/detail JSON bodies below the unchanged Local Runtime frame bound.
- [x] Offset/limit bounds, end windows, absent batches, malformed requests,
      unknown/unindexed/deferred/dismissed occurrence identities, queue
      occurrences, malformed/unsupported imported receipts, missing content,
      and corrupt State all fail closed with no fabricated history.
- [x] Repeated reads and restart are stable and State/source metadata remain
      unchanged; no parsed cache or new durable record appears.
- [x] Both typed views cross Local Runtime's existing version-1 transport with
      frozen bounded results, ordered calls, and unchanged protocol/framing.
- [x] Focused regressions fail without receipt-view dispatch and when projection
      is allowed to use current source bytes, then canonical verification and
      all four compiled risk probes pass on the pinned toolchain.

## Non-goals and constraints

- Do not project current queue candidates, promote a Draft, infer intent/Anchor,
  add candidate decisions, or add moved-source association in this child.
- Do not claim receipt completeness or reconstruct v1 lifecycle semantics. Do
  not replay a Harness action or infer consent, disposition, delivery, start,
  correlation, or correctness.
- Do not expose full unbounded strings, raw BLOBs, State content mechanics, or
  deletion-bound types. Use only sanitized/disposable evidence; inspect no real
  user data.
- Preserve State format 2, Workspace/Local Runtime version 1, source/import
  bytes and decisions, existing Reviewing records, frame/order/pending bounds,
  and the unrelated root `package.json` bump.

## Resolution comment

Yes. `LegacyReviewImportOwner` now owns two closed reads:
`legacy-review.receipt-history` windows at most 24 source-ordered batch
summaries, while `legacy-review.receipt-batch` selects one absolute batch and
windows at most eight annotations. Both resolve only an imported `lso_…` through
the validated migration index, load its exact `legacy-source` content from
Authoritative State, verify length/digest and occurrence provenance, and run the
same package-private frozen parser over those retained bytes. They never consult
the current source path.

Every available result carries `LEGACY REVIEW HISTORY`,
`imported-legacy-receipt-source`, and
`migration-evidence-not-v1-history` structurally. The fixed disclosure says the
source was mutable, retained at most 100 terminal batches, and cannot prove
complete history, consent, delivery, Harness start, terminal correlation, human
disposition, correctness, or v1 facts. Raw fields remain explicitly
`legacy…`-labelled. History exposes bounded batch/workspace/Harness/outcome and
queue summaries; detail exposes bounded legacy annotation id/kind/file, anchor
hints, text, and excerpt. Nothing receives a v1 identity or record shape, and
receipt copies are not merged with queue entries.

Every source string is a UTF-8 byte window carrying exact total, shown, and
truncation facts. IDs are capped at 128 bytes, paths at 1,024, labels at 256,
errors at 512, annotation text at 8,192, and excerpts at 4,096. Truncation backs
up to a Unicode scalar boundary. An adversarial 24-batch/eight-annotation fixture
with maximum control-character escaping and multibyte text keeps both encoded
views below the one-megabyte frame body bound with a 2 KiB envelope reserve.
Over-limit windows return `projection-limit`; malformed shapes reject.

Four direct Workspace scenarios prove exact golden fields/order/windows,
structural disclosure, empty/end windows, source metadata preservation,
source deletion plus restart, unknown/unimported/deferred, wrong-kind queue,
diagnostic-only malformed receipt, absent batch, malformed requests, projection
bounds, scalar-safe truncation, and frame size. A deliberately corrupted State
content BLOB becomes `content-unavailable` even while the original valid receipt
source remains present, proving there is no filesystem fallback. A focused Local
Runtime contract carries both frozen typed views through unchanged version-1
transport. Removing Workspace dispatch fails with `Unknown Workspace projection
request`; mutating the owner to read current source bytes makes the quarantine
contract fabricate available history and fail.

On Node 26.5.1 with pnpm 11.20.0, 48 focused source/import/history/runtime and
package-seam tests pass. Canonical `v1:verify` passes 30 files / 193 tests,
dependency firewall, all typechecks, builds, and smoke. All four compiled State,
Local Runtime, reviewed Pi 0.80.6, and dogfood probes pass, and
`git diff --check` is clean. No real legacy/user data was inspected or changed,
no projection cache or durable semantic record was added, State stays format 2,
Workspace/Local Runtime stay version 1 with unchanged framing/order/bounds, no
deletion-bound dependency entered active source, and the unrelated root
`package.json` bump remains untouched.
