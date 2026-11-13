---
id: WF-141
title: "Reconcile the quality-gate surface"
status: closed
labels:
  - wayfinder:task
parent: WF-140
assignee: juanan
blocked_by: [WF-135]
created: 2026-08-27
---

## Question

What exactly remains for P16E after P16B–P16D: which deferred interaction directives still fail at their owning Application seams, what evidence already stands, and how should packed/PTY and genuine human acceptance be cut into focused children without drifting into P54?

## Acceptance evidence

- Reconcile all 47 ledger headings and four allowed dispositions without changing the ledger.
- Trace every deferred WF-092 directive to current `reviewingModel`, `reviewingView`, `reviewingApplication`, tests, and compiled output. For each, record confirmed gap, already-satisfied behavior, owning private seam, and focused child; do not infer a defect from the historical wording alone.
- Exercise current source/compiled frames where needed to distinguish historical full-screen replacement, target-change weight, continuation disclosure/opacity/in-place return, commit-browser stability/click affordance, and per-pane command-chrome changes.
- Enumerate the exact current private pack graph (`@neoflow/workspace`, `@neoflow/local-runtime`, `@neoflow/app-source`), tarball content/manifest constraints, OpenTUI native optional package, executable route, and real-PTY checks. A disposable pack dry run may be used, but no release manifest, coordinate, installer, or publishing surface is added.
- Define sanitized disposable human scenarios that exercise only P16E's semantic and UX acceptance. Do not claim or simulate human acceptance.
- Confirm the current P16D checkpoint still has 47 settled findings, independent legacy/v1 verification, all four risk probes, and unchanged user data; rerun only focused read-only checks needed to establish this child.
- This child changes only WF-141 and WF-140 issue records. `git diff --check` passes; no source, test, manifest, lockfile, script, configuration, package Interface, durable byte, or user data changes.

## Authority

- Owning map: [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)
- Deferred directives and prior human evidence: [Prove Live Changes integration and human acceptance](./WF-092-prove-live-changes-integration-and-acceptance.md)
- Verification lanes: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)
- Packed renderer evidence: [Decide whether the OpenTUI renderer choice survives public distribution](./WF-059-decide-renderer-survives-public-distribution.md)

## Seam decision

This is a read-only reconciliation, not a design-by-cleanup pass. A historical directive becomes work only if current behavior still contradicts it. Group changes by the private Application behavior they alter, keep packed/PTY evidence separate from UI implementation, and reserve genuine acceptance for the actual human.

## Constraints

- Do not edit production or test source while auditing.
- Do not create a generic modal, renderer, packaging, PTY, or acceptance framework.
- Do not run a full human scenario or credit prior P16B acceptance as fresh P16E evidence.
- Do not begin P17, P18, or P54.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

The read-only reconciliation confirms 47 unique ledger headings, each with `Disposition`, `Rank`, and `Decided`, and no finding-level proposal remains. P16D's independent legacy/v1, four-risk-probe, package-isolation, and user-byte evidence still governs the unchanged source checkpoint.

Five deferred interaction gaps remain real in both source and compiled Application output:

1. Versions and historical Question navigation still issue ordinary `show-review` effects and replace the whole reading screen; no historical dialog state or overlay exists.
2. A changed composer target is disclosed twice globally in a two-row danger condition even though the composer already owns a precise title and blocked-action footer. The safety, preserved text, generation ordering, and later Attachment check already hold.
3. Moved-HEAD choice semantics and the bounded explicit dialog already hold, including saved-endpoint no effect and current-HEAD exact transition. The residue is presentation: `HEAD MOVED` remains persistently above the Diff, the dialog uses the transparent terminal-workspace palette, and an accepted continuation deliberately emits `show-home` before the new Review appears rather than returning in place.
4. The commit browser keeps a fixed row window, but selection clears its three preview rows during every asynchronous inspection, making the lower controls jump. Neither commits nor Home/history choices have pointer targets even though Home says `Click selects`.
5. Reviewing command chrome still changes wholesale by focused pane, hiding useful commands as focus moves. Configuration's opaque control-plane palette is already correct and needs no work.

These gaps stay private to the Application model/view/effect seam. The focused sequence is: bounded historical reading dialog; focused opaque in-place continuation; local target-change disclosure plus pane-stable Reviewing command chrome; stable clickable Home/comparison/history choices. No Workspace command, projection, durable record, package Interface, or accepted semantic needs to change.

The private packed route is also viable without P54 work. `pnpm pack --skip-manifest-obfuscation` produces byte-reproducible Workspace, Local Runtime, and Application tarballs containing only `package.json` plus `dist` (37, 21, and 25 entries). Their graph is Workspace ← Local Runtime ← Application, with Application also declaring exact OpenTUI `0.5.1`; the installed bin is `neoflow-v1-dogfood`. A disposable offline install using local-tarball overrides and the repository lock's external versions imported the exact package roots, selected `@opentui/core-darwin-arm64@0.5.1`, and ran installed `--help` through automatic FFI re-execution with empty stderr. Ordinary pnpm manifest obfuscation was observed reordering two packed dependency keys across otherwise identical Application packs; the evidence route therefore uses pnpm's documented skip flag. Choosing permanent release assembly remains P54.

Fresh human evidence will use only sanitized disposable roots: one scripted retained Question/Response whose source then moves for Live Changes, Versions, historical dialog, and target-change behavior; one moved-HEAD fixed range for both continuation choices; and one short local commit graph for click/stability and pane-command discovery. The actual acceptor—not automated PTY or the agent—must report outcome and confusion. All audit tarballs, installs, and controls were removed. This child changes only issue records, and `git diff --check` passes.
