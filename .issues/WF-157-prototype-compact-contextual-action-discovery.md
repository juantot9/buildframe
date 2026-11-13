---
id: WF-157
title: "Prototype compact contextual action discovery"
status: closed
labels:
  - wayfinder:task
parent: WF-156
assignee: juanan
blocked_by: [WF-156]
created: 2026-08-30
---

## Question

Which compact discovery interaction does the actual acceptor understand and prefer for ordinary Reviewing: a read-through leader window, a focus-first action chooser, or an adaptive strip with read-only lookup?

Research found first-party precedent for all three, but source mechanics cannot determine Neoflow's interaction. This child compares them as throwaway evidence before production work.

## Acceptance evidence

- Build exactly three structurally distinct OpenTUI 0.5.9 variants on throwaway branch `prototype/wf-157-contextual-action-discovery`, with one pinned Node 26.5.1 command to run them. Keep every prototype source, runner, and package route off `main`.
- Put each variant against the same populated Neoflow-like frames rather than an empty mock: Home launcher, short comparison, ordinary Current Review, Question composer, and one contextual overlay. Keep state entirely in memory and surface the active variant, scene, selected action/row, whether discovery is open, and the last non-mutating action after each input.
- Variant A is a Helix/Yazi-style read-through action window: one `[Space] actions` seed, current direct keys listed by group, an existing direct key closes and follows its exact behavior, and Esc closes without replay.
- Variant B is a Lazygit-style focus-first chooser: Space opens, Tab plus geometry-matched movement changes visible focus, Enter invokes the selected existing action, pointer clicks select only, and Esc cancels.
- Variant C is one adaptive contextual strip plus a K9s-style read-only lookup: the strip fits one row with bounded elision, Space opens lookup, and no lookup row can execute.
- In all variants, `?` remains action checks; Space remains text in composer/comparison input; contextual overlays retain their own instructions and reject the ordinary discovery trigger; Home and comparison clicks remain selection-only; Enter remains the sole activation action; direct ordinary keys remain available without opening discovery.
- Exercise each variant at 132x50 and 80x24 in true-color and no-color/ASCII frames. The action surface remains bounded, does not overlap fixed comparison preview or safety text, identifies focus/availability without color, and retires cleanly through a real PTY smoke.
- Hand the executable to the actual acceptor. Record only environment, outcome, confusion, preferred direction or combination, and rejected traits. Automated PTY output cannot supply the verdict.
- Commit and push the complete prototype only on its throwaway branch. Record its commit and the human decision on `main`, then create the smallest production child or stop if all variants fail. `git diff --check` passes; legacy/user data and the unrelated root `package.json` bump remain untouched.

## Authority

- Primary-source synthesis: [`terminal-command-discovery-patterns-2026-08-30.md`](../docs/research/terminal-command-discovery-patterns-2026-08-30.md)
- Human finding: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)
- Prototype policy: [Prototype a clearer moved-HEAD choice](./WF-150-prototype-clearer-moved-head-choice.md)
- Existing command constraints: [Localize target safety and stabilize Review commands](./WF-144-localize-target-safety-and-stabilize-review-commands.md)

## Seam decision

This is a UI prototype adjacent to the private Reviewing Application, not a model or Workspace experiment. Recreate only enough real density and input precedence to compare discovery structures. Do not reuse prototype components as production abstractions; a winning direction must be rewritten against the existing model/view/input seam with persistent tests.

## Constraints

- Do not land prototype code, a switcher, scripts, dependencies, package routes, or root commands on `main`.
- Do not use real Workspace, State, Git, runtime, Pi, configuration, clipboard, or user/legacy data. No prototype action performs an external effect.
- Do not repurpose `?`, introduce a direct non-Enter Home activation, intercept typed Space, or weaken contextual Esc ownership.
- Do not combine top-header redesign, historical-dialog distinction/latency, commit-line wrapping, performance optimization, configurable keymaps, or an `@opentui/keymap` dependency.
- Do not coach, infer, or pre-claim the acceptor's preference.

## Result (2026-08-30)

Complete on pushed throwaway branch `prototype/wf-157-contextual-action-discovery` at `1d50c3c16374d053e466fce7d57cac6dbbc94abb`. The exact OpenTUI 0.5.9 prototype presents the same populated Home, comparison, Current Review, Question composer, and moved-HEAD contextual scenes through all three structures. Its pinned runner uses Node 26.5.1 without a package route. State remains in memory; Home and commit clicks only select, Enter alone activates, typed Space remains text, contextual input retains ownership, and every simulated action reports that no external command was sent.

Strict TypeScript checking passed. Real PTY checks passed in true-color and no-color/ASCII modes, including all variants and scenes, action-window cancellation, focus-only pointer selection, natural Home-to-comparison navigation, 132x50 to 80x24 resize, alternate-screen cleanup, terminal restoration, and clean exit. One inspection artifact that appeared as a broken border was traced to the temporary reader decoding UTF-8 chunks independently; an incremental decoder proved the emitted frame intact. All temporary captures, smoke helpers, Python modules, and the prototype process were removed after the verdict.

The actual acceptor ran the prototype in Warp Terminal `0.2026.08.19.08.15.01` on macOS arm64 with Node 26.5.1. Before comparing the structures, they could not discover the prototype-only backtick scene switcher and initially encountered a non-navigating simulated Home action. Those were comparison-harness defects, not credited product findings: `fedfd28` made the normal click-selection plus Enter route reach the in-memory comparison, and `1d50c3c` replaced the cryptic switcher label with explicit `0 — next scene`. After rerunning, the acceptor selected **Variant C**, the adaptive one-row contextual strip plus read-only lookup, as the preferred direction. No prototype source lands on `main`.

[Present a compact contextual action lookup](./WF-158-present-compact-contextual-action-lookup.md) owns the fresh production rewrite and renewed Scenario C acceptance. The production child must not copy prototype components or turn this bounded vocabulary into a generic command registry.
