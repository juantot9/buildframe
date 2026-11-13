---
id: WF-111
title: "Prove Local Runtime unsubscribe acknowledgement"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-110]
created: 2026-08-26
---

## Question

Can the Local Runtime contracts prove ordered unsubscribe acknowledgement, tolerated already-queued updates, and no delivery after acknowledgement using positive protocol round trips rather than fixed sleeps?

## Acceptance evidence

- The semantic client scenario removes its 10 ms sleep. After local cancellation it permits a deliberately racing publish, observes a same-stream read round trip after the acknowledgement, publishes again after that barrier, observes a second read result, and then requires the update sequence to remain exactly `[2, 3]`.
- The raw socket scenario removes its unasserted 5 ms tail, reads the exact `workspace.unsubscribed` acknowledgement, publishes after that acknowledgement, then requires the next observed frame to be a requested `workspace.result` rather than a leaked update.
- The formerly constant client read is replaced by named causal barriers: the first proves all earlier server-to-client frames, including acknowledgement, were processed; the second bounds absence of the post-acknowledgement publish by an observed result.
- Focused server mutations prove both halves: a wrong acknowledgement identity fails immediately, and retaining the semantic subscription after acknowledgement makes the client and raw contracts fail on the leaked update.
- The only polling helper's existing 100-attempt / 5 ms body remains unchanged; X-06 diagnostics and L-01's contradictory source comment stay separate for their own children.
- No production behavior, protocol frame, timeout, public Interface, or test-only production seam changes.
- The complete Local Runtime socket contracts, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled three-site repair, scoped here to both Local Runtime sites: [`X-04`](../docs/audit/pre-p17-codebase-findings.md#x-04--retired-stream-guarantees-are-asserted-after-a-fixed-sleep-or-not-at-all)
- Corrected Local Runtime evidence and required acknowledgement assertion: [Disposition the Workspace test-source findings](./WF-074-disposition-workspace-test-source-findings.md)
- Completed Workspace half: [Prove silent Workspace replay with an observed update](./WF-104-prove-silent-workspace-replay-with-observed-update.md)

## Seam decision

The semantic client contract observes cancellation through the public `Workspace` unsubscribe function plus an ordered read round trip; the raw transport contract observes the protocol acknowledgement directly. Together they test the same guarantee at its two existing Interfaces without exposing client tombstones, server subscription maps, or scheduling hooks. Positive frames provide the causal barrier, so no new timer abstraction or test seam is needed.

## Constraints

- Preserve the guarantee that only already-queued updates from a known retired stream may be ignored before acknowledgement; do not weaken unknown-stream protocol failure.
- Assert both acknowledgement and post-acknowledgement non-delivery; neither fixed silence nor socket destruction is evidence.
- Do not modify production source except temporarily for focused mutation evidence.
- Do not combine this test repair with L-01's comment rewrite or X-06's wait labels.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The semantic client contract no longer treats 10 ms of silence as evidence.
It cancels locally, permits a racing publish while the retirement tombstone is
active, then observes a semantic read result after the ordered acknowledgement.
It publishes again beyond that barrier, observes a second read result, and only
then requires the complete delivered State-version sequence to remain `[2, 3]`.
The two named read results are causal barriers rather than assertions about a
constant projection.

The raw socket contract now requires the exact `workspace.unsubscribed` frame for
`sub_versions`. After that acknowledgement it publishes State version 4, sends a
read request, and requires the next frame to be that request's exact
`workspace.result`; a leaked subscription update therefore fails the test rather
than disappearing behind socket destruction. Both settled 10 ms / 5 ms sites are
gone, while the separate polling helper retains its original 100 attempts and
5 ms interval.

Two focused server mutations make both selected scenarios fail 2/2. A wrong
acknowledgement identity causes client protocol failure and an exact raw-frame
mismatch. Retaining the semantic subscription after acknowledging cancellation
causes client protocol failure and gives the raw peer a `workspace.update` where
its positive result barrier is required. Restored source passes the complete Local
Runtime socket contract 7/7.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the dependency
firewall, all 21 files / 136 tests, typecheck, builds, and smoke. All four compiled
risk probes pass, and `git diff --check` is clean. No production source, protocol
frame, timeout, public Interface, or test seam changed. L-01's comment and X-06's
helper labels remain separate. The unrelated root `package.json` bump remains
excluded.
