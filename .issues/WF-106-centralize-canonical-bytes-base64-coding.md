---
id: WF-106
title: "Centralize canonical bytesBase64 coding"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: []
created: 2026-08-13
---

## Question

Can the Workspace-owned `bytesBase64` wire representation have one canonical encoder/decoder pair across Workspace producers and Application consumers without changing the closed semantic Workspace Interface?

## Acceptance evidence

- A refreshed census covers 24 semantic operations across the same seven active-source files: 11 encodes and 13 decodes after duplicate decoding at one Anchor site is collapsed. The two `authoritativeStateWorker.ts` checksum encodings remain explicitly outside this codec.
- One narrow `@neoflow/workspace/bytes-base64` representation Module exports only `encodeBytesBase64(Uint8Array)` and `decodeBytesBase64(unknown)`; the decoder either returns exact bytes or throws for every non-string or non-canonical spelling.
- Every production `bytesBase64` producer and consumer in Workspace and the Application uses that pair. A source census leaves direct Base64 conversion only inside the pair and the two out-of-scope durable-checksum sites.
- Contract evidence pins empty and non-empty canonical round trips, subarray boundaries, arbitrary binary bytes, and rejection of malformed alphabet, whitespace, omitted/excess padding, and non-zero padding bits.
- Existing Workspace and Application Interface scenarios preserve exact projected text, Anchor bytes/digests, window progression, truncation metadata, and rendered output.
- The root Workspace Interface remains exactly `WORKSPACE_INTERFACE_VERSION` and `bootstrapWorkspace`; no command, view, subscription, record shape, field type, or stored byte changes.
- Focused codec, Workspace Reviewing/Harness/Projection/Evidence, and Application tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent route and package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled complete sweep and checksum exclusions: [`W-12`](../docs/audit/pre-p17-codebase-findings.md#w-12--the-bytesbase64-codec-is-hand-rolled-at-20-sites-and-validated-at-one)
- Reviewing/diff disposition: [Disposition the Workspace reviewing and diff findings](./WF-073-disposition-workspace-reviewing-and-diff-findings.md)

## Seam decision

`bytesBase64` is already a Workspace-owned representation invariant carried by its public view types and consumed in production by the Application. The dedicated subpath is therefore a real two-package seam with a two-function Interface, not an internal test seam or generic validation package. It keeps the semantic Workspace root closed and gives canonicality one owner. If implementation requires another export or a caller-specific option, stop rather than widen it.

## Constraints

- Preserve the exact standard padded Base64 spelling currently emitted; this is consolidation, not a wire migration.
- Keep validation at decode by default. Do not retain permissive `Buffer.from(value, 'base64')` call sites beside the codec.
- Do not touch the two checksum canonicalization calls in `authoritativeStateWorker.ts`.
- Do not introduce a generic encoding package, configurable policy, branded field migration, or new Workspace command/view surface.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The Workspace now owns one two-function representation Module at
`@neoflow/workspace/bytes-base64`. `encodeBytesBase64` encodes the exact selected
`Uint8Array` span with the existing standard padded alphabet;
`decodeBytesBase64` accepts `unknown`, returns a `Buffer` only when re-encoding
produces the identical string, and otherwise throws one `TypeError`. The subpath
exports exactly those two functions. The semantic Workspace root still exposes
only `WORKSPACE_INTERFACE_VERSION` and `bootstrapWorkspace`.

The refreshed census is 24 semantic operations across the same seven files: 11
Workspace encodes and 13 decodes (nine Application, one Harness Interaction, and
three Reviewing). All now cross the pair; Reviewing's local wrapper only
translates codec failure into its existing owner-specific state error. A final
active-source census leaves direct Base64 conversion only in the codec itself and
at `authoritativeStateWorker.ts:213`/`:216`, whose durable checksum input remains
explicitly out of scope and byte-for-byte unchanged.

The codec contract pins empty and aligned values, arbitrary binary data, and an
offset subarray so backing bytes cannot leak into an encoding. It rejects
non-strings, malformed alphabet, surrounding whitespace, missing or excess
padding, and non-zero padding bits. Removing canonical re-encoding makes the
rejection scenario fail 1/1; encoding the whole backing buffer makes the selected-
span scenario fail 1/1. Restored source passes the six owning files / 62 focused
tests, while existing Workspace and Application scenarios preserve exact text,
Anchors, digests, windows, and rendering.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the dependency
firewall, all 20 files / 134 tests, typecheck, builds, and smoke. All four
compiled risk probes pass, and `git diff --check` is clean. No command, view,
subscription, field shape, durable byte, or canonical spelling changed. The
unrelated root `package.json` bump remains excluded.
