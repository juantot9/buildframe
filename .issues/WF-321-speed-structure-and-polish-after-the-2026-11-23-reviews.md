---
id: WF-321
title: "Speed, structure and polish after the 2026-11-23 reviews"
status: open
labels:
  - wayfinder:map
parent: WF-289
assignee: juanan
blocked_by: []
created: 2026-11-23
---

## Destination

The findings of the three reviews of 2026-11-23 are acted on, in this order
(owner decision 2026-11-23: all four packages):

- [docs/research/performance-baseline-2026-11-23.md](../docs/research/performance-baseline-2026-11-23.md)
- [docs/audit/codebase-health-2026-11-23.md](../docs/audit/codebase-health-2026-11-23.md)
- [docs/research/visual-review-2026-11-23.md](../docs/research/visual-review-2026-11-23.md)

Each step is measured or frame-checked, verified, and committed on its own.

## A. Speed quick wins (no visible change)

1. Cache the saved-Snapshot working-tree check the way live reads are cached,
   so manifest, diff and questions reads stop running 7 Git processes each.
2. Open a Review faster: treat the start command's capture as verified, and
   overlap the open reads.
3. First search: read whole files for the search index instead of re-hashing
   the file for every 64-row window.
4. Gate the 2 s idle check so the idle runtime stops spawning ~70 Git
   processes per 20 s.

## C. Ready for Planning and more connectors

1. APP-04: the shell's input, status and preference types move into shell
   modules; `shell*.ts` stops importing `reviewing*.ts`.
2. APP-05: the Reviewing state type moves to a leaf file; `pnpm verify` fails
   on runtime import loops.
3. X-02 / X-03: `workspace.ts` splits into public types and owner setup.
4. AD-01 / AD-03: connect sentences say `!buildframe` for Codex; only the
   connect, status and disconnect commands go to the Codex helper.

## B. Visual polish (frames shown before and after)

The visual review's ranked proposals and polish table, in its suggested order.

## D. Larger changes

1. A persistent screen tree instead of rebuilding it on every key (with WF-214).
2. A private refreshed Git index copy for working-tree checks.
3. A Myers diff for large files with scattered edits.
4. TypeScript 7 and vitest 5, each on its own.

## Branch

`main` (Reviewing and shared code); `planning` merges it in.
