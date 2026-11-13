---
id: WF-151
title: "Present moved-HEAD continuation as a focused range choice"
status: closed
labels:
  - wayfinder:task
parent: WF-147
assignee: juanan
blocked_by: [WF-150]
created: 2026-08-30
---

## Question

How should the private Reviewing Application translate the human-selected moved-HEAD prototype into production so the saved range, saved endpoint, and current HEAD are visible as one relationship, while focus navigation and Enter preserve the exact existing continuation semantics?

## Acceptance evidence

- Rewrite only the Application-owned moved-HEAD choice state and view. Use the existing `ReviewContinuationView` facts—source basis, saved endpoint, current HEAD, and projected current-HEAD action—without another Workspace read, a new durable fact, or copied prototype implementation.
- Open the existing opaque continuation dialog with the saved choice visibly focused. Show one concise source-basis → saved-endpoint → current-HEAD relationship and explain in ordinary language that staying creates no Review, while continuing creates one Review from current HEAD and keeps the saved Review.
- In Wide/Balanced geometry, present the two choices horizontally: `Tab` cycles focus, `h`/`l` and Left/Right follow the horizontal relationship, Enter activates the focused choice, and Esc cancels. In Linear geometry, stack the choices: `Tab` cycles focus, `k`/`j` and Up/Down follow the vertical relationship, Enter activates, and Esc cancels. Do not pair Left/Right with a vertical list.
- Keep Enter as the sole activation action. Activating the saved endpoint closes the dialog without a Workspace command or State transition. Activating current HEAD sends the existing exact command once; its command fields, target-change checks, pending phases, accepted-result navigation, source retention, and no-replay behavior remain unchanged.
- Preserve the private `reviewing-continuation-dialog` control-plane identity and render complete, non-overlapping text at 132x32 and 80x24. Focus changes must not alter dialog geometry, and resize must retain the focused choice without activating it.
- Extend the existing Application scenario through the production Interface to prove default focus, Tab and geometry-matched directional movement, Enter-without-movement saved no-op, ordinary Esc cancellation, exact single current-HEAD continuation, responsive rendering, and no Home detour or extra read.
- Re-run the affected genuine human Scenario B on the built production executable. Record only environment, outcome, confusion, and bounded metadata; close this child only if the acceptor understands and accepts both choices.

## Authority

- Human-selected throwaway evidence: [Prototype a clearer moved-HEAD choice](./WF-150-prototype-clearer-moved-head-choice.md)
- Failed production scenario: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)
- Existing in-place continuation semantics: [Focus moved-HEAD continuation in place](./WF-143-focus-moved-head-continuation-in-place.md)
- Human evidence rule: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)

## Seam decision

The existing private `ReviewingApplicationModel` remains the owner of continuation focus, cancellation, and activation; the existing view derives horizontal or vertical geometry from the Application's current layout. This deepens the same Application Interface rather than exposing a selector, keymap, renderer, Git fact, or continuation policy to another package. The Workspace Interface and durable command contract do not change.

## Constraints

- Preserve exact Workspace wire shapes, command fields, diagnostics, projected action gates, durable bytes, and current-HEAD continuation identity.
- Preserve the saved endpoint as a no-op and do not implement the separate composite intent.
- Do not add pointer activation, direct `s`/`c` actions, a generic chooser/modal abstraction, `@opentui/keymap`, a renderer Interface, persistence, animation, or another Workspace read.
- Do not change the fixed Review header, historical dialog, command discovery, commit navigation, wrapping, performance, or any Scenario A/C finding.
- No prototype source or prototype runner lands on `main`; implement the selected behavior afresh in production code and existing owner-local tests.
- Preserve the unrelated root `package.json` package-manager bump outside planning and implementation commits.

## Result (2026-08-30)

Complete in production commit `2040390bc42c56580492131ff78f19d4addd5c06`. The private Application now opens the existing `reviewing-continuation-dialog` with the saved Review focused, renders the existing source basis, saved Review end, and current HEAD as one relationship, and presents concise stay/continue consequences. Wide and Balanced layouts use horizontal cards with Tab or `h`/`l`; Linear stacks the cards and uses Tab or `j`/`k`. Enter alone activates the focused choice, Esc cancels, and focus survives responsive reflow without changing dialog geometry.

No Workspace Interface, projection, command, durable fact, diagnostic, target check, package Interface, or additional read changed. Immediate Enter on the default saved focus starts nothing. Current-HEAD Enter sends the existing exact command once and opens its resulting Live Review directly; the source remains immutable history. Owner-local coverage proves both outcomes, cancellation, exact command fields, no Home detour, no extra read, focus movement, stable geometry, and complete 132x32/80x24 rendering. The focused Application lane passed 5 files / 26 tests; canonical verification passed 26 files / 147 tests; all four compiled State, Runtime, Pi, and dogfood risk probes passed on Node 26.5.1 with pnpm 11.20.0.

The actual acceptor reran Scenario B from this exact source in Warp Terminal `v0.2026.08.19.08.15.stable_01`, macOS arm64 release `25.6.0`, Node 26.5.1, true color, and a 132x50 terminal. They exercised the saved no-op followed by current-HEAD continuation and explicitly accepted the production interaction with no confusion reported. Bounded postinspection found State version and Review count each advanced exactly once, the new Current Review continued from the exact source, the source remained Previous, its continuation became unavailable, Git HEAD and sanitized working bytes stayed unchanged, and the working tree remained modified. The runtime retired after its bounded idle grace; the fixture, HOME/config/state/runtime roots, environment record, and owner-local helpers were removed. No prototype code or unrelated package-manager change entered the implementation.
