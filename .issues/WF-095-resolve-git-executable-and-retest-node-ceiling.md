---
id: WF-095
title: "Resolve the Git executable and retest the Node ceiling"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-094]
created: 2026-08-12
---

## Question

Can W-14 remove repeated `PATH` resolution from every production and verification Git spawn, then establish with full-suite evidence whether Node 26.6.0 and 26.7.0 remain known-bad?

## Blocked by

- [Harden Workspace Git process execution](./WF-094-harden-workspace-git-process-execution.md)

## Acceptance evidence

- One owner-side resolver selects Git once, returns an absolute executable, and is used by both Workspace production Git seams without widening the Workspace package Interface.
- The eight active test-helper spawn sites and the named risk-probe sites use the same absolute-executable rule, so the version experiment contains no remaining bare-word Git timing contamination.
- Missing, non-file, non-executable, and changed-resolution cases fail explicitly without consulting checkout-controlled Git configuration.
- Canonical verification and all four risk probes still pass on Node 26.5.1.
- The complete v1 suite—not a spawn micro-probe—is run on Node 26.6.0 and 26.7.0 after the resolver lands. The record separates timing failures from any second cause and either preserves or revises the known-bad evidence; it does not move the declared range merely because a micro-probe passes.
- W-14 remains paired with A-04's later Application launcher work. This child records the Node verdict but does not pull Application work ahead of the declared package order.

## Authority

- [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- W-14 and its coordination with A-04 in [`docs/audit/pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md)

## Constraints

- Keep S-01 separate: absolute executable resolution controls `PATH`; it does not make checkout-controlled Git configuration trusted.
- Resolve before the first checkout Git invocation. Do not use Git itself to locate Git.
- The production rule and verification rule must be the same rule; a test-only shortcut would make the Node result unclean.
- Do not weaken or remove the current Node guard before full-suite evidence establishes a replacement posture.
- Preserve the unrelated local root `package.json` pnpm bump.

## Resolution comment

Yes. The package-private `gitProcess` Module now owns one memoized resolver whose no-argument Interface returns a canonical absolute Git executable. It searches the captured `PATH` with filesystem operations only, validates that the selected target is a regular executable file, confirms that canonical resolution did not move while it was being selected, and rejects a later search-path change instead of silently selecting a second executable. Missing, non-file, non-executable, changed-resolution, and unexpected resolution failures remain distinct owner-side reasons. A regression uses an executable marker script and proves selection never invokes Git; the resolver has no checkout input and therefore cannot consult checkout-controlled Git configuration.

Both production seams call that resolver before spawning: Workspace Identity passes the result to `execFile`, and Workspace Evidence passes it into the existing bounded process runner. The Workspace package exports are unchanged. All eight active test-helper spawn sites import the same package-private rule, and the seven named probe sites use the compiled resolver. An exhaustive literal-call sweep finds no remaining bare-word Git spawn in the active production, v1 test, or risk-probe paths.

The focused resolver evidence covers canonical absolute selection, one-time reuse, no invocation during selection, and explicit `git-missing`, `git-not-file`, `git-not-executable`, and `git-resolution-changed` failures. The existing Workspace Identity missing-Git scenario also continues to fail through the public Workspace Interface when `PATH` changes after initial selection.

The complete v1 test suite was then invoked directly beneath the unchanged version guard, not replaced by a spawn micro-probe:

| Node | Result | Vitest duration | Verdict |
| --- | --- | --- | --- |
| 26.5.1 | 19 files / 114 tests passed | 26.55 s | canonical baseline remains good |
| 26.6.0 | 19 files / 114 tests passed | 26.49 s | no longer known-bad after the repair |
| 26.7.0 | 19 files / 114 tests passed | 25.86 s | no longer known-bad after the repair |

Neither candidate produced a timeout, performance-budget failure, or logic failure, and 26.7.0 exposed no second cause. The prior failures are therefore attributable to repeated bare-word Git resolution in the measured suite. The declared `<26.6.0` guard is deliberately unchanged in this Workspace child: the full-suite evidence now permits a later coordinated support-posture revision, while A-04's launcher behavior remains with the Application package order.

On Node 26.5.1, `pnpm v1:verify` passed the dependency firewall, all 19 files / 114 tests, typecheck, builds, and smoke. All four compiled risk probes passed: Authoritative State, Local Runtime, reviewed Pi 0.80.6 Adapter, and end-to-end dogfood. `git diff --check` is clean. The pre-existing root `package.json` bump caused Corepack to select pnpm 11.20.0 for these commands; that unrelated edit remains untouched.
