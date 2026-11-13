---
id: WF-226
title: "Own review message records and the change-driven tree"
status: closed
labels:
  - wayfinder:task
parent: WF-216
assignee: juanan
blocked_by: [WF-225]
created: 2026-09-08
---

## Outcome

Reviewing records **one message type**: a discussion message whose content is the user's text plus a `file:line` location, attached to one review basis. There are no UI-level Question/change-request kinds; the words and the Harness's later action carry the intent. Review bases form a **change-driven tree**: a node is created only when a confirmed change event completes (e.g., the Harness finishes a requested change, observed through the existing reviewed correlation and complete-Response capture) or the user explicitly takes a fork/snapshot point. Typing, saving, and ordinary file churn never fork a node, and consecutive messages without a change share the same basis. Messages asked at the current working diff attach to the live basis and accept visible drift; messages asked at a saved point are anchored to that saved origin and are viewed there, never silently re-anchored. Unchanged files and clean checkouts are reviewable: `packages/workspace/src/reviewing.ts`'s `no-current-changes` rejection is deliberately extended rather than worked around.

## Interface

Extend the closed Reviewing command/projection vocabulary behind the unchanged Workspace Interface: commands to compose and commit one message at a location, to read the ordered message list per basis, to enumerate the basis tree (with provenance distinguishing Git commits, saved Review points, and change-event nodes), and to open a message's origin basis. Message origins that are not the live working diff reuse or mirror the existing exact snapshot mechanism (WF-219) rather than inventing a parallel capture format. Each message keeps its exact outgoing text, location, origin-basis identity, and its captured Response when one settles; later file changes alter nothing about the record. This child owns records and semantics only; the view and the outgoing-message encoding are WF-227 and WF-228.

## Module seam

Reviewing owns messages, bases, and the tree. Workspace Evidence remains the sole owner of live repository facts, diff computation inputs, and source revalidation. Harness Interaction owns everything after commitment. No generic "conversation" engine, no cross-workflow message bus, and no Adapter-visible message internals.

## Acceptance

- [x] One message type commits atomically with its location and origin basis; no UI or record vocabulary splits questions from change requests.
- [x] Basis sharing: consecutive messages without an intervening confirmed change event or explicit fork attach to the same basis; a completed change event or explicit fork creates exactly one successor node.
- [x] Messages at the live current diff accept drift without re-anchoring; messages at a saved origin open onto that origin's exact saved source.
- [x] Unchanged files and clean checkouts accept messages; the former `no-current-changes` block is replaced by a deliberate contract extension with tests for the clean case.
- [x] Git commits, saved Review points, and change-event nodes remain distinguishable in the tree with truthful provenance; chronology never proves Harness authorship.
- [x] Restart, Current/Previous Review transitions, and format-version parsing preserve historical records; no migration claims captured material that never existed.
- [x] Focused Workspace suites, canonical verification, dependency/package seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with unrelated work unstaged.

## Constraints

- Records and semantics only; no view work, no outgoing-message encoding, no tree-leaf application (WF-229 stays parked).
- No automatic snapshot per message; the live basis is not copied. Capture points are change events and explicit user forks.
- Preserve WF-217–220 landed behavior where it fits; do not weaken current-target validation to fake historical anchoring.
- Settle and commit this child's own pre-implementation Resolution before code.

## Resolution (settled 2026-09-08)

### Records

- **`ReviewMessage`** (new identity brand; no migration of historical Question records): one review identity, one origin-basis identity, `file`, one-based `line`, exact user text, and — filled at commitment — the exact outgoing-material identity WF-228 commits (bytes/digest reference, never a copy). One type; no intent field. The settled Response attaches by reference when one completes.
- **`ReviewBasis`** (new identity brand): `kind: 'live' | 'git-commit' | 'saved-review-point' | 'change-event'`, parent link, and provenance naming its source (commit identity, Review Snapshot identity, or change-event evidence). The live basis is a singleton per Review and is never copied; every non-live basis references exact saved source through the existing snapshot mechanics (WF-219) — change-event nodes capture their observed state with that same machinery, not a new format.
- **Tree**: bases link by parent; one tree per Review; Previous Reviews keep their own trees. The picker enumerates the live basis, observed Git commits (read-only, discovered from Git — they never fork anything), saved points, and change-event nodes.
- Historical Reviews' existing Question/Response/Batch records remain readable as-is; only new messages use the new records.

### Commands and projections (closed, behind the unchanged three-method Workspace Interface)

- `CommitMessage` — atomic: message record + outgoing material (WF-228) + destination Handoff + receipt + Invocation, before dispatch.
- `ListMessages` (per basis or across the review), `ListBases` (the tree with provenance), `OpenMessageOrigin` (basis + its exact source projection).
- `RecordChangeObservation` (internal, from the existing reviewed correlation and complete-Response capture) and an explicit user fork/snapshot command that promotes a confirmed change into one new basis node.
- Review start extension: clean checkouts and unchanged-file reviews are valid; the `no-current-changes` rejection becomes a deliberate "live basis with an empty diff" state, still fully navigable and questionable.

### Invariants

- Forks happen only for confirmed change events or explicit user forks; typing, saving, and observed churn never fork.
- Messages never re-anchor; drift on the live basis is visible, and saved origins are immutable.
- The live basis is never copied per message; non-live bases exist only where saved source already exists or a change event captured it.
- Chronology and response capture never claim Harness authorship; records say "changes observed after this Response", not "changes the Harness made".

### Open point 1 — how a change event becomes a basis — settled (2026-09-08)

The user asked what would be wrong with keeping their changes and the Harness's on the same side. Answer: nothing — a node never claims authorship, it just records observed state. Settled semantics:

- **Automatic fork with mixed changes.** When a captured Response completes and the next observation sees changed files, Neoflow forks one node at that observation and captures the observed state, whoever made the edits. The node records "changes observed after this Response", never "changes the Harness made".
- **No mid-keystroke forks.** Forks happen only at that post-Response observation; typing and saving alone never fork. A manual fork/snapshot command remains for points the user wants elsewhere.
- This removes the earlier propose-and-confirm ceremony. It also means automatic fork points do capture state (via the existing snapshot machinery); that is accepted as the price of navigable change history, bounded by the trigger (post-Response observed changes and explicit forks only).

### Open point 2 — Git commits in the picker — settled (2026-09-08)

Confirmed as recommended: commits appear automatically in the picker as read-only bases; opening one that was never snapshotted captures it on first view; commits never fork anything.

## Resolution status

**Settled and user-confirmed (2026-09-08).** Both open points are resolved above; the records, commands, and invariants sections are the committed pre-implementation basis for implementation. Remaining detail (exact field shapes, encoding, storage) follows in the implementation pass under this Resolution.

### Progress

- **Slice 1 landed (2026-09-08, commit `41a9f2e`):** empty-diff reviews are valid. The `no-current-changes` and `no-comparison-changes` rejections were removed from the start/continue and change-set-refresh paths; clean checkouts and identical-revision comparisons start ordinary retained reviews, and a scoped comparison refresh whose basis catches up commits an empty successor. New tests cover the clean-checkout start (with deterministic replay), the empty comparison start, the refresh-to-empty successor, and the app surface on a clean checkout (review starts and survives restart). Full workspace + app suites pass (30 files, 288 tests).
- **Slice 2 landed (2026-09-08, commit `005d56e`):** each Review owns one durable live basis and a bounded parent-linked tree. Git commits are discovered without State writes and captured only on explicit first-open; explicit saved points use exact Review Snapshot machinery. Ordinary Snapshot refreshes and repository churn never create tree nodes.
- **Slice 3 landed (2026-09-08, commit `067b059`):** strict one-type Review Message, Response, history, origin, body, and basis projections landed with legacy absence preserved. Explicit and post-Response change observations create truthful `change-event` nodes labelled “changes observed after this Response,” never Harness authorship claims.
- **Slice 4 landed (2026-09-08, commit `6ee7862`):** `review.message.commit` now atomically retains the Message, one-message Review Batch, exact outgoing-material bytes/digest, Handoff, receipt, capability snapshot, Invocation, and both indexes before dispatch. Harness completion retains the complete correlated Response and performs the bounded post-Response observation. Live target revalidation blocks changed selected files but tolerates unrelated churn; saved origins quote immutable bytes with safe fences. The Pi Adapter sends committed material without enrichment, and the local Adapter transport carries the new directive.
- **Verification (2026-09-08):** all four package TypeScript configurations plus `tsconfig.v1-tests.json` pass; dependency firewall, full-format check (120 files), direct builds, and build smoke pass; focused suites pass (60 tests before the final contract refinements), and the complete Vitest suite passes (39 files, 337 tests). `oxlint` reports no errors (pre-existing warning set only), and `git diff --check` passes with unrelated work left unstaged.
