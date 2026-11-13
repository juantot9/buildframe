---
id: WF-199
title: "Implement context source discovery and exact capture"
status: closed
labels:
  - wayfinder:map
parent: WF-051
assignee: juanan
blocked_by: []
created: 2026-09-07
---

## Destination

P20 of [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md) is complete. The Workspace Evidence Module resolves Context Source Eligibility from explicit selection intent, expands bounded Context Locators into complete progressive membership, captures immutable exact bytes for whole sources and bounded ranges, normalizes overlap without erasing provenance, enforces named and versioned limits, and derives explicit current, changed, missing, unavailable, and over-limit facts through coherent bounded revalidation. Tracked, untracked, ignored, outside-checkout, unsaved, generated, binary, symlink, Gitlink, sparse, missing, oversized, and unrenderable sources follow their settled eligibility and degradation rules. No operation dereferences a symlink, enters a nested repository, fetches, hydrates, mutates the checkout, or lets incomplete membership look complete.

## Authority

- P20 outcome and learning gate: [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)
- Curation, eligibility, capture, overlap, refresh, and disclosure rules: [Define workflow context curation and capture](./WF-024-define-workflow-context-curation.md)
- Endpoint, manifest, special-file, limits, and verification rules: [Define the workspace and change-set evidence contract](./WF-023-define-workspace-change-set-evidence.md)
- Module ownership and seam: [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
- Interface-first fixtures and scale evidence: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)
- Checkout-controlled execution prohibition: [Prevent checkout-controlled Git execution](./WF-096-prevent-checkout-controlled-git-execution.md)
- Canonical terminology: [`CONTEXT.md`](../CONTEXT.md)

## Interface decision

Deepen the existing Workspace Evidence Module behind the unchanged three-method Workspace Interface. Add only closed semantic context-source inspect, capture, and verify requests plus their closed result views; callers name explicit selection intent (exact source, bounded directory, outside-checkout source, bounded ignored path, bounded range) and never receive Git argv, pathspec grammar, filesystem operations, ignore-rule engines, enumeration staging, or State records. The Workspace Evidence view-request and view unions extend with the context family; Workspace Commands gain nothing in P20 because selection curation belongs to Planning and Reviewing (P21), which will issue these requests through their own commands.

A Context Locator is live curation intent, never captured content: every inspect result names the selection intent, the complete candidate manifest, and per-candidate facts; every capture result freezes one immutable self-contained occurrence identified by exact source identity and scope. Eligibility facts (tracked, non-ignored untracked, ignored-by-default, explicitly included ignored, outside-checkout sensitive) are evidence, not heuristics: ignore membership comes from the bounded local Git inspection context, never from path pattern guessing in product code. Generated and binary classification come only from explicit repository evidence or caller-declared user classification. Unsaved editor content stays outside P20's filesystem evidence family; its immutable-contribution mechanics arrive with P21 curation.

Keep owner-private directory traversal, ignore evaluation, raw-path handling, stabilization, and degradation machinery free to split into internal files as locality requires. They remain one Module implementation with one external seam. Real disposable Git/filesystem fixtures cross Workspace reads; deterministic race hooks may be tested at an internal seam.

## Route

1. Resolve Context Source Eligibility and expand bounded Context Locators into complete manifests: in-checkout files, bounded directories, explicit outside-checkout sources, and bounded ignored paths. Directory membership includes tracked files plus non-ignored untracked files; tracked files stay eligible when an ignore rule matches; ignored untracked content is excluded by default and included only through one bounded explicit selection marked sensitive. Expansion never dereferences symlinks, escapes the checkout through one, enters submodules or nested repositories, or broadens past its selected root. Progressive presentation may defer content reads but never presents a truncated expansion as complete, and discovery stays non-eager at scale.
2. Capture immutable exact context bytes for whole-source and bounded-range scopes. Every capture is one self-contained occurrence with exact lossless bytes and identity. Binary content is never lossy-decoded; oversized, unrenderable, unavailable, symlink-target, Gitlink, sparse-absent, and missing sources degrade per item with exact named reasons while the manifest stays complete. Capture limits are named, measured, and versioned rather than hidden heuristics, and limits never silently omit an item.
3. Normalize overlap without erasing provenance: one exact source occurrence selected through several origins is carried once with every inclusion origin retained; overlapping ranges collapse to their exact union; whole-file inclusion subsumes its ranges for payload bytes; content equality alone never merges distinct paths, source versions, sides, or saved-versus-unsaved evidence; source-group order and lossless path order stay stable.
4. Make capture and revalidation coherent: resolve the selection, record the manifest and admitted bytes, then revalidate every included identity, membership fact, range, mode, size, and digest with the settled bounded retry before publishing. Derive exactly one of current, changed, missing, unavailable, and over-limit per item; a changed source proposes a successor capture without rewriting any prior capture; continuing movement publishes no mixed-time result.
5. Close with a versioned real-filesystem/Git matrix spanning every eligibility and degradation class plus a scale fixture proving progressive complete membership and truthful named limits at depth. Re-prove full local, Local Runtime transport, compiled risk, package seam, and dogfood behavior without widening product timeouts or performance budgets.

## State and safety invariants

- A Context Locator and a captured context occurrence are different things. A mutable locator denotes inclusion intent; a capture is immutable content. No refresh ever rewrites a capture, and no locator resolves into captured bytes implicitly.
- Complete membership is all-or-nothing evidence: when expansion cannot establish completeness (permission, instability, unreadable directory), the result says so and blocks downstream commitment; unknown scope can never become an acknowledged omission.
- Eligibility is evidence: ignore membership from bounded local Git inspection, tracked/untracked/index facts from the existing endpoint discipline, and outside-checkout or ignored inclusions only from explicit caller intent marked sensitive. Detection of generated or sensitive content is advisory; absence of a marker never claims safety.
- Lossless everything: Git path bytes and case distinctions survive; binary bytes are never decoded; timestamps and filesystem observation alone never establish equality; identity comes from exact object/content witnesses.
- Read-only, bounded, no-fetch/no-filter/no-recursion. Git commands stay inside the bounded absolute-executable, provenance-isolated inspection context with `GIT_NO_LAZY_FETCH=1`; filesystem reads use bounded traversal with explicit depth and entry limits.
- Preserve State format 2, Workspace and Local Runtime Interface version 1, and the `execute`/`read`/`subscribe` method set. New optional durable fields validate strictly and cannot make old bytes mean something new.
- Keep the existing budgets, deadlines, and non-eager discovery discipline. A context capture adds no watcher, prefetch, background scan, broad cache, or production test instrumentation. Timestamps never establish equality.
- Work one focused child at a time; create, link, commit, and push it before implementation. Run Node 26.5.1 / pnpm 11.20.0 and leave the unrelated root package-manager bump unstaged.

## Acceptance

- [x] Explicit file, bounded directory, outside-checkout, and bounded ignored selections produce complete per-candidate manifests with kind, lossless path, identity, mode, size, availability, provenance, inclusion origin, and sensitivity facts, without symlink escape, nested-repository entry, or checkout escape.
- [x] Whole-source and bounded-range captures are immutable, self-contained, and byte-exact; binary/oversized/unrenderable/unavailable sources degrade per item with exact reasons; named versioned limits never silently omit an item.
- [x] Overlap normalizes to one occurrence with all origins, exact range unions, and subsumed whole-file ranges, without content-equality deduplication across distinct identities.
- [x] Coherent capture plus bounded revalidation derives exact current/changed/missing/unavailable/over-limit facts, proposes successors without rewriting captures, and never publishes a mixed-time result.
- [x] A versioned matrix and scale fixture prove progressive complete membership and truthful limits across every eligibility and degradation class.
- [x] Canonical verification, the four compiled risk probes, dependency/package seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with the unrelated root package-manager bump unstaged.

## Decisions so far

- Mapping pass landed (2026-09-07): the five focused children below slice P20; Planning/Reviewing selection curation, disclosure, and consumption of these requests stay P21 and out of scope here.
- [Resolve context source eligibility and expand bounded Context Locators](./WF-200-resolve-context-source-eligibility-and-locator-expansion.md) — closed (2026-09-07): the closed `workspace.context.manifest` inspect family with complete per-candidate membership, evidence-based eligibility, and exact incompleteness.
- [Capture immutable exact context source bytes](./WF-201-capture-immutable-exact-context-source-bytes.md) — closed (2026-09-07): `workspace.context.capture`/`content` with immutable `cctx_` captures, per-item and aggregate limits, and bounded coherent retry.
- [Normalize context overlap without erasing provenance](./WF-202-normalize-context-overlap-without-erasing-provenance.md) — closed (2026-09-07): union-aware capture admission, segment-addressed windows, and the `workspace.context.resolution` normalization view with caller-ordered groups.
- [Revalidate context selections coherently](./WF-203-revalidate-context-selections-coherently.md) — closed (2026-09-07): `workspace.context.verify` with exact per-item currency, bounded stability retry, and fail-closed unknown scope.
- [Prove the context source matrix and scale limits](./WF-204-prove-context-source-matrix-and-scale-limits.md) — closed (2026-09-07): the versioned matrix, depth/breadth scale fixture, and the named `maxContextCandidates` limit.

## Out of scope

- Workflow Context Selection state, include/exclude precedence, refresh proposals, disclosure preview/delta, Context Budget Evidence, Handoff routes, and acknowledgment (P21).
- Editor Context Contributions and unsaved-buffer sources (P21 mechanics; P20 keeps unsaved content outside its filesystem evidence family).
- Implementation Baseline capture (P35); Annotation authority, Re-anchor Mapping, Coverage, and release assembly (P22 and later); hosting-service/PR integration (none in v1).
