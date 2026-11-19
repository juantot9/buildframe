---
id: WF-307
title: "Build the git inspection overlay without symlinks"
status: closed
labels:
  - wayfinder:task
parent: WF-304
assignee: juanan
blocked_by: []
created: 2026-11-19
---

## Finding

Git inspection builds a shadow common directory so Git never reads the
checkout's own `config`, `hooks`, `info` or `worktrees`
(`buildInspectionOverlay`, `packages/workspace/src/gitProcess.ts:711`). Each
other entry is a symlink (`symlinkRequired`, `:688`). On Windows without
Developer Mode, `symlink` fails with EPERM, so every bootstrap ends in
`git-inspection-failed` / `inspection-failed`.

## Evidence (2026-11-19, this repository)

A probe built the overlay with directory **junctions** for `objects`, `refs`
and `logs`, and **hard links** for `HEAD`, `index`, `packed-refs` and
`description`. Both work without privileges. With the structural keys copied
(`filemode = false`, `symlinks = false`, `ignorecase = true`, which Git for
Windows writes into every repository's config):

- `rev-parse HEAD`, `log` and `status --porcelain=v2 --untracked-files=all`
  gave the same answers as plain Git (0 changes on a clean tree);
- `core.hooksPath` from the checkout's config was not visible;
- `rmSync(root, { recursive: true })` removed the junctions without following
  them; `.git` stayed intact and `git fsck` passed.

Without the structural keys, all 682 tracked files showed as changed, so
copying them is required.

## Direction

- On Windows: junctions for directories; hard links for files, falling back
  to a copy when the link fails (`EXDEV` when `%TEMP%` and the checkout are on
  different volumes). A copy is a snapshot taken at inspection time, which is
  what inspection reads anyway.
- Remove the overlay in a way that never follows a junction: assert that each
  entry is a link before removal, and remove links one by one rather than
  relying on recursive removal.
- `gitProcess.ts` is frozen (over budget): put the Windows link rule in a new
  file.

## Verification

- Scenario: on Windows, bootstrap a repository whose checkout config sets
  `core.hooksPath`, `core.fsmonitor` and an alias; inspection reports the
  same changes as plain Git, and nothing from that config runs.
- Scenario: checkout on a different drive than `%TEMP%` (copy fallback).
- Overlay cleanup leaves the real `.git` byte-identical.

## Resolution and evidence (2026-11-19)

- New `packages/workspace/src/gitInspectionLinks.ts` owns how the overlay
  links and how it is removed. `linkOverlayEntry` makes a symlink on macOS
  and Linux (unchanged) and, on Windows, a junction for a directory and a hard
  link for a file, copying the file when the hard link fails.
  `removeInspectionOverlay` unlinks every link first (a junction reads as a
  symbolic link, so it is unlinked and never entered), then removes the rest;
  if an unlink fails, nothing else is removed. It replaces the three recursive
  `rm` calls in `gitProcess.ts`.
- `gitProcess.ts` stays frozen and shrank (27,379 → 26,424 bytes): besides the
  call-site changes, the `INSPECTION_IRRELEVANT_CORE_KEYS` table moved
  verbatim to `inspectionIrrelevantCoreKeys.ts`. The private
  `symlinkRequired` is now `linkRequired`.
- Tests (`gitInspectionOverlay.test.ts`, 4 on Windows, 6 on macOS/Linux):
  both link rules show a directory and a file through the overlay (the
  Windows rule checks the hard link shares the file's inode); the copy
  fallback, reached by making the hard link fail with `EXDEV`, keeps the
  bytes from inspection time; removal leaves linked objects, `packed-refs`
  and `info/exclude` intact and is idempotent. Over a real repository with
  packed refs, a tag, staged, unstaged and untracked changes, and a
  checkout `core.hooksPath`: `rev-parse`, `for-each-ref`, `status
  --porcelain=v2` and `diff --cached` match plain Git; `core.hooksPath` is
  not visible; `git hook run post-checkout` runs nothing (plain Git runs the
  same hook on this machine); after dispose the overlay is gone, the `.git`
  listing and `packed-refs` bytes are unchanged and `git fsck` passes.
- Full suite on Windows with only the native-Windows refusal and directory
  `fsync` patched locally (not committed): 611 tests, 498 pass (469 with the
  earlier rough overlay patch). The overlay and Git process tests all pass.
- Not covered by automation: a real cross-volume checkout (this machine has
  D: and E:, but the test does not write outside the temporary directory);
  a checkout on a network share, where junctions cannot point, fails with
  `inspection-overlay-failed`. When the copy fallback runs, the main
  worktree's `index` is copied too, although Git reads the index from
  `GIT_DIR`; that costs time on very large checkouts on another volume.
- Not run here: macOS and Linux; run `Verify` on the `windows` branch.
