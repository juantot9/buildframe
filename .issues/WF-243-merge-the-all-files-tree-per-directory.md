---
id: WF-243
title: "Merge the All-files tree per directory"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-16
---

## Outcome

In the `All` file scope every directory appears exactly once in the Files tree, and `j`/`k` walks each folder once whether it holds changed, unchanged, or both kinds of files.

## Finding

`review.live-files` sorts changed files before unchanged ones, so the `All` window is two path-sorted groups rather than one global path order. `reviewFileTreeNodes` assumed the single global order and re-emitted a directory whenever the list returned to it; a folder holding a changed and an unchanged file therefore appeared twice (`/src` … `/src`). Selection is stored by directory path, so `findNodeIndex` always resolved the first duplicate and the next `j` jumped back up to it — the owner's observed loop.

## Interface

`reviewFileTreeNodes` assembles a directory tree from the bounded window and flattens it depth-first. Every directory is emitted once; each level lists changed content before unchanged content in path order. Collapse, depth, and the first-flat ordinal per directory stay exact, and no projection, record, or wire frame changes.

## Acceptance

- [x] One folder row per directory in `All`, including folders that mix changed and unchanged files.
- [x] `j`/`k` visits every row once and never jumps back to an earlier folder.
- [x] Collapse, depth, and flat ordinals keep working for nested folders.
- [x] Focused fast and Application scenarios, full verification, the compiled dogfood probe, and `git diff --check` pass with unrelated work untouched.

## Resolution

`reviewFileTreeNodes` now builds a real directory tree from the window instead of trusting the input order: files are inserted by their path segments, ancestors are marked when a changed file passes through them, and the tree is flattened depth-first with each level ordered changed-first then by path. The first flat ordinal of each directory is tracked during insertion so collapsed nodes, `fixupCollapsedSelection`, and the Files-pane paging keep their exact coordinates. The view and the model share this one function, so the rendered rows and the navigation nodes cannot disagree.

## Completion evidence (2026-09-16)

- `apps/neoflow/test/fast/reviewFileTree.test.ts`: a window that groups changed files first (`review.txt`, `src/two.txt`) and unchanged files second (`docs/readme.md`, `src/one.txt`) flattens to `review.txt`, `src/`, `src/two.txt`, `src/one.txt`, `docs/`, `docs/readme.md` with exactly one `src/` node; nested depth, first-flat ordinal, and collapse stay exact.
- `apps/neoflow/test/scenarios/reviewingApplication.test.ts` gains a real-Application scenario with `src/two.txt` changed and `src/one.txt`/`docs/readme.md` unchanged: `All` renders exactly one `src/` row, and the `j` walk visits `src/`, `src/two.txt`, `src/one.txt`, `docs/`, `docs/readme.md`, never returning to an earlier `src/`.
- Verification on Node 26.5.1: the full suite passes 44 files / 378 tests; lint, format, dependency firewall, typecheck, clean builds, build smoke, the compiled dogfood fault probe, and `git diff --check` pass. The unrelated repository-health backlog remains untracked and untouched.
