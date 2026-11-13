---
id: WF-117
title: "Match Pi correlation markers by fields"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-116]
created: 2026-08-26
---

## Question

Can the Pi Adapter recover terminal evidence from a Pi-round-tripped correlation marker whenever all five scalar fields match, regardless of object key order, while still failing closed on every field mismatch?

## Acceptance evidence

- A Pi Adapter contract scenario dispatches and starts a real reviewed invocation through the existing Adapter Interface, then settles it with the stored correlation marker rebuilt in reverse property insertion order. It emits the exact successful terminal evidence rather than `terminal-evidence-lost`.
- The same scenario changes each of the five marker fields independently and proves every mismatch emits `harness.invocation.correlation-lost` with reason `terminal-evidence-lost`, with no terminal evidence fabricated.
- The old `JSON.stringify(value) === JSON.stringify(expected)` implementation fails the reordered-marker scenario. A focused omission mutation fails the corresponding field-mismatch assertion.
- Private `markerMatches` compares exactly `schema`, `attachmentIdentity`, `invocationIdentity`, `correlationIdentity`, and `disclosureSha256` directly. It adds no generic deep-equality helper, serializer, validator, or public test seam.
- The marker producer shape and order, correlation Entry type, evidence identities and shapes, fail-closed policy, prompt JSON serialization, deadlines, and reviewed Pi 0.80.6 capability remain unchanged.
- The package root continues to expose only its default host-loaded extension. Focused Pi Adapter contracts and source-island checks, package typecheck/build, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled cross-package repair and Pi Adapter inheritance: [`X-03`](../docs/audit/pre-p17-codebase-findings.md#x-03--jsonstringify-equality-comparisons)
- Five-field ruling: [Disposition the Workspace reviewing and diff findings](./WF-073-disposition-workspace-reviewing-and-diff-findings.md)
- Closed Workspace half: [Prove key-order-independent Harness replay](./WF-101-prove-key-order-independent-harness-replay.md)

## Seam decision

The repair stays inside the existing private `markerMatches` implementation and is proved through `PiReviewedAdapter.agentSettled`. The Adapter Interface already supplies the whole terminal-correlation behavior; exporting marker equality or manufacturing a generic object-comparison Module would create a shallow Interface for one five-field representation.

## Constraints

- Treat all five marker fields as correlation-critical; do not weaken a mismatch into successful correlation.
- Compare scalar values directly rather than canonicalizing, sorting, cloning, or stringifying the object.
- Leave X-03's accepted in-process comparisons and its already-closed Workspace durable-comparison half untouched.
- Do not alter the marker's written object shape or add compatibility fields.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. Private `markerMatches` now reads and compares the five correlation-critical
scalar fields directly: `schema`, Attachment Identity, Invocation Identity,
correlation identity, and disclosure digest. It no longer serializes either
object, while the producer still writes the exact same five-field marker in the
same order. The only remaining `JSON.stringify` in `piAdapter.ts` is the unchanged
direct-review prompt envelope serialization.

The Adapter contract now starts a real reviewed invocation, rebuilds Pi's stored
marker with all five exact values in reverse insertion order, and settles through
`PiReviewedAdapter.agentSettled`. That invocation emits its exact
`harness.invocation.terminal-observed` evidence and answer, with no correlation
loss. Five fresh invocations then alter one marker field each; every one emits
`harness.invocation.correlation-lost` with `terminal-evidence-lost` and no terminal
evidence.

Restoring the old `JSON.stringify` comparison makes the selected regression fail
1/1 because no terminal evidence is found for the reordered exact marker. A
focused mutation omitting the `disclosureSha256` comparison also fails 1/1 at the
field-labelled mismatch assertion. The repaired selected scenario passes 1/1;
the complete Pi Adapter contracts and source-island check pass 7/7, and package
typecheck/build pass. The compiled package root still exposes only the default
host-loaded extension.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the dependency firewall,
all 22 files / 138 tests, typecheck, builds, and smoke. All four compiled risk
probes pass, including the pinned Pi 0.80.6 live lifecycle, and `git diff --check`
is clean. No marker producer, Entry type, evidence identity or shape, fail-closed
policy, capability, deadline, package Interface, or protocol version changed. The
unrelated root `package.json` bump remains excluded. Together with WF-101, X-03 is
now closed across the Workspace and Pi Adapter.
