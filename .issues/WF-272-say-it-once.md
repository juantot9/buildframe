---
id: WF-272
title: "Say it once"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-06
---

## Outcome

A Review's name, what the Diff covers, and a whole answer each appear once on screen.

## Finding

The 2026-11-06 critique raised this as P2: repeated chrome took up rows and attention.

- "Current Review" appeared twice above the panes, in the header route and as the history row's lead. Once the colour pass made both plain bold text, they looked identical.
- What the Diff covers was said three times: `LIVE CHANGES`, "everything since last commit" at the end of the history row, and "since last commit" in the Diff title.
- At 132 columns the selected Message's full body and answer were printed twice: in the Diff card and in History.
- Home with a Review open said "Current Review" three times: "Continue your Current Review", "CURRENT REVIEW", and the "Continue Current Review" choice.

## Interface

- **Header:** on a Current or Previous Review it reads just `Neoflow`, because the row below names the Review. Home, Previous Reviews and comparison keep `Neoflow / <route>`.
- **History row:** nothing follows `now`. A past step still ends with `step N of M` in Brass.
- **History:**
  - It shows the selected Message as a short preview, like a hovered one, when the Diff card beside it holds the whole text without paging.
  - This applies only in the workspace arrangement, outside the linear layout, and once the body and Response are fully loaded. Otherwise History keeps the full text.
- **Home with a Review open:** the title is "Welcome back", and "Your open Review: 5 files · 1 Message." replaces the subtitle, the `CURRENT REVIEW` label and the counts row. The box is two rows shorter.
- `DESIGN.md` (Header, List rows) records the rules.

## Verification

- `reviews Changed and All files…` now finds the whole Message in the Diff card and a preview in History.
- `keeps wheel scrolling pane-local…` checks the selected Message's tails in the Diff card, before and during hover.
- The header-visibility test expects `Neoflow` without `/ Current Review`.
- The history-row tests no longer expect "everything since last commit".
- All 91 app tests pass. Fresh 132x40 frames show each name once.
