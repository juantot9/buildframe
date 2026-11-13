---
id: WF-107
title: "Trim dead Authoritative State re-exports"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: []
created: 2026-08-26
---

## Question

Can the private Authoritative State Module stop forwarding protocol types that no caller consumes, leaving its internal Interface equal to the vocabulary its production and test callers actually use?

## Acceptance evidence

- A refreshed TypeScript-AST census across tracked source finds 25 type names forwarded from `authoritativeStateProtocol.ts`: 11 have a consumer through `authoritativeState.ts` and 14 have none.
- The forwarding block retains exactly `AuthoritativeStateErrorCode`, `StateCommitRequest`, `StateCommitResult`, `StateContentReadRequest`, `StateContentReadResult`, `StateReadRequest`, `StateReadResult`, `StateRecord`, `StateRecordWrite`, `StateStatus`, and `StateTestFailpoint`.
- It removes exactly `ImmutableStateRecordWrite`, `RevisionedStateRecordWrite`, `StateCommandResultEnvelope`, `StateContentReference`, `StateContentWindow`, `StateContentWindowAvailable`, `StateContentWindowRequest`, `StateContentWindowUnavailable`, `StateContentWrite`, `StateMigrationCheckpoint`, `StateQuarantineReason`, `StateQuarantineReport`, `StateRecordClass`, and `StateRecoverySummary` from that forwarding path.
- All 14 types remain available to their real implementation consumers from `authoritativeStateProtocol.ts`; in particular, `authoritativeState.ts` keeps its own direct `StateMigrationCheckpoint` import.
- Every current production and test importer of `authoritativeState.ts` typechecks unchanged. The emitted runtime JavaScript and root Workspace Interface remain unchanged because the edit removes only erased type exports from a package-private path.
- The refreshed census, focused Authoritative State and direct-importer scenarios, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent route and package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled corrected count and exact survivor set: [`W-15`](../docs/audit/pre-p17-codebase-findings.md#w-15--thirteen-of-authoritativestatetss-twenty-five-re-exports-have-no-consumer)
- Workspace state/projection disposition: [Disposition the Workspace state and projection findings](./WF-072-disposition-workspace-state-and-projection-findings.md)

## Seam decision

`authoritativeState.ts` is the private in-package State seam used by semantic owners and their scenarios; `authoritativeStateProtocol.ts` remains the complete worker-protocol vocabulary. Trimming the curated forwarding block makes that private Interface truthful without moving the seam, redirecting callers around it, or changing the package Interface. This child deletes accreted Interface surface and introduces no new Module or abstraction.

## Constraints

- Remove only the 14 dead re-exports; do not delete or rename their protocol declarations or alter worker imports and messages.
- Keep the 11 types with current consumers, including seven used only by tests; do not manufacture a narrower production-only Interface by bypassing the State seam from tests.
- Do not change values, runtime validation, State behavior, generated JavaScript, package exports, or the semantic Workspace root.
- Do not add a behavioral regression test for an erased type-only deletion or pin implementation details beyond the exact source census; TypeScript compilation is the safety proof.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. A TypeScript-AST census before the edit found the settled 25 forwarded
protocol types: 11 with at least one importer through `authoritativeState.ts` and
14 with none. The forwarding block now contains exactly those 11 live names and
zero unconsumed names. The complete protocol Module still declares all 33 of its
types, including all 14 removed from this path, and `authoritativeState.ts` keeps
its direct implementation import of `StateMigrationCheckpoint`.

The implementation is the promised fourteen-line deletion. No caller was
redirected to the protocol Module, so every semantic owner and scenario still
crosses the same private State seam. The Workspace package root remains exactly
`WORKSPACE_INTERFACE_VERSION` and `bootstrapWorkspace`. A before/after comparison
of compiled `dist/authoritativeState.js` is byte-identical, confirming that the
erased type-only edit changes no runtime artifact. No behavioral test was added
for absence of private type surface; TypeScript compilation and the exact census
are the evidence appropriate to this maintainability repair.

On Node 26.5.1 with pnpm 11.20.0, the seven focused direct-importer files pass all
54 tests. `pnpm v1:verify` passes the dependency firewall, all 20 files / 134
tests, typecheck, builds, and smoke. All four compiled risk probes pass, and
`git diff --check` is clean. No State declaration, protocol message, runtime
validation, value export, package export, or durable behavior changed. The
unrelated root `package.json` bump remains excluded.
