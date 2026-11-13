---
id: WF-154
title: "Measure Scenario C loading latency"
status: closed
labels:
  - wayfinder:task
parent: WF-147
assignee: juanan
blocked_by: [WF-153]
created: 2026-08-30
---

## Question

Which measured part of Scenario C makes loading feel generally slow—cold executable startup, opening the local comparison browser, producing its first preview, local selection feedback, or settling a changed selection—and does any path violate the governing performance budgets?

## Acceptance evidence

- Build the exact committed production source and run a compiled standalone benchmark outside Vitest workers. Use disposable sanitized Git/State/runtime/HOME roots and the real Workspace/Application Interfaces; add no production instrumentation or benchmark-only package Interface.
- Measure at least: cold executable launch to usable first Home/Review frame; Home activation to usable comparison rows; graph availability to initial settled preview; keyboard and click selection to visible local loading feedback; and selection to the matching settled preview. Distinguish Application time from each existing Workspace read without exposing timing through the product.
- Exercise both the short four-commit human shape and the existing bounded 500-commit/truncated graph shape. Preserve exact graph, preview, latest-selection, click-selection, and no-command semantics while measuring them.
- Record fixture version, exact source commit, Node/pnpm/OpenTUI versions, OS, architecture, machine identifier, Terminal Adapter/PTY conditions, warm-up, sample count, p50/p95/max, failures, and whether each governing budget holds: local input/focus/navigation feedback below 100 ms p95, ordinary local views usable within 500 ms, and cold start within two seconds on this reference environment.
- If a budget fails or one stage dominates accepted end-to-end latency, stop and create one focused repair child at that owning private seam before changing production source. If all budgets pass, do not manufacture an optimization; report the evidence and return the perceived-loading question to the actual acceptor alongside command-presentation work.
- Remove every benchmark program, fixture, runtime/socket, HOME/config/state root, and output after recording bounded results. Confirm no State command or user/legacy data changed and `git diff --check` passes.

## Authority

- Human Scenario C finding: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)
- Benchmark and mandatory budget policy: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)
- Existing comparison selection seam: [Stabilize clickable Home choices](./WF-145-stabilize-clickable-home-choices.md)
- Accepted cyclic navigation: [Cycle comparison commit navigation](./WF-152-cycle-comparison-commit-navigation.md)

## Seam decision

This child is measurement evidence across existing compiled Interfaces, not a new performance Module. A disposable benchmark may wrap the closed Workspace Interface to timestamp existing reads and use a scripted Terminal Adapter plus real PTY for delivery milestones. Timing, fixture controls, and percentile calculation stay outside production. Any confirmed repair belongs to the single owning Module identified by the measurements.

## Constraints

- Do not lower or reinterpret a performance budget, use sleeps as synchronization, or infer a human verdict from benchmark output.
- Do not add telemetry, caches, speculative prefetch, parallel reads, persistent benchmarks, generic timing hooks, or a Workspace/projection field before a measured owner is known.
- Do not combine command discovery/leader-key design, commit wrapping, top-header design, historical visual distinction, or historical-version latency into this Scenario C measurement.
- Preserve exact commands, State, Git facts, projection bounds, latest-selection cancellation, package Interfaces, legacy/user data, and the unrelated root `package.json` package-manager bump.

## Result (2026-08-30)

Complete as measurement-only evidence on exact source `bcbe5949ac38c9ddf37cd4510b0304b2265ef476`. The compiled standalone probe ran outside Vitest on macOS arm64 release `25.6.0`, hardware `Mac16,8` / Apple M4 Pro / 12 logical CPUs / 48 GiB, Node 26.5.1, pnpm 11.20.0, and OpenTUI 0.5.9. Direct delivery used `@opentui/core/testing` at 132x50 with Kitty input and frame-local timestamps; cold launch used real 132x50 true-color PTYs, fresh HOME/config/state/runtime roots, and the production executable. The short shape used 3 warm-ups and 20 samples; the 510-commit shape projected exactly 500 commits with `truncated: true`, used 2 warm-ups and 10 samples; cold launch used 2 warm-ups and 10 samples. Final measured runs had zero failures.

All measured timing budgets hold on this reference environment. Short-graph p95 was 56.674 ms to usable rows and 242.997 ms to the initial preview; keyboard feedback/settlement was 17.803/188.138 ms and click feedback/settlement 33.714/207.428 ms. The bounded graph was usable at 189.111 ms and settled internally at 335.508 ms; keyboard feedback/settlement was 17.747/150.384 ms and click feedback/settlement 34.360/198.045 ms. Workspace-read p95 was 55.316 ms for the short graph and at most 147.510 ms for its previews; the bounded graph was 187.453 ms and its previews at most 132.965 ms. Real cold executable launch to usable Home was 409.680 ms p95/max. Thus local feedback remains below 100 ms p95, ordinary local work remains below 500 ms, and cold start remains below two seconds. No performance optimization or cache is justified by these measurements, and benchmark output cannot overrule the acceptor's earlier perception.

One non-timing control failed: the short initial preview was visible in 20/20 samples, but the internally settled bounded initial preview was visible in 0/10 at 132x50 because independently spaced commit rows pushed the fixed preview and controls below the frame. [Keep bounded comparison preview visible](./WF-155-keep-bounded-comparison-preview-visible.md) owns that private View defect before the perceived-loading question returns to the acceptor with command-presentation work. An initial disposable probe incorrectly compared current tree state with earlier frame timestamps and produced impossible intervals; that instrumentation was discarded and replaced with frame-local snapshots before the reported sample set.

Postinspection proved State version and Review count remained zero across both direct fixtures and all 12 cold roots, the bounded graph remained exactly 500/truncated, and sanitized working bytes were unchanged. Every benchmark, result, fixture, State/runtime/HOME root, process, socket, and diagnostic was removed. No repository source, package Interface, user/legacy data, or unrelated package-manager change was made; `git diff --check` passes.
