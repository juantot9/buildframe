---
id: WF-260
title: "Follow the terminal's light or dark background"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-05
---

## Outcome

Reviewing is legible on light terminals. A new default preset, **Match terminal**, shows Quiet Graphite on dark terminals and the new light preset **Quiet Paper** on light ones. It follows the terminal's own background report and switches live when that changes. Warm Carbon's warning no longer shares its accent's amber.

## Finding

All three built-in presets were dark, and `background: terminal` only removed fills, so light-terminal text kept dark-theme foregrounds. `PRODUCT.md` makes light terminals a requirement. In Warm Carbon, `warning` and `accent` were both `#e0ad62`, so caution and focus looked identical.

## Interface

- `reviewing.theme.inherits` accepts two more values: `match-terminal` (the new default) and `quiet-paper`. No version change, because `inherits` was already free text and unknown values still fall back to Quiet Graphite.
- An existing config that names a preset keeps it. A config that pins `quiet-graphite` stays dark until the user picks Match terminal once in Configuration (`c`).
- Detection uses OpenTUI 0.8.1's built-in `waitForThemeMode` and `theme_mode` event (OSC 11 background query). There is no new dependency.
- Startup waits at most 100 ms for the answer, so the first frame is already in the right theme. A terminal that never answers gets Quiet Graphite, and Configuration says so.

## Acceptance

- [x] Quiet Paper's text, semantic and syntax colours clear 4.5:1 on ground, pane, raised and all three row washes.
- [x] Match terminal paints Quiet Paper on a light report and returns to Quiet Graphite on a dark one, live.
- [x] The configuration description names the theme in use, or says the terminal didn't report its background.
- [x] Warm Carbon's warning (`#e6d36a`) is distinguishable from its accent and success colours.
- [x] `DESIGN.md` and `.impeccable/design.json` record both presets and the contrast rule.

## Completion evidence (2026-11-05)

- Scenario `follows a light or dark terminal under the default Match terminal theme` passes. The app suite passes 77/77, and typecheck passes for all packages.
- A compiled dogfood run in a pseudo-terminal with an empty config sends the OSC 11 query. After a light answer, the first painted surface is Quiet Paper's `#f5f7f9`, and Quiet Graphite's surface is never written.
- Known gap, not closed here: in the dark presets, Pewter and comment text fall to 3.8–4.4:1 on row washes.
