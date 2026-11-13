---
id: WF-142
title: "Open historical Review detail in a bounded dialog"
status: closed
labels:
  - wayfinder:enhancement
parent: WF-140
assignee: juanan
blocked_by: [WF-141]
created: 2026-08-27
---

## Problem

P16B proved exact historical Question and Versions navigation, but the current Application loads an immutable Snapshot as the whole Review screen. The acceptor explicitly deferred that sudden full-screen replacement to P16E: historical reading should be a navigable bounded dialog that preserves the current code-reading context.

## Acceptance evidence

- From a Current Review's Live Changes, `[` and a historical Question click open the exact immutable Snapshot inside one bounded `reviewing-historical-dialog`. The underlying Live Changes frame and its selected file/row remain visibly and model-wise preserved rather than becoming the historical route's presentation.
- The dialog is read-only and navigable through the same bounded Files, Diff, Questions, version, row, paging, and pointer mechanics. It opens the exact historical file/row/whole-file Anchor and complete captured discussion; no TUI inference or current-working-byte read is added.
- `[`/`]` move among immutable Versions in the dialog. `]` past the newest immutable Version, `L`, or `Esc` closes it and returns directly to a refreshed Live Changes route. Opening, navigating, and closing commit no command, State version, Review, Snapshot, Question, or effect.
- The dialog retains an opaque control-plane background under Terminal background mode, remains bounded at Wide/Balanced/80×24 Linear sizes, and preserves no-color/ASCII meaning. It has explicit historical identity and close/navigation instructions without adding persistent chrome to the base reading surface.
- Keep the production Workspace Interface and all projections unchanged. Reuse the existing bounded `show-review` reads/subscriptions behind private Application dialog state; add no generic modal, renderer, navigation, or cross-package Interface.
- A source Application regression crosses the real Workspace and OpenTUI test renderer. Its overlay, preserved base context, exact historical target, version movement, close/restore, resize, Terminal opacity, no durable movement, and restart-independent behavior fail against the old full-screen implementation. A clean build proves the same compiled path.
- Focused Application tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0. Legacy/user data and the unrelated root `package.json` bump remain untouched.

## Authority

- Owning map: [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)
- Deferred directive: [Prove Live Changes integration and human acceptance](./WF-092-prove-live-changes-integration-and-acceptance.md)
- Accepted Versions/Anchor semantics: [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)
- Private renderer seam: [Decide whether the OpenTUI renderer choice survives public distribution](./WF-059-decide-renderer-survives-public-distribution.md)

## Seam decision

Keep one ephemeral historical-dialog context inside `ReviewingApplicationModel`. On first historical navigation, capture the visible base Review bundle and local selection, then let the existing private bounded Review route load and navigate immutable detail. The View renders the captured bundle as the unchanged base and the active immutable bundle inside an opaque bounded overlay. Closing restores the base immediately and asks the existing route to refresh/resubscribe it; no second Workspace Interface or parallel product route is created.

The accepted shape is already specific enough that a throwaway visual variant exercise would only reopen the settled modal decision. Implement it directly through the existing OpenTUI test renderer, then leave genuine visual judgment to P16E's required human gate.

## Constraints

- Preserve immutable Snapshot bytes, exact Anchors, Questions, Responses, lineage, source status, and all Workspace request shapes.
- Historical detail is ephemeral presentation, not a durable selection, new navigation domain, or second Current pointer.
- Do not add search, editing, Ask, continuation, or configuration actions inside the historical dialog.
- Do not fold continuation, target-change weight, command chrome, or comparison clicks into this child.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

The Application now owns one ephemeral historical-dialog context. The first
Version or exact Question navigation captures the Live Changes bundle, route,
focus, file/row/Question selection, discussion position, and local Diff posture;
the existing bounded `show-review` route then remains the sole reader of the
immutable Snapshot. The renderer presents the captured state underneath and the
active immutable bundle inside `reviewing-historical-dialog`, with distinct
private renderable identities so both trees coexist without a renderer or
Workspace Interface.

The dialog uses an opaque control-plane surface even when the configured base
background is Terminal, fits the actual content viewport at Wide, Balanced, and
80x24 Linear dimensions, and retains explicit Version/read-only/close
instructions. Files, rows, Questions, complete Responses, discussion paging,
pointers, and `[`/`]` reuse their existing bounded mechanics. Editing, Ask,
search, configuration, continuation, and persistent layout changes are refused;
`L`, `Esc`, or `]` past the newest Version restores the captured Live selection
immediately and refreshes that same Live route.

The real Workspace/OpenTUI regressions now open an exact line Question over a
separately selected Live file, prove both render trees and a fully opaque
Terminal-background dialog, retain complete Q1/Q2 discussion, resize through
80x24 with the close footer visible, reject configuration/Ask entry, restore the
original file/focus/Question context, and leave State unchanged. A second real
scenario opens an exact empty-file whole-file Anchor, creates a legitimate
successor Snapshot, navigates Version 2/2 to 1/2 and back, closes past newest
without another command or State transition, and proves a fresh Application
restart has no dialog state. The stress path opens the dialog at 80x24 under
`--no-color --ascii`, retains ASCII-only output and bounded Projection requests,
and exposes the selected historical Questions pane.

Before implementation, the primary regression failed 1/1 by timing out waiting
for `Historical Version 1/1` because the immutable Snapshot replaced the whole
screen. After a clean Application build, a disposable test copy importing
`apps/neoflow/dist` passes the real whole-file and multi-Version dialog scenario
1/1; the control was removed. All five Application test files pass 26/26.
Canonical `pnpm v1:verify` passes 26 files / 147 tests, typecheck, clean builds,
and smoke on Node 26.5.1 with pnpm 11.20.0. All four compiled risk probes and
`git diff --check` pass. Production Workspace projections, commands, durable
bytes, package exports, and legacy/user data are unchanged, and the unrelated
root `package.json` bump remains excluded.
