---
id: WF-136
title: "Audit the retained legacy blocker surface"
status: closed
labels:
  - wayfinder:task
parent: WF-135
assignee: juanan
blocked_by: [WF-093]
created: 2026-08-27
---

## Question

Beyond LG-02's already-settled stale rendered diff, does any retained legacy source create an interim safety defect, block P17's exact importer, or leave P18 unable to perform the hard cutover?

## Acceptance evidence

- Enumerate every retained source/test file, manifest, root script route, and one-shot `nvim/` file owned by `apps/tui`, `apps/cli`, `packages/core`, `packages/ai-harness`, and `packages/pi-connector`; generated output and installed dependencies are distinguished from source ownership.
- Review the six legacy areas in that order for only correctness, hostile-input security, migration, and deletion/transplant blockers. Record each plausible lead and why it is confirmed, already covered, or deletion-bound.
- Reconfirm LG-01 without reading or printing user content: exact queue/receipt path derivation, accepted queue/receipt format versions, fresh-file modes, bounded-retention facts, and the pre-existing-directory permission caveat all match P17's authority.
- Inventory every legacy root command/build/smoke dependency and package edge P18 must delete. Prove active v1 source and manifests still have no legacy dependency, fallback, shared store, or compatibility import.
- Confirm whether LG-02 is the only executable P16D repair. Any additional confirmed blocker gets a separate linked child before implementation; unconfirmed or non-blocking cleanup does not become work.
- Run the current legacy tests and typechecks plus the v1 dependency firewall as read-only evidence. `git diff --check` passes.
- This child changes only WF-136 and WF-135 issue records. It does not edit source, tests, manifests, lockfiles, scripts, configuration, legacy/user data, or the finding ledger unless a genuinely new confirmed blocker requires an explicit decision.

## Authority

- Owning map: [Review the legacy packages for blockers](./WF-135-review-legacy-packages-for-blockers.md)
- Import/cutover contract: [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)
- Settled legacy rulings: [Disposition the root configuration and legacy findings](./WF-068-disposition-root-and-legacy-findings.md)
- Existing facts: [`pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md), Legacy packages

## Seam decision

This is a read-only blocker audit, not a general quality review. Use the P17/P18 contract as the filter: if removing the legacy source after import evidence would make a concern disappear without risking current users or required bytes, the concern is deletion-bound and earns no repair. Stop and create a focused decision only for a confirmed blocker.

## Constraints

- Do not inspect the contents of real ignored queue/receipt files; path, metadata, and digest-only checks are sufficient where repository data existence matters.
- Do not run a formatter/linter or dead-code sweep, propose architecture for legacy, or add coverage to code scheduled for deletion.
- Do not change source while auditing.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

The blocker census covered the exact retained surface: 41 TypeScript production files / 7,613 lines across the five legacy packages, 20 test files / 2,646 lines, five manifests, five tsconfigs, two one-shot Neovim files / 165 lines, all eight direct legacy root routes, six composite root routes, five generated `dist` trees, README instructions, and lockfile importer entries. The dependency graph remains inward-only (`tui → ai-harness/core`, `cli → core`, `ai-harness → core`, `pi-connector → core`); 46 active source files and all four active manifests have zero legacy import/dependency edges, and the v1 firewall passes.

One new blocker was confirmed and added as LG-03, bringing the ledger to 47 fully decided findings. Disposable fixtures proved that the queue writer follows a repository `.neoflow` directory symlink and replaces an outside `review.json`; bridge startup follows a state `neoflow` directory symlink, chmods its target, and replaces an outside regular `socket` file; and the receipt writer creates its hashed tree through the same state symlink. This is destructive, ranks Legacy / first, and requires a separate fail-closed private-path child before LG-02. LG-02's stale rendered diff remains the only other executable P16D repair.

LG-01 was re-proved without printing user content. The queue remains the regular 2,119-byte mode-`0600` `.neoflow/review.json` with SHA-256 `367d0c657b2998d7ed0d8ef9f8bb7cd60e09ad0936b8aebac419deb4d6efb727`; its existing `.neoflow` directory is mode `0755`, directly confirming the accepted pre-existing-directory caveat. The canonical-path SHA-256 still derives the receipt location, no receipt exists there for this checkout, queue parsers still accept raw/v1/v2 annotations, receipt parsing remains v1, and terminal retention remains 100. No queue or receipt content was displayed or changed.

Other reviewed leads remain deletion-bound rather than becoming repairs: loaded legacy queue facts cannot acquire v1 authority and P17 already requires exact-byte import plus human confirmation; legacy Ink can carry some DCS/BEL input from Diff, Pi, or planted data, but the probe established no durable mutation and a complete correction would duplicate the active rendered-text policy across a product scheduled for deletion; linear bridge/connector fragment accumulation and unbounded Git-child lifetime fail by availability, not mutation; Mock, generic protocol, CLI/Neovim aliases, README routes, and legacy package exports are all explicit P18 deletion inventory. No importer format/path gap, automatic replay, cross-store write, active fallback, or additional cutover prerequisite was found.

Current legacy tests and typechecks pass for all five packages on Node 26.5.1 with pnpm 11.20.0; the v1 dependency firewall and `git diff --check` pass. This audit changed only its issue records and the ledger entry required by the newly confirmed blocker; no source, test, manifest, lockfile, script, configuration, or user data changed.
