---
id: WF-091
title: "Continue a frozen range Review into Live Changes"
status: closed
labels:
  - wayfinder:task
parent: WF-079
assignee: juanan
blocked_by: [WF-090]
created: 2026-08-09
---

## Question

Can a fixed commit/range Review explicitly continue into a new Current Review without mutating the range, migrating Questions, or hiding HEAD movement?

## Blocked by

- [Add Live Changes and Versions to the Reviewing Application](./WF-090-add-live-versions-application-flow.md)

## Acceptance evidence

- `Continue with Live Changes from HEAD` starts a new HEAD-to-effective-working-state Current Review and retains the frozen range as Previous/supporting context.
- The separate composite range-basis-to-working-state intent remains explicit rather than inferred.
- If HEAD moved, the user chooses saved endpoint or current HEAD; Neoflow does not fetch, checkout, or silently retarget.
- The complete transition is one generation-checked semantic command and survives restart.

## Resolution comment

Workspace now owns a bounded `review.continuation` inspection for the current fixed commit/range Review. It correlates the immutable source Snapshot and saved endpoint with a verified HEAD-to-effective-working-state Live identity, refreshes on the same hint/fallback path as Live Changes, reports whether local HEAD moved, and projects one direct generation-checked `review.comparison.continue-live` action. The saved endpoint is retained explicitly as a separate composite intent rather than inferred into that action.

The continuation command verifies the expected State version, current source Review, latest source Snapshot, saved endpoint, current local HEAD, and complete Live Changes identity before committing. One transaction creates a new current-change Review and immutable Snapshot, moves the fixed range to Previous, records `continuedFromReviewIdentity` as durable supporting context, and creates no migrated Draft, Question, Response, or disposition. Source and Live races reject with no State change. Command results and the supporting-context link reconstruct after restart without replay. No command fetches, checks out, or retargets Git.

The Reviewing Application exposes `[C] Continue with Live Changes from HEAD`. Unmoved HEAD proceeds directly; moved HEAD opens a mandatory choice with no default. Selecting saved endpoint visibly identifies the separate composite intent and starts nothing; selecting current HEAD sends the single semantic command. The resulting Live Changes Review labels the frozen range as retained supporting context.

Regressions prove same-State continuation refresh, moved-HEAD choice, saved-endpoint no effect, stale Live generation rejection, exact current-HEAD capture, frozen Snapshot and Question preservation, no migration, Current/Previous projection, Git HEAD/worktree non-mutation, atomic commit, restart reconstruction, and command recall. The full Workspace suite (65 tests), full Application suite (19 tests), `pnpm v1:typecheck`, package builds, compiled dogfood probe, and `git diff --check` pass on Node 26.5.1.

## Authority

- [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)
- [`docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md`](../docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md), Continuing from a range
