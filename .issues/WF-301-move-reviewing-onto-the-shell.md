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
