---
id: WF-193
title: "Prove the Change Set matrix at 250,000-path scale"
status: closed
labels:
  - wayfinder:task
parent: WF-187
assignee: juanan
blocked_by: [WF-192]
created: 2026-09-05
---

## Resolution
Closed (2026-09-05). The versioned Change Set matrix is complete as the union of the closed children's focused scenarios: every endpoint/scope combination from WF-188 through WF-192 is instantiated — fixed commit/tree pairs in all four kind combinations, local-ref and both-dynamic revision pairs, selected-ref merge bases, commit/tree-to-index, commit/tree-to-effective-working-state, and index-to-working-tree, each with and without an optional exact scope (including a scoped dynamic-basis paired variant) — alongside the per-side degradation classes for non-UTF-8/case-distinct paths, symlinks, special entries, sparse absence, Gitlinks, partial/missing objects, large-file pointers, and binary/unrenderable bytes. A new 250,000-tracked-path real-Git fixture proves non-eager content discovery: 249,000 stable paths point at one deliberately missing blob so any eager materialization during enumeration fails closed, the unscoped comparison enumerates only its 1,000-entry diff, the scoped capture derives membership from the full 250,000-entry tree within existing bounds, and the scoped capture admits the exact 1,000-file / 50-MiB textual floor with tiny manifest/preview JSON and exact byte access. The eager-materialization mutation probe (reading every enumerated blob during tree enumeration) was applied, made the scale scenario fail, and was reverted with zero product-source delta.

## Outcome

The pre-Baseline Change Set evidence route closes with a versioned real-Git matrix spanning every endpoint/scope combination and representative degradation class, plus a 250,000-tracked-path fixture proving non-eager content discovery while the 1,000-file / 50-MiB textual floor and every response/process bound stay truthful. No timeout, budget, or limit is widened.

## Interface

No product Interface changes. This child adds only versioned fixture scenarios and, where the existing routes require it, closed diagnostics already specified by WF-187's invariants. The matrix instantiates the closed vocabulary from WF-188 through WF-192 — revision pairs, merge bases, index/working endpoints, degradation classes, optional scope, and refresh — and the scale fixture drives the existing capture/manifest/window routes against a generated 250,000-tracked-path repository, asserting that discovery and manifest enumeration never materialize eager content while a scoped 1,000-file / 50-MiB capture still admits exact bytes.

## Module seam

`WorkspaceEvidence` behavior is fixed by the earlier children; this child changes no owner logic unless a scale or matrix scenario exposes a real defect, in which case the fix is folded into the owning owner and re-proved here. Fixture generation, matrix indexing, and scale instrumentation are test-support only and never enter product source, package exports, or production instrumentation.

## Acceptance

- [x] A versioned matrix covers every endpoint/scope combination from the closed children: all commit/tree pairs, merge bases, commit/tree-to-index, commit/tree-to-effective-working-state, index-to-working-tree, each with fixed and dynamic selectors and, where meaningful, optional scope.
- [x] The matrix covers representative degradation classes per side: non-UTF-8/case-distinct paths, symlinks, special entries, sparse absence, Gitlinks, partial/missing objects, large-file pointers, and binary/unrenderable bytes, each asserting the settled current/stale/unverified and per-side facts.
- [x] A 250,000-tracked-path real-Git fixture proves non-eager content discovery: manifest enumeration completes within the existing manifest bounds, content is captured only for the admitted window, and the 1,000-file / 50-MiB textual floor remains truthful inside it.
- [x] Every response/process bound, the 30-second Git deadline, the three-attempt capture, the two retained ephemeral captures, and the under-100-ms / 500-ms / two-second user budgets stay exactly as specified — no widening anywhere in the route.
- [x] The matrix and fixture pass within the existing serialized canonical lane and focused runs on Node 26.5.1 / pnpm 11.20.0; a focused mutation that materializes eager content during enumeration makes the scale scenario fail and is reverted.
- [x] Canonical verification, Local Runtime contracts, all four compiled risk probes (State, Local Runtime, Pi, dogfood), dependency/package seams, and `git diff --check` pass with no legacy restoration, no production instrumentation, and the package-manager bump unstaged.

## Constraints

- Use only disposable generated Git repositories and sanitized objects; never inspect real user repositories, `.neoflow` state, Configuration, or receipts. Fixture roots must be created, used, and removed within the established disposable-test-root rules (`PNPM_CONFIG_PM_ON_FAIL=ignore`).
- No product Interface, State format, record format, limit, deadline, or budget changes. Any defect surfaced by the matrix is fixed in the owning owner and re-proved, never patched in fixture code.
- Scale fixtures must be deterministic, bounded in their own runtime, and safe to run on the serialized lane. No network, no parallel-lane dependence, no flaky timing assertions.
- Keep the unrelated root package-manager bump unstaged through every commit.

## Authority

- [Complete Change Set and Review Snapshot evidence](./WF-187-complete-change-set-review-snapshot-evidence.md)
- [Refresh the Current Review's Change Set explicitly](./WF-192-refresh-current-review-change-set-explicitly.md)
- [Resolve optional exact file scope for Change Set evidence](./WF-191-resolve-optional-exact-file-scope.md)
- [Degrade special, sparse, Gitlink, and partial evidence per side](./WF-190-degrade-special-sparse-gitlink-partial-evidence.md)
- [Capture index and working-state comparisons](./WF-189-capture-index-working-comparisons.md)
- [Resolve exact local revision Change Sets](./WF-188-resolve-exact-local-revision-change-sets.md)
- [Define the workspace and change-set evidence contract](./WF-023-define-workspace-change-set-evidence.md)
- [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)
