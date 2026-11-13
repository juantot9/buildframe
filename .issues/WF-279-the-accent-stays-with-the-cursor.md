---
id: WF-279
title: "The accent stays with the cursor; routine edits are Pewter"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-06
---

## Outcome

The focus colour appears only where focus or the cursor is. Your own edits between answers no longer wear the caution brass.

## Finding

The 2026-11-06 critique re-run (P2, "the focus colour appears where nothing has focus"). The detector found accent text with no focus meaning in these places:

- the card paging hints (`↑ Ctrl+K / ↓ Ctrl+J`);
- the Claude Code status line;
- the "Opening the … Review…" row;
- the snapshot loading screen's border, title and phase;
- "Preparing the preview…" and the preview's key hints;
- Home's Commit / Range toggle;
- the continuation diagram;
- the past-Review dialog's relationship line.

There were two related problems:

- History's `▶ now ◀ here` row used the selection colours. With the cursor on a Message, History showed two "you are here" marks.
- Your own edits between answers (`○ edits before #1`) were Brass on the rail and in History, so caution was always on screen.

Five user-facing strings also used `...` instead of `…` outside `--ascii`.

## Interface

- **Neutral colours:** all the leaks above now use Frost Text, or Pewter for "Opening…".
- **`here` rows:** History's `now` and shown-step rows are bold Frost Text, or Brass on a past step, with no wash.
- **Rail chip:** the accent at `now`. On a shown past step it is Brass, like the Diff border.
- **Routine edits:** `○ edits …` rows and rail nodes are Pewter.
- **Ellipsis:** "Loading…", "Loading file contents…", "Loading <path>…" and "Searching the exact Snapshot…" use `…`, with `...` under `--ascii`.
- `DESIGN.md` records all of these.

## Verification

- `keeps routine edits Pewter and gives "here" no selection colours` fails on the old code and passes now.
