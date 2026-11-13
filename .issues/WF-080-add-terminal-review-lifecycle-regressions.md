---
id: WF-080
title: "Add terminal Review lifecycle regressions"
status: closed
labels:
  - wayfinder:task
parent: WF-079
assignee: juanan
blocked_by: []
created: 2026-08-09
---

## Question

Can Workspace scenarios close the X-09 gap before Live Changes changes Review semantics by exercising completion, cancellation, and a human Question disposition through the existing Workspace Interface?

## Acceptance evidence

- One existing Review fixture reaches `review.completed`, asserting its terminal result and exact State-version advance.
- One reaches `review.cancelled` with the same assertions.
- One records `review.question.disposition-recorded` and proves the durable judgment through the Interface.
- Each scenario fails against the old test coverage by exercising a previously unexercised handler; production semantics do not change.

## Authority

- [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)
- X-09 in [`docs/audit/pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md)

## Resolution comment

Closed X-09 with three Workspace Interface regressions in `packages/workspace/test/scenarios/workspaceReviewing.test.ts`: historical completion, cancellation, and human Question disposition now each assert the terminal accepted result and exact State-version advance; the disposition scenario also reads the projected durable judgment. Because amended P16 no longer produces active Review Passes, test setup installs a compatibility-shaped historical active Review through the private State fixture seam, then all behavior under test crosses only `Workspace.execute`/`read`.

The focused scenario file passes with 7 tests, `pnpm v1:typecheck` passes, and `git diff --check` is clean under Node 26.5.1. Production semantics did not change.
