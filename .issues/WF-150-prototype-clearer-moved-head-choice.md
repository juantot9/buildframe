---
id: WF-150
title: "Prototype a clearer moved-HEAD choice"
status: closed
labels:
  - wayfinder:task
parent: WF-147
assignee: juanan
blocked_by: [WF-149]
created: 2026-08-29
---

## Question

Which radically different spatial presentation lets a human understand the relationship between the saved Review range and current HEAD, then choose the intended continuation endpoint without verbose machine-like copy or controls that contradict the option geometry?

## Acceptance evidence

- Build exactly three throwaway OpenTUI 0.5.9 variants on a dedicated `prototype/wf-150-moved-head-choice` branch. Keep the prototype next to the private Application, clearly marked throwaway, and runnable with one command; no prototype code lands on `main`.
- Mount every variant inside a faithful populated Reviewing surface at the accepted 136x50 posture, with an 80x24 check. Reuse real Application view/model vocabulary and geometry where practical, but use sanitized in-memory facts and perform no Workspace command, State transition, Git read, runtime launch, or persistence.
- Make the three variants structurally different rather than copy or color variations. Each must visually explain the saved range, its saved endpoint, the moved current HEAD, and the consequence of staying versus continuing; use simpler human language and no internal identity terminology.
- Align each variant's navigation keys with its option geometry. A vertical option arrangement uses vertical controls; a horizontal arrangement uses horizontal controls. Ordinary Esc cancels. The rejected vertical-list-plus-Left/Right design is not one of the candidates.
- Include one visibly separate prototype switcher that cycles among all three variants without being mistaken for product controls. Show the complete relevant in-memory state and currently selected outcome after every switch or selection.
- The actual acceptor drives all three variants and selects one direction or an explicit combination. Record only environment, variant verdict, confusion, and requested bounded changes—no transcript. Automated rendering cannot choose or claim the winner.
- Preserve the selected prototype at one pushed branch commit as primary-source evidence and link that commit here. Delete the prototype from the main worktree after the verdict; production implementation gets a separate planned child and is rewritten under production constraints.

## Authority

- Failed human case: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)
- Independent dependency upgrade: [Upgrade reviewed OpenTUI to 0.5.9](./WF-149-upgrade-reviewed-opentui-to-0-5-9.md)
- Current in-place behavior: [Focus moved-HEAD continuation in place](./WF-143-focus-moved-head-continuation-in-place.md)
- Prototype policy: local `prototype` skill, UI branch

## Seam decision

This is disposable visual evidence around the existing private continuation state, not a new renderer, command model, or Workspace Interface. It may use new OpenTUI 0.5.9 capabilities only when they help compare presentations; it does not adopt them for production. The prototype answers what the choice should look and feel like. A later child owns translating the human-selected direction into the production model/view with full tests.

## Constraints

- Do not edit production Reviewing behavior, command semantics, durable State, Workspace, Local Runtime, package Interfaces, or the accepted direct continuation result.
- Do not add `@opentui/keymap`, framework bindings, animation, audio, embedded terminal, persistence, telemetry, or a generic modal/renderer abstraction.
- Keep saved-endpoint selection a no-op and current-HEAD selection an explicit single continuation in the represented state; the prototype itself executes neither.
- Do not combine the broader command-discovery/leader-key redesign, general performance work, top-header redesign, historical-detail redesign, or commit-list wrapping into this child.
- Preserve the unrelated root `package.json` package-manager bump outside every prototype and issue commit.

## Result (2026-08-30)

Complete on pushed branch `prototype/wf-150-moved-head-choice`. The primary-source verdict is commit [`51743ccb555f28213ab2013495288009257fce10`](https://github.com/juantot9/neoflow/commit/51743ccb555f28213ab2013495288009257fce10); its ancestors preserve all three initial candidates and the bounded responsive corrections. No prototype source exists on `main`.

The actual acceptor drove Range map, Branch lanes, and Action window in the existing macOS arm64 / Warp Terminal P16E environment at the wide posture and a small approximately 80x24 posture. Range map's visible source-range/saved-endpoint/current-HEAD line was preferred; Action window's concise choice explanations were preferred; Branch lanes was not selected. The explicit selected combination keeps the commit relationship and concise explanations, visibly focuses one choice, moves focus with Tab, and activates only with Enter. Horizontal Wide/Balanced choices use `h`/`l` or Left/Right; stacked Linear choices use `j`/`k` or Up/Down. Esc cancels.

Two observed prototype failures were corrected rather than waived. The shell's Homebrew pnpm launcher hung under Node 26.7.0, so the pushed throwaway runner bypasses pnpm and invokes pinned Node 26.5.1 directly. The first small rendering wrapped fixed-height option text into overlapping rows and retained stale cells; one-line responsive geometry plus post-frame root retirement removed the overlap. The acceptor then accepted the text and small layout, requested focus-plus-Enter instead of direct `s`/`c` actions, drove that final revision, and explicitly accepted it.

Strict standalone TypeScript checks and real-PTY probes independently covered all three initial variants, 136x50 to 80x24 resize, the final Wide `Tab`/`h`/Enter and Linear `Tab`/`j`/`k`/Enter paths, alternate-screen cleanup, warning suppression, and zero exit. These checks do not substitute for the human verdict. The prototype used sanitized in-memory facts and performed no Workspace command, State transition, Git read, runtime launch, or persistence. [Present moved-HEAD continuation as a focused range choice](./WF-151-present-focused-moved-head-range-choice.md) owns the fresh production rewrite and Scenario B retry.
