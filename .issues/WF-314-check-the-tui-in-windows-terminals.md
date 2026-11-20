---
id: WF-314
title: "Check the TUI in Windows terminals"
status: closed
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
PowerShell.

Owner decision (2026-11-20): Git Bash is out of scope. herdr is checked as
a terminal too; Windows Terminal and the VS Code terminal are not installed
on the reference machine.

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

## Checklist (2026-11-20)

The checks, setup and result tables are in
[`docs/research/tui-windows-terminals-wf314.md`](../docs/research/tui-windows-terminals-wf314.md);
`node scripts/tui-check-fixture.mjs` builds the repository they use. Until
WF-315, the run needs the native-Windows refusal lifted locally (the note
says how). Windows Terminal and the VS Code terminal are not installed on the
reference machine.

## From WF-306 (2026-11-20)

- At a past step, `a` (and the other keys blocked there) answers "Still
  loading (Loading Diff rows); press a again in a moment." while the Diff
  rows load, instead of "Press Esc to come back to now first.": the loading
  notice is checked first. On Windows the rows load slowly enough that
  `reviewingApplication.test.ts` "says whether the agent changed code while
  answering" fails every run. At a past step the key can never act, so the
  Esc notice should win (`apps/buildframe/src/reviewingActions.ts`).
  Fixed (2026-11-20): the past-step guards now come before the loading guard;
  `test/fast/reviewingActionOrder.test.ts` pins the order. With the refusal
  patched out locally, the scenario passed 3 of 3 runs (it failed every run
  before).

## Done (2026-11-20)

Findings, per-terminal results and method:
[`docs/research/tui-windows-terminals-wf314.md`](../docs/research/tui-windows-terminals-wf314.md).
Reviewing holds up in conhost, WezTerm and herdr from PowerShell; Windows
Terminal and the VS Code terminal were not installed and were not checked.

- Fixed in this work: every Git run of the runtime flashed a console window
  that took the keyboard and mouse (`runGitProcess` now passes
  `windowsHide: true`).
- Filed: [WF-316](./WF-316-narrow-diff-clips-instead-of-wrapping.md),
  [WF-317](./WF-317-narrow-screens-cut-chrome-mid-word.md),
  [WF-318](./WF-318-wheel-in-a-short-files-list-jumps-to-the-ends.md) (shared
  code), [WF-319](./WF-319-input-cursor-glyph-missing-in-conhost.md) and
  [WF-320](./WF-320-paste-on-windows-consoles.md) (Windows).
- Key collisions without the kitty keyboard protocol need no change: no
  listed key depends on telling Ctrl+I, Ctrl+M, Ctrl+H or Ctrl+[ apart.
- Not done: arm64, and the agent-connected keys (Enter sends, F3 previews,
  `x`, `r`, `[`/`]`), which need the refusal lifted and an agent attached;
  they move to WF-315.