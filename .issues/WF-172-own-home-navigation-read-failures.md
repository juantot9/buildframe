---
id: WF-172
title: "Own Home navigation read failures"
status: closed
labels:
  - wayfinder:task
parent: WF-140
assignee: juanan
blocked_by: [WF-171]
created: 2026-09-01
---

## Question

Can the Reviewing Application contain post-start Home read rejection at its route/effect seam and render truthful failure without a generic task abstraction?

## Acceptance evidence

- Every post-start `show-home` effect has an observed Promise outcome: an active Home read failure reaches the existing semantic failed presentation and cannot become `unhandledRejection`.
- A real scripted-Terminal scenario enters retained history, requests another bounded Home window, injects a Workspace read rejection, and proves a stable visible failure; current source fails through an unhandled rejection.
- A separate race proves rejection from a stopped or superseded Home generation is ignored and cannot replace the newer route.
- Startup failure, Home auto-open, Review loading/recovery, six/eight-read bundles, same-version convergence, generation cancellation, rendering, and Workspace/package Interfaces remain unchanged.
- Focused Application evidence, canonical verification, all four compiled probes, and `git diff --check` pass on Node 26.5.1 with experimental FFI where required.

## Authority

- [Active v1 anti-pattern audit, AV-05](../docs/audit/active-v1-antipatterns-2026-09-01.md#av-05--home-navigation-launches-a-rejecting-read-promise-without-an-owner)
- [Settle Review bundles within the interaction budget](./WF-161-settle-review-bundles-within-budget.md)
- [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)

## Seam decision

Home route failure belongs to the existing private Application route/effect assembly. Deepen that seam with local settlement and generation checks; do not add a renderer Interface, generic task runner, global rejection handler, or Workspace error channel.

## Constraints

- Preserve Home/Review wire reads, projection attempts, route semantics, visible accepted UI, no replay, and latency budgets.
- Do not swallow an active failure or report an obsolete one.
- Preserve the unrelated root `package.json` bump.

## Resolution comment

Yes. The Application now gives post-start `show-home` effects one specific
owner, `#showHomeFromEffect`. It captures the Home route generation created
synchronously by `#showHome`, observes that Promise at creation, ignores a
failure after stop or a successor Home generation, and otherwise renders the
existing truthful `Home unavailable: <semantic error>` failed state. A terminal
handler also contains an unexpected failure while presenting that error. Startup
continues to await `#showHome` directly, so its prior failure propagation is
unchanged; no generic task runner or renderer abstraction was introduced.

Two focused real-View contracts drive the 64-item page boundary through the
keyboard. The active case injects a rejected `workspace.home` read and observes
zero `unhandledRejection`s plus the exact visible failure in both the semantic
tree and raw terminal write. The supersession case holds that read, starts a
newer successful Home generation, then rejects the old read and proves the
65th item remains visible with no stale failure. Restoring the old fire-and-
forget call produces the injected error as an actual `unhandledRejection` in
both contracts.

On Node 26.5.1 with pnpm 11.20.0, the focused Application set passes four files /
25 tests. Canonical `v1:verify` passes 27 files / 159 tests, typecheck, builds,
and smoke; all four compiled State, Local Runtime, reviewed Pi 0.80.6, and
dogfood probes pass, and `git diff --check` is clean. Home reads, projections,
commands, route generation, startup semantics, renderer boundary, Workspace
Interface, user data, and the unrelated `package.json` bump remain unchanged.
