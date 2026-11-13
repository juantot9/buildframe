---
id: WF-143
title: "Focus moved-HEAD continuation in place"
status: closed
labels:
  - wayfinder:enhancement
parent: WF-140
assignee: juanan
blocked_by: [WF-142]
created: 2026-08-27
---

## Problem

The fixed-range continuation semantics are already exact, but moved-HEAD presentation still repeats a persistent `HEAD MOVED` warning above the Diff, renders the explicit choice dialog with the transparent Terminal-workspace palette, and routes an accepted current-HEAD choice through Home before the new Current Review appears. The accepted P16E interaction keeps that explanation inside one opaque focused dialog and returns directly in place.

## Acceptance evidence

- A fixed Review retains one low-weight immutable-context line; moved-HEAD explanation and both exact choices appear only after `C` inside a bounded `reviewing-continuation-dialog`. The base reading surface no longer carries a persistent `HEAD MOVED` row.
- The dialog uses the same private opaque control-plane palette as configuration/historical control surfaces under Terminal background mode. Saved endpoint, current HEAD, abbreviated identities, no-fetch/no-checkout meaning, explicit selection, cancel, and no-selection no-op remain unchanged.
- Confirming the saved endpoint closes the dialog with the existing composite-intent notice and commits no command or State transition. Confirming current HEAD dispatches the unchanged `review.comparison.continue-live` command with the same expected source Snapshot, saved endpoint, current HEAD, and Live Changes identities.
- An accepted current-HEAD result opens `result.reviewIdentity` directly through the existing bounded `show-review` route. No Home frame/read is inserted between the frozen Review and the resulting Current Review; pending, no-replay recovery, rejection diagnostics, current-HEAD semantics, retained source Review, dirty working state, and State settlement remain unchanged.
- Keep the production Workspace Interface, command/result shapes, durable bytes, subscriptions, and package exports unchanged. Add no generic modal, route, renderer, or cross-package helper.
- The real Workspace/OpenTUI continuation scenarios prove opaque dialog presentation, absence of persistent warning, saved-endpoint no effect, exact current-HEAD success, direct in-place route ordering, and Local Runtime refresh. The old implementation fails a focused source regression, and a clean build proves the same compiled path with disposable controls removed.
- Focused Application tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0. Legacy/user data and the unrelated root `package.json` bump remain untouched.

## Authority

- Owning map: [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)
- Reconciled gap: [Reconcile the quality-gate surface](./WF-141-reconcile-quality-gate-surface.md)
- Deferred directive: [Prove Live Changes integration and human acceptance](./WF-092-prove-live-changes-integration-and-acceptance.md)
- Accepted continuation semantics: [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)

## Seam decision

Keep continuation policy in the existing model and Workspace command. The View removes only the redundant moved-HEAD condition row and gives the existing choice overlay the private opaque control-plane treatment plus a stable test identity. On accepted `review.comparison.continued-live`, `applyCommandResult` already has the exact newly created `reviewIdentity`; return one ordinary bounded `show-review` effect for that identity instead of detouring through Home to rediscover it. This is a deeper Application result seam, not a new route or command.

## Constraints

- Preserve saved-endpoint no effect and require an explicit current-HEAD selection before execution.
- Preserve every continuation command field, gate basis, rejection, unknown-result recovery, and State-version barrier.
- Do not fold target-change disclosure, pane command chrome, comparison clicks, or historical-dialog behavior into this child.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Moved-HEAD continuation now has one low-weight fixed-Review context row. It
changes only its neutral `C` affordance when the basis must be chosen; the base
reading surface never publishes a persistent `HEAD MOVED` warning. `C` opens the
existing explicit choice surface as `reviewing-continuation-dialog`, where the
saved endpoint, current HEAD, distinct meanings, no-fetch/no-checkout contract,
and confirm/cancel controls remain unchanged.

The dialog now resolves colors through the private control-plane palette, so its
background remains fully opaque when the base Reviewing background is Terminal.
The real OpenTUI scenario verifies alpha 1, both exact abbreviated object
identities, confirm instructions, and bounded 80x24 geometry. Enter with no
selection and the saved-endpoint choice execute nothing and leave the State
version and Current Review unchanged.

An accepted `review.comparison.continued-live` result now carries the deep route
it already owns: the model opens `result.reviewIdentity` directly with the
existing bounded `show-review` effect instead of showing Home to rediscover the
same identity. The accepted transition increments only the local retained-Review
count on its first result acceptance, preserves the pending State-version
barrier, and keeps rejection/unknown-result handling untouched. The resulting
frame is the new Current Review with one retained Previous Review; no Home frame
or `workspace.home` read occurs between fixed and current screens. The exact
current HEAD, dirty working state, source Review retention, and continued-from
identity remain proven, while the Local Runtime scenario still observes a
same-State moved-HEAD refresh and opens the focused dialog.

The old source implementation fails 1/1 by timing out waiting for the neutral
`[C] Choose continuation basis.` presentation. A clean compiled-Application
control passes the full real continuation scenario 1/1. Replacing only the
compiled direct `show-review` result with the old Home detour then fails on the
captured Home frame (`Review and record the current workspace changes.`); the
mutation and disposable test were removed.

All five Application test files pass 26/26. Canonical `pnpm v1:verify` passes 26
files / 147 tests, typecheck, clean builds, and smoke on Node 26.5.1 with pnpm
11.20.0. All four compiled risk probes and `git diff --check` pass. Workspace
commands/results, durable bytes, subscriptions, package exports, legacy/user
data, and the unrelated root `package.json` bump remain unchanged.
