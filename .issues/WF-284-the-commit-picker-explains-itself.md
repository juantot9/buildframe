---
id: WF-284
title: "The commit picker explains itself"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-09
---

## Outcome

"Review a commit or range" can be opened with the mouse. Once open, it says what to do and what went wrong inside the card, and its typed inputs behave the way people expect.

## Finding

Owner: "Did we check what we see when we click on 'Review a commit or range'?" We hadn't, beyond one empty commit with Enter. A walk-through showed these problems:
- **Mouse:** a click only selected the choice, and nothing said Enter was needed to open it.
- **Merge at HEAD:** the picker opened on a blank preview with no Enter. "Choose a parent with h/l" flashed in the status line, and `[h/l]` was only listed in `?`.
- **HEAD~N:** the input started at `2` and typing appended, so `3` became `23` and an error.
- **Input hints:** both inputs' footers said "Type a commit, branch, or range." That was wrong for `n`, and for `r` it repeated the card in different words.
- **Errors:** they emptied the preview and showed only in the status line ("That many first-parent commits are not available locally."). They vanished on a timer and then appeared on Home.
- **Narrow terminals:** at 70 columns, `[Tab] commit / range` dropped out, so range mode couldn't be found.
- **Loading text:** "Loading local commit history" showed in both the card and the status line.
- **Preview:** "From"/"To" didn't line up, and "Parent"/"From" were bare hashes.

## Interface

- **Pointer:** a click on the already-selected Home choice or Previous Review opens it, as Enter does. A double-click therefore opens.
- **In-card reasons:** the preview gives the reason, in plain words, and the status line stays clear:
  - merge: "A merge has two parents. [h/l] picks which one to compare against.";
  - unknown name: "No commit, branch or tag by that name here.";
  - too far back: "This repository doesn't have that many commits before HEAD.";
  - anything else: "Git couldn't compare that here.".
- **Merge at HEAD:** the footer shows `[h/l] parent` whenever a merge is selected in commit mode.
- **HEAD~N:** labelled "Commits back from HEAD (HEAD~N)" with the footer "Type how many commits back from HEAD, from 1 to 500." The suggested `2` is replaced by the first digit typed. Left arrow or backspace keeps it as editable text instead.
- **`r` input:** labelled "Commit hash, branch or tag". Its footer reads "Shows that one commit's changes." or "Shows everything from that commit up to HEAD.", depending on the mode. Enter reads `[Enter] compare`.
- **Footer ranks:** `[Tab] commit / range` ranks above `[/] search`.
- **Loading:** on Home, loading shows in the card only.
- **Preview layout:** labels are padded to one width, and Parent/From show hash plus subject.
- **HEAD~N semantics:** unchanged. It follows first parents, as git does.
- **Docs:** `DESIGN.md` Home records the in-card rule, the typed inputs and the pointer behaviour.

## Verification

- **New test:** `explains the commit picker where you look…` fails on the old code, timing out at the merge explanation. It covers:
  - one click selects and a second opens;
  - the merge explanation in the card, with `[h/l] parent` and an empty status line;
  - `l` picks a parent, and the preview names it with aligned labels;
  - `n` then `9` reads `> 9`;
  - HEAD~9 says it is too far back, in the card, with the status line empty.
- **Updated test:** `click-selects stable Home choices…` now opens the selected Previous Review by clicking it.
- **Frames checked:** a merge repository with side branch, range mode, `n`, `r` and a bad ref, at 132 and 70 columns.
- **Full run:** `pnpm verify` passes, 648 tests.
