---
id: WF-218
title: "Admit immutable Editor and Artifact context contributions"
status: closed
labels:
  - wayfinder:task
parent: WF-216
assignee: juanan
blocked_by: [WF-217]
created: 2026-09-07
---

## Pre-implementation resolution (2026-09-07)

- **One contribution command, one existing removal path.** `review.context-contribution.add` carries the Current Review identity, expected State and selection revisions, and one closed `editor` or `artifact` contribution. Acceptance atomically creates deterministic immutable `rcc_` contribution evidence, appends one ordered `contribute` rule with deterministic `rcr_` identity to the existing revisioned selection, and records the ordinary idempotent command result. `review.context-selection.change/remove` removes only that rule; the immutable occurrence and any Snapshot remain addressable. Contribution rules count toward the existing 64-rule bound and never replace or deduplicate another occurrence.
- **Exact Editor occurrence.** An Editor input names one exact workspace file, outside-checkout file, or opaque untitled-buffer source; whole or positive byte range; bounded editor-instance/buffer identities and non-negative buffer version; reported saved/unsaved state; optional explicit generated/binary classification; and either canonical Base64 bytes with exact byte length/SHA-256 or one closed unavailable reason with observed size when known. Range bytes must equal the declared range length. Unsaved, ignored-explicit, and outside-checkout sources derive immutable sensitivity reasons; equality with disk or another contribution never changes identity or provenance. Attachment/buffer attestation remains P28/P29, so the record says `unattested-editor-command` rather than claiming a live Attachment.
- **Closed prior-Artifact readers.** V1 initially supports two concrete already-implemented Artifact locations: a whole/ranged `review.response` body and one whole/ranged old/new file side of an indexed `review.snapshot`. Reviewing derives source Workflow, labels, exact bytes, full-source digest/length, classification, limitations, and record checksum from strictly parsed immutable State records and index membership; commands cannot supply those claims. Missing membership rejects as not found; quarantined, wrong-owner, wrong-kind, malformed, or digest-incoherent records fail closed; same-Review sources reject as a direct context dependency cycle. Unknown Artifact kinds and generic record identities never enter the command union.
- **Named byte bound and explicit degradation.** One available contribution carries at most 512 KiB, safely below the existing 1 MiB Local Runtime frame after Base64 and command metadata; exact content views use the existing 256 KiB State window bound. A valid Artifact whole source above that bound or valid Snapshot side whose bytes were not captured is admitted as explicit immutable unavailable/over-limit evidence rather than truncated. Editor callers likewise submit an explicit unavailable occurrence when native content cannot be represented; no unavailable item is silently omitted or represented by guessed bytes.
- **Bounded projection and conflict seam.** `review.context-selection` keeps raw P20 paging and adds all selected immutable contribution metadata plus source-group order and at most one saved-disk/unsaved-editor conflict per selected Editor occurrence in the current raw window. The currently-empty P20 `workspace.context.resolution.conflicts` member becomes that closed conflict type; P20 still returns `[]`, while Reviewing composes the first conflicts from nominal lossless source identity, live admitting origins, contribution/rule identities, exact scope/order, and `keep-distinct` resolution. `review.context-contribution-content` is the only byte window and remains readable after rule removal.
- **No ambient refresh.** Projection resolves only contribution identities already in the selection. It never reads Editor Presence, focus, transcript, another State record, a newer Artifact, or current editor bytes; later file/buffer/Artifact changes cannot alter contribution metadata, content, sensitivity, State version, or conflict identity. WF-219 may copy selected occurrences into a new Snapshot, but this child neither captures mutable locators nor changes Snapshot currentness or disclosure consent.

## Outcome

Review context curation admits immutable Editor Context Contributions and closed concrete prior-Artifact contributions alongside live Context Locators. Each contribution preserves one exact whole/range occurrence, bytes or explicit unavailability, source identity, provenance, order, and sensitivity. Later buffer, file, or Artifact focus changes never rewrite or auto-refresh it; removal changes only the mutable selection. Saved disk and unsaved editor occurrences for one nominal path remain distinct and surface a conflict even when their bytes happen to match.

## Interface

Add closed Reviewing contribution commands and bounded views. A normalized Editor contribution carries exact bytes, digest, logical source/range identity, editor-buffer provenance/version, saved-versus-unsaved truth, and any explicitly unavailable native representation. A prior-Artifact contribution names one supported concrete Artifact identity and exact scope; Reviewing resolves and verifies it through the owning durable record shape rather than accepting arbitrary record identities or caller-supplied Artifact claims.

Populate the conflict shape prepared by `workspace.context.resolution` when a live disk occurrence and immutable contribution share a nominal source but differ in occurrence identity. Conflict is evidence for a deliberate keep/exclude choice, never automatic precedence or deduplication. P28/P29 later attest live Editor Attachment and buffer witnesses; this child owns only immutable contribution and curation semantics.

## Module seam

Reviewing owns contribution admission and durable references. Concrete Artifact readers and exact byte/range validators remain owner-private collaborations; there is no public generic Artifact/context registry and Editor Presence never crosses this seam.

## Acceptance

- [x] Whole and bounded-range Editor contributions verify digest/length, preserve exact bytes and buffer provenance, mark unsaved content sensitive, and remain immutable across later editor/file changes and restart.
- [x] Supported concrete Artifact contributions resolve exact immutable content/provenance from State and reject missing, quarantined, wrong-workflow, cyclic, unsupported, or malformed references without generic record access.
- [x] Removing one contribution changes selection only and never deletes or rewrites its durable occurrence or a Snapshot that references it.
- [x] Disk/editor nominal-path conflicts retain both occurrences, origins, scopes, and order; equal bytes never merge saved and unsaved evidence.
- [x] Editor Presence, focus, transcript, arbitrary State records, and newer Artifact content never appear automatically.
- [x] Focused Workspace/Runtime suites, canonical verification, four compiled risk probes, dependency/package seams, and `git diff --check` pass with unrelated work unstaged.

## Constraints

- A contribution is immutable source evidence, not a live editor sync, Attachment establishment, Artifact lifecycle, disclosure representation, or consent record.
- Keep exact binary bytes and lossless identities; do not infer provenance or safety from path, text, focus, or content similarity.

## Implementation (2026-09-07)

Reviewing now admits one closed, idempotent `review.context-contribution.add` command for the Current Review. Acceptance atomically writes a deterministic immutable `rcc_` occurrence, appends its ordered deterministic `rcr_` `contribute` rule to the revisioned selection, and records the command result. Editor occurrences preserve exact whole/range bytes or a closed unavailable reason, canonical digest and length evidence, lossless workspace/outside/untitled source identity, buffer instance/version and saved state, explicit classification, derived sensitivity, and the honest `unattested-editor-command` boundary. Available content is capped at 512 KiB and stored as exact State content rather than Base64 inside the semantic payload.

The owner-private Artifact resolver accepts only indexed prior `review.response` bodies and exact old/new sides of indexed `review.snapshot` files. It strictly verifies immutable kind, schema, Workflow ownership, index membership, payload identity, record checksum, source digest/length, side provenance, classification, availability, limitation, and sensitivity before copying exact whole/range bytes in bounded 256 KiB State windows. Missing and invalid ranges reject without State movement; same-Review cycles reject; quarantined, wrong-owner, wrong-kind, malformed, or digest-incoherent records fail closed. Oversized or uncaptured valid sources become explicit immutable unavailable evidence and are never truncated.

Projection now composes immutable contribution metadata and source-group order into `review.context-selection`, preserves each selected unsaved Editor occurrence beside a nominal live locator as a typed `saved-versus-unsaved` / `keep-distinct` conflict, and exposes bytes only through bounded `review.context-contribution-content` windows. Removing a rule leaves its immutable occurrence directly readable, restart reconstructs identical content, and projection performs no Editor Presence, filesystem-content, transcript, generic-State, or newer-Artifact lookup.

`packages/workspace/test/scenarios/workspaceReviewContextContributions.test.ts` covers exact Editor and Artifact whole/range bytes, binary and unavailable inputs, sensitivity, equal-byte disk/editor conflicts, command recall/conflict, removal, restart, multi-window reads, over-limit degradation, prior Snapshot and Response sources, cycle/missing/range rejection, and wrong-owner/wrong-kind/quarantine/unsupported fail-closed behavior over real Git, State, Runtime, and scripted-Adapter fixtures. Durable codec coverage rejects incoherent contribution payloads. Canonical verification passed with 37 files / 314 tests; all four compiled risk probes, build/import smoke, dependency firewall, formatting, lint, and `git diff --check` passed on Node 26.5.1 / pnpm 11.20.0 while the unrelated root package-manager bump and parallel-session artifacts remained unstaged.
