---
id: WF-274
title: "Keys that act wait while the Review loads"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-06
---

## Outcome

A key that acts on what is on screen no longer fires while the Review is still loading it. Neoflow says it is still loading instead. `q` quits only when nothing is loading or saving.

## Finding

The 2026-11-06 critique of the WF-269..273 work raised this as P1, and the code confirmed it.

- `a` pressed during a Diff load was ignored without a word (`openCreateEditor` returned `[]` when `loading` was set).
- The text typed next ran as single-letter commands. In the captured frames, the `y` in "Why" tried to copy ("Couldn't copy the selected Diff row"), and the `f` in "of" switched Files from Changed to All. The `a` in "an" finally opened the composer, so only "n empty queue?" reached it, on the wrong file.
- `q` quit on a single press at any time, so a typed-ahead word containing `q` could close Neoflow, and `x` could interrupt a working Message.

## Interface

- `ACTS_ON_LOADED_REVIEW` (`a y f r x t v w R C`): on the Review screen, while `loading` is set, these keys don't run. `sayStillLoading` shows "Still loading (<what>); press <key> again in a moment." in the info tone.
- Movement (`j/k`, arrows, PgUp/PgDn, `g/G`, Tab, `[ ]`, `h/l`) and Esc work as before.
- `q` quits only when nothing is loading or saving. Otherwise it says "Still loading; press q again once it's done to quit." (or "Still saving…"). Ctrl+C still quits at any time.
- `openCreateEditor` gives the same message instead of returning silently.
- **Not done:** replaying held keys after a load, as the save phase does with movement. `loading` is cleared in more than 20 places, so the clear message is the safer step.
- `DESIGN.md` (Do's) records the rule.

## Verification

- New: `never runs typed-ahead letters as commands while a Diff loads, and q waits too`. `TimedWorkspace.holdDiffReads` holds `review.diff` and `review.live-diff` reads. With a load in flight, the test types `a` then "Why not a queue?" and checks that:
  - the still-loading notice shows, and no copy warning appears;
  - Files stays `Changed`;
  - no composer opens, and Neoflow doesn't quit.

  After the load finishes, `q` quits. The test fails on the old code.
- Typecheck, lint and format pass, and all 76 test files (639 tests) pass.
