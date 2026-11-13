---
id: WF-187
title: "Complete Change Set and Review Snapshot evidence"
status: closed
labels:
  - wayfinder:map
parent: WF-051
assignee: juanan
blocked_by: [WF-185]
created: 2026-09-02
---

## Destination

P19 of [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md) is complete. The Workspace Evidence Module resolves every pre-Baseline v1 Change Set endpoint from explicit local intent, captures one complete lossless immutable Review Snapshot without mixed-time evidence, and derives current, stale, or unverified from exact scope-relevant facts. Reviewing can explicitly refresh the unchanged Change Set intent, reusing an exact unchanged Snapshot or atomically adding one successor. Missing or unrenderable content degrades per side; missing structure fails closed; no operation fetches, hydrates, checks out, mutates, or infers remote state.

## Authority

- P19 outcome and learning gate: [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)
- Endpoint, manifest, capture, special-file, and verification rules: [Define the workspace and change-set evidence contract](./WF-023-define-workspace-change-set-evidence.md)
- Review, Change Set, Snapshot, and refresh semantics: [Shape the Reviewing workflow](./WF-006-shape-reviewing-workflow.md)
- Module ownership and seam: [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
- Interface-first fixtures and scale evidence: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)
- Checkout-controlled execution prohibition: [Prevent checkout-controlled Git execution](./WF-096-prevent-checkout-controlled-git-execution.md)
- Canonical terminology: [`CONTEXT.md`](../CONTEXT.md)

## Interface decision

Deepen the existing Workspace Evidence Module behind the unchanged three-method Workspace Interface. Add only closed semantic Change Set inspect/capture/verify requests and Reviewing-owned refresh commands/results. Callers may name explicit endpoint intent and a bounded semantic file scope; they never receive Git argv, pathspec grammar, object readers, filesystem operations, capture staging, repository handles, caches, or State records.

Distinguish fixed local object selection from dynamic local-ref selection in the command vocabulary instead of inferring intent from a revision string. A fixed abbreviation is resolved once and retained as its complete immutable object identity. A dynamic local branch, tag, remote-tracking ref, or explicit HEAD selector remains part of Change Set intent and is re-resolved; movement is scope-relevant even when the resulting tree bytes are equal. Merge-base intent retains the selected ref and exact compared endpoint as well as the resolved merge-base identity. Every Snapshot freezes resolved endpoint and input witnesses.

Keep owner-private Git resolution, index capture, filesystem stabilization, raw-path comparison, Gitlink inspection, pointer recognition, and degradation machinery free to split into internal files as locality requires. They remain one Module implementation with one external seam. Real disposable Git/filesystem fixtures cross Workspace reads and commands; only unusually lossless parsers and deterministic race hooks may be tested at an internal seam.

## Route

1. Extend exact local revision evidence from the existing historical conveniences to explicit commit/tree endpoint pairs and selected-local-ref merge-base intent. Canonicalize fixed objects, retain dynamic selector witnesses, reject ambiguity/missing structure, and verify fixed versus moving inputs without consulting a host service or working bytes.
2. Add one bounded, lossless semantic file scope. Scope membership is derived from exact repository-relative bytes, not display text or Git pathspec heuristics. A rename crossing the scope retains its complete two-sided occurrence; out-of-scope movement cannot stale or destabilize the capture. Explicit ignored-path inclusion remains visibly distinct and bounded.
3. Implement exact commit/tree-to-index, commit/tree-to-effective-working-state, and index-to-working-tree captures. Preserve index staging facts independently from effective working bytes, include only the endpoint's promised untracked set, freeze all endpoint/input witnesses, and revalidate selectors, index, paths, modes, sizes, and digests before publishing.
4. Complete per-side path, mode, type, availability, and source evidence for non-UTF-8 and case-distinct paths, regular files, raw symlink targets, special working entries, sparse-index/skip-worktree absence, binary and unrenderable bytes, and explicit generated classification. Never dereference a symlink or reinterpret intentional sparse absence as deletion.
5. Capture Gitlinks without recursing: preserve before/after Gitlink identities and, only when locally inspectable, the checked-out commit plus dirty and untracked indicators. Missing nested checkout facts affect only a working endpoint that depends on them; no operation initializes, fetches, updates, or opens nested source as parent content.
6. Admit partial repositories through the already hardened Git-inspection context while keeping checkout-controlled executable configuration inert and `GIT_NO_LAZY_FETCH=1`. Distinguish missing enumeration structure from a complete manifest whose content object is unavailable, and prevent one unavailable side from erasing otherwise exact files or bytes.
7. Recognize versioned Git large-file pointer evidence without invoking repository-defined filters. Keep pointer bytes, declared payload identity/size, local payload availability, and captured payload bytes distinct; never fetch or hydrate. Arbitrary content filters remain unsupported and dependent working evidence remains unverified.
8. Add one Reviewing-owned explicit refresh of the Current Review's unchanged Change Set intent. Exact unchanged capture reuses the latest Snapshot and advances no State; changed exact capture atomically writes one successor and bounded lineage with no Anchor movement. Race, replay, restart, failed commit, and unknown outcome cannot create a partial or duplicate successor.
9. Close with a versioned real-Git matrix spanning every endpoint/scope and degradation class, plus a 250,000-tracked-path non-eager discovery fixture. Re-prove full local, Local Runtime transport, compiled risk, package seam, and dogfood behavior without widening product timeouts or performance budgets.

## State and safety invariants

- A Change Set is stable intent: Workspace Identity/canonical checkout, explicit basis, compared state, and optional file scope. A Review Snapshot is one immutable resolution of that intent. Neither is a mutable Diff or inferred current target.
- Preserve all existing format-1 Review/Change Set/Snapshot/index bytes and parse old comparison forms. New optional durable evidence must validate strictly and cannot make an old record mean something new. Authoritative State remains format 2.
- Preserve Workspace and Local Runtime Interface version 1 and the `execute`, `read`, `subscribe` method set. New closed vocabulary remains transport-agnostic and below existing frame/pending bounds.
- Resolution and capture are local and read-only. Never fetch, hydrate, checkout, reset, update the index, apply filters, contact a hosting service, infer a pull-request target, recurse into nested repositories, or use mutable caches/prior observations to fill evidence gaps.
- Continue routing every Git command through the bounded absolute executable and provenance-isolated inspection context. Checkout-controlled command configuration stays rejected or inert before the first repository-aware command; supporting partial/LFS repositories cannot weaken that rule.
- Structure required to enumerate complete membership is all-or-nothing. Once membership and side identity are exact, content availability degrades independently per side. Limits never silently omit a file, invent bytes, or turn unavailable into unchanged/deleted.
- Capture resolves inputs, enumerates the complete in-scope manifest, captures admitted exact bytes, then revalidates every scope-relevant dynamic selector, index fact, path, kind, mode, size, and digest with at most the existing three attempts. A failed successor preserves prior immutable evidence.
- Timestamps are never identity. Display paths, similarity, names, extensions, and text heuristics cannot establish file, generated, Gitlink, LFS, or scope authority. Rename/copy detection stays derived presentation evidence and may degrade without changing side identity.
- Keep the existing 1,000-file / 50-MiB textual floor, bounded manifest/content windows, 30-second Git process deadline, and under-100-ms / 500-ms / two-second user budgets unless a focused child presents contrary measured authority. Add no watcher, prefetch, background scan, broad cache, telemetry, or production test instrumentation.
- Implementation Baseline capture remains P35. Context Source capture/selection remains P20/P21. Complete Annotation authority, Re-anchor Mapping UI, Review Coverage, release assembly, and public coordinates remain downstream.
- Work one focused child at a time; create, link, commit, and push it before implementation. Run Node 26.5.1 / pnpm 11.20.0 and leave the unrelated root package-manager bump unstaged.

## Acceptance

- [x] Every supported pre-Baseline endpoint pair resolves only from explicit local intent: exact commit/tree to exact commit/tree, selected-ref merge base to exact commit, commit/tree to index, commit/tree to effective working state, and index to working tree.
- [x] Fixed and dynamic selectors, unborn limitations, ambiguity, deletion, same-tree ref movement, merge-base movement/unavailability, and unrelated HEAD movement produce the exact current/stale/unverified result without fallback.
- [x] Optional exact scope controls complete manifest membership and revalidation; out-of-scope movement is irrelevant, crossing renames remain complete, tracked ignored files remain included, and explicitly included ignored paths are bounded and disclosed.
- [x] Index, working, and commit/tree sides preserve lossless path bytes, object/content identity, kind, Git mode, size, staging provenance, availability, evidence source, and exact admitted bytes through coherent three-attempt capture.
- [x] Binary/unrenderable content, symlinks, special files, sparse absence, Gitlinks, partial/missing objects, and recognized large-file pointers follow their settled per-side degradation rules without dereference, recursion, filter execution, fetch, hydration, or global omission.
- [x] Explicit refresh reuses exact unchanged evidence and otherwise Durable-Commits one complete successor Snapshot/records/index/result atomically; replay, race, restart, corruption, and pre/post-commit faults preserve lineage and never move old Anchors.
- [x] A versioned matrix covers every endpoint/scope and representative special/missing case. A 250,000-tracked-path fixture proves non-eager content discovery while the 1,000-file / 50-MiB floor and all response/process bounds remain truthful.
- [x] Canonical verification, Local Runtime contracts, all four compiled risk probes, dependency/package seams, dogfood, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with no legacy restoration or package-manager-bump staging.

## Decisions so far

- [Resolve exact local revision Change Sets](./WF-188-resolve-exact-local-revision-change-sets.md) — closed (2026-09-05): explicit fixed commit/tree endpoint pairs and dynamic selected-local-ref/HEAD merge-base evidence with frozen direct/peeled witnesses, one unique merge base, one owner-local currentness verifier delegated to by Reviewing/Projection/Harness Interaction, and byte-compatible format-1 records.
- [Capture index and working-state comparisons](./WF-189-capture-index-working-comparisons.md) — closed (2026-09-05): commit/tree-to-index, commit/tree-to-effective-working-state, and index-to-working-tree captures with index/enumeration fingerprints as endpoint witnesses, independent staging provenance, promised untracked sets only for working endpoints, unmerged stages as per-path unavailable evidence, one shared fact walker across preview/capture/verification, and byte-identical historical paths.
- [Degrade special, sparse, Gitlink, and partial evidence per side](./WF-190-degrade-special-sparse-gitlink-partial-evidence.md) — closed (2026-09-05): per-side degradation for lossless path bytes, symlinks, special entries, sparse/skip-worktree absence, Gitlinks without recursion, partial repositories, and large-file pointers without filters or hydration.
- [Resolve optional exact file scope for Change Set evidence](./WF-191-resolve-optional-exact-file-scope.md) — closed (2026-09-05): one optional bounded, lossless semantic scope over exact repository-relative bytes; out-of-scope movement irrelevant, boundary-crossing renames complete, explicit ignored inclusion bounded and disclosed.
- [Refresh the Current Review's Change Set explicitly](./WF-192-refresh-current-review-change-set-explicitly.md) — closed (2026-09-05): one human-invoked refresh; unchanged reuses the latest Snapshot with no State advance, changed atomically commits one successor with bounded lineage and no Anchor movement.
- [Prove the Change Set matrix at 250,000-path scale](./WF-193-prove-change-set-matrix-250k-scale.md) — closed (2026-09-05): versioned endpoint/scope/degradation matrix plus the 250,000-tracked-path non-eager discovery fixture with every bound truthful and none widened.

## Out of scope

- Implementation Baseline capture or Baseline-to-current comparison (P35).
- General Context Locator expansion, outside-checkout/unsaved Context Sources, or Workflow Context selection (P20/P21).
- Notes, mutation-authorizing Review intents, new Anchor kinds, Re-anchor Mapping, Coverage, or new Harness disclosure (P22 and later).
- Hosting-service/PR integration, network object acquisition, automatic target inference, repository mutation, public package coordinates, installer/setup, or release assembly.
