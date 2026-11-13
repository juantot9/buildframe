---
id: WF-166
title: "Run Local Runtime read cohorts behind operation barriers"
status: closed
labels:
  - wayfinder:task
parent: WF-165
assignee: juanan
blocked_by: [WF-165]
created: 2026-09-01
---

## Question

How should one Local Runtime connection execute adjacent read-only Workspace operations as a measured concurrent cohort while retaining a total arrival-order barrier around every command, correlated result delivery, bounded pending work, and graceful close?

## Acceptance evidence

- Change only the private `RuntimeClientConnection` operation scheduler. Consecutive `workspace.read` frames accepted after the same completed mutation barrier may begin together. A `workspace.execute` waits until every earlier read and execute has completed; every later read or execute waits for that command. No read crosses a command barrier, no two commands overlap, and Harness Adapter establishment/evidence retain their existing serial path.
- Preserve protocol and Workspace Interface versions, frame shapes and bounds, request identities, result/error codes, role checks, `MAX_PENDING_OPERATIONS`, subscription behavior and ordered unsubscribe acknowledgement, bootstrap timeout, connection isolation, runtime generation, endpoint lifecycle, and graceful-close settlement. Keep operation results correlated by request identity and deliver operation result/error frames in accepted order even when read computations finish out of order.
- Add deterministic owner-local Local Runtime contract evidence with explicit gates, not sleeps. Two adjacent reads must both enter the Workspace before either gate releases; the serial predecessor must fail there. A held earlier read must block a following execute, and that held execute must block a later read. Distinct read results may compute out of order while correlated frames remain ordered. Disconnect/dispose waits for the complete cohort, and pending-limit refusal remains exact.
- Re-run the unchanged compiled WF-165 benchmark through the real Unix-socket client/server at 153x50 rapid and quiescent cadence plus 132x50 and 80x24 no-color/ASCII controls. Keep Application request counts/shapes, six-read historical and eight-read Live bundles, same-version convergence, moved-Live-Diff retry, generation cancellation, and renderer behavior unchanged. Every route must settle below 500 ms p95 and materially converge toward the direct-owner control; feedback remains below 100 ms p95.
- If the rapid route still fails after read cohorts, stop and create a separate Application-owned reconciliation child from the retained trace. Do not fold subscription policy into this Local Runtime correction or claim that concurrent reads cancel already-started work.
- Run Local Runtime focused tests/typecheck, Application scenarios, canonical `pnpm v1:verify`, all four compiled State/Runtime/Pi/dogfood probes, and `git diff --check` on Node 26.5.1 with pnpm 11.20.0. Remove every negative control, benchmark root/output/helper, process, and socket after recording bounded results.

## Authority

- Production-transport measurement: [Make saved Version navigation feel immediate](./WF-165-make-saved-version-navigation-feel-immediate.md)
- Local Runtime Interface and topology: [Choose the Local Runtime topology](./WF-042-choose-local-runtime-topology.md)
- Ordered unsubscribe guarantee: [Prove Local Runtime unsubscribe acknowledgement](./WF-111-prove-local-runtime-unsubscribe-acknowledgement.md)
- Application bundle cohort invariant: [Settle Review bundles within the interaction budget](./WF-161-settle-review-bundles-within-budget.md)

## Seam decision

The Application already expresses independent reads through the unchanged closed Workspace Interface, and the direct owner safely runs them concurrently. The production Adapter erases that leverage by placing every frame on one serial private tail. Deepen `RuntimeClientConnection` instead of adding a bundle Interface or more Application concurrency: one connection owns a read cohort behind the last mutation barrier and an ordered result-delivery tail. This remains implementation behind the same Local Runtime and Workspace Interfaces.

## Constraints

- Do not parallelize, reorder, batch, speculate, retry, or cancel `workspace.execute`; do not allow a read accepted after a command to observe before that command completes.
- Do not add a scheduler Interface, worker pool, second socket, connection, channel, protocol field, cancellation frame, priority, cache, prefetch, timeout, dependency, telemetry, or production benchmark hook.
- Do not alter Workspace projection concurrency, durable transactions, Pi Adapter ordering, send-side framing, body limits, polling counts/delays, errors, wire bytes, or package exports.
- Do not change Application subscriptions, historical presentation/header, workflow State, P17/P18/P54, user/legacy data, or the unrelated root `package.json` bump.

## Outcome (2026-09-01)

Production commit `79cc4ec00004b4aee89ded0c11c238d14e700321` deepens only `RuntimeClientConnection`. Read computations accepted behind the same mutation barrier now share a private cohort; each command snapshots and waits for every earlier active read plus the prior command barrier, then becomes the barrier for every later operation. A separate delivery tail still sends result/error frames in accepted order by request identity, retains pending identities until delivery, and remains the graceful-close barrier. Harness Adapter operations keep their existing serial tail. Protocol/Workspace versions, frames, bounds, errors, subscriptions, unsubscribe acknowledgement, roles, endpoint lifecycle, and package Interfaces are unchanged.

Three deterministic raw/semantic contract controls prove the schedule. Two held adjacent reads both enter Workspace before either releases, the second may compute first while result frames remain first→second, an earlier held read blocks two ordered commands and both commands block a later read, and graceful disposal waits for both members of a held read cohort. Replacing the cohort predecessor with the old serial tail fails only at `both adjacent Workspace reads to start`; the repaired implementation passes and no negative control remains.

The identical compiled standalone benchmark was rerun on exact commit `79cc4ec00004b4aee89ded0c11c238d14e700321` with the same State-version-8/two-Version/two-complete-Response fixture, real Unix-socket Local Runtime, 153x50 rapid and quiescent profiles, 132x50 control, and 80x24 no-color/ASCII control. Rapid 153x50 p95 settlement is now 350.380 ms Live→latest, 353.580 ms latest→older, 313.411 ms older→newer, and 324.789 ms newer→Live, down from 644.140/1,183.846/1,223.013/1,382.675 ms. Quiescent p95 is 332.623–354.344 ms; every 132x50 and 80x24 rapid route is at or below 349.249 ms. Feedback remains at or below 34.776 ms p95. Production transport now converges with the exact direct-owner control (320.741–368.559 ms p95), so the trace does not justify a separate Application reconciliation change.

The action bundles retain the exact successful six historical/eight Live requests, all shapes, stages, convergence, cancellation, and moved-Live retry. The trace still truthfully observes the existing post-settlement reconciliation reads, but concurrent read-only transport absorbs rapid overlap below budget; no read was removed, cached, prefetched, retried, or cancelled. Navigation issued no command and every semantic/raw milestone, complete Response, no-color/ASCII control, and State/Git/working-byte invariant held.

All 20 Local Runtime tests, all 28 Application tests, Local Runtime and cross-package typecheck pass. Canonical verification passes 26 files / 152 tests, clean build, and smoke; all four compiled State/Runtime/Pi/dogfood probes and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0. Disposable benchmark fixtures, outputs, helpers, negative control, processes, and sockets were removed. Genuine perceived-loading acceptance remains with the fresh Scenario A rerun.
