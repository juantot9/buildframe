---
id: WF-043
title: "Choose the Authoritative Workflow State architecture"
status: closed
labels:
  - wayfinder:prototype
parent: WF-039
assignee: juanan
blocked_by: [WF-041, WF-042]
created: 2026-07-17
assets:
  - "ab9e1ce:apps/authoritative-state-prototype/ on evidence/validated-implementation-probes (disposable evidence only)"
  - "ba374d1:evidence/validated-implementation-probes/README.md on evidence/validated-implementation-probes"
---

## Question

Which persistence model and implementation technology should realize Authoritative Workflow State, immutable records, atomic semantic transitions before external effects, one Workspace Writer, exact Artifact bytes, schema evolution, conservative recovery and quarantine, bundle round trips, and the v1 scale envelope; and can a disposable persistence probe validate its highest-risk durability and migration claims?

## Blocked by

- [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
- [Choose the local runtime and Workspace Writer topology](./WF-042-choose-local-runtime-topology.md)

## Resolution comment

Choose a **generation-switched SQLite record store** implemented directly with built-in `node:sqlite`, without an ORM, event-sourcing framework, or caller-visible repository layer. One private store root belongs to one Workspace Identity in the OS user-state location. The State Module keeps SQLite, files, locks, migrations, checksums, and recovery mechanics behind a narrow internal Interface; the Workspace Interface remains `execute`, `read`, and `subscribe`, and workflow Modules continue to own semantic meaning and invariants.

```text
command owner ── complete semantic transition ──▶ Authoritative State Module
                                                        │
                         lifetime lock.sqlite ◀──────────┤ one writer
                         CURRENT ─▶ generation-N.sqlite ◀┤ one authority
                         checksummed record envelopes ◀──┤ exact facts
                         exact content BLOBs ◀────────────┤ exact Artifact bytes
                         quarantine reports ◀────────────┘ conservative recovery

migration: verified N ── build + validate ──▶ N+1 ── atomic CURRENT switch
bundle:    logical manifest + record/content bytes, never a copied database
```

### Store and record shape

Each active generation is one owner-only SQLite database. Use rollback journaling with `synchronous=FULL`, `fullfsync=ON` where the platform supports it, foreign keys, and immediate failure on unexpected lock contention. Rollback journaling is preferable to WAL because all authoritative access already sits inside one runtime, no client reads the database directly, and a self-contained generation is simpler to preserve, migrate, diagnose, and switch.

The canonical tables hold store metadata, command idempotency, typed record envelopes, exact content objects, record-to-content references, quarantine reports, and bundle-import facts. A record envelope carries stable Workflow Record Identity, owning Workflow Identity, closed kind, record-schema version, immutability class, exact versioned payload bytes, and a checksum. Payloads use a versioned binary-safe JSON representation; large or exact Artifact content is stored separately as SQLite BLOB content objects and referenced by digest. A digest verifies or deduplicates content but never supplies Artifact Identity or merges record occurrences.

Consequential facts—Artifacts, decisions, Batches, dispositions, Handoffs, Invocations, receipts, and evidence—are insert-only through the State Interface. Mutable drafts and curation state use an explicitly separate revisioned record class with compare-and-swap replacement; they cannot update immutable history accidentally. Whole-Workflow purge is the only semantic deletion route and is a dedicated State operation after the Workflow Organization Module has established the Destructive Consent Gate and full dependency closure. State exposes neither generic CRUD nor Plan, Artifact, Annotation, or receipt repositories.

SQL indexes and bounded metadata columns support lookup, but they are storage mechanics rather than parallel authority. Product projections remain on-demand outputs of the Projection Module. Exact content is loaded in bounded pieces only when requested; startup and Home never deserialize every Artifact or the whole Workspace.

### Durable Commit and writer ownership

The production State Adapter lives on one private persistence worker thread inside the per-workspace runtime chosen by [Choose the local runtime and Workspace Writer topology](./WF-042-choose-local-runtime-topology.md). It owns every SQLite connection and serializes State requests so synchronous `node:sqlite` work cannot block the runtime IPC loop. The thread is implementation, not a package or public seam; losing it is fatal to that runtime generation rather than permission to continue from memory.

Before runtime readiness, that worker opens a tiny lock database and holds a lifetime `BEGIN EXCLUSIVE` transaction. SQLite's OS lock is the final Workspace Writer exclusion authority: a contender fails closed, while process death releases the lock without stale-owner guessing. The active state database then uses ordinary short transactions; no TUI, launcher, Harness Adapter, Editor Adapter, or diagnostic tool opens it directly.

A command owner submits one complete transition with expected state version and stable command identity. State begins one transaction, validates identity and immutability constraints, writes every affected record, content object, command result, and next committed state version, and reports success only after `COMMIT` returns. Duplicate command identity returns the previously committed result and starts no effect. Any validation, constraint, I/O, or durability failure rolls back all records and leaves the prior authority unchanged.

Only the owning Module may begin its external effect after that success. A crash after commit but before effect remains an explicit committed-with-missing-evidence condition governed by the relevant Harness, Editor, or Portability semantics; State never replays it automatically. This preserves the already-settled distinction between authority, delivery, start, and outcome.

### Format evolution and recovery

`CURRENT` names exactly one active generation. Store format and individual record schemas are versioned independently. A migration acquires the writer lease, verifies the source, creates a fresh candidate database, copies or transforms records through the owning schema validators while preserving identities, provenance, quarantine facts, and exact content bytes, then runs SQLite integrity, envelope-checksum, referential, and semantic validation. Only after the candidate file and directory entries are durably synchronized is it renamed as a generation and selected through an atomic, durably synchronized `CURRENT` replacement. The prior verified generation remains untouched. A failed or interrupted candidate never becomes authority; unknown newer format opens read-only and starts no writer runtime.

Checksums detect accidental corruption and migration mistakes, not hostile local modification. When SQLite can retrieve a malformed envelope or content object, State leaves its original bytes unchanged, appends a persistent quarantine report, excludes only that object from semantic reads, and lets verified unaffected Workflows continue. The owning Workflow blocks only actions whose required facts are quarantined. If SQLite container damage prevents trustworthy row recovery, State preserves and quarantines the complete original generation, fails closed, and may construct a separate recovery generation only from independently verified readable records; it never claims row-level recovery it cannot prove or silently rolls back to older authority.

Receipt Integrity remains application-level: normal State operations cannot edit or selectively delete immutable receipts, corrections append facts, and explicit whole-Workflow purge removes the closed history. This adds no signature, attestation, encryption, or tamper-proof claim.

### Portability and scale

Workflow Portability exports a storage-independent logical bundle: versioned manifest, selected record envelopes, complete dependency closure, exact content files, digests, and provenance. It never copies or zips the SQLite generation. Import validates the entire bundle before one transaction, preserves record identities, rejects conflicting identity/content, treats an identical import idempotently, records explicit Workspace Rebinding, and leaves historical Harness activity inert. The eventual archive container, compression, and installation handling remain with the existing packaging plan; they cannot change this logical format contract.

The disposable Authoritative Workflow State probe preserved at `ab9e1ce:apps/authoritative-state-prototype/` on `evidence/validated-implementation-probes` passed lifetime competing-writer exclusion and crash release; immediate `SIGKILL` after a reported commit with exact binary Artifact bytes; commit-before-effect crash separation; all-or-nothing rollback on a failed multi-record transition; failed-migration preservation followed by validated generation switch; read-only handling of a newer format; single-record quarantine with unchanged corrupt bytes and an unaffected usable Workflow; and byte-exact, identity-preserving, idempotent logical bundle import. Its exact reproduction route and logs are indexed by `ba374d1:evidence/validated-implementation-probes/README.md`.

On Node `24.18.0` and SQLite `3.53.1` on the audited arm64 macOS machine, its 1,000-Workflow, 1,000-file Review, and 50 MiB exact-content fixture produced a 52,862,976-byte database. Reopening the generation took 2.11 ms, reading 1,000 Workflow summaries took 0.55 ms, and reading a 1 MiB Artifact took 0.20 ms. These measurements validate the lazy record/content shape, not release performance by themselves. The existing verification and packaging tickets must rerun crash, migration, and scale probes on the supported Node `22.19.0` floor and macOS, Linux, and WSL2 matrix; the 250,000-path Git envelope remains a Workspace Evidence concern.

This rejects a custom file-generation store because Neoflow would have to invent transactions, locking, query indexes, and crash recovery; one JSON document or per-Workflow files because cross-Workflow commitments and receipts would not be atomic; a filesystem BLOB sidecar because database/file commits cannot be atomic; and event sourcing as the sole state model because perpetual replay and upcasting add no value over immutable occurrence records while complicating mutable drafts, quarantine, and scoped reads. No product language, new ticket, or fog changes.
