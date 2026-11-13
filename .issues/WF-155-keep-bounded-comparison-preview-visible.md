---
id: WF-155
title: "Keep bounded comparison preview visible"
status: closed
labels:
  - wayfinder:bug
parent: WF-154
assignee: juanan
blocked_by: [WF-154]
created: 2026-08-30
---

## Problem

WF-154's compiled benchmark found no Scenario C timing-budget violation, but its 500-commit/truncated control exposed a separate view-geometry defect: at 132x50, the commit rows consume the Home content box and the settled three-row comparison preview plus keyboard controls are below the visible frame. The short four-commit human shape keeps them visible. A bounded projection must not produce an unbounded rendered list.

## Acceptance evidence

- Give the projected comparison rows one explicit viewport inside Home rather than letting Home's section gap expand each row as an independent section. At 132x50 and 80x24, the fixed three-row preview and all comparison control rows remain visible for short and 500-commit/truncated graphs.
- Derive the row viewport from the actual Home content geometry. Keep the selected commit visible and centered where possible; first and last selections remain reachable through the accepted cyclic `j`/`k` policy.
- Loading, available, unavailable, and empty previews occupy the same three rows. Commit focus changes leave preview and controls at fixed screen coordinates and render no overlapping or off-screen required text.
- Preserve exact projected row order/identities, graph truncation truth, pointer IDs, click-selection-only behavior, Enter activation, merge-parent choice, Page/edge behavior, preview latest-selection cancellation, and existing Workspace reads. Add no graph paging or projection field.
- Extend the real Workspace/OpenTUI scenario with a 510-commit repository whose projection contains exactly 500 commits and `truncated: true`. Prove short and bounded geometry at 132x50 and 80x24 before/loading/settled and after first↔last movement; State remains unchanged.
- Focused Application tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.

## Authority

- Measured discovery: [Measure Scenario C loading latency](./WF-154-measure-scenario-c-loading-latency.md)
- Fixed preview decision: [Stabilize clickable Home choices](./WF-145-stabilize-clickable-home-choices.md)
- Bounded projection policy: [Project bounded Reviewing views](./WF-051-design-solo-developer-execution-plan.md#p11--project-bounded-reviewing-views)

## Seam decision

This is private View geometry. Keep the existing model-owned selected identity and bounded commit projection; group or bound concrete row Renderables inside `homeComparison` so Home's section spacing applies between sections, not between every projected row. No model, Workspace Interface, Git owner, generic list Module, or package Interface changes.

## Constraints

- Do not change the 500-commit projection bound, fetch more commits, add off-window paging, or cache Git data.
- Do not combine commit-line wrapping, command discovery/leader-key design, measured-performance optimization, top-header work, or historical-dialog work.
- Do not hide the preview or controls to make the list larger; the comparison decision plane remains fixed and visible.
- Preserve legacy/user data and the unrelated root `package.json` package-manager bump.

## Result (2026-08-30)

Implemented in `6c38d646eab87bc01c89ffa05b5dc70380ec394d` after planning commit `c1f5312`. `homeComparison` now gives its already-bounded projected rows one private `reviewing-comparison-commits` viewport. The viewport derives its height from the actual terminal rows left after the Application header/footer, Home padding and section gaps, the three-row preview, controls, and optional comparison input. Its internal one-row gaps preserve the short-list presentation without allowing Home's section gap to expand an arbitrarily long list. Selection remains model-owned and centered over the existing rows.

A real 510-commit Git fixture proves the Workspace projection remains exactly 500 commits with `truncated: true`. At both 132x50 and 80x24, the first and last cyclic selections remain rendered, loading and settled previews keep identical geometry, all three control rows remain in the captured frame, and State stays at version zero. This test is a negative control for the original layout: before the viewport, its first bounded preview never appeared in the 132x50 frame.

Focused Application evidence passed 5 files / 27 tests. Canonical `pnpm v1:verify` passed 26 files / 148 tests plus dependency, typecheck, build, and smoke gates; all four compiled State, Local Runtime, Pi, and dogfood risk probes passed on Node 26.5.1 with pnpm 11.20.0. `git diff --check` passes. No Workspace read, projection fact, pointer identity, input policy, package Interface, durable State, legacy/user data, or unrelated package-manager change was made.
