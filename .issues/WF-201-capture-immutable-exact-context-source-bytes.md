---
id: WF-201
title: "Capture immutable exact context source bytes"
status: closed
labels:
  - wayfinder:task
parent: WF-199
assignee: juanan
blocked_by: [WF-200]
created: 2026-09-07
---

## Pre-implementation resolution (2026-09-07)

- **Two closed requests.** `workspace.context.capture` (read) normalizes the same closed selection union plus an optional per-selection byte-range `scope: { kind: 'bytes', offset, length }` (absent means whole source), expands the complete candidate manifest with the WF-200 engine, and admits exact bytes per candidate. `workspace.context.content` (read) serves bounded byte windows from one retained capture by `captureIdentity` plus the candidate's exact path (or absolute host path), `offset`, and `length`. Both stay below existing frame/response bounds; window reads honor `maxContentWindowBytes`.
- **Per-item results and limits.** Each item records origin, exact path, eligibility, source kind, sensitivity, classification, the tracked source identity when present, and `status: 'captured' | 'unavailable' | 'over-limit'`. Captured items carry `byteLength` and the SHA-256 of the exact captured bytes. Unavailable items carry the settled absence reasons verbatim (missing, skip-worktree, unmerged, Gitlink, nested repository, special entry, unreadable). A single item beyond `maxCapturedFileBytes` is `over-limit` with its exact size; once the aggregate exceeds `maxCapturedContentBytes`, later items are `over-limit` with the aggregate reason. The manifest stays complete in every case; limits never silently omit an item, and binary bytes are never decoded.
- **Immutable retention, not yet durable.** P20 captures are owner-retained immutable evidence under the same bounded-retention discipline as current-changes evidence: one capture identity per attempt, never rewritten, superseded only by a new identity. Durable freezing into Planning/Reviewing snapshots (restart-proof lineage) is P21/P22's snapshot commitment, not evidence retention; the WF-201 acceptance line about restart preservation therefore applies to identity immutability within retention, and the durable record commit lands with curation.
- **Coherent capture with bounded retry.** One attempt enumerates membership, admits bytes, then re-derives the manifest facts and compares per-path size, identity, and absence facts; any relevant movement retries within the existing `maxCaptureAttempts`, and continued instability returns an explicit `unavailable` capture-level reason without publishing mixed-time bytes. A deterministic `afterContextContent` internal seam (owner-local tests only) drives the retry path.

## Outcome

Workspace Evidence captures immutable, self-contained, byte-exact context occurrences for whole sources and bounded ranges. Every capture freezes one occurrence identified by exact source identity and scope; binary content is never lossy-decoded; oversized, unrenderable, unavailable, symlink-target, Gitlink, sparse-absent, and missing sources degrade per item with exact named reasons while the manifest stays complete. Capture limits are named, measured, and versioned rather than hidden heuristics, and limits never silently omit an item.

## Interface

Extend the closed Workspace Evidence family with context capture requests over the already-normalized selections from [Resolve context source eligibility and expand bounded Context Locators](./WF-200-resolve-context-source-eligibility-and-locator-expansion.md):

```text
context-source-capture
  selections: closed list as above
  scopes: whole-source or exact bounded byte/range scope per selection
```

Each capture result freezes one immutable occurrence: exact lossless bytes, source identity witness, selected scope, mode/kind, size, provenance, and capture status. Per-item degradation names the exact reason (binary without semantic decoding, oversized beyond the named limit, unrenderable, unavailable, sparse absence, missing, Gitlink without recursion, raw symlink target). Captures are durable records under the existing State format 2 discipline; new optional fields validate strictly and old bytes keep their meaning. No capture request ever rewrites or supersedes an earlier capture; a successor is a new immutable record.

## Module seam

`WorkspaceEvidence` owns bounded read staging, byte admission, per-item degradation, and durable capture persistence, private behind the existing seam. Callers receive closed capture results, never file handles, staging buffers, or State records.

## Acceptance

- [x] Whole-source and bounded-range captures are byte-exact and self-contained, preserve lossless path bytes and case distinctions, and never decode binary content.
- [x] Symlink captures store raw link-target bytes without dereference; Gitlink selections record Gitlink evidence without recursion; sparse-absent, missing, and unavailable sources degrade per item with exact reasons and a complete manifest.
- [x] Oversized and unrenderable content remains navigable in the manifest with exact captured-byte status and an exact named reason; per-item and aggregate limits are named, measured, versioned, and never silently omit an item.
- [x] A re-capture of changed content creates a new immutable record; no refresh rewrites any prior capture; restart, replay, and failed commits preserve lineage.
- [x] Local Runtime version 1 transports the capture shape under existing frame bounds; focused Workspace/Runtime suites, canonical verification, the four compiled risk probes, dependency/package seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with the unrelated root package-manager bump unstaged.

## Constraints

- Read local evidence only; bounded reads with explicit limits; never fetch, hydrate, checkout, execute filters, or mutate the checkout.
- Keep the existing budgets and deadlines; one capture performs no Git, filesystem, or network access beyond its own bounded reads.

## Implementation (2026-09-07)

Landed beside the manifest engine in `packages/workspace/src/contextEvidence.ts`: `workspace.context.capture` reuses `resolveContextCandidates` for complete membership, admits exact bytes per candidate (whole source or half-open byte ranges; raw symlink targets without dereference; binary bytes never decoded), tracks per-item and aggregate capture limits (`file-limit`/`aggregate-limit` with exact sizes), fingerprints every candidate's settled facts before and after content admission, and retries relevant movement within `maxCaptureAttempts` before failing closed with `unavailable` plus its exact reason. Owner retention keeps at most the settled two captures per evidence instance; re-capture always mints a new `cctx_` identity and never rewrites retained bytes. `workspace.context.content` serves bounded windows from one retained capture through the unchanged Workspace Interface.

Scenario coverage in `packages/workspace/test/scenarios/workspaceContextEvidence.test.ts`: byte-exact captures with SHA-256 digests across text, non-UTF-8 binary, and raw symlink targets; tracked source-identity witnesses; Gitlink/skip-worktree/special per-item degradation; range-scope slices; content windows with `capture-not-retained` and `candidate-not-captured` degradation; per-item and aggregate over-limit with small owner-local limits; identity immutability under bounded retention; and deterministic bounded retry (settled movement captured, continuing movement fails closed). Canonical `v1:verify` passed (35 files / 295 tests), all four compiled risk probes passed, and `git diff --check` is clean with the unrelated root `packageManager` bump unstaged.
