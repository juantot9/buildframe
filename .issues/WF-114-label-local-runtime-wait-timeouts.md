---
id: WF-114
title: "Label Local Runtime wait timeouts"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-113]
created: 2026-08-26
---

## Question

Can all three Local Runtime predicate waits identify the condition that exhausted its bound, without sharing helpers or changing their 500 ms polling policy?

## Acceptance evidence

- A refreshed census finds the two remaining unlabelled predicate pollers in `localRuntime.test.ts` and `harnessAdapterRuntime.test.ts`, covering three calls. The Workspace and Application pollers remain unchanged and labelled.
- Both Local Runtime test-local `waitFor` helpers take a required `label: string` and throw `Timed out waiting for ${label}` after exhaustion.
- Each of the three calls supplies a condition-specific label: initial Workspace Identity delivery, the explicitly published Workspace Identity delivery, and Harness Adapter disconnect evidence.
- Both helpers retain exactly 100 attempts, the 5 ms interval, synchronous predicates, and existing scenario ordering.
- Focused fault mutations make one real wait in each file permanently false. The two selected scenarios fail 2/2 after their real bounds and each failure names its own condition rather than `condition was not reached`.
- A source census finds two two-parameter helpers, three two-argument calls, and no generic timeout message in Local Runtime tests.
- No helper is shared or exported, no dependency or test-support Module is added, and no production source or normal-success-path timeout test changes.
- Focused Local Runtime contracts, test typecheck, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled diagnostic-only repair and accepted consolidation half: [`X-06`](../docs/audit/pre-p17-codebase-findings.md#x-06--four-near-duplicate-waitfor-helpers)
- Corrected census and package-local ruling: [Disposition the Workspace test-source findings](./WF-074-disposition-workspace-test-source-findings.md)
- Completed Workspace half: [Label Workspace Projection wait timeouts](./WF-108-label-workspace-projection-wait-timeouts.md)

## Seam decision

There is no production Module seam to deepen. Each predicate poller remains a test-local Module whose small Interface gains the one fact needed for actionable failure diagnostics. The differing package owners and deadlines remain local; X-06's cross-package consolidation half stays accepted rather than being reopened.

## Constraints

- Keep each helper in its current file; do not extract, export, or import a shared helper.
- Preserve exactly 100 attempts and the 5 ms interval in both files.
- Use a specific label at each call rather than one repeated generic label.
- Do not change production source or add a permanent test that deliberately exhausts a normal-path wait.
- Do not combine this diagnostic child with the Local Runtime package-boundary checkpoint.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. Both Local Runtime pollers now require a label and report
`Timed out waiting for ${label}` after the same 100 attempts at the same 5 ms
interval. The two semantic-runtime waits distinguish initial Workspace Identity
delivery from the explicitly published successor, and the Harness Adapter wait
names its disconnect evidence. Predicate shape, success ordering, and the ~500 ms
budgets are unchanged.

A TypeScript-AST census reports two parameters on each of the two helpers,
three calls with two arguments and string-literal labels, and zero generic
`condition was not reached` messages in Local Runtime tests. No helper moved,
was shared, or gained an import.

For focused fault evidence, the first semantic subscription predicate and the
Harness Adapter disconnect predicate were temporarily made permanently false.
The two selected scenarios failed 2/2 after their real bounds with
`Timed out waiting for initial Workspace Identity subscription update` and
`Timed out waiting for Harness Adapter disconnect evidence`. Restoring both
predicates leaves the two complete contract files passing 9/9.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the dependency
firewall, all 22 files / 137 tests, typecheck, builds, and smoke. All four compiled
risk probes pass, and `git diff --check` is clean. No production source, shared
test Module, dependency, polling policy, or normal-path timeout test changed. The
unrelated root `package.json` bump remains excluded. X-06's diagnostic half is now
closed at all four pollers; its cross-package consolidation half remains accepted.
