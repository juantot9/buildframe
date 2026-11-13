---
id: WF-123
title: "Delete the unreachable Application revise editor"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-122]
created: 2026-08-26
---

## Question

Can the Application remove its producerless Question-revision editor path and collapse the remaining local editor shape without deleting the capability-shaped Workspace Draft-revision command or changing any reachable Reviewing behavior?

## Acceptance evidence

- A fresh producer census precedes deletion. In Application source, `load-question-editor` has only its effect declaration and consumer arm, with zero object constructions; `openReviseEditor` has only its declaration and that consumer; and `revise-question` exists only in the dead editor variant and dead opener. No view, model input, projected action, test, or other package produces the path.
- Delete the dead effect member, Application dispatch arm, paged loader, model opener, revise editor variant, and now-unused `ReviewQuestionDraftListItem` import. The shared `review.question-body` reader remains because expanded Question discussion still uses it.
- Collapse model state and `editorCommand` to `CreateQuestionEditor`. Remove only discriminators that become tautological: target-change checks, whole-file-anchor selection, the two save guards, and the hardcoded intermediate action kind. The resulting command remains exactly `review.question.ask` with the same gate, attachment, inspection, Anchor, body, and pending semantics.
- Post-change AST/source and compiled-output censuses contain zero `load-question-editor`, `openReviseEditor`, or `revise-question` Application references. No new producer, fallback, or replacement Interface is introduced.
- Do not manufacture a behavioral regression for code that had no producer. Instead, all real Application scenarios pass unchanged through the Reviewing Application Interface, including line/whole-file Ask, target reselection, paste/copy, discussion paging, and restart behavior.
- The accepted Workspace half remains intact. `review.question-draft.revise`, its parser/handler, and the direct Workspace scenario added by WF-099 remain present and passing; no Workspace source, command shape, durable event, or package export changes.
- Application root/launcher runtime values and declaration reachability remain unchanged. The deletion stays private to `reviewingModel.ts` and `reviewingApplication.ts` plus tautology cleanup in `reviewingView.ts`.
- Focused Application scenarios, Application typecheck/build, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.

## Authority

- Parent package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled split finding: [`A-05`](../docs/audit/pre-p17-codebase-findings.md#a-05--the-revise-question-editor-is-wired-end-to-end-but-unreachable-and-could-not-save-if-it-were-reached)
- Capability-shaped versus accident-shaped decision: [Disposition the Application unreachable-surface and test-double findings](./WF-076-disposition-application-unreachable-surface-findings.md)
- Accepted-half coverage: [Cover capability-shaped Workspace commands](./WF-099-cover-capability-shaped-workspace-commands.md)

## Seam decision

This child removes a private Interface rather than replacing it. The Application effect union and model editor union currently ask maintainers to understand a path no caller can enter and whose own save logic rejects it. Deleting that accident-shaped surface makes the existing Reviewing Application Interface deeper: callers retain the same behavior while the implementation loses an effect, loader protocol, editor state, and impossible branches.

The Workspace command is a different Module with a documented producer-of-intent and live Interface coverage. Preserve it exactly. Sharing the structural word “revise” is not a seam and does not justify deleting both halves together.

## Constraints

- Delete only the Application half of A-05; retain every Workspace Draft-revision declaration, validation rule, handler, event, export, and test.
- Preserve Question discussion body paging, exact Ask command fields, and all reachable composer behavior.
- Do not add a replacement keybinding, projected action, producer, or test-only hook.
- Do not turn structural deletion evidence into a permanent source-shape test.
- Do not combine this child with last-ranked A-02 or the Application package checkpoint.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The pre-change TypeScript census found exactly four decisive literals in the
Application: `revise-question` in the dead editor type and its opener,
`load-question-editor` in the effect type and its consumer comparison, and zero
object literals producing that effect. `openReviseEditor` likewise had only its
method declaration and the consumer call. No view, model-input path, projected
action, test, or neighbouring package constructed the route.

The Application now has no revise-editor shape. The effect member, five-line
dispatch arm, 48-line paged loader, model opener, revise editor variant, local
editor union, unused Workspace type import, and private `kind` field are deleted.
Model state and
`editorCommand` hold only `CreateQuestionEditor`; target-change and whole-file
logic now narrow on the facts that still vary. The two impossible save guards and
the hardcoded intermediate action-kind variable disappear, while the produced
`review.question.ask` command retains its exact gate, inspection, Attachment,
Anchor, body, pending focus, and result flow.

This is a net 121-line production deletion (146 removed and 25 replacement lines).
Post-build source and compiled censuses contain zero
`load-question-editor`, `openReviseEditor`, `revise-question`,
`ReviseQuestionEditor`, or `LocalQuestionEditor` references. The live
`load-question-discussion` effect and its `review.question-body` paging remain, so
the shared body reader was not mistaken for dead infrastructure. No replacement
producer, keybinding, action, or test seam was added.

The capability-shaped half remains wholly Workspace-owned and untouched. Production
still declares, parses, dispatches, and records `review.question-draft.revise`; its
direct scenario revises one Draft exactly and rejects stale or closed revisions,
and passes 1/1 focused. This child therefore executes A-05's split disposition
rather than reviving the original cross-package deletion proposal.

No behavioral test was manufactured for a route with no producer. All four real
Application test files instead pass 23/23 through the existing Interface, covering
line and whole-file Ask, target reselection, paste/copy, title filtering,
discussion paging, and restart behavior. Application typecheck/build pass, and the
compiled root remains only `createReviewingApplication`; the launcher remains only
`openDeveloperReviewing` and `openDeveloperWorkspaceRuntime`.

On Node 26.5.1 with pnpm 11.20.0, canonical `pnpm v1:verify` passes the dependency
firewall, all 24 files / 142 tests, typecheck, builds, and smoke. All four compiled
risk probes pass and `git diff --check` is clean. The unrelated root `package.json`
bump remains excluded. A-05's Application half is closed; its covered Workspace
half remains accepted.
