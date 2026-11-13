---
id: WF-137
title: "Refuse symlinked legacy private paths"
status: closed
labels:
  - wayfinder:bug
parent: WF-135
assignee: juanan
blocked_by: [WF-136]
created: 2026-08-27
---

## Problem

LG-03 proves three destructive path escapes in the retained legacy TUI. Queue persistence follows a repository-controlled `.neoflow` directory symlink and can replace an outside `review.json`; bridge startup follows a planted state `neoflow` directory symlink, chmods its target, and unlinks/replaces an outside regular `socket`; receipt persistence writes its hashed tree through the same state symlink.

## Acceptance evidence

- Queue load/save accepts a missing or real `.neoflow` directory but fails closed for a symlink or non-directory before reading or writing. A symlink/non-regular `review.json` is rejected rather than followed or replaced.
- Receipt load/save treats the configured state base as operator-selected, but every application-owned descendant (`neoflow`, `workspaces`, and the workspace-hash directory) must be a real directory. Symlink/non-regular receipt files are rejected. Missing real descendants are still created with the existing mode request and files remain mode `0600`.
- Bridge startup creates or validates only its real private directory before chmod. A symlink/non-directory is rejected without changing its target; an existing non-socket or symlink endpoint is rejected and preserved rather than unlinked. A real inactive socket may still be retired, and normal endpoint cleanup remains intact.
- Disposable controls reproduce all three old escapes and show outside bytes/modes changing. Against the repair, the same controls reject while outside sentinel bytes and directory modes remain exact. Normal queue, receipt, bridge, restart/reconcile, and missing-file behavior remains unchanged.
- The real ignored `.neoflow/review.json` retains its exact SHA-256, bytes, mode, and metadata; its pre-existing mode-`0755` parent is accepted without chmod. No real receipt, v1 State, or other user data is read for content or changed.
- Add no persistent legacy test, shared migration utility, package export, compatibility layer, or new capability. Existing legacy tests, typechecks, builds, smoke, v1 verification, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.

## Authority

- Finding: [`pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md), LG-03
- Discovering audit: [Audit the retained legacy blocker surface](./WF-136-audit-retained-legacy-blocker-surface.md)
- P16D constraints: [Review the legacy packages for blockers](./WF-135-review-legacy-packages-for-blockers.md)
- Import/cutover contract: [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)

## Seam decision

Repair only the three legacy owners at their filesystem boundary. The operator may intentionally select or symlink the configured checkout/state base; Neoflow's own child directories and source/endpoint files may not be symlinks. Validate before chmod/read/write, create missing descendants one level at a time, and keep errors visible. Do not introduce P17 provenance, infer authority from permissions, or harden unrelated legacy paths.

## Constraints

- Preserve every queue/receipt JSON shape, byte serialization, retention rule, path hash, atomic rename, and failure diagnostic contract except the new unsafe-path refusal.
- Preserve bridge protocol, message bounds, handshake, stale-socket convergence, modes, and callbacks.
- Do not chmod an existing queue directory or any rejected target.
- Ignore concurrent same-user path replacement; the operator remains trusted.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

LG-03 is closed at the three owning filesystem seams. Queue persistence now requires a real `.neoflow` directory and regular non-symlink queue file before read/write. Receipt persistence allows an operator-selected configured base but creates and validates `neoflow`, `workspaces`, and the hash directory one level at a time, rejecting symlink/non-directory descendants and non-regular source files. Bridge startup validates its private directory before chmod, preserves non-socket/symlink endpoints, still retires an inactive real socket, and verifies the newly bound socket and modes.

The pre-repair disposable controls changed outside sentinel bytes/modes in all three cases. The repaired controls reject every directory/file symlink and regular endpoint while preserving all outside bytes and the outside directory's `0755` mode; a SIGKILL-left stale socket still converges, ordinary close removes its endpoint, and checkout/state base aliases remain accepted. One overbroad planning sentence was corrected after a same-user path-swap probe: Node owns part of Unix socket close cleanup, so this child makes no concurrent same-user replacement guarantee under the trusted-operator model. That did not weaken any planted-before-startup guard in LG-03.

No persistent test or helper Module was added. Existing queue, receipt, bridge, reconciliation, and protocol tests pass; full `pnpm legacy:verify` passes all five packages and compiled smoke. Canonical v1 verification passes 26 files / 147 tests, all four compiled risk probes pass, and `git diff --check` passes on Node 26.5.1 with pnpm 11.20.0. The real ignored queue remains a 2,119-byte mode-`0600` regular file with SHA-256 `367d0c657b2998d7ed0d8ef9f8bb7cd60e09ad0936b8aebac419deb4d6efb727`; its existing `0755` parent was not chmodded, no receipt appeared, and no user data or package Interface changed.
