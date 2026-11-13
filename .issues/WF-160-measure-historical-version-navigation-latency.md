---
id: WF-160
title: "Measure historical Version navigation latency"
status: closed
labels:
  - wayfinder:task
parent: WF-147
assignee: juanan
blocked_by: [WF-159]
created: 2026-08-31
---

## Question

Which measured stage made one historical Version movement feel slow in Scenario A—local key feedback, the existing bounded `show-review` read, projection settlement, or rendering—and does any stage violate the standing interaction-performance budgets?

## Acceptance evidence

- Build the exact committed production source on Node 26.5.1 and run a compiled standalone benchmark outside Vitest workers. Use a fresh disposable sanitized Scenario A shape with changed Live Changes, at least two immutable Versions, retained Questions, and complete Responses through the real Workspace and private Application Interfaces. Add no production instrumentation or benchmark package Interface.
- Measure separately from input receipt to first visible loading feedback and to the matching settled frame for: Live Changes to latest historical Version, latest to older, older to newer, and newest historical Version back to the captured Live route through both `]` and `L`/Esc behavior where applicable. Time each existing Workspace `show-review` read independently through an owner-local wrapper without changing its request, scheduling, cancellation, or result.
- Use real OpenTUI rendering at the accepted Scenario A geometry and at 80x24, with true-color and no-color/ASCII controls. Include finite warm-up and repeated samples; record exact source, Node/pnpm/OpenTUI, OS, architecture, machine identifier, terminal adapter conditions, sample counts, failures, p50/p95/max, and the slowest stage.
- Apply the governing budgets without reinterpretation: local key/loading feedback below 100 ms p95 and each ordinary local historical/Live view usable within 500 ms p95 on the reference environment. Preserve exact historical identity, selected file/row/Question context, captured Live return target, bounded reads, zero commands, and zero State/Git/working-byte movement.
- If a budget fails or one stage dominates accepted end-to-end latency, stop and create one focused repair child at the measured private Application or existing Workspace owner before changing production. If all budgets pass, do not add a cache, prefetch, parallel read, or speculative optimization; report the evidence and return perceived loading to the actual acceptor alongside the separate historical-versus-Live presentation correction.
- Remove every benchmark program, fixture, State/runtime/HOME/config root, output, process, and socket after recording bounded results. Run `git diff --check` and leave only issue evidence plus the unrelated root `package.json` bump.

## Authority

- Human Scenario A finding and standing performance directive: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)
- Governing quality gate: [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)
- Existing historical dialog seam: [Open historical Review detail in a bounded dialog](./WF-142-open-historical-review-dialog.md)
- Prior measurement discipline: [Measure Scenario C loading latency](./WF-154-measure-scenario-c-loading-latency.md)

## Seam decision

This child is evidence across the existing deep Workspace and private Reviewing Application Interfaces, not a new timing Module. A disposable owner-local adapter may timestamp the closed `Workspace.read` Interface while the real model/view path supplies visible milestones. Timing and percentile logic stay outside production. Any confirmed correction belongs only to the measured owner; no new external seam is justified.

## Constraints

- Do not infer human acceptance from benchmark output, lower a budget, use arbitrary sleeps as synchronization, or hide a slow settled result behind fast loading feedback.
- Do not add telemetry, caching, prefetch, parallelization, debounce changes, a generic loading abstraction, a Workspace read, projection field, dependency, or package Interface before a measured owner is known.
- Keep Local Runtime polling, Workspace limits, `show-review` request shapes, cancellation, scheduling, selection, diagnostics, durable bytes, and State transitions exact.
- Do not combine top-header redesign, historical-versus-Live visual redesign, command discovery, Scenario C work, P17/P18/P54 scope, legacy/user data, or the unrelated root `package.json` bump.

## Result (2026-08-31)

Measurement is complete without a production-source change on exact commit `73697720d66becf4cac01a4a00c02902b91a0219`. The compiled standalone probe ran outside Vitest on macOS arm64 release `25.6.0`, machine `Mac16,8`, 12 logical CPUs / 48 GiB, Node 26.5.1, pnpm 11.20.0, and OpenTUI 0.5.9. Its fresh sanitized real Workspace contained changed Live Changes, exactly two immutable Versions, two Questions, and two complete Responses at State version 8. The primary true-color run used 224x68, 3 warm-up cycles, and 20 measured cycles; 80x24 true-color and no-color/ASCII controls each used 1 warm-up and 5 measured cycles.

Local feedback is healthy: every primary path stayed below 17.478 ms p95. Settled primary p95 was 408.453 ms from Live to latest, 494.616 ms from latest to older, 405.871 ms from older to newer, 477.000 ms from latest to Live with `L`, and 498.638 ms with Esc. Returning past newest with `]` failed the ordinary-view budget at 515.664 ms p95 / 519.493 ms max. The 80x24 no-color/ASCII control repeated that failure at 507.936 ms p95/max. Thus fast feedback does not erase a settled-result budget violation.

The measured owner is the private Application bundle orchestration. Historical routes issue six existing reads and Live restoration issues eight. The slowest individual read remained at or below 179.816 ms p95, while the failing `]` route's complete Workspace span was 512.970 ms p95 versus 515.664 ms to its settled frame. `#readReviewBundle` currently waits for the selected Diff before starting the two independent harness projections, creating an avoidable serial stage; rendering adds only the final few milliseconds. [Settle Review bundles within the interaction budget](./WF-161-settle-review-bundles-within-budget.md) owns that measured correction before another timing pass.

The controls exposed one independent View defect rather than concealing it as timing success. During an 80x24 no-color/ASCII transition, transparent historical-dialog cells retained characters from `Opening historical Review` when the title and body changed to the settled Version. Semantic render-tree state was correct, but the raw character frame was not complete. Milestone timing was therefore changed from fragile raw-title matching to frame-local semantic state, while the corrupt raw frame remains a failed control for the separate historical presentation child after WF-161. An earlier control also incorrectly required a Question to be visible while Linear layout legitimately focused Diff; it was discarded and replaced with selected-Question preservation at 224x68 plus selected-file preservation at 80x24.

Postinspection found State version 8, the two-Version count, Git HEAD, and working-byte digest unchanged, with zero navigation commands. The benchmark's disposable Workspace, State, HOME/config/runtime roots, processes, and sockets retired. No repository source, Workspace Interface, package Interface, user/legacy data, or unrelated package-manager change was made.

WF-161 corrected the measured private Application stage on commit `c2d74eb7657ed3cb7bb87886e86bdda5fb78da42`. The identical primary benchmark now places every route below 291.179 ms p95 and feedback below 17.190 ms p95 while retaining the exact six/eight read counts. The no-color transparent-overlay control remains a separate View finding, not a performance waiver.
