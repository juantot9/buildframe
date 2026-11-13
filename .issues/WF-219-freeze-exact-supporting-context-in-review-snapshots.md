---
id: WF-219
title: "Freeze exact supporting context in Review Snapshots"
status: closed
labels:
  - wayfinder:task
parent: WF-216
assignee: juanan
blocked_by: [WF-218]
created: 2026-09-07
---

## Resolution

Settled for implementation (2026-09-08). A non-empty supporting-context basis is one optional, format-1 extension of `ReviewSnapshotPayload`; absence is canonically the exact revision-0 empty selection and creates no synthetic records. The extension freezes the exact `review.context-selection` identity/revision/rules and ignored-untracked default, a semantic basis digest, ordered source groups, saved-versus-unsaved conflicts, aggregate availability/sensitivity counts, and a bounded manifest summary. Snapshot-scoped `rsi_` occurrences preserve every expanded locator candidate—including effective exclusions—and every selected immutable `rcc_` contribution. Locator occurrences retain lossless identity, kind/mode/availability/source version, normalized whole/range scope, all inclusion origins, the Reviewing-owned deciding rule, provenance, classification, sensitivity, and explicit capture limitation. Contribution occurrences copy the complete admitted contribution payload and exact available bytes or its closed unavailable reason; they never resolve the Editor or source Artifact again.

Complete occurrence metadata is stored in immutable `review.snapshot-context-manifest-window` records of at most 64 items. Every available whole or normalized range segment has one immutable `review.snapshot-context-content` record with a Snapshot-scoped `rsx_` identity, exact scope, byte length, SHA-256, provenance link, and State content role. Content is exposed only through 256-KiB windows. Snapshot context, manifest-window, occurrence, and content identities are deterministic from the Snapshot and stable ordinal; a separate semantic digest deliberately excludes those Snapshot-scoped identities so an unchanged recapture can reuse the latest Snapshot. Parsers validate every local reference and closed union; complete owner reads additionally reconstruct and verify manifest/content counts and digests. Historical records without the optional field continue to project exact empty context without migration or write-back.

One private `ReviewSnapshotTransition` preparation path reads the selection and referenced contributions at one exact State version, asks Workspace Evidence for one coherent locator capture, materializes every admitted segment through its bounded content windows, and returns only a complete prepared Snapshot/record set or a closed failure. Reviewing supplies the pure admission decision so Workspace Evidence does not acquire rule precedence; Workspace Evidence retains ownership of expansion, source reads, normalized interval capture, stabilization, and capture retention. Excluded candidates consume no content budget and are frozen as metadata-only decisions. Equal bytes do not collapse distinct occurrences or origins. Missing contribution records/content, malformed durable references, digest/length mismatch, incomplete expansion, unstable capture, retention loss, or failed State commit writes no successor or context fragment.

The existing explicit `review.change-set.refresh` command is the first public commit route: either changed Change Set evidence or changed supporting context produces one atomic successor, while exact equality reuses the latest Snapshot and State version. Review start uses the same transition with the canonical empty basis. Atomic Ask and later refresh verification call the same preparation path rather than composing State, filesystem, Git, or content reads. Until WF-221 supplies and binds a route-exact disclosure projection, Harness commitment fails closed for non-empty Snapshot context instead of silently omitting it. WF-220 owns durable current/stale/unverified comparison, additions beneath locators, pinning, and refresh deltas; WF-221 owns destination representations and disclosure.

Closed (2026-09-08). Landed as: `ContextSourceCaptureItem` gained `sourceKind`/`gitMode`/`sourceSize`/`sourceAvailability`/`sourceAbsenceReason`, a closed `excluded` status, owner-supplied pure admission, normalized merged-interval plans, exact-bytes revalidation alongside fact fingerprints before publishing, and per-item verdicts that compare the union-segment concatenation digest rather than whole files; content windows resolve inside any containing captured interval. `ReviewSnapshotTransition` now owns one State-bound `captureContext` preparation and one `#prepareContext` record materialization (`rsi_` items, `rsx_` content, `rsw_` windows, `rsc_` basis with semantic digest and totals). `review.change-set.refresh` freezes both mutable inputs; atomic Ask reuses the latest Snapshot only on exact context equality and otherwise rejects with the new closed `snapshot-context-disclosure-unavailable` reason. Projection exposes bounded `review.snapshot-context` and `review.snapshot-context-content` views for any Snapshot version. Five scenarios in `workspaceReviewSnapshotContext.test.ts` cover freezing with ranges/exclusions/direct-override/contribution/conflicts and restart, multi-window manifest and 600-KiB content reads, unchanged reuse, Ask fail-closed versus empty-context success, and no-successor rejection on incomplete expansion; durable codecs reject incoherent context bases.

## Outcome

Every newly accepted Review Snapshot is self-contained across both its unchanged Change Set contract and its independently selected supporting context. The Snapshot freezes the effective selection basis, complete admitted manifest, source groups and origins, explicit/default exclusions, immutable contributions, unavailable/over-limit reasons, exact captured scopes and bytes, provenance, and advisory sensitivity in stable order. Failed or incoherent capture commits nothing, and no ephemeral P20 retention identity is the only copy of durable context.

## Interface

Add one inspection/commit path owned by Reviewing that materializes the current effective selection through Workspace Evidence and prepares a complete optional context basis for `ReviewSnapshotPayload`. Store context summary/manifests and bounded content windows as immutable Snapshot-owned records, with exact byte length and digest checks on every admitted occurrence. Snapshot preparation remains one internal transition used by Review start, explicit refresh, and atomic Ask; callers receive closed results and bounded projections rather than State writes or capture buffers.

Historical format-1 Snapshot records with no context fields parse as the exact empty context they originally contained. New optional fields and record kinds validate strictly, preserve stable order and identities, and fit existing State format 2 and Local Runtime frame limits.

## Module seam

Reviewing owns which resolved occurrences enter the Snapshot and all durable workflow records. Workspace Evidence owns coherent live capture and content windows. Authoritative State owns only atomic durability. Keep their collaboration package-private behind Workspace `execute`/`read`.

## Acceptance

- [x] Effective locator captures and immutable contributions commit as one complete Snapshot context basis with exact manifests, scopes, bytes, digests, provenance, origins, ordering, and sensitivity.
- [x] Explicit/default exclusions and every unavailable, over-limit, binary, generated, symlink, or unrenderable item remain inspectable without silently entering payload content.
- [x] P20 retained capture eviction or process restart cannot lose bytes needed by a committed Snapshot; all content records verify against their manifest identities.
- [x] Failed State commit, incomplete membership, unstable capture, missing window, digest mismatch, or limit breach leaves the prior Snapshot and selection intact and produces no partial successor.
- [x] Old Snapshot bytes remain valid and mean exact empty supporting context; new records survive restart and transport in bounded windows.
- [x] Focused Workspace/State/Runtime suites, canonical verification, four compiled risk probes, dependency/package seams, and `git diff --check` pass with unrelated work unstaged.

## Constraints

- Supporting context remains separate from changed-file evidence and grants no Annotation authority.
- No eager whole-Snapshot projection, mutable content record, broad cache, hidden truncation, or background capture.
