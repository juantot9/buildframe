---
id: WF-101
title: "Prove key-order-independent Harness replay"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: []
created: 2026-08-13
---

## Question

Can the Workspace close X-03's durable-comparison obligation by proving that every Harness command is recalled by semantic content rather than caller object key order, without changing the already-fixed production normalizer?

## Acceptance evidence

- Interface-level Harness scenarios commit and then replay `review.question.ask`, `harness.review-handoff.commit`, and `harness.invocation.interruption.request` after owner restart using separately rebuilt objects with deliberately different property insertion order.
- The reordered Ask also changes its nested Anchor property order; every replay returns the exact durable accepted result rather than `command-identity-conflict`.
- Reordered replay creates no State version, Question, Invocation, interruption intent, Handoff, or reviewed Adapter directive beyond the original committed effect.
- The current natural Ask/interruption flow uses a real invocation. The retained historical Handoff flow is made explicit through the existing private fixture setup rather than restored as an Application producer.
- A focused mutation restoring caller-order-preserving Harness normalization makes the reordered replay regression fail.
- No production entry point, public Interface, generic equality helper, or normalization unrelated to Harness commands is added.
- Focused Workspace tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent route and package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled Workspace repair and Pi Adapter inheritance: [`X-03`](../docs/audit/pre-p17-codebase-findings.md#x-03--jsonstringify-equality-comparisons)
- Reviewing/diff disposition: [Disposition the Workspace reviewing and diff findings](./WF-073-disposition-workspace-reviewing-and-diff-findings.md)
- Existing structural repair landed with Live Changes prerequisites: `690c01d Establish Live Changes implementation prerequisites`

## Constraints

- Durable recall must run before current-version checks and must never replay a Harness effect.
- Keep historical setup private; assertions cross only `Workspace.execute`, `Workspace.read`, and the reviewed Adapter seam.
- Leave X-03's accepted in-process comparisons and Pi Adapter-owned `markerMatches` for their settled package owners.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The structural Workspace repair was already present in `690c01d`: each
Harness command variant is rebuilt into a fixed literal by `normalizeCommand`
instead of preserving caller insertion order. This child adds the missing
Interface evidence and makes that prerequisite implementation traceable to X-03.
No production source or Interface changed.

The real direct-Ask scenario now retains the original Ask command, records one
intent-only interruption, reopens the Workspace, and reconstructs both commands
with reversed top-level key order. The Ask's nested Diff-line Anchor is reversed
separately. Both replays return their exact durable accepted results before stale
expected-version checks, while the bounded views retain one Question, one
Invocation, and one interruption intent; the original Adapter has only its two
committed directives and the reattached Adapter receives none.

A second scenario explicitly installs the retained historical active-Review fact,
creates one Draft and Batch through `Workspace.execute`, commits one real direct
Handoff, then reopens and replays the Handoff command with every top-level key in
reverse order. The exact durable result returns at the same State version, with
one projected Handoff-correlated Invocation and no directive on the reattached
Adapter. The historical setup remains private and does not restore a product
producer.

A focused mutation replacing the current normalizer with the caller-order-
preserving implementation from `e9cd82e` makes both scenarios fail with
`command-identity-conflict`. On Node 26.5.1 with pnpm 11.20.0, the complete
Harness Interaction file passes 12/12. `pnpm v1:verify` passes the dependency
firewall, all 19 files / 128 tests, typecheck, builds, and smoke. All four
compiled risk probes pass, and `git diff --check` is clean. The unrelated root
`package.json` bump remains excluded.
