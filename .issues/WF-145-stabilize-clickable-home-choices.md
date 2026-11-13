---
id: WF-145
title: "Stabilize clickable Home choices"
status: closed
labels:
  - wayfinder:enhancement
parent: WF-140
assignee: juanan
blocked_by: [WF-144]
created: 2026-08-27
---

## Problem

Home says `Click selects`, but launcher choices, local commit rows, and retained Review rows have no pointer targets. In the comparison browser, changing commit selection also removes all three preview lines while asynchronous inspection runs, so the controls below jump even though the commit window itself is fixed. P16E accepted direct click selection and stable comparison geometry at this private Application seam.

## Acceptance evidence

- Launcher choices, loaded comparison commits, and loaded Previous Review rows expose owner-local OpenTUI click targets. One click performs the same bounded selection transition as keyboard navigation; it does not implicitly Enter, execute a command, open a Review, fetch, checkout, or page beyond the loaded projection.
- Unavailable launcher choices and stale/unknown identities fail closed. Clicks are inert behind pending/configuration/input control states. Keyboard selection, paging, mode changes, merge-parent choice, and Enter activation retain their exact semantics.
- Comparison selection has one model-owned transition reused by keyboard and pointer. It clears only superseded preview/merge-parent state, schedules the existing bounded preview, and preserves cancellation/sequence behavior.
- The comparison preview owns a fixed three-row box for loading, available, and unavailable/empty states. Commit selection, including the immediate asynchronous loading frame, leaves the commit window and `KEYBOARD CONTROLS` row at the same coordinates; no speculative cache or extra Workspace read is added.
- Keep the production Workspace Interface, commit graph/preview projections, commands, durable bytes, package exports, and Home wording unchanged except where click evidence requires a private renderable identity. Add no generic list, pointer, renderer, or navigation Interface.
- A real Workspace/OpenTUI scenario uses at least two local commits to click-select launcher, comparison commit, and retained Review choices; proves preview geometry before/loading/after, selection-only no-State behavior, and ordinary Enter activation. The old source fails the click/geometry controls, and a clean build proves the same compiled path with disposable controls removed.
- Focused Application tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0. Legacy/user data and the unrelated root `package.json` bump remain untouched.

## Authority

- Owning map: [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)
- Reconciled gap: [Reconcile the quality-gate surface](./WF-141-reconcile-quality-gate-surface.md)
- Deferred directive: [Prove Live Changes integration and human acceptance](./WF-092-prove-live-changes-integration-and-acceptance.md)
- Private renderer seam: [Decide whether the OpenTUI renderer choice survives public distribution](./WF-059-decide-renderer-survives-public-distribution.md)

## Seam decision

Extend the existing private `ReviewingPointerTarget` union with three semantic Home selections and route them through `ReviewingApplicationModel`, which already owns launcher, commit, and history selection. Extract one private commit-selection method so keys and clicks share preview invalidation and scheduling. The View only attaches those targets to the concrete owner rows and reserves one explicit three-row preview box. This deepens the current model/view seam; it does not create a reusable list or mouse abstraction.

## Constraints

- Click selects; Enter retains sole activation/command meaning.
- Do not add double-click, hover, mode-tab coordinates, drag policy, or off-window paging.
- Preserve bounded graph/history windows and comparison-preview debounce/cancellation.
- Do not fold packed/PTY evidence, release assembly, or human acceptance into this child.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

The private pointer vocabulary now names launcher, loaded commit, and loaded
Previous Review selections. Home rows attach those semantic targets directly;
`ReviewingApplicationModel` validates the active Home mode and loaded identity,
refuses unavailable history and clicks behind pending/configuration/comparison
input, and changes selection only. Enter remains the sole door to opening or
executing anything.

Keyboard and pointer commit selection now share one private
`selectComparisonCommit` transition. It validates the object against the bounded
loaded graph, clears superseded parent/input/preview request state, and invokes
the existing debounced preview effect. No graph, preview, command, or package
Interface changed. The View gives each concrete owner row a private stable ID;
both lines of a retained Review select the same identity.

Comparison preview now owns one fixed three-row box. Available Parent/Commit/file
facts fill it; asynchronous inspection uses the same space for its loading label
and unavailable/empty states retain the reservation. Consequently commit rows
and `KEYBOARD CONTROLS` keep their screen coordinates before selection, in the
immediate loading frame, and after the bounded preview arrives.

The real Workspace/OpenTUI scenario uses a two-commit repository. It first proves
keyboard selection leaves the controls row fixed, then click-selects the launcher
comparison choice, a different commit, the new-Current choice, the now-available
history choice, and the retained Review itself. The unavailable empty-history
choice fails closed, every click before Enter leaves State unchanged, the commit
click exposes the existing loading/available preview in the fixed box, and
ordinary Enter still performs the established Review lifecycle and restart
reconstruction.

Against the old source, the scenario fails immediately because
`reviewing-home-choice-comparison` does not exist. A clean compiled Application
passes the complete scenario 1/1. Independently replacing only the compiled fixed
preview box with the old conditional rows makes the keyboard geometry control
fail (`expected 14 to be 20`); the mutation and disposable tests were removed.

All five Application test files pass 26/26. Canonical `pnpm v1:verify` passes 26
files / 147 tests, typecheck, clean builds, and smoke on Node 26.5.1 with pnpm
11.20.0. All four compiled risk probes and `git diff --check` pass. Workspace
projections/commands, durable bytes, package exports, legacy/user data, and the
unrelated root `package.json` bump remain unchanged.
