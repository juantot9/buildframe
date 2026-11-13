---
id: WF-228
title: "Define the outgoing review message contract"
status: closed
labels:
  - wayfinder:task
parent: WF-216
assignee: juanan
blocked_by: [WF-226]
created: 2026-09-08
---

## Outcome

One closed contract for what Reviewing sends. A message's outgoing material is the user's text plus a `file:line` location — a **Live Repository Reference** in the accepted vocabulary: it names live source for the Harness's own tools and is not captured bytes, proof of what the Harness holds, or a promise about its later reads. A message whose origin is a **saved past point** cannot be represented by a live path, so its outgoing material additionally carries the exact deliberately selected historical lines, clearly labelled with their origin. Nothing else is added: no supporting-file packages, no ambient context, no invented quotes. The exact outgoing message is measured in bytes and characters and shown honestly; there are no token estimates. The Adapter remains a pure encoder of the committed material.

## Interface

Harness Interaction composes and validates the outgoing message from the WF-226 message record before commitment, replacing the previous frozen-Snapshot disclosure path (`snapshot-context-disclosure-unavailable`) with this deliberate contract change. Before any effect, revalidate the target: a current-code message whose file or location changed since composition is not sent as-is; the user explicitly reselects current code (the prototype's `F4` semantic) or cancels. A saved-origin message revalidates against the origin's immutable basis, which cannot drift. Preserve the surviving WF-221 exactness requirements: the accepted message bytes/digest agree across Handoff, receipt, command recovery, and Adapter directive; failure before durability sends nothing; committed-but-uncertain attempts stay explicit with no automatic replay. Local-only evidence (exclusions, if any ever apply) stays out of the message.

## Module seam

Harness Interaction owns composition, revalidation, measurement, and commitment. Reviewing supplies the message record and origin basis. Workspace Evidence supplies current-file facts for revalidation. Adapters encode the committed material without enriching it; their tool-kind gates remain unrelated to path access.

## Acceptance

- [x] A current-code message's committed outgoing material is exactly user text + `file:line`; nothing ambient, quoted, or package-like is added.
- [x] A saved-origin message carries the exact labelled historical lines from the origin basis; a live path never substitutes for them.
- [x] Byte/character size is exact and displayed in the What-will-be-shared preview; no token estimates appear anywhere.
- [x] Revalidation blocks a changed current-code target before effect and offers explicit reselection; saved-origin revalidation is stable.
- [x] Accepted message bytes/digest are identical across Handoff content, receipt summary, command recovery, and Adapter directive; no silent truncation, substitution, or omission.
- [x] Failed durability sends nothing; the former `snapshot-context-disclosure-unavailable` path is replaced only through this contract's own tests, never silently.
- [x] Focused Harness Interaction/Adapter suites, canonical verification, dependency/package seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with unrelated work unstaged.

## Constraints

- The Adapter encodes; it never selects context, reads State, or adds material. Harness tool reads remain the Harness's own business.
- Exclusion semantics do not apply to this minimal message unless a user deliberately includes extra material; if exclusions later gain meaning here, WF-225's exclusion rules govern and are assessed through WF-223.
- Settle and commit this child's own pre-implementation Resolution before code.

## Resolution (settled 2026-09-08)

### Message shape

A current-code message is exactly two parts — the user's text and one location line — joined by a blank line:

```
Why is this timeout one hour instead of thirty minutes?

src/session.ts:3
```

The location line is the Live Repository Reference: plain `path:line`, no diff content, no file excerpts, no review metadata. A saved-origin message keeps the same shape and inserts the exact historical passage, labelled with its origin, before the location line:

```
Why did this use seconds directly back then?

From c1 · Initial session implementation — src/session.ts:3-4:
```typescript
const TTL_SECONDS = 900;
```

src/session.ts:3 — historical source (saved review point, not current code)
```

Rules: the quoted block is the origin basis's exact bytes for the labelled range, never reformatted; the closing line always states that historical source is not current code; code fences use the minimum backtick run that safely encloses the content. Nothing else is ever added.

### Revalidation and commitment

Before any effect: a current-code message revalidates its target file bytes and line against live Workspace Evidence; changed target blocks commitment, and the user explicitly reselects current code (keeping their text) or cancels. A saved-origin message revalidates only against the immutable origin basis, which cannot drift. Commitment stores the exact message bytes with one digest identity shared by Handoff, receipt, command recovery, and Adapter directive. Failure before durability sends nothing; a committed-but-uncertain attempt stays explicit with no automatic replay.

### Size and preview

The What-will-be-shared preview (optional `F3`-style inspection in the view) shows the exact message bytes and characters, the destination label, and the two limitation lines (later Harness reads may see newer code; naming a file does not restrict its access). No token estimates anywhere. Only a demonstrable transport/acceptance bound can refuse a message on size; none is invented here.

### Replacement of the old path

`snapshot-context-disclosure-unavailable` is removed only through this contract's own tests: the non-empty-snapshot-context blocker is replaced by this message path once both exist, never silently.

### Open point — the message shape above — settled (2026-09-08)

The user confirmed both shapes ("they look nice"). The examples in this Resolution are the committed contract; wording, fence-safety, and the closing historical-source line are part of it.

## Resolution status

**Settled and user-confirmed (2026-09-08).** The message shape, revalidation, size/preview, and replacement rules above are the committed pre-implementation basis for implementation. Remaining detail (exact encodings, storage, adapter directive fields) follows in the implementation pass under this Resolution.

### Progress

- **Contract implementation landed (2026-09-08, commit `6ee7862`):** Harness Interaction composes current messages as exact user text plus a blank line and `path:line`; saved origins quote immutable selected source with a minimum safe fence and the settled historical-source wording. The inspection projects exact UTF-8 bytes, byte count, Unicode-scalar character count, destination, and the two disclosure limitations. Commitment atomically retains one outgoing-material record with the Message, one-message Batch, Handoff, receipt, capability snapshot, Invocation, and command result before the Pi Adapter receives the exact committed bytes without enrichment.
- **Exactness closure landed (2026-09-08, commit `76079bb`):** current-target changes now demonstrate rejection followed by explicit reselection while unrelated repository churn remains admissible; saved-origin composition remains stable across current-code movement. Tests pin equal bytes, lengths, and digest through outgoing material, Handoff content and summary, receipt summary, command recovery, and Adapter directive; malformed Unicode scalar input is rejected instead of being substituted. Message-specific fail-before-durability and committed-but-uncertain no-replay scenarios are covered, and non-empty supporting Snapshot context blocks only the historical Question path, not the minimal Message contract.
- **Transport-bound closure landed (2026-09-08, commit `32c29e0`):** the only Message text bound leaves room for the equally bounded saved-source line and encoding overhead beneath the reviewed native and 1 MiB Adapter transport bounds; no token or arbitrary UI estimate is introduced.
- **Verification (2026-09-08):** all package and v1-test TypeScript checks pass; focused Harness Interaction, Snapshot Context, durable-codec, Pi Adapter, and local Adapter transport suites pass (44 tests); the complete Vitest suite passes (39 files, 337 tests). Full-format check (120 files), dependency firewall, direct builds, build smoke, and `git diff --check` pass; focused `oxlint` reports no errors (pre-existing warning set only).
