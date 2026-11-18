---
id: WF-297
title: "Split the app into a shell and screens"
status: open
labels:
  - wayfinder:task
parent: WF-289
assignee: null
blocked_by: []
created: 2026-11-17
---

## Question

Planning needs a second top-level screen, and the app has one screen fused
with its infrastructure. Decide the seam between an app shell and a screen,
make Reviewing the first screen behind it, and split the scenario test with
it. This replaces WF-214's pane-by-pane split: panes become internal modules
of the Reviewing screen.

## Evidence (at `f7e4ac7`)

- One state object for everything: `ReviewingApplicationState`
  (`reviewingModel.ts:437-543`); `state.screen` is
  `'loading'|'home'|'review'|'failed'` and is checked 39 times in the model,
  19 in the view, once in the app.
- Input: `handleInput` (`reviewingModel.ts:2925-3230`, 306 lines) mixes
  dialog guards, global keys (q, ?, c, Esc, !, Tab, Ctrl+C) and 73
  `data.text === '…'` comparisons. The View also intercepts keys itself
  (`reviewingView.ts:6626-6734`). The `?` list is written separately
  (`reviewingView.ts:4718-4811`), so help can drift from dispatch.
- Dialogs: about a dozen optional state fields (`reviewingModel.ts:486-530`);
  a new dialog touches 6–7 places, including the hard-coded overlay list in
  `screen()` (`reviewingView.ts:6267-6276`) and hover suppression
  (`:6504-6516`).
- A second screen touches: the state union, `handleInput`,
  `handlePointerTarget`, four global-key guards (`reviewingModel.ts:2968-3001`),
  the effect union (`:545-635`) and `#runEffects`
  (`reviewingApplication.ts:534-600`), `ActiveRoute` (`:128-143`), `screen()`,
  `footerMode`, `actionLookupItems`, the header, and the hard-coded root id
  `'reviewing-screen'` (`reviewingView.ts:6916`, `:6958`, `:6984`).
- Generic code typed against Reviewing: theme and presets
  (`reviewingView.ts:94-406`), primitives (`:408-672`), glide and wheel
  (`:6369-6491`), render loop (`:6895-6964`); preferences mix app settings
  with Reviewing layout (`userConfiguration.ts:76-90`).
- All Workspace I/O already sits in `reviewingApplication.ts` (42 `read`
  sites, one `#execute`), and the model already returns effects; both are
  the seams to keep.
- Tests: almost all behaviour is proved through terminal frames
  (`test/scenarios/reviewingApplication.test.ts`, 6,004 lines, 62 tests);
  only `test/fast/reviewingModelSource.test.ts` drives the model directly.

## Direction (owner review of the screen interface before code)

- **Shell** owns: renderer and render loop, input routing, global keys,
  dialog stack, theme, settings, glide and wheel, notices, Workspace I/O and
  subscriptions, and the effect runner.
- **Screen** is a module with its own state, `handleInput` that returns
  effects, `render`, and one key-binding table used for both dispatch and the
  `?` list and footer.
- Reviewing (home and review) becomes the first screen; its panes become
  internal modules of it.
- New test surface: key → screen state → effects, with no renderer. Move
  behaviour checks there; keep a smaller set of terminal-frame scenarios for
  layout and rendering.
- Design the screen interface twice before coding (codebase-design
  `DESIGN-IT-TWICE`), checking it against WF-298's Planning screen.
- No visible change: every frame, key and setting stays the same.

## Verification

- Existing scenarios pass unchanged before the test split; after it, the same
  behaviours are covered at the new interface.
- A test that every binding in a screen's table appears in its `?` list.
- `pnpm verify` passes; manual pass in wide, narrow, `--no-color`, `--ascii`,
  light and dark terminals.
