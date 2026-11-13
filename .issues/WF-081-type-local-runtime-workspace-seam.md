---
id: WF-081
title: "Type the Local Runtime to Workspace seam"
status: closed
labels:
  - wayfinder:task
parent: WF-079
assignee: juanan
blocked_by: [WF-080]
created: 2026-08-09
---

## Question

Can L-03 replace Local Runtime's `DynamicWorkspace` and double cast with the real Workspace Interface so command, request, scope, result, and update drift fails at build time while JSON frames remain runtime-validated at their owning seams?

## Blocked by

- [Add terminal Review lifecycle regressions](./WF-080-add-terminal-review-lifecycle-regressions.md)

## Acceptance evidence

- `RuntimeClientConnection` depends on the existing Workspace Interface, not a wider or duplicate shape.
- No `request.workspace as unknown as DynamicWorkspace` or equivalent type escape remains.
- Compile-time coverage demonstrates Workspace command/request drift is visible to Local Runtime.
- Existing real-socket contracts and canonical affected checks pass; no public Interface is widened.

## Resolution comment

Closed L-03 by making `RuntimeClientConnection` hold the imported `Workspace` Interface directly and deleting `DynamicWorkspace` plus `request.workspace as unknown as DynamicWorkspace`. The private protocol's operation union now relates `execute` payloads to `WorkspaceCommand`, `read` payloads to `WorkspaceViewRequest`, and subscription scopes to `WorkspaceViewScope`; the discriminant narrows direct calls at compile time. Payload semantics remain opaque on the wire and are still validated fail-closed by their Workspace owners.

`pnpm v1:typecheck` passes, all 12 Local Runtime tests pass, the removed type escape is absent, and `git diff --check` is clean under Node 26.5.1. No public Interface changed.

## Authority

- [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)
- L-03 in [`docs/audit/pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md)
