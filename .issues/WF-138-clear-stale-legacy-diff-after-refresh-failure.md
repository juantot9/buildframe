---
id: WF-138
title: "Clear stale legacy diff after refresh failure"
status: closed
labels:
  - wayfinder:bug
parent: WF-135
assignee: juanan
blocked_by: [WF-137]
created: 2026-08-27
---

## Problem

LG-02's deletion-bound aggregate Diff Interface fails visibly when tracked output crosses its 512 KiB bound or an untracked file exhausts the remaining budget. The settled unsafe residue is narrower: `refreshGitDiff` reports the failure but leaves the previous successful `gitDiff` rendered and actionable beneath the red error footer.

## Acceptance evidence

- After any `getGitDiff` rejection that belongs to the current uncancelled refresh, `App` clears `gitDiff` before publishing `Git diff failed: …`. No prior code row remains on that failure screen.
- Cancellation behavior, successful refresh replacement, queued refresh scheduling, loading state, watcher policy, 120 ms debounce, 512 KiB request, notices, selection, and every legacy Interface remain unchanged.
- `packages/core/src/git.ts` is byte-identical. Its aggregate max-buffer failure, untracked remaining-budget behavior, and string-or-throw Interface remain explicitly deletion-bound.
- A disposable source/compiled ordering check fails against the old catch branch and passes only when the clear precedes the failure notice. Per the settled P16D ruling, add no persistent legacy test or refactor for this one state assignment.
- Full legacy tests, typechecks, build, and smoke pass independently. Canonical v1 verification, all four compiled v1 risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.
- Real queue/receipt/v1 State/user bytes remain unchanged. Only `apps/tui/src/App.tsx` and issue records change.

## Authority

- Finding: [`pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md), LG-02
- Settled split: [Disposition the root configuration and legacy findings](./WF-068-disposition-root-and-legacy-findings.md)
- Owning map: [Review the legacy packages for blockers](./WF-135-review-legacy-packages-for-blockers.md)

## Seam decision

Repair the stale Application state exactly where the legacy Git call becomes a failed refresh. Do not deepen `getGitDiff`, add partial Diff semantics, clear durable Review annotations, change watcher behavior, or introduce a reusable error-state abstraction in code scheduled for deletion.

## Constraints

- Preserve the visible error and clear only the rendered Diff string.
- Do not alter `gitWorkspace`, queue/receipt state, selected panes, or user data.
- Do not add a test, helper, comment, or unrelated cleanup.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

LG-02's fixed portion is closed with the one settled state assignment: the current uncancelled `getGitDiff` catch now calls `setGitDiff('')` before publishing the existing failure notice. Success, cancellation, loading, queued refresh, debounce, watchers, selection, queue/receipt state, and diagnostics are untouched; `packages/core/src/git.ts` is byte-identical, so every oversized aggregate mechanic remains deletion-bound for P18.

A disposable ordering check first passed the repaired source and failed the still-old compiled `App.js`, then passed both after a clean TUI build. That independently proves the source/compiled catch branch and would fail without the clear. No persistent legacy test, helper, comment, or refactor was added.

Full `pnpm legacy:verify` passes all five packages, builds, and compiled smoke. Canonical v1 verification passes 26 files / 147 tests; all four compiled v1 risk probes and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0. The real ignored queue remains byte-, mode-, and SHA-256-identical, and no receipt, v1 State, package Interface, or user data changed.
