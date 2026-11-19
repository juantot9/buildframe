---
id: WF-307
title: "Build the git inspection overlay without symlinks"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: null
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
