---
id: WF-135
title: "Review the legacy packages for blockers"
status: closed
labels:
  - wayfinder:map
parent: WF-051
assignee: juanan
blocked_by: [WF-093]
created: 2026-08-27
---

## Destination

P16D of [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md) is complete. `apps/tui`, `apps/cli`, `packages/core`, `packages/ai-harness`, `packages/pi-connector`, and one-shot `nvim/` have been reviewed only for correctness, security, migration, and deletion blockers. Anything unsafe to leave runnable or required by P17/P18 is fixed or explicitly carried forward; everything else remains deletion-bound rather than becoming a second implementation stream.

## Authority

- P16D outcome and blocker-only learning gate: [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)
- Exact migration, import, and hard-cutover constraints: [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)
- Settled legacy findings: [Disposition the root configuration and legacy findings](./WF-068-disposition-root-and-legacy-findings.md)
- Ledger evidence: [`pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md), LG-01 through LG-03
- Verification bar: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)

## Route

1. Perform one read-only, package-ordered blocker census over all retained legacy source, tests, manifests, root routes, and `nvim/`. Check only interim safety, P17 exact-byte importer facts, and P18 deletion/transplant prerequisites. Record ruled-out leads rather than polishing deletion-bound code.
2. Apply LG-02's already-decided narrow repair in `apps/tui`: clear the prior diff whenever refresh fails, while leaving the aggregate 512 KiB behavior, per-untracked-file budget, and string-or-throw Interface deletion-bound. Add no legacy capability, refactor, or test.
3. Give any newly confirmed blocker its own focused child and owning evidence. Do not repair an unconfirmed suspicion or fold unrelated legacy cleanup into LG-02.
4. Re-prove the dependency-isolated legacy MVP and v1 source island independently, confirm the two LG-01 locations and deletion inventory remain exact, and close P16D without touching legacy/user data.

## Constraints

- Never edit, delete, move, rename, chmod, or rewrite `.neoflow/review.json`, legacy receipt files, v1 State, or any other user data. Do not print sensitive file contents.
- Legacy remains isolated and temporary. Do not add an Adapter, compatibility wrapper, fallback, dual writer, migration-on-startup path, or dependency from v1 source.
- Do not polish, restructure, rename, sweep dead code, add broad tests, or transplant behavior during this package. P17 owns the exact importer; P18 owns validated source deletion/transplant.
- Treat LG-01 as an accepted importer fact: verify its two locations without strengthening their directory-permission claim.
- Fix only LG-02's stale rendered state. Preserve its deletion-bound oversized-diff mechanics exactly.
- Run legacy and v1 verification independently on Node 26.5.1 with pnpm 11.20.0; final evidence also includes all four compiled v1 risk probes and `git diff --check`.
- Preserve the unrelated root `package.json` pnpm bump outside every P16D commit.

## Blocked by

- [Deepen the active Modules](./WF-093-deepen-active-modules.md)

## Decisions so far

- [Audit the retained legacy blocker surface](./WF-136-audit-retained-legacy-blocker-surface.md) — closed: all 41 legacy TypeScript source files, 20 tests, manifests, root routes, README/lock entries, and both Neovim files were reviewed; LG-01 remains exact, LG-02 remains normal, and destructive symlink-following was confirmed as new high LG-03 / first while every other lead stays deletion-bound.
- [Refuse symlinked legacy private paths](./WF-137-refuse-symlinked-legacy-private-paths.md) — LG-03 is closed: queue, receipt, and bridge paths reject application-owned symlink/non-directory descendants and non-regular files before mutation, while configured base aliases, real stale-socket convergence, all legacy behavior, and real user bytes remain intact.
- [Clear stale legacy diff after refresh failure](./WF-138-clear-stale-legacy-diff-after-refresh-failure.md) — LG-02's fixed portion is closed with one `setGitDiff('')` before the existing failure notice; source/compiled controls prove the ordering while the oversized aggregate Interface stays byte-identical and deletion-bound.
- [Close the legacy blocker review](./WF-139-close-legacy-blocker-review.md) — closed: all 47 classifications, the exact retained/deletion inventory, private data facts, package isolation, disposable path controls, source/compiled stale-state ordering, and independent legacy/v1 verification reconcile without another source change.

## Out of scope

- P16E packed, PTY, and fresh human quality acceptance.
- P17 legacy Review discovery/import and candidate confirmation.
- P18 legacy source, command, dependency, and test deletion.
- P54 support-manifest and release assembly.

## Resolution comment

P16D is complete. The package-ordered census reviewed every retained legacy owner against only interim correctness/security, P17 import facts, and P18 cutover obligations. It confirmed one new destructive blocker, LG-03, then closed it at the queue, receipt, and bridge filesystem owners before applying LG-02's one-line stale-Diff clear. LG-01 remains an accepted exact-byte importer fact; all aggregate legacy Diff mechanics and every other non-blocking concern remain deletion-bound.

The retained package graph and root/deletion inventory are exact and dependency-isolated from the 46-file active island. No new legacy capability, architecture, test, migration path, fallback, or cross-store writer was added. The real queue and receipt facts were verified by metadata and digest only and no user bytes changed.

Final reconciliation passes all legacy tests, typechecks, builds, and compiled smoke; canonical v1 verification passes 26 files / 147 tests; all four compiled v1 risk probes and disposable blocker controls pass on Node 26.5.1 with pnpm 11.20.0. P16E is now the dependency frontier. Packed/PTY/human quality acceptance, P17 import, P18 deletion, and P54 release assembly remain unclaimed.
