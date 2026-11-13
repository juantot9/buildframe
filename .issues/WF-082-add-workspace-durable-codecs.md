---
id: WF-082
title: "Add compiler-checked Workspace durable codecs"
status: closed
labels:
  - wayfinder:task
parent: WF-079
assignee: juanan
blocked_by: [WF-081]
created: 2026-08-09
---

## Question

Can W-13 replace whole-object proof casts across Workspace Reviewing and Harness Interaction durable records with owner-local codecs that validate complete owned structure and construct compiler-checked values before Live Changes changes those records?

## Blocked by

- [Type the Local Runtime to Workspace seam](./WF-081-type-local-runtime-workspace-seam.md)

## Acceptance evidence

- Reviewing and Harness Interaction each validate the complete durable structures they own and construct typed results without `as unknown as T` standing in for proof.
- The malformed Snapshot with valid outer identities and empty `basis`, `comparedState`, and `manifest` is rejected through the owning Interface, with a broader malformed nested-value matrix for changed durable shapes.
- Opaque semantic payloads remain opaque where Workspace does not own their meaning.
- No generic validation package or new public Interface is introduced; Local Runtime, Application, unrelated `deepFreeze`/`validText`, and legacy work stay untouched.

## Resolution comment

Closed the pre-P16B Workspace portion of W-13. Reviewing now has complete codecs for its index, Snapshot evidence, Snapshot files, manifest and Diff windows, Anchors, Questions, Drafts, Batches, dispositions, Responses, and durable command results. Harness Interaction likewise constructs validated input, index, compatibility, evidence, and command-result values. Whole-object `as unknown as T`/`as never` proofs are gone from both owners; branded scalar casts follow explicit pattern checks. One package-private `recordCodec.ts` now owns the structural object/key/membership primitives shared by these owner codecs.

`workspaceDurableCodecs.test.ts` regresses the exact empty nested Snapshot that the old parser accepted, incomplete Snapshot file/Anchor/Review command structures, and an incomplete durable Harness result through `Workspace.read`; all fail under the old proof casts. All 56 Workspace tests, `pnpm v1:typecheck`, the one-object-guard/source-cast checks, and `git diff --check` pass under Node 26.5.1.

Local Runtime and Application codecs, unrelated `deepFreeze`/`validText`, legacy definitions, and cross-package validation remain untouched by this child.

## Authority

- [Replace repeated isRecord validation with owner-local codecs](./WF-078-revisit-active-input-codecs.md)
- W-13 in [`docs/audit/pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md)
- [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)
