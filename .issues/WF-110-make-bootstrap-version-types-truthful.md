---
id: WF-110
title: "Make bootstrap version types truthful"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-109]
created: 2026-08-26
---

## Question

Can the Local Runtime bootstrap parser prove every literal version type it returns while representing peer-supported rejection versions honestly, so compatibility enforcement has one owner and caller-specific identity/role checks stay local?

## Acceptance evidence

- A refreshed census preserves the six narrowly typed protocol version fields and their settled three grades: the two Harness Adapter fields already validate correctly, the two accepted-bootstrap fields move to exact parser validation, and the two rejected-bootstrap supported-version fields widen to `number`.
- `parseBootstrapAcceptedFrame` returns a `BootstrapAcceptedFrame` only when both negotiated versions equal `LOCAL_RUNTIME_PROTOCOL_VERSION` and `WORKSPACE_INTERFACE_VERSION`; either mismatch is rejected before the literal type is asserted.
- The client and Harness Adapter delete their four now-redundant accepted-version comparisons, including the stale hardcoded Workspace `1`, while retaining caller-owned Workspace Identity and role validation.
- `BootstrapRejectedFrame` accepts safe peer-supported protocol and Workspace Interface versions that differ from this process's constants. A typed fixture with differing values compiles and round-trips through the parser.
- Focused parser evidence fails against the old permissive accepted parser, and TypeScript rejects the differing rejected-frame fixture against the old over-narrow declarations.
- Valid bootstrap, incompatible bootstrap, Workspace client, and Harness Adapter behavior retain their existing diagnostics and wire objects. No protocol version, field, rejection code, timeout, role, or package Interface changes.
- Focused Local Runtime parser and socket contracts, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled three-grade repair and exact call-site obligation: [`L-04`](../docs/audit/pre-p17-codebase-findings.md#l-04--the-bootstrap-parser-manufactures-a-literal-version-type-it-never-verified)
- Local Runtime disposition reasoning: [Disposition the Local Runtime and Pi Adapter findings](./WF-066-disposition-local-runtime-and-pi-adapter-findings.md)
- Typed Workspace seam prerequisite: [Type the Local Runtime to Workspace seam](./WF-081-type-local-runtime-workspace-seam.md)

## Seam decision

`protocol.ts` owns proof that an untrusted frame satisfies a protocol frame type. It therefore owns constant-version validation before returning an accepted frame. Connection callers still own facts the parser cannot know—the requested Workspace Identity and role—but no longer repeat negotiated-version policy. Rejected frames travel in both directions, so their peer-supported versions remain validated safe numbers rather than falsely local literals. This deepens the existing parser Interface and adds no seam.

## Constraints

- Follow the settled grades in opposite directions; do not validate rejected-frame supported versions against local constants.
- Keep the correctly validated Harness Adapter protocol fields unchanged.
- Remove only redundant read-side accepted-version comparisons; do not change version constants, request frame types/producers, compatibility declarations, or handshake diagnostics in this child.
- Keep tests at the private parser and existing semantic socket Interfaces; do not expose protocol parsing through the package root.
- Do not combine L-04 with L-01, L-02, X-04, or X-06.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The six protocol fields now follow their three settled grades. The two
Harness Adapter literal fields retain their existing exact parser checks. The two
accepted-bootstrap literals are now proved by direct comparison with
`LOCAL_RUNTIME_PROTOCOL_VERSION` and `WORKSPACE_INTERFACE_VERSION` inside
`parseBootstrapAcceptedFrame`. The two rejected-bootstrap supported-version
fields are plain `number` values and retain safe-integer validation on read.

With negotiated-version policy owned by the accepted parser, the Workspace client
and Harness Adapter no longer repeat its four comparisons. Their request-specific
Workspace Identity and role checks remain, while the stale hardcoded accepted-side
Workspace `1` disappears. A source census finds the two exact parser comparisons,
zero accepted-version comparisons in either caller, and zero over-narrow rejected
supported-version fields. Request producers, compatibility declarations, and the
already-correct Harness Adapter protocol parsing remain unchanged.

The new private protocol contract accepts the exact current pair, rejects either
mismatched accepted version, and round-trips rejection frames carrying differing
peer-supported versions. Restoring the old permissive accepted checks makes the
focused runtime scenario fail 1/1. Restoring the old rejected literal declarations
makes test typecheck fail at both differing fixtures with TS2322. Restored source
passes all four focused files / 14 tests and test typecheck.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the dependency
firewall, all 21 files / 136 tests, typecheck, builds, and smoke. All four compiled
risk probes pass, and `git diff --check` is clean. No wire field, protocol version,
rejection code, diagnostic, role, timeout, package Interface, or valid handshake
behavior changed. The unrelated root `package.json` bump remains excluded.
