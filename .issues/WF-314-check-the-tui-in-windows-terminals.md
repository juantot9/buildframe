---
id: WF-314
title: "Check the TUI in Windows terminals"
status: open
labels:
  - wayfinder:research
parent: WF-304
assignee: null
blocked_by: []
created: 2026-11-19
---

## Question

The renderer works in conhost (evidence in
[Run BuildFrame natively on Windows](./WF-304-run-buildframe-natively-on-windows.md)).
Does the whole Reviewing experience hold up in the terminals Windows users
actually use, without the kitty keyboard protocol?

## Terminals

Windows Terminal, conhost, WezTerm, and the VS Code terminal. Run each from
PowerShell and from Git Bash.

## What to check

- Every binding in the `?` list works. Without kitty keyboard some keys
  cannot be told apart (Tab and Ctrl+I, Enter and Ctrl+M, Esc and Alt
  sequences); list which bindings collide and in which terminals.
- Mouse: click navigation, movement expansion, wheel, native selection.
- Paste (bracketed), copy (system clipboard and OSC 52; conhost has no
  OSC 52), focus reports, light/dark detection.
- Resize, `--no-color`, ASCII-safe mode, wide characters.
- Exit restores the console (cursor, mouse mode, alternate screen) after
  normal exit, Ctrl+C, and closing the window.
- Startup to a usable Home stays within the WF-015 budget.

Note: the probe showed OpenTUI guessing the terminal from an inherited
`TERM_PROGRAM`; check that detection does not mislabel a Windows console.

## Output

A findings note in `docs/research/` with a terminal × check table, and a
ticket for each binding or behaviour that needs a change.

## From WF-306 (2026-11-20)

- At a past step, `a` (and the other keys blocked there) answers "Still
  loading (Loading Diff rows); press a again in a moment." while the Diff
  rows load, instead of "Press Esc to come back to now first.": the loading
  notice is checked first. On Windows the rows load slowly enough that
  `reviewingApplication.test.ts` "says whether the agent changed code while
  answering" fails every run. At a past step the key can never act, so the
  Esc notice should win (`apps/buildframe/src/reviewingActions.ts`).
