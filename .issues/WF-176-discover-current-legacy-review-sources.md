---
id: WF-176
title: "Discover current legacy Review sources explicitly"
status: closed
labels:
  - wayfinder:task
parent: WF-174
assignee: juanan
blocked_by: [WF-175]
created: 2026-09-02
---

## Question

Can the Workspace expose one explicit, bounded current-source discovery view over the stabilized legacy bytes without storing, importing, or leaking legacy content?

## Acceptance evidence

- Extend the closed Workspace view family with one `legacy-review.sources` read. It returns exactly two stable slots in queue-then-receipts order for the current Workspace: `<canonical-checkout>/.neoflow/review.json` and the legacy `${XDG_STATE_HOME:-~/.local/state}/neoflow/workspaces/<sha256(legacy-realpath)>/review-receipts.json` location.
- Each slot carries an opaque source identity, source kind/location, canonical source path, and one closed observation: missing; unavailable with the WF-175 path/read reason; or detected with exact byte length/digest plus recognized format and bounded counts or the closed recognition diagnostic. Receipt summaries may expose only deduplicated embedded legacy workspace paths and counts, never annotation text, excerpts, Harness session/model values, or exact source bytes.
- The view carries the current Authoritative State version for future command formation but writes no record, source marker, cache, or decision. Repeated reads over unchanged sources are equal and leave State version, source bytes, mode, mtime/ctime, and directory entries unchanged.
- Discovery runs only for the explicit read. Opening the Workspace/runtime and ordinary Home/Review reads do not touch either legacy source. An unsafe or malformed source cannot prevent runtime readiness and becomes a truthful slot only when requested.
- Derive the receipt path with a v1-owned copy of the settled legacy path/hash rule; do not import `@neoflow/core` or any legacy package. Production defaults preserve the legacy XDG/home rule even though v1 State has a different macOS default. A package-private runtime option may point tests at a disposable legacy-state root; no path enters the public bootstrap Interface.
- A direct runtime-owned Workspace scenario proves valid, absent, malformed, and symlinked slots, exact counts/digests/paths, content silence, no writes, and stable identities. A Local Runtime contract proves the same view crosses the existing opaque operation transport without a protocol/version/frame change and malformed requests still fail closed.
- Workspace Interface version 1 and the three-method Interface remain unchanged; no subscription, command, Application route, durable record, or generic discovery/filesystem Interface is added.
- Focused Workspace and Local Runtime evidence, canonical verification, all four compiled probes, dependency/source-island checks, and `git diff --check` pass on Node 26.5.1.

## Authority

- [Implement the explicit legacy Review importer](./WF-174-implement-explicit-legacy-review-importer.md)
- [Recognize stable legacy Review source bytes](./WF-175-recognize-stable-legacy-review-source-bytes.md)
- [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)
- Legacy path rule retained in `apps/tui/src/review/persistence.ts` and `apps/tui/src/review/receipts.ts` as evidence only

## Seam decision

Current discovery is one read projection owned by the private Reviewing/import implementation and reached only through `Workspace.read`. The caller asks “what current legacy Review sources are present?” and learns no path hashing, filesystem validation, parser, or source-byte mechanics. Local Runtime continues treating Workspace payloads/results as opaque; do not add a migration protocol or raise either protocol version.

## Constraints

- Discovery is not consent. Do not persist exact bytes, a decision, association, candidate, or history and do not auto-open this view at startup.
- Keep exact legacy content behind the seam. Counts, format, digest, size, path, and closed diagnostics are the complete outward summary for this child.
- Do not scan other workspace-state directories or accept a former path yet; WF-174's explicit moved-source package owns that later.
- Do not inspect or touch real user data. All direct and Local Runtime evidence uses disposable XDG/home/checkouts and sanitized WF-175 goldens.
- Preserve source order, Local Runtime ordering/bounds/frames, State format, package exports, and the unrelated root `package.json` bump.

## Resolution comment

Yes. `LegacyReviewDiscovery` is a private Reviewing/import projection reached by
one new closed `Workspace.read({ kind: 'legacy-review.sources' })` request. It
computes but does not inspect the two legacy locators until that explicit read,
then delegates all byte/path safety to WF-175. Queue and receipts are returned in
stable order with locator-bound `lgs_…` identities, canonical paths, and only
missing/unavailable or content-silent detected summaries. Valid queues expose
format and annotation count; valid receipts expose format, batch/annotation
counts, and at most 32 exact paths of at most 4 KiB each with total/omitted
counts. Malformed sources expose only closed diagnostics. Bytes, annotation
text, excerpts, Harness/session/model values, and parser values stay behind the
seam.

The old receipt locator rule is copied without a legacy dependency: SHA-256 of
the canonical legacy realpath beneath XDG State, otherwise
`~/.local/state/neoflow/workspaces`. This intentionally remains independent of
v1 State's macOS default. The view obtains only `state.status()` and returns its
version; it performs no commit, index write, cache, marker, decision, scan,
subscription, or startup/Home read. The Workspace Interface remains three
methods and version 1. Local Runtime required no source change because its
operation payload and result were already opaque; a focused contract proves the
new typed view and malformed-request rejection cross that unchanged version-1
transport.

Four runtime-owned Workspace scenarios prove exact paths, digests, formats,
counts, identities, source order, repeatability, frozen results, absent,
malformed, symlinked and long/many-path behavior, content silence, unchanged
State v0, and byte/mode/mtime/ctime/directory preservation. Runtime readiness
succeeds before unsafe discovery is requested. Removing the Workspace dispatch
arm makes the primary scenario fail at the prior Projection owner with `Unknown
Workspace projection request`.

On Node 26.5.1 with pnpm 11.20.0, the five focused Workspace/Local Runtime
contracts pass. Canonical `v1:verify` passes 29 files / 176 tests, dependency
firewall, typecheck, builds, and smoke; all four compiled State, Local Runtime,
reviewed Pi 0.80.6, and dogfood probes pass, and `git diff --check` is clean. No
real legacy/user data was read or changed, no legacy import entered active
source, no wire/frame/order/bound or State format changed, and the unrelated
`package.json` bump remains untouched.
