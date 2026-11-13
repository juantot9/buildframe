---
id: WF-217
title: "Own Review context selection and rule precedence"
status: closed
labels:
  - wayfinder:task
parent: WF-216
assignee: juanan
blocked_by: []
created: 2026-09-07
---

## Pre-implementation resolution (2026-09-07)

- **One change command.** `review.context-selection.change` carries `reviewIdentity`, `expectedStateVersion`, `expectedSelectionRevision`, and one closed change: `include`, `exclude`, or `remove`. Include names a semantic source (`workspace` file/directory with `ordinary` or `ignored-explicit` intent, or outside-checkout file/directory), optional whole/byte scope, and optional explicit generated/binary classification. Exclude names one workspace or outside-checkout file/directory target. Remove names one exact rule identity. Commands are valid only for the Current retained/legacy-active Review; previous Reviews remain readable but their selections cannot be edited.
- **Durable mutable record.** One deterministic `rcs_` revisioned `review.context-selection` record belongs to each Review; absence means revision 0 and the exact empty selection for old and newly started Reviews, so no existing Review/index/Snapshot bytes are rewritten. Accepted include/exclude rules receive deterministic `rcr_` identities from the command occurrence. The normalized current payload contains at most 64 rules, preserving surviving rule order; command/result records retain ordinary State-version and command-idempotency behavior.
- **Replacement without lost overlap.** Setting an exclusion replaces the prior exclusion and every include at the exact same source/form; setting an include replaces the exact-source/form exclusion and an identical include (same scope), while distinct same-source include ranges remain ordered so P20 can union them without losing origins. Removing a missing rule rejects. A normalized command that would exceed 64 rules rejects rather than truncating.
- **Exact precedence.** Candidate matching uses lossless repository-relative bytes or exact validated absolute host paths. The longest matching source prefix wins; exact-file match outranks a directory match at the same prefix; a deeper explicit include therefore overrides an inherited directory exclusion, including the default ignored exclusion. Any remaining equal-specificity conflict is resolved by the later surviving rule ordinal. Exclusion is path intent, so content change/recreation still matches; rename is an absent old path plus an independently evaluated new path and never inherits by content identity.
- **One bounded live view.** `review.context-selection` takes `reviewIdentity`, raw-candidate `offset`, and `limit` (bounded by `maxManifestWindowFiles`). It returns State version, deterministic selection identity/revision, all bounded normalized rules/source groups, `defaultIgnoredUntracked: 'excluded'`, and one P20 manifest window whose candidates carry every admitting include-rule identity plus the effective `included`/`excluded` decision and deciding rule. Pagination remains over the stable P20 raw candidate order so filtering cannot skip or duplicate rows; the view reads no content bytes.
- **Evidence collaboration.** Projection translates active include rules to one `workspace.context.manifest` request; Reviewing owns rule normalization and precedence, while Workspace Evidence owns eligibility, expansion, candidate facts, ordering, and completeness. No include rules yields a complete zero-candidate view without calling P20. P20 `incomplete` and exact reason remain visible with enumerated candidates; malformed evidence never becomes an empty selection.
- **No premature capture.** This child changes curation intent only. It does not capture bytes, write Snapshot context, pin occurrences, assess staleness, establish a destination baseline, calculate disclosure, or acknowledge sensitivity; WF-218 onward consume the revisioned selection. Source movement may change the live view but never mutates the rule record or State version.

## Outcome

The Reviewing Module owns one bounded, revisioned Workflow Context Selection for each eligible Review. Ordered locator/include/exclude actions produce one deterministic effective selection while remaining mutable curation intent rather than captured content or disclosure consent. File and prefix exclusions survive source change and recreation; a rename is missing old plus new; a more-specific direct inclusion overrides inherited directory/default-ignore exclusion; and equal-specificity actions replace rather than coexist.

## Interface

Extend the closed Reviewing command/result family with idempotent, expected-version context-rule changes and add a bounded same-version selection projection. Commands carry semantic `ContextSourceSelection` intent, exact whole/range scope, include or exclude action, expected Review and selection revision, and stable command identity. The projection exposes ordered source groups, explicit and default rules, effective/overridden disposition, complete or incomplete status, and exact corrective reasons without exposing Git, filesystem, State, or manifest-composition primitives.

Reviewing invokes Workspace Evidence to resolve live locators and owns precedence and source-group order itself. Any owner-private path matcher is an implementation detail at this seam; applications never page candidate windows and reconstruct selection meaning.

## Module seam

Keep the revisioned selection record, rule evaluator, command idempotency, and bounded projection beside Reviewing. Workspace Evidence supplies candidate facts only. Do not create a public Workflow Context or generic rule Module.

## Acceptance

- [x] Current Review context rules commit atomically with exact command recall/conflict behavior, bounded revisions, and restart reconstruction; historical Reviews and Snapshots are never rewritten.
- [x] Exact-file, bounded-directory, ignored, outside-checkout, whole/range, and exclude intent preserve user group order and lossless path identity.
- [x] File/prefix exclusion survives content change and recreation, applies to future descendants, and does not follow a rename by inferred identity.
- [x] A more-specific direct include overrides inherited directory or default-ignore exclusion, equal-specificity replacement removes contradiction, and resulting sensitivity remains visible.
- [x] Empty/default selections add no context, incomplete expansion stays explicit, and no application caller composes Git/filesystem or P20 content reads.
- [x] Focused Workspace/Runtime suites, canonical verification, four compiled risk probes, dependency/package seams, and `git diff --check` pass with unrelated work unstaged.

## Constraints

- Selection is bounded mutable intent, not an Artifact, immutable capture, Handoff payload, acknowledgment, or permission grant.
- Rules use exact lossless source identity and path-prefix semantics, never display strings, content similarity, timestamps, or rename guesses.

## Implementation (2026-09-07)

Reviewing now accepts the closed, idempotent `review.context-selection.change` command and owns one deterministic revisioned `review.context-selection` record per eligible Review. Absence remains the exact revision-0 empty selection, so pre-P21 Reviews and immutable Snapshots need no migration. Include/exclude/remove changes preserve surviving order, retain distinct ranges, replace equal-target contradictions, derive stable `rcr_` rule identities, reject stale revisions/missing removals/the 65th rule, and remain available through ordinary command recall and restart reconstruction.

Projection now exposes the bounded `review.context-selection` live view. It maps ordered include rules to one P20 `workspace.context.manifest` request, preserves P20 candidate ordering, origins, sensitivity, eligibility, and incompleteness, then applies Reviewing-owned longest-prefix/exact-file/later-rule precedence without reading content bytes. Empty selections return a complete zero-candidate view without evidence expansion; candidate movement changes only live facts, never State or selection intent.

`packages/workspace/test/scenarios/workspaceReviewContextSelection.test.ts` proves empty compatibility, command recall/conflict, immutable Snapshot lineage, whole/range replacement, ignored and outside-checkout handling, direct-over-inherited precedence, future descendants, recreation, rename independence, restart reconstruction, bounded rules/windows, stale and historical rejection, and explicit incomplete expansion over disposable real Git/filesystem fixtures. Canonical `v1:verify` passed (36 files / 307 tests), all four compiled risk probes passed, dependency/package seams passed, and `git diff --check` is clean on Node 26.5.1 / pnpm 11.20.0 with the unrelated root package-manager bump and parallel-session artifacts unstaged.
