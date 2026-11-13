---
id: WF-249
title: "Stabilize the app Reviewing scenario's hover pointer against unlaid trees"
status: closed
labels:
  - wayfinder:task
parent: WF-205
assignee: juanan
created: 2026-09-18
---

## Outcome

The wheel-scroll hover-expansion scenario in
`apps/neoflow/test/scenarios/reviewingApplication.test.ts` cannot time out on a
freshly replaced, unlaid render tree: the shared `moveToRenderable` helper
waits for real geometry before dispatching the pointer. The flake stops
costing CI reruns. No app behavior changes.

## Finding

`keeps wheel scrolling pane-local across bounded projections and long wrapped
rows` fails intermittently with `Timed out waiting for hovered Message to
expand within bounds without replacing the selected Message` after the 60 s
poll budget. Four CI occurrences so far: WF-213 attempt 2, WF-210 stage-1
attempt 1, WF-210 stage-2 attempt 1, and WF-215 attempt 1 (Node 26.4.0, while
Node 26.5.1 passed the same run). Session 7 also saw one local isolation
failure at load 9.2.

Reproduced locally on 2026-09-18 under CPU load, with the geometry logged
before and after the hover move:

```
run 3 before move: card1 {sx:0, sy:0, w:0, h:3}, viewport {sx:0, sy:0}
run 3 after move:  card1 {sx:185, sy:7, w:38, h:3}   (never expanded)
passing case:      card1 {sx:185, sy:7, w:38, h:3} -> after move h:6
```

The last wheel render had replaced the tree, and `waitFor(secondMessageSelected)`
returns as soon as the new card carries its selection styling — before OpenTUI
lays the tree out. `moveToRenderable` then read `screenX/screenY` as `0,0` and
dispatched the hover to the terminal origin, so card 1 never expanded and the
pointer stayed at the origin even after the layout arrived 300 ms later. This
is the same zero-geometry artifact WF-247 fixed for the clicked-row scenario
(`screenX/Y/W/H` of `0,0,0,1`), which is guarded there by an inline layout
wait; `moveToRenderable` was the remaining direct coordinate reader in this
file.

## Resolution

`ScriptedTerminal.moveToRenderable` now flushes and waits until the target
reports `width > 0 && height > 0` before reading its coordinates, then re-reads
the renderable so the move uses the laid-out instance. A missing renderable
still fails immediately with `Renderable <id> is unavailable`; the 60 s budget
only applies to a tree that stays unlaid. Both call sites (the hovered Message
card and the Diff pane) keep their semantics.

## Acceptance

- [x] The focused scenario passes repeatedly under CPU load: 14/14 focused
      runs after the fix (8 under 18 CPU burners, 6 unloaded), plus every
      full-file and full-suite run below.
- [x] The whole `reviewingApplication.test.ts` file passes under load: five
      consecutive 28-burner runs of all 25 tests passed; one 60-burner run
      (5× oversubscription) failed the unrelated `keeps a truncated
      500-commit comparison preview…` scenario on the 120 s test timeout.
- [x] Full suite, lint, format:check, dependency firewall, typechecks, build,
      and build smoke pass; no app source change.
- [x] CI green on both engines: run
  [`35379832497`](https://github.com/juantot9/neoflow/actions/runs/35379832497)
  green on the first attempt, no rerun (`verify (Node 26.4.0)` in 5m03s,
  `verify (Node 26.5.1)` in 4m58s).

## Completion evidence (2026-09-18)

Reproduction and fix, macOS Node 26.5.1:

- Pre-fix under load: the hover scenario failed with card 1 at
  `{sx:0, sy:0, w:0, h:3}` before the move — an unlaid replacement tree — so
  `moveToRenderable` dispatched to `(0, 0)` and card 1 never expanded. The
  same run 300 ms later had laid the tree out while the pointer stayed at the
  origin. A passing run reads `{sx:185, sy:7, w:38}`.
- Post-fix: 14/14 focused runs pass (8 under 18 burners, 6 unloaded); the
  clean verify run's hover scenario is 3.6 s.
- Canonical `pnpm verify` green: 54 files / 382 tests in 524 s, with lint
  (33 pre-existing warnings), format:check, dependency firewall, package and
  test typechecks, clean build, and build smoke all passing.
- The two failed attempts before that green run are the machine's documented
  load flakes, both passing in isolation: `opens the preview immediately and
  cancels a pending inspection…` (60 s test timeout under a 41 15-min load
  average left by 60 burners) and `legacyReviewQueueCandidates` concurrent
  promotion (`snapshot-unverified` vs `state-version-mismatch`).
- CI: run
  [`35379832497`](https://github.com/juantot9/neoflow/actions/runs/35379832497)
  green on both engines on the first attempt: `verify (Node 26.4.0)` in 5m03s
  and `verify (Node 26.5.1)` in 4m58s. No rerun was needed, and the run
  consumed no further Actions minutes after it completed.
