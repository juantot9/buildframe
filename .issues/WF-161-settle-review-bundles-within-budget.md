---
id: WF-161
title: "Settle Review bundles within the interaction budget"
status: closed
labels:
  - wayfinder:task
parent: WF-160
assignee: juanan
blocked_by: [WF-160]
created: 2026-08-31
---

## Question

How should the private Reviewing Application remove avoidable serial latency between one selected Review Diff and the two independent harness projections while preserving the exact bounded Review bundle and every Workspace Interface?

## Acceptance evidence

- Keep `OpenReviewingApplication.#readReviewBundle` as the sole private orchestration seam. After the existing same-version manifest/questions/versions/live/continuation cohort identifies the selected source and file, start the selected Diff read, `harness.review-interaction`, and `harness.review-question.inspect-default` together in one bounded cohort instead of waiting for the Diff before starting the independent harness reads.
- Preserve all successful request shapes, limits, selected Snapshot/live identities, file and Diff offsets, result assembly, diagnostics, five-attempt convergence bound, moved-live-Diff retry, same-version checks, cancellation/generation checks, subscriptions, commands, and State semantics. A failed or moved cohort may finish already-started read-only projections, but no additional kind, retry, durable effect, or package Interface is introduced.
- Add deterministic owner-local Application evidence using the real Interface shape and explicit read gates—not wall-clock sleeps—to prove the harness projections start while the selected Diff is unresolved, the visible Review does not settle until the complete same-version cohort is available, stale/mismatched results still retry or reject exactly, and historical selection/Live restoration remain exact.
- Rebuild the exact committed source and rerun the WF-160 compiled standalone benchmark with the same sanitized two-Version/complete-Response shape, 224x68 primary sample set, and 80x24 controls. Local visible feedback remains below 100 ms p95 and every historical/Live settled route falls below 500 ms p95; the Workspace span no longer contains the avoidable Diff-then-harness serial stage.
- Run focused Application tests/typecheck, canonical `pnpm v1:verify`, all four compiled State/Runtime/Pi/dogfood risk probes, and `git diff --check` on Node 26.5.1 with pnpm 11.20.0. Confirm zero navigation commands and unchanged State, Version identities, Git HEAD/order, and working bytes.

## Authority

- Measured owner and failed route: [Measure historical Version navigation latency](./WF-160-measure-historical-version-navigation-latency.md)
- Standing performance quality: [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)
- Private Application orchestration: [Reconcile the quality-gate surface](./WF-141-reconcile-quality-gate-surface.md)

## Seam decision

The Workspace Interface already exposes every bounded fact required by one Review bundle. The measured delay is inside the private Application implementation: three independent read-only requests are arranged as two serial stages. Deepen that existing orchestration by changing only its internal cohort schedule. A new Workspace bundle read, cache, timing Interface, or exported scheduler would enlarge the Interface without adding leverage.

## Constraints

- Do not combine or remove Workspace reads, add a projection field, cache, prefetch across user actions, persistent benchmark, telemetry, generic scheduler, dependency, or package Interface.
- Do not change request limits, timeout/retry counts, State-version equality, error text, route generation, refresh policy, selection, focus, historical dialog semantics, commands, wire shapes, or durable bytes.
- Do not fix the independently observed transparent no-color historical redraw, top header, historical-versus-Live design, command discovery, Scenario C, P17/P18/P54 scope, legacy/user data, or the unrelated root `package.json` bump.

## Outcome (2026-08-31)

Production commit `c2d74eb7657ed3cb7bb87886e86bdda5fb78da42` keeps the same private `#readReviewBundle` Interface and the same successful six-read historical / eight-read Live bundles. Once the first same-version cohort identifies source and file, the selected Diff and both independent harness projections now start together in one bounded cohort. Result assembly, five-attempt convergence, moved-live-Diff retry, State equality, diagnostics, generation cancellation, subscriptions, request shapes/limits, commands, and package Interfaces are unchanged.

A deterministic real-Workspace/Application gate holds the exact selected Snapshot Diff and proves both harness projections start before that Diff resolves, while the historical dialog remains visibly loading and cannot settle early. Replacing the production implementation temporarily with its serial predecessor makes this test fail at the intended independent-read scheduling assertion; restoring the repaired source passes. No negative control remains.

The compiled standalone WF-160 benchmark was rerun on exact commit `c2d74eb7657ed3cb7bb87886e86bdda5fb78da42` with the same macOS arm64 `Mac16,8`, Node 26.5.1, pnpm 11.20.0, OpenTUI 0.5.9, sanitized State-version-8/two-Version/complete-Response fixture, 224x68 primary run (3 warm-ups / 20 measured cycles), and 80x24 controls (1 warm-up / 5 cycles). Primary p95 settled times are now 265.347 ms Live→latest, 276.485 ms latest→older, 265.261 ms older→newer, 291.179 ms `]`→Live, 285.924 ms `L`→Live, and 284.665 ms Esc→Live. The previously failing `]` path fell from 515.664 ms to 291.179 ms p95. Every control path is below 331.058 ms, every feedback path is below 17.190 ms p95, read counts remain exactly six/eight, and the slowest primary Workspace span is 288.454 ms p95.

Postinspection retained State version 8, two Versions, Git HEAD, and working-byte digest with zero navigation commands. All 27 Application tests/typecheck pass; canonical verification passes 26 files / 148 tests; all four compiled State/Runtime/Pi/dogfood probes and `git diff --check` pass. Disposable benchmark roots, outputs, processes, and sockets were removed. The independent transparent no-color historical redraw remains explicitly outside this child for the historical presentation correction.
