---
id: WF-297
title: "Split the app into a shell and screens"
status: closed
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

## UX brief (Impeccable shape, owner-confirmed 2026-11-18)

- **No visible change in WF-297.** Every frame, key and setting stays as it is;
  the scenario suite's captured frames prove it. Planning (WF-300) then adds
  a screen and Home rows without editing Reviewing.
- **The shell owns** the header row and the context-row slot under it, the
  two-row footer with its fixed right anchor (`[?] keys  [q] quit`, or
  `[Ctrl+C] quit` while typing), the `?` key list, Configuration, the dialog
  stack, theme, notices, smooth scrolling, Esc to Home, and the quit rule (`q`
  only when nothing is loading or saving).
- **A screen supplies** its route name, its context row, its body, its modes
  (a sentence and three or four keys each), and one key table — label, rank
  for narrow dropping, modes, action — that drives both the keys row and the
  `?` list, so they cannot drift.
- **Switching is through Home, plus Implement.** Esc closes what is open
  inside a screen first, then goes Home. Implement on an approved plan sends
  its Message and opens Reviewing of the current changes. No new global key,
  no tab bar, no screen switcher, no second accent.
- **Home stays one card**, grouped: Review current changes · Review a commit
  or range · Plan something new · Previous Reviews · Plans. With Planning off
  the Planning rows disappear and the card is exactly today's. "Plans (none
  yet)" in Pewter when empty.
- **On a Plan** the header reads `BuildFrame / Plan` with the connection on
  the right; the row below names the plan and its versions, like a Review's
  history row.
- **Left to WF-300:** Plan icons and their ASCII twins (not `>`, `-`, `+`, `@`,
  `=`, `%`).

## Resolution (2026-11-18, before code)

Designed three ways (smallest interface, most flexible, easiest next screen);
the owner chose the easiest-next-screen design after a worked Planning
example, with three pieces from the flexible one.

- **`defineScreen({...})`** in `shellScreen.ts`: state, `open`, `title`,
  `mode`/`modes` (a sentence and up to four footer keys each), one key table,
  `context`/`body`, `views`/`receive` (the shell reads every view at one State
  version and re-reads when State changes), `settled` (command results), and
  `home` (rows the screen adds to the Home card). Screens return effects
  (`execute`, `open`, `home`, `copy`) and never do I/O themselves.
- **One key table** drives dispatch, the keys row and the `?` list. Each
  binding has a stable `id`, a footer `label` and a separate `help` text
  (today's wording differs between the two), optional `modes`, `rank`,
  `waits` (still loading) and `blocked` (keeps its slot and says why).
  `defineScreen` checks at definition time: no reserved key (`q ? c ! Space
  Ctrl+C`), no key claimed twice in one mode, at most four footer keys.
- **The shell owns Home**, built from each registered screen's `home`
  section; Planning off means it is not registered.
- **`extend`** holds what only Reviewing needs (its dialogs, its own loaders,
  glide targets, pointer and wheel). It has one user, so it is migration
  scaffolding expected to shrink; WF-300 does not use it.
- **Owner decision:** in comparison mode `?` always lists Enter, and pressing
  it without a preview says why (DESIGN.md: a key that can't act yet keeps its
  slot). A small visible change, made in the key-table step.

**Migration**, each step committed with every scenario frame unchanged and the
three big files only shrinking:
1. Move the look (themes, presets, text and box helpers) out of
   `reviewingView.ts` into `shellLook.ts`; re-export the presets.
2. The key table draws the keys row and the `?` list (display only), proved by
   exact strings for every mode at several widths.
3. The shell routes the global keys (`q`, `?`, `c`, `!`, Esc, Ctrl+C).
4. Bindings dispatch directly; the legacy `handleInput` tail goes.
5. Frame, render loop, glide and textarea move to `shell*.ts`.
6. Effects and views move to `shellEffects.ts` / `shellViews.ts`;
   `createReviewingApplication` becomes `createShell({ screens })`.
7. `shellHome.ts` and `reviewingHome.ts`.
8. Behaviour tests move to a renderer-free `screenTest`; the frame suite
   shrinks to layout and rendering.

## Progress and re-scope (2026-11-18)

Steps 1–6d landed (`2124073` … `c221014`): the look, the key table and
`?` list, the shell key order, Reviewing's ordered key actions, smooth
scrolling, screen-tree swapping, the frame, copying and preference saving,
commands with result recovery, keeping views current, and the terminal's
lifecycle — each frame-identical, each with renderer-free tests where the
part allows.

**Re-scoped (owner, 2026-11-18): shell first, Reviewing later.** Moving
Reviewing onto the screen interface means moving its keyboard, pointer,
wheel, selection and composer wiring out of `ReviewingView` and turning its
dialogs into shell-routed layers — the largest piece of the migration. So:

- **Here (6e):** `defineScreen` and `createShell` built from the shell parts,
  proven end-to-end by a small test screen on a real Workspace. Reviewing
  keeps running on its own application, composed of the same parts.
- **[WF-301](./WF-301-move-reviewing-onto-the-shell.md):** Reviewing becomes
  a screen, Home becomes shell-owned with rows from every screen, the spinner
  and notice timers become screen-reported, the model ↔ actions import loop
  goes, and the scenario suite splits (old steps 7 and 8).

## 6e landed (2026-11-18)

- `shellScreen.ts`: `defineScreen` (checked at definition: no shell-owned
  key, no key bound twice in a mode, at most four footer keys) builds the key
  table the footer and `?` list are drawn from; `dispatchScreenKey` runs
  bindings, saying why a `blocked` key can't act and that a `waits` key is
  still loading.
- `shell.ts`: `createShell({ workspace, screens, first })` runs screens on the
  shell parts: terminal, frame, header and `?` panel (`shellChrome.ts`, moved
  out of `reviewingView.ts`), the shell's key order, commands with result
  recovery, copying, a screen stack (`open`, Esc returns), and views read
  together at one State version (`shellViews.ts`) and kept current.
- Proven by `test/fast/shellScreen.test.ts` and
  `test/scenarios/shell.test.ts` (a two-screen app on a real Workspace).
- Reviewing is unchanged; everything else continues in WF-301.
