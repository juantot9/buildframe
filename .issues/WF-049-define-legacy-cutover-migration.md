---
id: WF-049
title: "Define legacy deletion, cutover, and data migration"
status: closed
labels:
  - wayfinder:grilling
parent: WF-039
assignee: juanan
blocked_by: [WF-043, WF-047]
created: 2026-07-17
assets: []
---

## Question

How should implementation isolate or delete the legacy MVP while keeping the repository buildable, introduce dogfoodable v1 paths, retire old packages and commands, and perform the conservative one-time legacy Review-data import without compatibility scaffolding obscuring the new Module seams or allowing incomplete history to become canonical state?

## Blocked by

- [Choose the Authoritative Workflow State architecture](./WF-043-choose-authoritative-state-architecture.md)
- [Choose the first dogfoodable vertical slice](./WF-047-choose-first-dogfood-slice.md)

## Resolution comment

Use a **dependency-isolated parallel build followed by one hard source cutover**, and ship a self-contained, explicitly authorized legacy Review importer. Legacy code may remain runnable only while the production-shaped v1 Reviewing path is being proven; it never becomes an Adapter, compatibility layer, fallback, dual writer, or source of v1 records.

```text
parallel build                         hard cutover

legacy MVP ── unchanged ──┐            delete legacy source/packages/commands
                          │
new v1 packages ──────────┼─ gates ──▶ apps/neoflow is the only product path
  Workspace Interface     │                    │
  new State + runtime     │                    ▼
  new Pi + pi-tui path ───┘          explicit legacy Review import
                                            │
                       exact source bytes + labelled history
                                            │
                       human-confirmed candidates only
                                            ▼
                                  new Annotation Drafts
```

### Parallel construction and hard cutover

Create the target topology from [Choose the local runtime and Workspace Writer topology](./WF-042-choose-local-runtime-topology.md): `packages/workspace`, `packages/local-runtime`, and `apps/neoflow`, plus only the separately host-loaded Adapter packages actually required. The new source graph must not import `apps/tui`, `apps/cli`, `packages/core`, `packages/ai-harness`, `packages/pi-connector`, the old `nvim/` integration, or their record and protocol types. A small dependency check should enforce that rule. Validated Git/diff, terminal, persistence-ordering, socket, and Pi-hook mechanics are copied with still-valid tests into their new owning Modules; they are never reached through wrappers around a legacy package.

During the parallel period, pnpm builds and verifies both retained legacy source and the growing target source so the repository stays buildable at every work package. The new executable has an explicit developer-only dogfood entrypoint; exact installed commands and package assembly remain for [Shape packaging, setup, and release topology](./WF-050-shape-packaging-setup-release.md). Legacy and v1 use separate endpoints and stores. There is no shared mutable file, dual write, background synchronization, or conversion on ordinary startup, and the old product is not offered as an in-v1 fallback when a v1 action is unsupported.

The cutover is one coordinated work package after all of these are true:

- the first Reviewing slice passes its automated Interface, State, IPC, Pi Adapter, terminal, restart, staleness, and non-normal-outcome evidence;
- the three real Review Passes and induced-failure learning gate from [Choose the first dogfoodable vertical slice](./WF-047-choose-first-dogfood-slice.md) pass without legacy fallback;
- legacy discovery and import pass their golden-byte, malformed/newer-input, crash, idempotency, moved-checkout, and candidate-confirmation gates; and
- the real ignored `.neoflow/review.json` in this checkout can be inspected and preserved without being modified or fabricating v1 history.

At that point make `apps/neoflow` the sole product source and remove legacy `apps/tui`, `apps/cli`, `packages/core`, `packages/ai-harness`, `packages/pi-connector`, and the one-shot `nvim/` integration. Remove their manifests, root scripts, smoke imports, lockfile dependencies, Ink/React and any otherwise-unused Commander dependency, `neoflow send`, compatibility aliases, generic mode protocol, Mock path, and legacy tests whose behavior no longer applies. Keep only tests transplanted behind a new owner’s Interface. The first post-cutover executable may expose Reviewing alone; all later Planning, Reviewing, Harness, and Editor slices extend the v1 architecture rather than restoring the MVP.

The source cutover never deletes or edits `.neoflow/review.json`, a legacy receipt file, or any other user data. Before cutover, rollback is simply source control over two isolated products. After cutover, no shipped legacy executable or hidden compatibility path is retained; installation upgrade and binary rollback mechanics belong to the packaging decision, while v1 State compatibility follows the already-selected generation migration rules.

### Deep legacy-import ownership

Keep the frozen importer beside the Reviewing Module under `packages/workspace`; it owns legacy Review format recognition, source classification, import idempotency, candidate meaning, and legacy-history projections. Its narrow operations are exposed only as closed Workspace commands and projections for inspect, explicitly import, defer, dismiss, and confirm a candidate. Filesystem reads, old path hashing, parsers, bounds, and source stabilization are private implementation. It is not a generic migration framework, a public filesystem Interface, a State schema migration, or Portable Workflow Bundle import.

The Authoritative State Module atomically stores import evidence after the importer has obtained stable source bytes, but assigns those records a dedicated migration-evidence class that cannot satisfy any v1 workflow invariant. Reviewing alone may later create an Annotation Draft through a separate confirmed command. This preserves Depth and Locality: callers learn one small Workspace Interface, State owns durability without interpreting Review semantics, and no legacy shape leaks into Planning, Harness Interaction, Projection callers, or native Adapters.

### Read-only discovery and explicit import

Ordinary discovery is read-only and scoped to the active Workspace Identity. It checks the known current-checkout sources:

- `<canonical-checkout>/.neoflow/review.json`; and
- `${XDG_STATE_HOME:-~/.local/state}/neoflow/workspaces/<sha256(legacy-realpath)>/review-receipts.json` for the current canonical path.

Discovery reports source kind, location, byte size, digest, recognized version, and whether it is valid, malformed, unsupported-newer, already imported, deferred, or changed since a prior decision. It writes no marker, performs no source migration, and does not treat mere detection as consent. A defer or dismiss decision is stored against the exact source digest in v1 State without touching the source; different bytes surface as a new source occurrence.

Because a checkout move changes the legacy receipt hash and the old hash cannot prove the new Workspace Identity, broader discovery occurs only through an explicit `Find legacy data` action. It may inspect the bounded legacy workspace-state directory or a user-supplied former checkout path, but must display every embedded old workspace path and require the user to associate the selected source with the current Workspace Identity. It never auto-associates another workspace’s receipts by repository name, remote, content, recency, or path similarity.

Import is one explicit, previewed action over exact selected source occurrences. The importer accepts only bounded regular files, reads without following a substituted symlink, revalidates identity and bytes around the read, and retries only a small bounded race. The Durable Commit stores the original bytes as a BLOB, digest, source locator and kind, observed metadata, parser version, validation result, import occurrence, and any diagnostic. It never renames, rewrites, chmods, moves, or deletes the source. Repeating the same source identity and bytes is idempotent; changed bytes require a new preview and consent.

Known valid formats are raw version-1 annotation arrays, version-1 and version-2 Review queue objects, and version-1 receipt files. Malformed, duplicate-identity, over-bound, non-regular, and unknown-newer sources fail closed. When exact bytes can safely be read, an explicitly requested import may preserve them with a diagnostic as uninterpreted migration evidence, but it produces no parsed history or candidate. Failure to capture exact bytes leaves the source untouched and commits no claim that it was preserved.

### Legacy history is not v1 history

A valid receipt source is rendered only as **labelled read-only legacy Review history** derived from its exact captured bytes. The interface explains that the file was mutable, retained at most 100 terminal batches, used normalized absolute paths, and cannot prove complete history, consent, delivery, Harness start, terminal correlation, human disposition, or correctness. Parsed indexes are rebuildable projections over the preserved source; legacy batch, annotation, Harness, session, outcome, and queue fields retain their original labels and provenance.

The importer never converts a legacy receipt or its embedded annotation copies into a Workflow, Review, Review Pass, Review Snapshot, Annotation, Review Batch, Workflow Handoff, Commitment Receipt, Capability Snapshot, Invocation, Terminal Evidence, Annotation Disposition, Review Result, or Workspace Identity. It does not merge receipt copies with queue entries or infer that matching ids represent one trustworthy lifecycle. Raw local identifiers remain private and are not silently added to Portable Workflow Bundles.

Only the current queue source yields migration candidates. Each candidate records its own new candidate identity, source digest, legacy id and kind, exact text, optional path, coordinate/excerpt hints, and import provenance. It is not an Annotation Draft, does not belong to a Review, grants no authority, and cannot be submitted. Dismissing or deferring a candidate changes only migration status and never removes its source bytes.

A candidate may become a new Annotation Draft only when:

1. the user selects a Review with a newly captured, verified-current Review Snapshot for the destination Workspace Identity;
2. Reviewing can show an exact target in that Snapshot rather than relying on the old path, line number, or excerpt alone;
3. the user inspects and confirms the exact old/new-side Anchor and the v1 Annotation Intent; and
4. one idempotent Reviewing command creates a fresh v1 draft identity with provenance back to the candidate.

The importer may offer exact-match suggestions but never confirms an Anchor, Re-anchor Mapping, or intent. A missing, ambiguous, stale, unverified, out-of-scope, or changed target leaves the candidate intact.

The first dogfood slice may promote only a legacy `question` after the user confirms Question intent. Legacy `change` and `edit` entries remain visible preserved candidates and do not delay cutover. They are not downgraded to Questions, guessed into Change Requests, or treated as Concrete Replacements: legacy `edit` contains no trustworthy explicit replacement payload. They remain available until the corresponding v1 intent workflow exists and the human deliberately chooses a supported intent and exact Anchor.

### Verification and retirement evidence

Keep immutable sanitized golden bytes for every accepted legacy queue and receipt shape, including the raw-array form, plus malformed JSON, duplicate identities, unknown versions, moved paths, changed-after-discovery files, symlinks, oversized inputs, and internally inconsistent receipts. Tests assert exact byte and digest preservation, unchanged source bytes and metadata, bounded reads, atomic and idempotent import, restart reconstruction, explicit moved-workspace association, no unrelated auto-association, and conservative diagnostics.

Workspace Interface scenarios must prove that receipt import exposes only labelled legacy history; queue import exposes only candidates; conversion requires a verified-current Snapshot and explicit human confirmation; unsupported intents remain candidates; and no forbidden v1 record kind appears. Real-process fault probes cover death before and after the import Durable Commit. Before hard cutover, run a read-only inspection and explicit test import against a disposable byte-for-byte copy of this checkout’s seven-entry version-2 queue, never against the original file.

No product term changed, no new ticket is needed, and no fog changes. Exact install, upgrade, and release command topology remains with [Shape packaging, setup, and release topology](./WF-050-shape-packaging-setup-release.md).
