---
id: WF-165
title: "Make saved Version navigation feel immediate"
status: closed
labels:
  - wayfinder:task
parent: WF-147
assignee: juanan
blocked_by: [WF-162]
created: 2026-09-01
---

## Question

Which measured private stage still makes opening and checking saved Versions feel too slow in the final Scenario A fixture, and what is the smallest owning-seam correction that makes the settled saved result feel immediate without changing the historical bundle or Workspace Interface?

## Acceptance evidence

- Reproduce the failed human route on a fresh sanitized two-Version fixture matching Scenario A at exact source `416a576a6bf68cb9c4b39f8d03b5cc1c935bfdbc`. Measure input-to-feedback and input-to-visible-settlement p50/p95 for Live→latest, latest→older, older→newer, and saved→Live at 153x50 plus the 132x50 and 80x24 controls. Required settlement means the raw terminal and semantic tree both contain the selected immutable Diff, historical source band, Question, and complete Response; a loading frame or completed internal promise is not settlement.
- Correlate the delay to existing private Application stages, bounded Workspace reads, and renderer publication before changing production. Use only disposable owner-local benchmark helpers; add no production telemetry. Record each exact read start/completion and distinguish request latency, bundle scheduling, projection convergence, model publication, and terminal-frame publication.
- Preserve the successful WF-161 six-read historical bundle, eight-read Live bundle, one-cohort selected Diff/harness starts, same-version convergence, moved-Live-Diff retry, generation cancellation, and 100-attempt/5 ms Local Runtime polling. Add no Workspace Interface, read, cache, prefetch, broad concurrency, deadline change, durable fact, or production instrumentation without measurement proving that seam owns the failure.
- Repair only the measured private owner. Immediate feedback must remain below 100 ms p95, every settled route must remain below the governing 500 ms p95 ordinary-view budget, and the failed human path must materially improve rather than merely cross the reference budget. Loading and settled historical geometry, exact saved/read-only identity, selection, focus, Questions/Responses, raw no-color/ASCII clearing, and Live restoration remain unchanged.
- Add deterministic owner-local evidence whose predecessor fails at the measured stage and whose repaired implementation preserves exact requests, order constraints, cancellation, and State effects. Re-run the identical benchmark after the change; retain only summarized measurements and remove every benchmark fixture, process, socket, capture, and helper.
- Verify Application tests/typecheck, canonical `pnpm v1:verify`, all four compiled State/Runtime/Pi/dogfood probes, and `git diff --check` on Node 26.5.1 with pnpm 11.20.0. Rebuild a fresh exact-commit Scenario A and obtain a genuine acceptor verdict on saved-Version loading; automated timing cannot substitute for that judgment.

## Authority

- Failed final human route: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)
- Prior measurement and owner: [Measure historical Version navigation latency](./WF-160-measure-historical-version-navigation-latency.md)
- Existing private scheduling correction: [Settle Review bundles within the interaction budget](./WF-161-settle-review-bundles-within-budget.md)
- Saved-history presentation: [Distinguish historical detail from Live Reviewing](./WF-162-distinguish-historical-detail-from-live-reviewing.md)

## Seam decision

Do not infer a new Interface from a perception failure. First measure across the existing private Application orchestration seam and the already bounded Workspace Interface. If the delay belongs to bundle orchestration or publication, deepen that private implementation behind the unchanged model/View contract; if measurement names a different owner, stop and narrow this child before editing it.

## Constraints

- Do not claim acceptance because prior p95 settlement was below 500 ms; the current human verdict is failed.
- Do not redesign the configured header, historical dialog, command vocabulary, navigation keys, loading copy, or retention bands to disguise latency.
- Do not alter Workspace bytes, State version, Snapshot/Review identity, Anchors, Questions, Responses, commands, request limits, package exports, dependencies, or wire shapes.
- Do not begin P17/P18/P54, inspect non-fixture data, retain acceptance transcripts, or touch the unrelated root `package.json` bump.

## Result (2026-09-01)

The exact failed path is measured without a production change. A compiled standalone OpenTUI probe ran outside Vitest against source-code commit `416a576a6bf68cb9c4b39f8d03b5cc1c935bfdbc` (issue-only repository HEAD `35bd7a6824255efc97b380fc19fc26833af0491f`) on macOS arm64 `25.6.0`, 12 logical CPUs / 48 GiB, Node 26.5.1, pnpm 11.20.0, and OpenTUI 0.5.9. Each fresh sanitized State-version-8 fixture contained exactly two immutable Versions, two Questions, two complete Responses, and changed Live bytes. The primary run reproduced the human 153x50 true-color geometry through the real Local Runtime Unix-socket client/server; 132x50 and 80x24 no-color/ASCII controls used the same route. Required visible settlement included the selected saved Diff and source band in the raw frame plus the selected Question/Response in the semantic tree; the 80x24 control reached the complete Response through its normal Linear pane focus after settlement.

Feedback remains healthy at 35.878 ms p95 or below, but every production-transport route fails settled latency. With each prior reconciliation allowed to quiesce, 153x50 p95 settlement is 663.699 ms Live→latest, 667.832 ms latest→older, 649.969 ms older→newer, and 754.941 ms newer→Live. Under the actual rapid “check saved Snapshots” cadence, those p95 values are 644.140 ms, 1,183.846 ms, 1,223.013 ms, and 1,382.675 ms. The 132x50 and 80x24 rapid controls reproduce the same 0.63–1.45-second class. This both violates the 500 ms ordinary-view budget and explains the human finding; prior direct-Workspace evidence did not cover the production transport.

The measured dominant owner is `RuntimeClientConnection.#operationTail`. One connection currently serializes every `workspace.read` even when the Application intentionally submits an independent `Promise.all` cohort. In a representative historical trace, the first three requests begin near 2 ms but complete at approximately 154/299/299 ms; the Diff/harness cohort then completes at approximately 444/445/585 ms. The same exact route over the owner’s direct Workspace Interface settles at 308.865–336.341 ms p95 when quiescent and 283.813–311.801 ms p95 under rapid cadence. Thus rendering contributes only the final frame interval while Local Runtime serialization roughly doubles a clean bundle.

A second interaction explains the one-second rapid path but does not require speculation before the transport repair. Visible settlement installs subscriptions and immediately starts the existing read-then-subscribe reconciliation cohort: three historical or five Live reads are active at the settled frame. A next Version key arrives while that cohort owns the serial connection, and its later-stage reads continue after generation cancellation; traces contain 12 historical or 16 Live starts before the new result is visible. The direct owner control absorbs that read-only overlap and remains near 300 ms, so the first focused correction belongs to Local Runtime. [Run Local Runtime read cohorts behind operation barriers](./WF-166-run-local-runtime-read-cohorts-behind-operation-barriers.md) owns it; the identical rapid benchmark will determine whether any separate Application reconciliation child remains justified.

Navigation issued zero commands, and fixture State/Git/working bytes had no mutation route. Two initial probe attempts looked only for the first-open title and therefore missed the truthful in-dialog loading label on Version-to-Version movement; that benchmark milestone was corrected before samples were retained. No production telemetry, cache, prefetch, Interface, or source change was introduced.
