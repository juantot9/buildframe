---
id: WF-118
title: "Share array-form SHA-256 coding"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-117]
created: 2026-08-26
---

## Question

Can one Workspace-owned SHA-256 representation Module preserve every existing digest byte while giving multi-part coding an array-shaped Interface that a unary digest function cannot silently satisfy, and move the Pi Adapter onto that exact contract before its package boundary is re-proved?

## Acceptance evidence

- A narrow `@neoflow/workspace/sha256` subpath exposes exactly `sha256(value)` for UTF-8 strings or bytes and `sha256Parts(parts)` for string parts. The semantic Workspace root and Pi Adapter root remain unchanged.
- `sha256Parts` takes one readonly array parameter and retains the Pi Adapter's exact coding: each UTF-8 part is followed by one NUL byte, including the final part. Type evidence proves the unary function cannot satisfy the multi-part function type.
- Golden source tests pin unary string/byte vectors and the current empty, one-part, and multi-part Pi vectors. An exact Pi Attachment Identity and attachment evidence identity remain byte-for-byte unchanged through the existing Adapter contract.
- The three W-13 Workspace copies in Reviewing, Workspace Evidence, and Harness Interaction and the Pi Adapter copy all consume the shared Module. No local variadic `sha256` contract remains; Pi's unrelated final-answer content digest uses the same unary representation without changing bytes.
- A focused separator mutation fails the golden multi-part evidence. A varargs-signature mutation fails typecheck/call sites, proving the array form is load-bearing rather than stylistic.
- The new source and compiled representation subpath both expose exactly two values and produce the same vectors. Existing Workspace root/runtime/Base64/Harness Interaction surfaces and the Pi default-only root stay exact; clean declarations leak no hash implementation type.
- Authoritative State checksums, the incremental Workspace Evidence stream hasher, Local Runtime location hashing, durable digest fields, identity prefixes, and all producer call-part lists remain unchanged.
- Focused Workspace representation and Pi Adapter contracts, both package typechecks/builds, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent package-order checkpoint: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled array-form requirement and Pi Adapter inheritance: [`W-13`](../docs/audit/pre-p17-codebase-findings.md#w-13--validation-and-digest-helpers-are-copied-across-modules-and-two-sha256s-disagree)
- Corrected hazard and shared-helper ruling: [Disposition the Workspace reviewing and diff findings](./WF-073-disposition-workspace-reviewing-and-diff-findings.md)
- Inward package direction and closed semantic root: [Define the target Module architecture](./WF-041-define-target-module-architecture.md)

## Seam decision

The Workspace is the innermost package already consumed by the Pi Adapter, so it owns this pure representation seam. A dedicated SHA-256 subpath keeps byte coding out of the semantic Workspace root and avoids both an outward dependency and a generic utility package. The seam is real—four production owners consume it—and its two-function Interface distinguishes unary bytes from multi-part framing instead of overloading one function shape.

## Constraints

- Preserve every current digest and identity byte; do not change the NUL delimiter, add a domain prefix, sort parts, or concatenate before hashing.
- Use an array for the multi-part Interface. Varargs do not discharge W-13 because a unary function can satisfy that type.
- Migrate only W-13's named copies plus Pi's same-algorithm final-answer digest; do not sweep unrelated checksum, stream, or location hash implementations.
- Do not expose digest helpers from either semantic package root or create a cross-package utility package.
- Treat this as the outstanding W-13 prerequisite discovered before the Pi Adapter boundary checkpoint; do not claim that checkpoint until this child closes.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The Workspace now owns one pure `sha256` representation Module. Its narrow
subpath exposes only `sha256(value)` for UTF-8 strings or bytes and
`sha256Parts(parts)` for multi-part strings. The latter takes one readonly array
and retains the Pi Adapter's exact framing: each part is streamed into SHA-256 and
followed by one NUL byte, including the final part. The declaration exposes only
those value types and no Node hash implementation type.

Reviewing, Workspace Evidence, and Harness Interaction import the unary function
instead of defining W-13's three Workspace copies. The Pi Adapter imports both
forms, has no local hash implementation, makes six multi-part calls through the
array contract, and uses the unary form once for final-answer content. Its private
`exactIdentity` still accepts convenient rest arguments but crosses the shared
seam with the resulting readonly array. An AST census finds exactly those four
production consumers and no local `sha256` declaration in any of the four former
owners.

Two source tests pin the exact empty, ASCII, UTF-8, byte, one-part, and multi-part
vectors and the source Module's exact two-value surface. A compile-time relation
also proves the unary function does not satisfy the multi-part function type. The
existing Pi Adapter contract now pins the pre-change Attachment Identity
`att_03db5676e1368f7c65df0f9ff8f504e68e39e72509591395744999f5a0ee4c5a`
and attachment evidence identity
`pi-attachment:21367cb70c5d23fc286cb8fbe404f29e9b315a23b121a4ce42e8dc27ace4f392`;
both remain exact.

Removing the NUL update makes the selected multi-part regression fail 1/1, with
the one-part digest collapsing to the unary digest. Temporarily changing
`sha256Parts` back to varargs makes Pi typecheck fail at all six array calls with
TS2345 and makes the test typecheck fail with TS2322 (`true` is not assignable to
`false`). Restoring the array form returns the focused representation, Adapter,
and source-island set to 11/11.

The Workspace manifest now has a deliberate fifth subpath. Source and compiled
`@neoflow/workspace/sha256` each expose exactly `sha256` / `sha256Parts` and return
the same golden vector; every compiled manifest target exists. The semantic
Workspace root remains two values, runtime one, Base64 two, Harness Interaction
zero, and the Pi root only its default extension. Both package typechecks/builds
and the dependency firewall pass. No lockfile change is needed.

On Node 26.5.1 with pnpm 11.20.0, canonical `pnpm v1:verify` passes all 23 files /
140 tests, typecheck, builds, and smoke. All four compiled risk probes pass,
including the pinned Pi 0.80.6 lifecycle, and `git diff --check` is clean.
Authoritative State checksums, the incremental Evidence stream hasher, Local
Runtime location hashing, durable fields, identity prefixes, call-part lists, and
every digest byte remain unchanged. The unrelated root `package.json` bump
remains excluded. W-13's shared-digest and Pi inheritance obligation is now closed,
so the Pi Adapter package boundary can be re-proved next.
