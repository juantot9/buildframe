---
id: WF-162
title: "Distinguish historical detail from Live Reviewing"
status: closed
labels:
  - wayfinder:task
parent: WF-147
assignee: juanan
blocked_by: [WF-161]
created: 2026-08-31
---

## Question

How should the private View make one immutable historical Version unmistakably different from the preserved Live Reviewing route beneath it, while repairing transparent no-color redraws without changing historical navigation or Workspace reads?

## Acceptance evidence

- Keep `ReviewingApplicationModel` historical state and every existing bounded `show-review` request unchanged. The View alone presents the active immutable bundle as a dedicated saved-history control plane over the captured Live route; no durable fact, command, Workspace Interface, generic modal, or alternate Review renderer is added.
- Replace the ordinary-looking historical title/status treatment with one stable structural identity across loading and settled states: an explicit `HISTORY`, `SAVED VERSION`, and `READ ONLY` title; a fixed context band saying the saved Snapshot is being viewed and Live Changes remains preserved underneath; and a visually distinct border in styled output. Do not depend on color alone, duplicate the ordinary Review retention header, or move the bounded pane body and two navigation rows while loading.
- Keep exact Files, Diff, Questions, Responses, focus, pointer selection, `[`/`]`, `L`, Esc, paging, and captured Live restoration semantics. The context band describes source relationship only; it adds no action, mode, focus target, search, editor, or historical command.
- Give the historical dialog an opaque control-plane backing in true-color, Terminal-background, no-color, and ASCII modes. At 80x24, an opening frame followed by a settled Version must replace every title/body cell: no character from `Opening historical Review` or the prior Live body may remain in spaces of the settled raw terminal frame. No-color output emits no style escapes and ASCII output contains only ASCII.
- Preserve bounded Wide/Balanced/Linear geometry, selected context, immediate loading feedback, and the repaired WF-161 performance posture. Add no Workspace read or command; keep the dialog, pane body, close instructions, and underlying Live route visible inside 224x68, 132x50, and 80x24.
- Extend owner-local real-Workspace/OpenTUI evidence to assert structural labels, stable geometry through opening/settlement and Version movement, opaque backing alpha, exact raw no-color/ASCII title replacement, unchanged State/selection/reads, and clean close/refresh. The old transparent implementation must fail the raw-frame/opacity control; remove every negative control afterward.
- Run Application tests/typecheck, canonical `pnpm v1:verify`, all four compiled State/Runtime/Pi/dogfood probes, and `git diff --check` on Node 26.5.1 with pnpm 11.20.0. Leave final visual judgment to the genuine Scenario A rerun after the separate top-header correction.

## Authority

- Human Scenario A finding: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)
- Original historical dialog seam: [Open historical Review detail in a bounded dialog](./WF-142-open-historical-review-dialog.md)
- Measured and repaired loading path: [Settle Review bundles within the interaction budget](./WF-161-settle-review-bundles-within-budget.md)
- Governing private renderer decision: [Decide whether the OpenTUI renderer choice survives public distribution](./WF-059-decide-renderer-survives-public-distribution.md)

## Seam decision

The active immutable bundle already has a distinct private overlay seam and distinct renderable identities. Deepen that View implementation rather than adding a second Review Interface: one fixed history context band and an opaque control-plane surface frame the existing bounded `reviewBody`. `controlPlaneTheme` already supplies a real backing color when configured or no-color themes resolve to transparent, so the fix remains local and also clears stale terminal cells.

## Constraints

- Do not change model state, request scheduling, read counts/limits, State transitions, Snapshot identity, Anchors, Questions, Responses, selection, focus, or diagnostics.
- Do not redesign the ordinary top header, base Reviewing panes, historical navigation, action lookup, continuation, target safety, or comparison route in this child.
- Do not add animation, a full-screen replacement, generic overlay/renderer abstraction, dependency, telemetry, cache, package Interface, or persistent preference.
- Do not touch P17/P18/P54 scope, legacy/user data, or the unrelated root `package.json` bump.

## Outcome (2026-08-31)

Production commit `879db75f590fa104d8f2aed5bf225bb11f9cf1ac` changes only the private View. The historical overlay now has a double styled border, an explicit `HISTORY · Historical Version · SAVED · READ ONLY` identity, and a fixed three-row source band stating `SAVED SNAPSHOT`, `NOT LIVE CHANGES`, exact immutable content, and that Live Changes remains preserved underneath. Loading and settled states reserve the same dialog and body geometry while the existing bounded `reviewBody` retains every pane, identity, focus, pointer, and navigation behavior.

The overlay now always resolves through `controlPlaneTheme`, including no-color/ASCII and Terminal-background posture. Its real opaque backing clears the complete dialog before transparent child panes draw, so an opening title/body cannot leak characters into the settled frame. The 80x24 ASCII control proves alpha 1, an exact clean `HISTORY - Historical Version 1/1 - SAVED - READ ONLY` raw title, the complete pipe-delimited source band, ASCII-only output, no style escape, and bounded projection limits. Wide historical loading holds an exact selected Snapshot Diff and proves opening/settled x/y/width/height are identical. Replacing the View temporarily with its transparent predecessor fails at the intended opaque history-frame assertion; no negative control remains.

All 27 Application tests/typecheck pass. The first canonical run suffered a broad fixture stall across four otherwise unrelated files: five scenarios timed out at 20/90-second test bounds and one timed-out Git fixture initially reported cleanup contention. Each exact failed scenario then passed independently at normal 0.6–4.7-second duration, no worker/process remained, and the complete canonical gate subsequently passed 26 files / 148 tests, typecheck, clean build, and smoke. This sequence is recorded rather than waived or attributed to the View change. All four compiled State/Runtime/Pi/dogfood risk probes and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.

No model state, Workspace read, request schedule/limit, command, State version, durable byte, package Interface, or dependency changed. Genuine visual judgment remains with the final Scenario A rerun after the separate ordinary top-header correction.
