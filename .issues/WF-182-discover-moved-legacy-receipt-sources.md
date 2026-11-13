---
id: WF-182
title: "Discover moved legacy receipt sources explicitly"
status: closed
labels:
  - wayfinder:task
parent: WF-174
assignee: juanan
blocked_by: [WF-181]
created: 2026-09-02
---

## Outcome

An explicit Workspace read can find bounded legacy receipt files left under old
checkout hashes after a checkout move, or inspect the receipt locator derived
from one user-supplied exact former canonical checkout path. Results are stable,
source-ordered metadata and recognition views with separately pageable embedded
legacy workspace paths. They do not associate, import, defer, dismiss, or infer
anything, and ordinary startup, Home, Reviewing, and current-source discovery
remain unchanged.

## Grounding

- Parent map: [Implement the explicit legacy Review importer](./WF-174-implement-explicit-legacy-review-importer.md)
- Moved-source rule: [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)
- Frozen source capture: [Recognize stable legacy Review source bytes](./WF-175-recognize-stable-legacy-review-source-bytes.md)
- Current locator/discovery: [Discover current legacy Review sources](./WF-176-discover-current-legacy-review-sources.md)

## Interface

Deepen `LegacyReviewImportOwner` with two closed read projections:

```text
legacy-review.moved-receipt-sources
  search:
    legacy-state-directory
    | former-checkout-path + exactFormerCanonicalCheckout
  sourceOffset
  sourceLimit

legacy-review.moved-receipt-source
  sourceIdentity
  legacyCheckoutHash
  legacyWorkspacePathOffset
  legacyWorkspacePathLimit
```

The list reports bounded source identity/path, old locator hash, exact file
metadata/digest, recognition status, receipt/annotation/path counts, and search
provenance. Detail re-captures the selected source and returns only its bounded
recognition summary plus source-ordered distinct embedded legacy workspace path
windows. Neither view exposes receipt batches, annotations, Harness/session
values, source bytes, State record/content roles, association authority, or a
v1 identity.

## Search and trust invariants

- Run only for either explicit request. Never scan during bootstrap, Home,
  current `legacy-review.sources`, candidate/history reads, subscriptions, or
  Application navigation.
- Preserve the old locator rule exactly: beneath
  `${XDG_STATE_HOME:-~/.local/state}/neoflow/workspaces`, a receipt candidate is
  `<64-lowercase-hex-checkout-hash>/review-receipts.json`. This remains
  independent of v1 State placement and macOS defaults.
- Directory mode examines at most 4,096 direct entries in deterministic lexical
  hash order. It never recurses, follows a symlink, trusts recency, or opens an
  unrecognized name. Exclude the known current-checkout receipt locator so the
  current source is not duplicated as “moved.”
- Former-path mode requires one bounded, Unicode-scalar, lexically canonical,
  non-NUL absolute path that the user asserts is the exact former canonical
  checkout string. Hash those exact UTF-8
  bytes under the old rule; do not `realpath`, stat, search for, normalize by
  repository metadata, or require that the former checkout still exists.
- Every candidate file goes through the existing no-follow regular-file-only,
  16 MiB, 4,096-entry, three-attempt stable capture and frozen receipt parser.
  Missing, malformed, unsupported, unsafe, racing, and over-bound sources remain
  explicit observations and never become associations.
- Derive stable `lgs_…` source identity through the existing source-kind,
  moved-receipt-location, and exact-locator identity rule. Validate the paired
  locator hash on detail reads rather than caching or reversing the identity.
  The old hash, path, repository name,
  remote, content, recency, and embedded workspace values never prove that it
  belongs to the current Workspace.
- Embedded absolute paths are legacy provenance only. Preserve parser order,
  window every path at 1,024 UTF-8 bytes, page at most 32 paths, and retain exact
  total/offset/omitted facts. List at most 32 sources per result and prove the
  maximum encoded views stay below the unchanged one-megabyte frame body limit.
- Reads are pure and independently repeatable. Add no scan cache, watched
  directory, prefetch, telemetry, marker, registry, source/index/BLOB record,
  command, or subscription.

## Acceptance

- [x] A sanitized moved receipt under an old 64-hex locator is found only by an
      explicit directory search; the current receipt locator is excluded and
      startup/current discovery/ordinary views perform no broader scan.
- [x] Exact former-canonical-path mode derives the old hash without touching the
      former path and yields the same source identity/observation as directory
      mode when both select the same receipt.
- [x] Multiple hash-locator slots are lexically ordered and paged with exact
      totals (including explicit missing/unsafe leaf observations); more than
      4,096 entries, long names/paths, non-hash names, nested files,
      missing files, directories, FIFOs, symlinked files/components, unreadable,
      oversized, and changing sources stay bounded and fail closed.
- [x] Recognized, malformed, unsupported, and internally inconsistent sanitized
      receipts report exact metadata/digest and bounded recognition only; no
      batch, annotation, Harness/session, error, or raw source content crosses
      the list.
- [x] Detail returns every distinct embedded legacy workspace path through
      bounded source-ordered scalar-safe pages, rejects unknown identities and
      malformed offsets/limits/shapes, and never claims workspace association.
- [x] Repeated reads, source disappearance/replacement, and restart report only
      current filesystem truth while leaving source metadata, v1 State version,
      migration index/BLOBs/decisions, and every v1 record unchanged.
- [x] Both typed frozen views cross unchanged Local Runtime version-1 transport;
      adversarial path/control escaping and maximum pages remain below the
      unchanged frame bound.
- [x] Focused regressions fail without moved-view dispatch and if directory
      search runs through ordinary current discovery, then canonical
      verification, all four compiled risk probes, dependency/package seams,
      and `git diff --check` pass on the pinned toolchain.

## Non-goals and constraints

- Do not associate or import a moved source, accept an association decision,
  alter source/import/candidate decisions, or show legacy history in this child.
- Do not search by repository name, remote, content, path similarity, timestamp,
  current Git identity, or embedded path; do not rank or auto-select results.
- Do not discover former queue files: only the current queue may yield migration
  candidates. Do not add a generic filesystem finder or migration browser.
- Do not mutate a legacy source or inspect real user data. Use only sanitized
  receipts and disposable state roots.
- Preserve State format 2, Workspace/Local Runtime version 1, current source
  order, capture/parser bounds, frame/order/pending bounds, and the unrelated
  root `package.json` bump.

## Resolution

- `LegacyReviewImportOwner` now owns two strict read requests for explicit moved
  receipt locator search and exact locator detail. Directory search stabilizes
  the old state-root chain, examines direct entries through a bounded iterator,
  accepts only lower-case 64-hex locator slots, excludes the current checkout
  hash, sorts deterministically, and captures only the requested page through
  the frozen no-follow source operation.
- Former-path search accepts only one bounded Unicode-scalar, lexically
  canonical absolute assertion, hashes its exact UTF-8 spelling without
  touching that path, and converges on the same `lgs_…` identity as directory
  search. Detail validates both the opaque identity and hash, re-captures
  current filesystem truth, and pages source-ordered distinct embedded paths as
  1,024-byte scalar-safe windows with exact omitted counts.
- List views expose only bounded path/digest/stat/recognition metadata; malformed
  and unsupported files stay diagnostic, missing/oversized/non-regular/unsafe
  sources stay explicit, and neither view writes State or claims association.
  Current discovery remains queue-then-receipts and an `fs.opendir` regression
  assertion proves ordinary reads never invoke moved search.
- Workspace and Local Runtime retain Interface/protocol version 1. Frozen list,
  former-path, and detail wire values are exercised with control/multibyte text;
  worst-case 32-source and 32-path encoded views remain below the unchanged
  one-megabyte body limit.
- Focused source/import/history/candidate/moved/runtime evidence passed 58 tests.
  Canonical `v1:verify` passed 32 files / 208 tests, followed by all four
  compiled risk probes and `git diff --check` on Node 26.5.1 / pnpm 11.20.0.
  Removing Workspace moved-view dispatch failed all four focused scenarios;
  injecting directory inspection into ordinary source discovery failed the
  no-implicit-scan regression. No real user source was inspected or changed.
