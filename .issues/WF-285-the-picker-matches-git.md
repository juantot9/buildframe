---
id: WF-285
title: "The picker matches git"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-09
---

## Outcome

Every comparison the commit picker previews is proven against real git. Its preview never shows an older answer while you type.

## Finding

Owner: "Could we check if that is working as intended?", about HEAD~3 after a merge landing on a commit that looked further back.

- **Intended behaviour:** WF-028 and WF-051 (2026-07-30) define HEAD~N as a first-parent `HEAD~N` start, as git does.
- **Endpoints:** the Workspace resolves them as specified:
  - commit = parent→commit, with an explicit parent for merges;
  - range = commit→HEAD;
  - HEAD~N = `HEAD~N`→HEAD.
- **Git cross-check:** the walk-through repository was rebuilt exactly, and git agrees with every count the picker showed: commit 1 and 3, range 4 and 6, merge parent 1.
- **One apparent mismatch:** "1 changed file" after `n` was a frame taken while the HEAD~N input was still open. The card still showed the previous range preview, which reads as the answer to the number being typed. That is a real defect.
- **Label drift:** WF-028 names range endpoints Start/Head. WF-284 had renamed them From/To.
- **Not a regression:** the left-margin selection rail approved in WF-051 belonged to the source removed in WF-185 (2026-09-05). The current app never had it, and WF-282 to WF-284 did not remove it.

## Interface

- **Range labels:** range mode names its endpoints Start and Head again. Commit mode keeps Parent and Commit, with aligned labels.
- **While typing:** with a hash or HEAD~N input open, the preview says what Enter will compare:
  - "Enter compares HEAD~N up to HEAD.";
  - "Enter compares that commit with its parent." / "…up to HEAD.".
  It never shows a changed-file count for an earlier selection.
- **Docs:** `DESIGN.md` records both, and that HEAD~N follows first parents.

## Verification

- **New test:** `compares exactly what git compares: commit, range, merge parent and HEAD~N`. It builds a merge history, then checks each preview's changed-file count against `git diff --name-only`:
  - the merge against the parent `l` picks;
  - a single commit against its parent;
  - a range up to HEAD;
  - HEAD~2 and HEAD~3, checking that while typing no count is shown.
- **App tests:** 104 pass.
- **Full run:** `pnpm verify` passes, 649 tests.
