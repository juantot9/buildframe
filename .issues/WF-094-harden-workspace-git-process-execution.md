---
id: WF-094
title: "Harden Workspace Git process execution"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: []
created: 2026-08-12
---

## Question

Can the Workspace's private Git process runner remain bounded, diagnostic, and exactly-once under early child exit, a hung child, and failed Git inspection, without widening the Workspace Interface or terminating the Neoflow process?

## Acceptance evidence

- W-07: a Workspace-owned regression sends at least 1,600 tracked object identities to a Git process forced to exit early, proves `child.stdin` failure cannot become an unhandled `EPIPE`, and observes bounded failure through the owning Interface while the process remains usable.
- W-09: every `runGit` call has an explicit deadline; expiry terminates the child, reports a distinct bounded Git-inspection reason, settles once, clears its timer, and leaves no process or promise alive.
- W-08: failed Git inspection retains only the exact bounded stderr prefix—without zero padding—and makes that diagnostic available on the owner-side error without exposing an unbounded payload.
- Normal exit, allowed nonzero exit, spawn failure, output limit, stdin failure, timeout, and close/error races each retain their existing semantic distinctions or gain the one explicitly required distinction; no branch resolves or rejects twice.
- Focused Workspace Interface tests, Workspace typecheck/build, `git diff --check`, canonical `pnpm v1:verify`, and all four compiled v1 risk probes pass under Node 26.5.1.

## Authority

- [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- W-07, W-08, and W-09 in [`docs/audit/pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md)

## Constraints

- W-07 and W-09 are one repair in the same function and promise. W-08 joins because it is the same private runner and avoids reopening that implementation; all three remain independently traceable.
- Do not couple the child-process deadline implementation to W-03's worker-port deadline. Reuse only an already-established error vocabulary where it fits without a new Interface.
- Do not remove the output-limit kill path: the settled W-07 ruling withdrew that proposed change after proving its stated trigger unreachable.
- The W-07 regression must use tracked object identities and forced early exit; the existing large untracked-file fixture does not exercise stdin.
- Keep diagnostics bounded and owner-side. Do not pass raw repository or Git output into a public durable record.
- Preserve the unrelated local root `package.json` change.

## Resolution comment

Yes. The Workspace now delegates child-process lifecycle to one package-private `gitProcess` Module while preserving the package Interface. Every call carries a 30-second deadline. Output-limit, timeout, stdin failure, spawn failure, nonzero exit, and normal close converge through one guarded settlement path; timeout, stdin failure, and output limit terminate the child and settle only after `close`, so no live process or timer escapes the operation. Timeout is a distinct `git-timeout` owner-side reason. The existing output-limit kill path remains intact.

`GitInspectionError` now retains an exact copied stderr prefix capped at 64 KiB. Failed inspection no longer pads a dropped straddling chunk with NUL bytes, and raw stderr remains private rather than entering a durable or public projection.

The Workspace Evidence regression creates and modifies 1,600 uniquely backed tracked files, hides `.git` after initial inspection, and forces `git cat-file --batch-check` to exit while more than the pipe capacity drains through stdin. Applied alone to the unfixed `4c8d347` checkpoint in a disposable worktree, that test produced Vitest's uncaught `write EPIPE` and exited 1. Against the repair it returns bounded `inspection-failed`, restores the generated repository, and captures all 1,600 files successfully on the next read. Owner-private process tests cover normal and allowed exits, missing executable error/close, output-limit kill/close precedence, exact 60-KiB-plus-4-KiB stderr retention, and a timed-out child proven absent before rejection returns.

On Node 26.5.1, the focused 14 tests pass. `pnpm v1:verify` passes the dependency firewall, all 19 files / 111 tests, typecheck, builds, and smoke. All four compiled risk probes pass: Authoritative State, Local Runtime, reviewed Pi 0.80.6 Adapter, and end-to-end dogfood. `git diff --check` is clean. The unrelated local `package.json` package-manager bump remains untouched and excluded.
