---
id: WF-275
title: "Check phase, last accent leaks, whole state words, and plainer wording"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-06
---

## Outcome

The other four items from the 2026-11-06 critique of WF-269..273 (30/40) are done. The check before saving reads as checking everywhere. The accent marks only focus. State words and file names stay readable. The repeated and internal wording is gone.

## Finding

- **P2, check phase.** After Enter, while the line was checked, the composer still read `New Message` with its editing hint. The Diff title said `composing`, and the footer offered `[Enter] send [F3] preview [Esc] discard`, though keys are locked then. History and the status line said checking. The local row said "Checking exact target". Once saved, the Diff title still said `saving` while the composer said `Saved`.
- **P2, accent outside focus.** The accent still appeared on:
  - the "is working on it" sentence and the working, checking and saving badges and card titles, through the `accent` badge tone;
  - the "+ local" row's wash;
  - the past-step `┃` line and history-row segment;
  - the old Question card;
  - the discussion card's border and title;
  - the unchanged-content gutter.
- **P2, text cut where the meaning is.**
  - Stack rows were measured in characters against an estimated width, so the state word overflowed into "✗ faile".
  - History cut locations from the front ("…ew.txt:1") and counts mid-word ("…les").
- **P3, repetition and wording.**
  - A failure or lost-turn sentence printed three times: in the Diff card, in full in History, and in the status line.
  - The first-run Home said "since your last commit, including uncommitted changes" twice.
  - Other wording: "[Enter] send anyway" (CONTEXT.md avoids that phrase), and "lost track of this turn".

## Interface

- **Check phase:**
  - The composer title reads `Checking`, with the hint "Checking the line still matches; nothing is saved yet.".
  - The Diff title reads `checking`, then `saving`, then `saved`.
  - The footer reads "Keys you press now apply once it's saved.".
  - The local row reads "Checking the line · not sent".
- **`toneColor`:** the `accent` status tone renders as Frost Text, so work in progress is shown by the spinner's motion. The Question card, the discussion card and the content gutter go through `selectionColors` or a check on `shownFocus`. The local row uses `selectionColors(state, 'questions')`. The shown past step is brass, on History's line and on the history-row segment.
- **Text fitting:**
  - Stack rows reserve the prefix and suffix by display cells, with 2 cells spare, and `fitDisplayCellsEnd` shortens only the preview.
  - `fitLocation` keeps `path:line` if it fits, otherwise `basename:line`.
  - A multi-file count is dropped whole.
- **Wording:**
  - In History, the selected outcome sentence is a one-line preview when the Diff card shows it whole.
  - The first-run Home drops the duplicate line under `NO REVIEW OPEN`, and the box is 11 rows.
  - "[Enter] send it".
  - "Neoflow never heard back about this Message." and "#N: Neoflow never heard back about it.".
- `DESIGN.md` (Harbor Cyan, State badge, text fitting) records these rules.

## Not done

- **Naming the Message in "An earlier Message here never reported back".** The gate's requirements carry invocation identities, not Message numbers. Naming it needs a workspace contract change.
- **The Home error's "Try again".** A key-specific wording didn't fit every place `semanticError` is used, and it pushed the cause off the two-row status line at 60 columns.

## Verification

- New: `tells one story while a Message is checked before saving`, using `TimedWorkspace.holdInspection`.
- New: `keeps each state word whole in a stack of Messages on one line`. On the old code its 100x30 stack row needs 2 display rows; now it needs 1.
- Both fail on the old code.
- Updated: the lost-turn tests use the new wording; the outcome check reads the Diff card; the wheel test reads only the Files pane, because History now names `file-0.ts` by its basename.
- All 96 app tests pass.
