---
id: WF-099
title: "Cover capability-shaped Workspace commands"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: []
created: 2026-08-14
---

## Question

Can the Workspace prove its two capability-shaped, producerless command paths through the existing Interface so draft revision and Harness interruption cannot mutate durable State untested?

## Acceptance evidence

- One Reviewing scenario creates an open Question Draft, revises its exact body and Anchor through `review.question-draft.revise`, observes the incremented draft revision and State version through bounded Workspace views, and proves a stale expected draft revision cannot commit.
- One Harness Interaction scenario creates a real interruptible invocation, executes `harness.invocation.interruption.request`, and observes the accepted result, exact new State version, one durable interruption intent, unchanged invocation status, and one correlated `harness.direct-invocation.interrupt` directive.
- Replaying either command identity returns its durable result without an extra version, record, or directive; invalid or terminal targets retain their settled rejection semantics.
- A focused coverage census reports no matching scenarios before this child and exactly two afterwards; both scenarios exercise previously untouched handlers and assert only results visible through the Workspace and reviewed Adapter Interfaces.
- Focused Workspace tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- X-08 and A-05's accepted Workspace-half obligation in [`docs/audit/pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md)

## Constraints

- Keep both capabilities and the Workspace Interface unchanged; this child adds evidence, not a production entry point or speculative Application flow.
- Drive commands through `Workspace.execute`, inspect bounded views through `Workspace.read`, and observe effects through the existing `ReviewedHarnessAdapter` seam.
- Preserve intent-only interruption semantics: recording intent must not fabricate terminal evidence or change Invocation Status.
- Preserve unknown-outcome and no-replay semantics. Do not make command retries emit a second Harness directive.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. Two scenarios now cross the existing Workspace Interface and exercise both
capability-shaped commands that had no production producer or prior test. The
focused coverage census had zero matching scenarios before this child and exactly
two afterwards; production code and the public Interface are unchanged.

The Reviewing scenario explicitly reconstructs a historical active Review rather
than making today's natural-follow-up Application produce the superseded Draft
flow. It creates an open Draft, revises its exact body and old-side Anchor to a
new-side Anchor, observes revision 2 and the exact next State version through the
bounded Questions and Question Body views, then reopens the Workspace and proves
the same command is recalled without another revision. Fresh commands with a
stale expected Draft revision and with a committed Draft reject as
`draft-revision-mismatch` and `draft-not-open` without advancing State.

The Harness scenario creates a real Question invocation through one established
`ReviewedHarnessAdapter`, records one interruption intent while status remains
`awaiting-start`, and observes exactly one correlated
`harness.direct-invocation.interrupt` directive. After Workspace restart and
Adapter reattachment, replay returns the durable result with no new intent,
version, or directive. Missing and terminal invocations reject through the
Interface; correlated start and interruption evidence then prove the terminal
status comes from evidence rather than from the intent record.

On Node 26.5.1 with pnpm 11.20.0, both complete owning scenario files pass 21/21.
`pnpm v1:verify` passes the dependency firewall, all 19 files / 126 tests,
typecheck, builds, and smoke. All four compiled risk probes pass, and
`git diff --check` is clean. The unrelated root `package.json` bump remains
excluded.
