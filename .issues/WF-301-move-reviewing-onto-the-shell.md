---
id: WF-301
title: "Move Reviewing onto the shell"
status: open
labels:
  - wayfinder:task
parent: WF-289
assignee: null
blocked_by: [WF-297]
created: 2026-11-18
---

## Question

Reviewing still runs on its own application class, composed of the shell's
parts (WF-297). Make it a screen defined with `defineScreen`, so the shell
owns input, rendering and Home for every screen.

## Scope

- Move keyboard, pointer, wheel, selection and composer wiring out of
  `ReviewingView` into the shell; Reviewing's dialogs become shell-routed
  layers (today's `extend` scaffolding shrinks as each moves).
- Home becomes shell-owned and built from each screen's `home` rows
  (WF-297's UX brief: one card, grouped, Planning rows only when Planning is
  on).
- The spinner and notice timers become screen-reported (`animating`,
  `said`).
- The import loop between `reviewingModel.ts` and `reviewingActions.ts` goes.
- Configuration (`c`) and action checks (`!`) move into the shell. Until
  then a `createShell` screen answers them with "… opens from Reviewing for
  now." (WF-297 6e).
- `defineScreen` gains `home` (the rows a screen adds to the Home card).
- Behaviour checks move to renderer-free screen tests; the frame suite keeps
  layout and rendering only.

## Constraint

Every frame, key and setting unchanged at every commit, as in WF-297.

## When

Alongside Planning (WF-300): Home rows from two screens are its natural
proof.

## Branch

Reviewing work, so it lands on `main` (2026-11-18 split). Planning picks it up
when `planning` next merges `main`.

## Progress (2026-11-21)

Each step frame-identical, with the three frozen files only shrinking (view
237.4 → 222.9 KB, model 259.3 → 251.6 KB, application 67.9 → 67.0 KB):

- `682c980` The model ↔ actions import loop is gone: the Files list and tree
  helpers are in `reviewingFileList.ts`, the file glyphs in
  `reviewingFileGlyphs.ts`, and the actions read the selected Diff row
  through the model.
- `34f00a9`, `8823514` Configuration (`c`) and action checks (`!`) are shell
  parts: `shellConfiguration.ts` (window keys and drawing for any rows),
  `shellDisplaySettings.ts` (theme and background), `actionChecksPanel`.
  `createShell` answers both, saving settings as they change; screens add
  rows through `settings` and lines through `checks`. Reviewing draws both
  through the same parts.
- `800ab7c` The spinner and notice timers are one shell part, `ShellPulse`;
  screens report `animating` and `advance`.
- `040a012`, `2a0c934` Home's card and launcher are shell parts
  (`shellHome.ts`), and `createShell` owns Home (`shellHomeScreen.ts`):
  `defineScreen` gains `home` (views and rows), Home reads every screen's
  views together, opens first, and Esc returns to it. Rows are listed in
  screen order with no group headings until a second screen adds rows
  (WF-300 decides the grouping). Pointer clicks on the shell's Home wait for
  the input step below.

Remaining: Reviewing itself becomes a screen. Its keyboard, pointer, wheel,
selection and composer wiring leave `ReviewingView`; its dialogs become
shell-routed layers; its Home rows come from `home`; its loader stays its
own behind the screen until views can carry it. Then the behaviour tests move
to renderer-free screen tests.
