---
id: WF-139
title: "Close the legacy blocker review"
status: closed
labels:
  - wayfinder:task
parent: WF-135
assignee: juanan
blocked_by: [WF-138]
created: 2026-08-27
---

## Question

Is P16D complete: every retained legacy owner reviewed against the blocker-only rule, every executable legacy finding closed, importer/cutover facts preserved, and legacy/v1 verification still independent?

## Acceptance evidence

- The ledger has exactly 47 unique, fully decided findings. Legacy is exactly LG-01 accepted, LG-02 fixed/deletion-bound, and LG-03 fixed; all non-blocking legacy behavior remains explicitly deletion-bound rather than becoming cleanup work.
- Reconcile the complete retained inventory: the audited baseline was 41 TypeScript source files / 7,613 lines and is now the same 41 files / 7,821 lines after the net 208-line LG-03/LG-02 repairs; 20 tests / 2,646 lines, five manifests/tsconfigs/generated trees, two Neovim files / 165 lines, eight direct legacy root routes, six composite routes, README instructions, and lockfile importer entries remain exact.
- Re-prove the exact legacy package graph and zero active→legacy source/manifest edges. The v1 firewall and both source islands remain independent; no Adapter, fallback, compatibility import, shared mutable store, or dual writer was introduced.
- Reconfirm LG-01 by metadata/digest only: queue/receipt locations and format versions remain exact, the real queue retains its original size/mode/SHA-256 and mode-`0755` parent caveat, no receipt appears, and no user content is printed or changed.
- Re-run the LG-03 fail-closed path controls and LG-02 source/compiled ordering check from disposable roots; outside sentinels remain unchanged and all controls are removed. No real queue, receipt, State, or user-data path participates.
- `pnpm legacy:verify` and canonical `pnpm v1:verify` pass independently; all four compiled v1 risk probes and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.
- Close WF-135 and record P16D complete in WF-051. This checkpoint changes only issue records; no source, test, manifest, lockfile, script, configuration, ledger classification, package Interface, or user data changes.

## Authority

- Owning map: [Review the legacy packages for blockers](./WF-135-review-legacy-packages-for-blockers.md)
- P16D outcome: [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)
- Import/cutover contract: [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)
- Final ledger: [`pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md)

## Seam decision

This is reconciliation evidence, not another legacy pass. If a guard, byte check, package edge, or verification route fails, return to its owning child. If they stand, close P16D and advance to P16E without adding source merely to manufacture a final change.

## Constraints

- Change only WF-139, WF-135, and P16D's result record in WF-051.
- Do not inspect real ignored data content; use lstat/stat/digest only.
- Do not claim P16E packed/PTY/human evidence, P17 import, P18 deletion, or P54 release work.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

P16D's reconciliation closes with exactly 47 unique, fully settled ledger findings: LG-01 is accepted importer fact, LG-02's stale state is fixed while its aggregate Diff Interface remains deletion-bound, and LG-03 is fixed. The retained baseline of 41 source files / 7,613 lines is still 41 files and now 7,821 lines after the exact net 208-line blocker repairs; 20 tests / 2,646 lines, five manifests, five tsconfigs, five generated trees, two Neovim files / 165 lines, eight direct root routes, six composite routes, README instructions, and five lockfile importers remain accounted for.

The package graph remains `tui → ai-harness/core`, `cli → core`, `ai-harness → core`, and `pi-connector → core`. All 46 active source files and all active manifests have zero legacy edges, legacy has zero active edges, and the v1 dependency firewall plus both source-island suites pass. No Adapter, compatibility path, fallback, shared store, or dual writer was introduced.

Disposable LG-03 controls reject queue/receipt directory and file symlinks plus bridge directory symlinks and non-socket endpoints while preserving every outside sentinel byte and mode. Configured base aliases, stale-socket convergence, and normal close still work. The LG-02 ordering check passes independently against source and compiled `App`; `packages/core/src/git.ts` is unchanged. All controls lived under disposable roots and no control file remains.

LG-01 remains exact without displaying user content: raw/v1/v2 queue recognition, receipt format 1, retention 100, and canonical receipt derivation hold. The real ignored queue remains a regular 2,119-byte mode-`0600` file with SHA-256 `367d0c657b2998d7ed0d8ef9f8bb7cd60e09ad0936b8aebac419deb4d6efb727`; its pre-existing parent remains mode `0755`, and no receipt exists for this checkout.

On Node 26.5.1 with pnpm 11.20.0, full `pnpm legacy:verify` passes all five packages and compiled smoke, canonical `pnpm v1:verify` passes 26 files / 147 tests, all four compiled risk probes pass, and `git diff --check` passes. This final checkpoint changes issue records only. No source, test, manifest, lockfile, script, configuration, ledger classification, package Interface, legacy/user data, P16E evidence, importer, deletion, or release scope changed.
