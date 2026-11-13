---
id: WF-268
title: "One meaning per colour and glyph"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-06
---

## Outcome

Code in the Diff never takes the focus colour, a green `●` means only that the agent is connected, and the `--ascii` spinner no longer looks like a border or separator.

## Finding

The 2026-11-05 critique (P2, "colours and glyphs mean more than one thing"):

- Syntax `function` and `tag` tokens used the theme's accent in Quiet Graphite, Warm Carbon and Quiet Paper, so function names in the Diff read as focus or selection. This breaks the One Accent Rule.
- `●` in green meant three things: the open Review is Current (history row and plain header row), Home's "CURRENT REVIEW", and the agent's connection. "Previous Review" was drawn in the accent.
- The `--ascii` spinner `| / - \` reused the characters of ASCII borders (`+ - |`) and separators (`|`).

## Interface

- **Token palette:** `function` and `tag` take their own hue: Quiet Graphite `#9fb2e8`, Warm Carbon `#9fbfcf`, Quiet Paper `#2f55a4`. These clear 5.5:1 or better on every fill, including the diff washes. Indigo Night already used a separate hue.
- **Review labels:** the history row and the header row say `Current Review` or `Previous Review` in Frost Text, bold, with no glyph. Home's `CURRENT REVIEW` and `N PREVIOUS REVIEWS` labels use Frost Text instead of Sage, and `CURRENT REVIEW` has no glyph.
- **ASCII spinner:** `. : ' :`.
- `DESIGN.md` records all three rules.

## Verification

- `theme presets › never paint code in the accent` and `keeps the ASCII spinner apart from ASCII borders and separators` both fail on the old code and pass now.
- The scenario tests now wait for `Current Review · ` and `Previous Review · read only`, without a glyph.
- All 10 app test files (91 tests) pass, along with typecheck, lint and format. In fresh 132x40 frames, the green `●` appears only on `● Pi fixture`.
