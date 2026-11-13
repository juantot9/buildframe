---
id: WF-131
title: "Make Harness command dispatch exhaustive"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-130]
created: 2026-08-27
---

## Question

Will adding a fourth normalized Harness Interaction command fail compilation instead of silently routing that command to interruption handling?

## Acceptance evidence

- `HarnessInteractionOwner.execute` dispatches the three current command kinds explicitly: Ask, retained historical Handoff commitment, and interruption request.
- The impossible branch assigns the remaining command to `never` before failing closed, so widening `HarnessInteractionCommand` without adding a handler is a compile error at the dispatch seam.
- A temporary fourth union member fails Workspace typecheck at that exact exhaustiveness assignment. Removing the mutation restores typecheck.
- Existing Ask, retained Handoff recovery, and interruption scenarios retain exact command results, durable bytes, effects, and no-replay behavior; unknown input still fails in `normalizeCommand` before dispatch.
- No command kind, public type, package Interface, diagnostic reachable by a valid command, Adapter directive, or State schema changes.
- Focused Harness Interaction scenarios and Workspace typecheck/build pass. Canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.

## Authority

- Parent package-order checkpoint: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Recorded three-member dispatch obligation: [Disposition the Application text-filtering findings](./WF-075-disposition-application-filtering-findings.md)
- Harness Interaction command owner: [Define the target Module architecture](./WF-041-define-target-module-architecture.md)

## Seam decision

Enforce exhaustiveness at the existing private command dispatch seam. Do not add an exported assertion helper, generic dispatcher, command registry, or another Interface. Shared recall/version checks stay before one explicit switch; each semantic handler remains owner-local.

## Constraints

- Change only the private dispatch implementation plus issue records.
- Preserve normalization, command JSON, idempotent recall, expected-version checks, handler order, results, diagnostics, and effects.
- Do not add a fourth production command to prove the check; use a temporary type mutation and remove it.
- Keep the retained historical Handoff path and interruption capability unchanged.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

`HarnessInteractionOwner.execute` now switches explicitly over `review.question.ask`, retained `harness.review-handoff.commit`, and `harness.invocation.interruption.request`. Recall, State-version rejection, normalized command bytes, and each existing private handler remain in their prior order. The default branch binds the narrowed command to `never` before failing closed, so no union member can inherit interruption behavior by fallthrough.

A temporary fourth `wf131.unhandled` member on `HarnessInteractionCommand` fails Workspace typecheck exactly at the dispatch assignment with TS2322: the new command is not assignable to `never`. Removing that type-only mutation restores package typecheck. No production command, contract, public type, package Interface, valid-command diagnostic, durable representation, directive, or effect changed.

The focused Harness Interaction scenarios pass 1 file / 12 tests, covering Ask, retained Handoff recall, interruption, exact durable results, and no replay. On Node 26.5.1 with pnpm 11.20.0, canonical `pnpm v1:verify` passes all 25 files / 145 tests, dependency checks, the unused-declaration gate, typecheck, builds, and smoke. All four compiled risk probes pass and `git diff --check` is clean. The unrelated root `package.json` bump remains excluded.
