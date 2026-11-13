---
id: WF-191
title: "Resolve optional exact file scope for Change Set evidence"
status: closed
labels:
  - wayfinder:task
parent: WF-187
assignee: juanan
blocked_by: [WF-190]
created: 2026-09-05
---

## Resolution
Closed (2026-09-05). One optional closed `exact-paths` scope now attaches to every Change Set selection form: entries are canonical Base64 repository-relative bytes with explicit `ordinary` / `include-ignored` inclusion, validated against duplicate, case-colliding, NUL-embedded, escaping, per-scope byte-total, and entry-count limits before any Git inspection. Scoped captures enumerate full membership once at the raised 250,000-path bound, project an exact scope fingerprint onto revision/empty-tree endpoints, and record `scopeMembership` provenance per manifest occurrence, including split `explicit-ignored` membership for boundary-crossing renames into ignored bytes. Dynamic refs, index, and working witnesses are compared only through scope-relevant projection identities, so unrelated ref, index, or byte movement leaves a scoped capture current while in-scope movement produces stale, and selected mutation retries while out-of-scope mutation does not. Format-1 records without scope keep parsing byte-for-byte, and Reviewing binds the normalized scope through preview, start, restart, and replay unchanged.

## Outcome

Callers may attach one optional bounded, lossless semantic file scope to any Change Set intent. Scope membership is derived from exact repository-relative bytes, complete manifest membership follows the scope, and revalidation considers only scope-relevant facts: out-of-scope movement cannot stale or destabilize a capture, a rename crossing the scope retains its complete two-sided occurrence, and explicitly included ignored paths remain bounded and visibly distinct.

## Interface

Extend every Change Set selection form with one optional closed scope value: a bounded set of exact repository-relative path bytes (directories and files), each entry validated against the repository's real membership encoding, with explicit inclusion of tracked-ignored paths as a distinct, bounded, disclosed selection. Scope names repository-relative bytes only — no Git pathspec grammar, glob semantics, negation, anchor magic, display text, or case folding. Malformed, duplicate, over-limit, case-colliding, and out-of-repository entries are closed diagnostics; nothing silently narrows or reorders a scope.

Captured evidence records the normalized scope with the comparison so intent and membership stay bound: the in-scope complete manifest, per-file two-sided occurrences, ignored-path inclusion provenance, and the exact scope-relevant witness set used for revalidation. A rename whose old side is out of scope and new side in scope (or across the boundary) yields the complete two-sided occurrence with the out-of-scope side's exact bytes, never a one-sided addition or deletion. Scope-relevant revalidation freezes selector, index, and working witnesses for in-scope facts only; out-of-scope selector or byte movement is irrelevant by declaration. Existing scopeless comparisons keep their exact bytes, semantics, and currentness; the scope field is optional in format-1 and old records keep parsing.

No new Workspace method is added. The existing capture, preview, and start routes accept the optional scope; Reviewing binds the previewed scope exactly as it binds endpoint and resolution identities.

## Module seam

`WorkspaceEvidence` owns scope normalization, membership derivation from exact tracked/index/working membership, rename-completeness composition, and scope-relevant revalidation behind the bounded inspection context. Membership and rename machinery may split into internal files but stays one implementation with one external seam. The owner-local comparison verifier interprets scope-relevant witnesses so Reviewing, Projection, and Harness Interaction keep delegating; no caller re-derives membership or relevance.

## Acceptance

- [x] One optional scope attaches to every endpoint/scope combination from WF-188 and WF-189; membership is complete for the scope and derived only from exact repository-relative bytes, with no pathspec heuristic, glob, display-text, or case-folding authority.
- [x] Out-of-scope file, index, and working movement never stales or destabilizes a scoped capture; in-scope movement produces the exact current/stale/unverified result through the one owner-local verifier.
- [x] A rename crossing the scope boundary retains its complete two-sided occurrence with exact per-side bytes; neither side is dropped, and out-of-scope sides keep their exact bytes without becoming membership.
- [x] Tracked ignored paths are included only by explicit, bounded, disclosed selection and remain visibly distinct from ordinary membership; untracked-ignored entries outside explicit inclusion stay excluded.
- [x] Malformed, duplicate, over-limit, case-colliding, and out-of-repository scope entries, plus scope combined with unborn/unavailable endpoints, return closed diagnostics with no silent narrowing.
- [x] Scopeless comparisons, the historical four selection forms, and existing currentness behavior are byte-for-byte unchanged; the scope field is optional in format-1 and old records keep parsing. State format 2 and Interface version 1 are unchanged.
- [x] `review.comparison.start` atomically retains scoped comparisons with the normalized scope, resolved endpoints, witnesses, and complete Snapshot records; restart and replay preserve the first exact facts, and preview/start races reject with `comparison-changed` instead of moving scope or endpoints.
- [x] A focused mutation that derives membership through pathspec semantics, or that lets out-of-scope movement stale a scoped capture, makes the relevant focused scenarios fail. Canonical verification, Local Runtime contracts, all four compiled risk probes, dependency/package seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with the package-manager bump unstaged.

## Constraints

- Read local evidence only through the bounded, provenance-isolated Git inspection context. Never fetch, checkout, stage, mutate the index or worktree, run a filter, or contact a host service.
- Scope is stable declared intent: it never widens itself, follows renames implicitly, or absorbs movement outside its bytes. Rename completeness is captured evidence, not a mutable scope.
- Ignored-path inclusion is explicit, bounded, and disclosed; it never silently expands membership or exceeds the existing limits.
- Keep manifest/content limits, the 1,000-file / 50-MiB textual floor, three attempts, two retained ephemeral captures, the 30-second Git deadline, budgets, and the FIFO. Add no refresh command, watcher, cache, or telemetry.
- Use only disposable real Git repositories and sanitized generated objects. Never inspect real user repositories, `.neoflow` state, Configuration, or receipts.

## Authority

- [Complete Change Set and Review Snapshot evidence](./WF-187-complete-change-set-review-snapshot-evidence.md)
- [Degrade special, sparse, Gitlink, and partial evidence per side](./WF-190-degrade-special-sparse-gitlink-partial-evidence.md)
- [Capture index and working-state comparisons](./WF-189-capture-index-working-comparisons.md)
- [Resolve exact local revision Change Sets](./WF-188-resolve-exact-local-revision-change-sets.md)
- [Define the workspace and change-set evidence contract](./WF-023-define-workspace-change-set-evidence.md)
- [Shape the Reviewing workflow](./WF-006-shape-reviewing-workflow.md)
- [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
