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
5. Owner request 2026-11-23: the Files pane loads every file at once and
   scrolls as one list, instead of 64-file windows the app pages through.
   The Workspace allows larger reads; the stored 64-file records stay.

Done: A1 (`f6f1f7d`): saved-Snapshot reads 147 → 1 ms with a live
subscription. Tried and reverted for A2: starting the watcher on plain live
reads made a read right after an edit miss it.

## C. Ready for Planning and more connectors

1. APP-04: the shell's input, status and preference types move into shell
   modules; `shell*.ts` stops importing `reviewing*.ts`.
2. APP-05: the Reviewing state type moves to a leaf file; `pnpm verify` fails
   on runtime import loops.
3. X-02 / X-03: `workspace.ts` splits into public types and owner setup.
4. AD-01 / AD-03: connect sentences say `!buildframe` for Codex; only the
   connect, status and disconnect commands go to the Codex helper.

Done: A3 (`509316e`) first search 2,693 → 193 ms on a 20,000-line file;
A5 (`4d0db13`) the Files pane holds up to 10,000 files as one list. A4 waits
for the windows branch (its overlay code is WF-307's) and an owner decision
on checking less often.

Done in C: C1+C2 (`87e51f1`) the shell no longer imports Reviewing, and
`check:dependencies` fails on runtime import loops (two found and broken);
C3 (`63da487`) baseTypes.ts and workspaceContracts.ts; C4 (`e35590d`)
connect sentences from the support facts, `!buildframe` for Codex, doctor
works inside Codex. Left for WF-300: owners declaring their publish needs,
so `#publishCommitted` stops naming them.

## B. Visual polish (frames shown before and after)

The visual review's ranked proposals, in its suggested order. Owner
decision 2026-11-24: theming, layout and spacing only; labels, copy and
glyph choices stay (the polish table's wording rows are out).

Done: B1 (`fd63657`) proposals 2, 3, 7, 9 (answer tone), 11, 12 and the
Files/History inset; critique 27 → 29/40. The mark column stays 3 cells
(owner, 2026-11-24). B2: dialog backdrop (1) and card inset (6); History
stays short whenever the card holds the Message, paged or not (owner,
2026-11-24). Dropped: badge-only colour on the card title (OpenTUI draws a
border title in one colour) and a Sage `↳` (it would split every answer row).
Left: side-by-side room (4), loading frame shape (5), theme keyword hues
(10), wrapped-row continuation (m).

## D. Larger changes

1. A persistent screen tree instead of rebuilding it on every key (with WF-214).
2. A private refreshed Git index copy for working-tree checks.
3. A Myers diff for large files with scattered edits.
4. TypeScript 7 and vitest 5, each on its own.

## Branch

`main` (Reviewing and shared code); `planning` merges it in.
