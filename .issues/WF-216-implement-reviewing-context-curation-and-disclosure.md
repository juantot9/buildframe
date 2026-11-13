---
id: WF-216
title: "Implement Reviewing context curation and disclosure"
status: open
labels:
  - wayfinder:map
parent: WF-051
assignee: juanan
blocked_by: [WF-199, WF-225]
created: 2026-09-07
---

## Design checkpoint (2026-09-08)

WF-217–220 are landed. The WF-221 grilling pass produced a broader accepted product change, recorded in [Reframe Reviewing around the current repository](./WF-225-reframe-reviewing-around-the-current-repository.md): current-repository-first Reviewing includes unchanged files and clean checkouts; history supports explicit inspection, Questions, and selected-change reuse; ordinary Questions are small human-readable messages, with additional current files read by the Harness's own tools. Exact outgoing-message disclosure and Harness filesystem access are different guarantees.

**Pause WF-221 and the remaining WF-222–224 sequence pending WF-225's replan.** The original destination, route, and acceptance below remain visible for reconciliation, not permission to implement the old all-supporting-captures delivery model unchanged. Preserve landed records and fail-closed paths; no restricted file server, automatic replay, or new mutation route is approved by this checkpoint.

**Replan complete (2026-09-08).** WF-225's user-confirmed child map supersedes WF-221, WF-222, and WF-224 and re-scopes WF-223: [Own review message records and the change-driven tree](./WF-226-own-review-message-records-and-the-change-driven-tree.md), [Implement the diff-first Reviewing view](./WF-227-implement-the-diff-first-reviewing-view.md), and [Define the outgoing review message contract](./WF-228-define-the-outgoing-review-message-contract.md) carry the revised work; [Apply a review tree leaf to current files](./WF-229-apply-a-review-tree-leaf-to-current-files.md) stays parked. Each child needs its own committed pre-implementation Resolution before code. The older Route/acceptance below describes the superseded shape and remains for record.

## Destination

P21 of [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md) is complete. Reviewing owns one bounded mutable Workflow Context Selection per Review while Workspace Evidence remains the sole owner of live Context Locator expansion, exact byte capture, and source revalidation. Every immutable Review Snapshot freezes its selected supporting context, provenance, exclusions, unavailable evidence, ordering, and sensitivity without merging that context into the Change Set. Harness Interaction derives one route-exact Handoff Disclosure Preview, Handoff Disclosure Delta, Context Budget Evidence view, and composed commitment assessment from the immutable proposed Snapshot and exact destination; an Adapter receives exactly the accepted projection and no ambient workspace, editor, transcript, or newer-Artifact content.

## Authority

- P21 outcome and learning gate: [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)
- Selection, contribution, capture, refresh, representation, disclosure, and sensitivity rules: [Define workflow context curation and capture](./WF-024-define-workflow-context-curation.md)
- Reviewing and immutable Snapshot lifecycle: [Shape the Reviewing workflow](./WF-006-shape-reviewing-workflow.md)
- Consent, blockers, sensitive acknowledgment, and one composed gate: [Set trust and consent guardrails](./WF-011-set-trust-consent-guardrails.md)
- Exact and attached-session Context Budget Evidence: [Establish Pi and Claude Code context-budget evidence](./WF-021-establish-context-budget-evidence.md)
- Submit Review Batch disclosure contract: [Define v1 Workflow Handoff payload contracts](./WF-031-define-v1-workflow-handoff-payloads.md)
- Module ownership and seam: [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
- Editor contribution evidence shape: [Validate the Editor Companion implementation seam](./WF-046-validate-editor-companion-seam.md)
- Interface-first and scripted-Adapter proof: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)
- P20 evidence vocabulary and limits: [Implement context source discovery and exact capture](./WF-199-implement-context-source-discovery-and-exact-capture.md)
- Canonical terminology: [`CONTEXT.md`](../CONTEXT.md)

## Interface decision

Deepen the existing Reviewing Module behind the unchanged three-method Workspace Interface. Add only closed, versioned Reviewing commands and bounded projections for Review-scoped context rules, immutable contributions, preview, and successor commitment. Applications name semantic curation intent; they do not page P20 manifests, read context files, calculate prefix precedence or interval unions, compare capture witnesses, copy State records, or construct a Handoff payload. Reviewing consumes the existing Workspace Evidence context family through an owner-local collaboration and Durable-Commits its own complete transition.

Keep four facts deliberately separate. The Workflow Context Selection is revisioned mutable curation intent. A Workflow Context Capture or Editor Context Contribution is one immutable exact occurrence. A Handoff representation is a route- and Capability-specific decision over an immutable Snapshot. Consent is an exact destination-scoped commitment fact. No status Boolean or generic context bag may stand for more than one of them.

Reviewing owns ordered include/exclude rules, concrete immutable-contribution references, effective-selection identity, and Snapshot successor rules. Workspace Evidence continues to own filesystem/Git facts, bounded expansion, byte admission, overlap arithmetic, and coherent source verdicts. A package-private pure rule evaluator may earn locality inside the Reviewing implementation, but no public generic Workflow Core or one-method-per-source Interface is introduced. Planning may later reuse private mechanics only behind its own concrete commands and records.

A Review Snapshot gains an optional strictly validated context basis plus immutable context-manifest/content records. Absence on historical format-1 records means the exact empty context that those Snapshots actually had; it never means unknown or “resolve now.” P20 `cctx_` retention is only staging evidence: every admitted durable occurrence copies and verifies its exact bytes, scope, digest, source witness, provenance, origins, sensitivity, and limitation before the Snapshot commit succeeds.

Harness Interaction remains the semantic owner of Handoff inspection and commitment. It resolves the exact destination, frozen Capability and route representations; constructs the disclosure projection and delta; obtains normalized Context Budget telemetry without exposing native facts to Reviewing; asks the internal Commitment Policy Module for `direct`, `gate`, or `blocked`; and Durable-Commits the accepted disclosure, exact acknowledgments, receipt, Handoff, and Invocation before dispatch. Commitment Policy is an internal pure Module, not a second Workspace seam. Reviewed Adapters receive only the already-committed projection and minimum correlation.

## Route

1. Add one bounded Review-scoped Workflow Context Selection with revisioned ordered rules. Exact file/direct inclusion, directory inclusion, stable path/prefix exclusion, explicit ignored/outside-checkout inclusion, equal-specificity replacement, and more-specific direct-include precedence produce one deterministic effective selection while preserving user source-group order and lossless path order.
2. Admit immutable Editor Context Contributions and concrete prior-Artifact contributions without turning Editor Presence, arbitrary State records, or live Artifact locators into context. Preserve exact bytes/ranges, source identity, provenance, editor buffer version and unsaved status where applicable; populate the prepared P20 saved-versus-unsaved conflict seam without merging equal bytes or nominal paths.
3. Freeze one complete self-contained supporting-context basis into each new Review Snapshot. Persist admitted captures, explicit/default exclusions, unavailable and over-limit items, complete source-group order, provenance, sensitivity evidence, and bounded exact content records atomically with the Snapshot; never retain an ephemeral Evidence identity as the only copy.
4. Extend one owner-local Snapshot currentness and refresh path across the unchanged Change Set and context basis. Included mutable locator additions, changes, deletions, scope movement, or unavailability make context stale/unverified; excluded movement is irrelevant; immutable contributions remain fixed. Unchanged refresh reuses the Snapshot, while accepted movement or selection change commits one complete successor without rewriting prior records or moving Anchors.
5. Resolve each context occurrence to one closed route representation—exact content/range, exact destination-native reference where correlation proves it, metadata only, or explicitly unavailable—and build the ordered Handoff Disclosure Preview and Delta from the immutable proposed Snapshot. Unknown scope, silent omission, truncation, substitution, or an unrepresentable required item is a blocker.
6. Publish exact proposed-payload byte, character, item, and file counts beside normalized optional Harness telemetry. Preserve source, unit, model/session binding, declared capacity, observation generation, freshness, and explicit unknown reasons; model/session change, compaction, Attachment loss, or telemetry loss invalidates usage without changing payload truth or choosing a route.
7. Freeze advisory sensitivity evidence and assess the whole commitment once. Matching ordinary curation proceeds through the accurately labelled Ask action; changed disclosure or sensitive content produces one composed gate; exact matching destination-scoped acknowledgments remain sufficient; incoherent capture and unknown/unrepresentable payload remain non-overridable blockers.
8. Close with a versioned Workspace/scripted-Adapter matrix and scale fixture spanning precedence, recreation/rename, saved-versus-unsaved conflict, immutable Artifact behavior, restart, context-only and combined successor capture, route limitations, sensitivity/destination changes, fresh/unknown telemetry, failed commit, exact payload confinement, and no ambient additions.

## State and safety invariants

- Workflow Context Selection, immutable capture, Handoff representation, and consent remain different records and different result vocabularies. Selection is neither a Snapshot nor permission to disclose.
- Excluding a file survives content change and recreation; excluding a directory applies to present and future descendants. Rename is missing old path plus a new candidate. A more-specific direct inclusion overrides an inherited exclusion and exposes resulting sensitivity; equal-specificity actions replace rather than coexist.
- Mutable Context Locators refresh only through explicit Reviewing actions. Editor and Artifact contributions never auto-refresh, and source movement never rewrites an immutable occurrence or Snapshot. Pinning old exact content is explicit.
- Change Set evidence and selected supporting context stay separate inside one Review Snapshot. Supporting context and Evidence References never widen Annotation authority.
- Every durable context occurrence is self-contained and byte-exact. Binary bytes are never lossy-decoded; unavailable, over-limit, unrenderable, metadata-only, and excluded items remain explicit. Unknown membership cannot become an acknowledged omission.
- A Handoff projection is derived only from one immutable proposed Snapshot, exact Batch, exact destination, frozen Capability, and route. Excluded identities stay local unless their metadata is deliberately represented; no Adapter may browse State, re-resolve a locator, or add ambient context.
- Sensitivity detection is advisory evidence with source/version provenance. Absence never claims safety. A Sensitive Disclosure Acknowledgment binds one exact immutable occurrence and destination; content, scope, destination, or newly detected sensitivity movement requires a new acknowledgment.
- Context Budget Evidence is advisory and unit/provenance honest. Exact proposed-payload facts never become Harness usage; stale or incomparable telemetry never becomes a universal percentage, authority, automatic omission, compaction, or route choice.
- Preserve State format 2, Workspace and Local Runtime Interface version 1, and the `execute`/`read`/`subscribe` method set. New optional format-1 fields parse strictly while historical bytes retain their original exact empty-context meaning.
- Preserve the post-dogfood direct Question interaction: one accurately labelled Ask action, atomic pre-effect commitment, captured Response, Current/Previous Reviews, and no reintroduced Finish, disposition, or staged-Handoff workflow.
- Keep existing limits, deadlines, frame bounds, non-eager windows, no-fetch/no-filter rules, and no-replay effect ordering. Add no watcher, ambient editor synchronization, transcript reader, broad cache, or production test instrumentation.
- Work one focused child at a time; settle and commit its pre-implementation resolution before code, stage exact files only, and leave the unrelated root `packageManager` bump and parallel-session artifacts untouched.

## Acceptance

- [ ] Review-scoped ordered include/exclude rules are durable and deterministic across restart, recreation, rename, overlapping locators, default ignored exclusion, direct specific overrides, and equal-specificity replacement.
- [ ] Editor and concrete Artifact contributions are immutable exact occurrences with truthful provenance and unsaved sensitivity; saved-versus-unsaved conflicts remain distinct and inspectable without content-equality deduplication.
- [ ] Review Snapshots durably freeze complete selected supporting context, exclusions, unavailable evidence, bytes, ordering, provenance, and sensitivity independently from Change Set evidence; historical empty-context records remain valid.
- [ ] One coherent verifier and explicit refresh path derives context-sensitive current/stale/unverified truth, ignores excluded movement, keeps immutable contributions fixed, reuses exact unchanged Snapshots, and atomically commits complete successors.
- [ ] Handoff inspection produces exact route representations, Preview and Delta; commitment stores and dispatches exactly the accepted projection, with no ambient additions or silent omission/truncation/substitution.
- [ ] Context Budget Evidence preserves exact proposed-payload counts and fresh/unknown provenance-bound Harness telemetry without false parity, authority, route choice, or automatic payload changes.
- [ ] Advisory sensitivity and exact destination-scoped acknowledgments feed one `direct`/`gate`/`blocked` Commitment Policy assessment; true unknown or incoherent conditions have no override.
- [ ] The versioned matrix, scale fixture, canonical verification, four compiled risk probes, dependency/package seams, dogfood, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with unrelated work unstaged.

## Decisions so far

- Mapping pass landed (2026-09-07): the eight focused children below keep curation in Reviewing, evidence in Workspace Evidence, route disclosure and telemetry in Harness Interaction, and assessment in one internal Commitment Policy Module. No production code changed during mapping.
- [Review context selection and rule precedence](./WF-217-own-review-context-selection-and-rule-precedence.md) landed (2026-09-07): one revisioned Review-owned selection preserves ordered lossless locator intent while P20 supplies bounded live candidates and Reviewing applies deterministic direct-include, prefix-exclusion, and replacement precedence.
- [Immutable Editor and Artifact context contributions](./WF-218-admit-immutable-editor-and-artifact-context-contributions.md) landed (2026-09-07): atomic immutable occurrences preserve exact bytes or explicit degradation, source provenance, order, sensitivity, strict prior-Artifact ownership, and distinct saved-versus-unsaved conflicts without ambient refresh.
- [Exact supporting context in Review Snapshots](./WF-219-freeze-exact-supporting-context-in-review-snapshots.md) landed (2026-09-08): one optional Snapshot-owned context basis freezes selection intent, complete effective locator and contribution occurrences, exclusions, normalized content segments, provenance, ordering, and sensitivity in deterministic immutable bounded records; refresh and atomic Ask reuse or fail closed through one preparation path, and absence remains exact empty context.
- [Revalidate and refresh Review supporting context](./WF-220-revalidate-and-refresh-review-supporting-context.md) landed (2026-09-08): one owner-local verifier derives separate comparison and context verdicts with one truthful aggregate over membership-complete revalidation, one context-only explicit refresh command extends the existing vocabulary with deterministic deltas, and pinning freezes one exact prior occurrence through a closed selection action without rewriting history.
- [Reframe Reviewing around the current repository](./WF-225-reframe-reviewing-around-the-current-repository.md) accepted product direction (2026-09-08): the user reaffirmed live-repository-first Reviewing, expanded it to unchanged files and clean checkouts, separated comparison from visiting past code, and chose small human-readable Questions plus ordinary Harness-owned live reads. Historical Questions and applying selected past changes need explicit new actions. WF-221–224 pause for replanning; implementation remains unchanged.
- Replan mapping confirmed (2026-09-08): after two prototype iterations the user preferred the simplified diff-first interaction and confirmed the child map — one message type whose intent the Harness's action expresses, text + `file:line` messages, a change-driven basis tree with fork-on-confirmed-change semantics, a floating `/tree`-style picker, product chrome, and no token estimates. WF-226–228 replace WF-221/222/224; WF-223 is re-scoped onto the smaller outgoing material; WF-229 parks the tentative apply-a-tree-leaf idea. Contracts amended: WF-006, WF-021, WF-024, WF-031, `CONTEXT.md`, and the harness capability seam blueprint.
- [Compose Review context commitment assessment](./WF-223-compose-review-context-commitment-assessment.md) landed (2026-09-14): one package-private pure Commitment Policy Module assesses the exact outgoing Review Message as `direct`/`gate`/`blocked`; ordinary messages keep one action, sensitive occurrences or unresolved prior Invocations compose one gate with exact requirement identities, and immutable exact acknowledgments (never standing trust) commit atomically with the Handoff and receipt while adapters still receive only the exact bytes.

## Out of scope

- Complete Note, Change Request, Concrete Replacement, Anchor, and Evidence Reference authority (P22); Re-anchor Mapping and Coverage (P23).
- Pi mutation routes, native Pi telemetry production, Explicit Resubmission, and complete Direct recovery (P25); Claude User Pull and native telemetry production (P26); strongest-route selection and Manual Handoff (P27).
- Editor Attachment/runtime identity, buffer-witness attestation, bridge/reconnect, Neovim UI, Artifact Buffers, and native navigation (P28/P29). P21 lands only the immutable contribution semantics consumed later.
- Planning context, Planning Origins, and cross-workflow Plan contributions (P31 and later); general Context Reuse remains post-v1.
- Hosting-service context, transcript capture, automatic secret-safety claims, network token counting, automatic summarization, compaction, source refresh, or payload reduction.
- Ruled out of scope by the 2026-09-08 replan and closed 2026-09-14 after a live real-Pi verification of the replacements: [Resolve route-exact context disclosure and deltas](./WF-221-resolve-route-exact-context-disclosure-and-deltas.md), [Publish provenance-bound Context Budget Evidence](./WF-222-publish-provenance-bound-context-budget-evidence.md), and [Prove the Reviewing context curation and disclosure matrix](./WF-224-prove-reviewing-context-curation-and-disclosure-matrix.md). The revised one-message contract, exact commitment assessment, and each replacement child's own acceptance suites carry the surviving obligations.
