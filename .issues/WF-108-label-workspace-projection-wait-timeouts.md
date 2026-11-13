---
id: WF-108
title: "Label Workspace Projection wait timeouts"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: []
created: 2026-08-26
---

## Question

Can every bounded predicate wait in the Workspace Projection scenarios report the condition that timed out, without consolidating test helpers or changing their polling policy?

## Acceptance evidence

- A refreshed census still finds four 5 ms predicate pollers: the Application helper already takes a label, while Workspace Projection and two Local Runtime helpers remain unlabelled. This package-ordered child changes only the Workspace-owned helper; the two Local Runtime sites remain explicit follow-up work for that package turn.
- The test-local Workspace Projection `waitFor` takes a required `label: string` and reports `Timed out waiting for ${label}`, matching the established Application diagnostic shape.
- All 11 Workspace Projection call sites provide condition-specific labels. No call remains positional-but-unexplained or falls back to a generic timeout message.
- The existing 200-attempt / 5 ms bound, synchronous predicate shape, return behavior, and test scenario ordering remain unchanged.
- A focused fault mutation makes one real projection wait exhaust its bound and the observed Vitest failure names that exact condition; restoring the predicate leaves the complete Workspace Projection scenarios green.
- No helper is shared, no test-support dependency or Module is introduced, and the differing Workspace, Local Runtime, and Application deadlines remain untouched.
- Focused Workspace Projection tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent route and package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled diagnostic-only repair and accepted consolidation half: [`X-06`](../docs/audit/pre-p17-codebase-findings.md#x-06--four-near-duplicate-waitfor-helpers)
- Corrected census and package-local ruling: [Disposition the Workspace test-source findings](./WF-074-disposition-workspace-test-source-findings.md)

## Seam decision

There is no production Module seam to deepen here. The four helpers are test-local mechanics with differing owners and deadlines, and cross-package consolidation is explicitly accepted rather than fixed. This child therefore improves only the Workspace scenario diagnostic at its existing local seam. It adds one required fact to that helper's test-only Interface and no abstraction, import, package edge, or production surface.

## Constraints

- Keep the Workspace helper local to `workspaceProjection.test.ts`; do not extract or export it.
- Preserve exactly 200 attempts and the 5 ms interval; do not reinterpret the finding as a timeout-policy change.
- Use specific condition labels at every call rather than one repeated generic label.
- Do not edit either Local Runtime helper in this Workspace child; carry them to the Local Runtime turn.
- Do not alter production source or add a test whose normal success path deliberately waits for timeout.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The Workspace Projection helper now requires a condition label and throws
`Timed out waiting for ${label}` after the same 200 attempts at the same 5 ms
interval. All 11 call sites pass distinct condition-specific labels covering the
initial, hint-driven, fallback, unavailable, recovered, continuation, moved-HEAD,
and State-version subscription updates. The predicate remains synchronous and
all success-path ordering is unchanged.

A TypeScript-AST census reports two helper parameters, 11 calls with two
arguments each, and zero generic timeout messages in the Workspace file. The
other three pollers are unchanged: the Application baseline remains labelled,
while the two Local Runtime files retain their three one-argument calls and two
generic messages for that package turn. No shared helper, import, package edge,
deadline change, production edit, or normal-path timeout test was introduced.

For focused fault evidence, the initial Live Changes predicate was temporarily
made permanently false. The one selected scenario failed 1/1 after the real
bound with `Timed out waiting for initial Live Changes subscription update`,
rather than the old source's `condition was not reached`. Restoring the predicate
leaves the complete Workspace Projection file passing 7/7.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the dependency
firewall, all 20 files / 134 tests, typecheck, builds, and smoke. All four
compiled risk probes pass, and `git diff --check` is clean. The unrelated root
`package.json` bump remains excluded.
