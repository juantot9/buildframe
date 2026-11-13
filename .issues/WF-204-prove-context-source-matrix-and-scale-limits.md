---
id: WF-204
title: "Prove the context source matrix and scale limits"
status: closed
labels:
  - wayfinder:task
parent: WF-199
assignee: juanan
blocked_by: [WF-203]
created: 2026-09-07
---

## Outcome

A versioned real-filesystem/Git matrix and a scale fixture prove every P20 evidence rule: complete progressive directory membership, lossless identities and bytes, stable include origins, exact range unions, no symlink or nested-repository escape, coherent bounded retry, per-item degradation, and explicit current, changed, missing, unavailable, and over-limit facts across tracked, untracked, ignored, outside-checkout, generated, binary, symlink, Gitlink, sparse, missing, oversized, and unrenderable sources. Named limits stay truthful and product budgets stay unwidened.

## Pre-implementation resolution (2026-09-07)

- **Named, versioned limits.** The context expansion bound becomes a named field of the existing `WorkspaceEvidenceLimits` record — `maxContextCandidates: 250_000` — validated by the same strict checked-limits gate and echoed in every context view, replacing the hidden module constant. Limits stay in-memory evidence (no durable codec change); nothing else in the record moves.
- **Versioned matrix.** One scenario walks the full eligibility/degradation matrix through the Workspace Interface with real disposable Git/filesystem fixtures: tracked, tracked-ignored, untracked, ignored-by-default, explicit ignored, outside-checkout (file, directory, and refusing a symlink root), raw and escaping symlinks, nested repositories, Gitlinks, special entries, skip-worktree absence, unmerged stages, missing working files, binary bytes, case-distinct index paths (one side materializable on a case-insensitive host, the other carried losslessly from the index), and non-UTF-8 raw path bytes carried from the index without host materialization. Every row asserts the exact closed facts, reasons, provenance, origins, and ordering — never string snapshots — and a mutation that would let incomplete membership look complete (an unreadable directory during re-inspection) trips the `incomplete`/`traversal-failed` result.
- **Depth and breadth scale.** A second scenario builds a deep chain (hundreds of nested directories, a file at every level) plus a multi-thousand-file directory, then proves complete progressive membership through exact byte-ordered windows, unchanged re-inspection, and per-item capture over the same tree without eager materialization of content at manifest time (metadata-only enumeration). Named limits stay truthful: an owner-local evidence instance with a small `maxContextCandidates` proves the exact `incomplete`/`candidate-limit` result without weakening any product default.

## Interface

No new Workspace Interface vocabulary beyond what the first four children landed; this child adds versioned fixtures, scenario coverage, and scale evidence only. If the matrix exposes a defect, the fix folds into the owning child's owner and re-proves there.

## Module seam

Presentation stays out of scope; fixtures live beside the existing Workspace Evidence scenario suites and follow the disposable real-Git/real-filesystem fixture discipline.

## Acceptance

- [x] The versioned matrix covers every eligibility and degradation class with real Git/filesystem fixtures, including lossless raw-path and case-distinct handling.
- [x] A scale fixture proves progressive complete membership and truthful named limits at depth without eager content materialization, and every product bound stays unwidened.
- [x] Every matrix row asserts the exact closed result (facts, reasons, provenance, ordering) rather than string snapshots, and mutations that would let incomplete membership look complete trip a scenario before reversion.
- [x] Canonical verification, the four compiled risk probes, dependency/package seams, dogfood, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with the unrelated root package-manager bump unstaged.

## Constraints

- Disposable generated fixtures only; never inspect real user repositories or `.neoflow` state.
- No new dependency class; fixture tooling stays inside the existing test surface.

## Implementation (2026-09-07)

The context expansion bound became the named, versioned `maxContextCandidates: 250_000` field of `WorkspaceEvidenceLimits`, validated by the strict checked-limits gate and echoed in every context view; the hidden module constant is gone and the bound is owner-local overridable for proof without weakening any product default. The matrix and scale scenarios live in `packages/workspace/test/scenarios/workspaceContextEvidence.test.ts`.

The matrix proves with real disposable Git/filesystem fixtures: case-distinct index paths staying distinct and lossless on a case-insensitive host; non-UTF-8 raw path bytes carried from the index without host materialization (`working-missing`); tracked-ignored eligibility; default ignored exclusion; binary bytes; nested repositories without recursion; raw and escaping symlinks without dereference or checkout escape; outside-checkout selections through a symlink root staying unfollowed and sensitive; and re-inspection with an unreadable subtree publishing exact `incomplete`/`traversal-failed` with enumerated candidates retained for diagnosis. The scale scenario builds a 40-level-deep chain plus a 1,500-file directory and proves complete progressive membership (1,541 candidates), exact byte-ordered windowed access, whole-capture, normalized resolution, and settled all-current verification without eager content materialization, plus the exact `incomplete`/`candidate-limit` result under a small owner-local limit.

One verification-lane flake (`ERR_IPC_CHANNEL_CLOSED` at lane exit) was rerun per the standing discipline; the canonical lane passed twice afterward with no pool changes. Canonical `v1:verify` passed (35 files / 301 tests), all four compiled risk probes passed, and `git diff --check` is clean with the unrelated root `packageManager` bump unstaged.
