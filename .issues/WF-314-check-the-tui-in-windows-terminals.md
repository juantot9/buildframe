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
