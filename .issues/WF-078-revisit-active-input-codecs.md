---
id: WF-078
title: "Replace repeated isRecord validation with owner-local codecs"
status: closed
labels:
  - wayfinder:grilling
parent: WF-053
assignee: juanan
blocked_by: [WF-073]
created: 2026-08-09
assets:
  - docs/audit/pre-p17-codebase-findings.md
---

## Question

The owner raised a direct code concern while the map was closing: active Modules
repeatedly define `isRecord`, then build hand-written validators from long
`isRecord`/field-check chains and whole-object casts. Does that concern overturn
W-13's settled `accepted` ruling for validation-helper consolidation, and if so,
where does the replacement seam belong and when must it land?

This is not a request to add a generic validation package or polish legacy code.
It asks whether the repeated primitive and the decoder shape now have evidence of
a defect, and whether the repair should deepen each owning Module rather than
centralise syntax alone.

## Established facts

- W-13 counted **five exact active-source `isRecord` definitions** and accepted
  them on 2026-08-07 because no defect then traced to them. Four further exact
  definitions live in deletion-bound legacy source.
- The active definitions participate in **95 calls including the definitions**.
  The five files containing them expose **38 parser or normalizer functions** and
  contain **49 `as unknown as` casts**. Two further Workspace helpers spell the
  same structural check as `objectRecord` and `rowRecord` with a different return
  convention.
- The duplication is not distributed evenly. Workspace has separate copies in
  Reviewing and Harness Interaction; Local Runtime exports one from `protocol.ts`
  while `lifecycle.ts` redeclares it; the Application has one in User
  Configuration. A cross-repository helper would give the deliberately
  dependency-free Workspace package a new dependency or public generic seam.
- The hand-written decoders are not all equivalent. Some intentionally preserve
  an opaque semantic payload, while durable record decoders are responsible for
  establishing complete typed facts before workflow logic trusts them. A repair
  must preserve that distinction rather than recursively validating every object
  merely because it is present.
- P16B Live Changes changes Review Snapshot lineage, Versions, Anchors, and
  related durable shapes. A whole-object cast keeps compiling when those types
  change, so waiting until P16C would remove compiler protection from the largest
  semantic rewrite on the roadmap.

## Resolution comment

**Overturn W-13's `accepted` validation half: `isRecord` duplication and the
manual-decoder pattern are `fixed`, with the validation defect at medium
severity.** Keep the finding count at 46. This is the same helper family, decoder
surface, and owning Modules W-13 already names; opening a second finding would
give one problem two execution owners.

### The concern reproduced as a correctness defect

Run against the current compiled `parseReviewSnapshot` on the repository-declared
Node 26.5.1, a payload with valid outer identities and these nested values was
accepted and returned as `ReviewSnapshotPayload`:

```ts
{
  basis: {},
  comparedState: {},
  manifest: {},
}
```

All three fields have required nested structure and are dereferenced downstream.
The parser checks only that each is a non-array object and then returns
`value as unknown as ReviewSnapshotPayload`. This is the concrete evidence the
2026-08-07 ruling lacked: a structural guard plus a whole-object cast can report a
malformed durable record as a trusted type. The demonstrated result is a semantic
validation breach, not yet durable mutation, data loss, or a reproduced false
truth-critical status, so severity is **medium**, not high.

### The repair seam

The repair is package-local and domain-owned:

1. Each active package has at most one private primitive for recognising an
   object record. Do not create a generic cross-package validation Module or a
   new public Interface merely to share three lines.
2. Reviewing records, Harness Interaction records and inputs, Local Runtime
   frames, and User Configuration use owner-specific codecs. A codec validates
   the complete structure its owner promises and constructs a compiler-checked
   result; `as unknown as T` cannot stand in for that proof.
3. Opaque payloads stay opaque where the receiving Module deliberately does not
   own their semantics. The rule is ownership of validation, not recursive
   inspection of every nested value.
4. Tests cross the owning Interface and include malformed nested values that the
   current casts accept. The exact Snapshot probe above is the minimum regression
   case, not the complete matrix.
5. Deletion-bound legacy definitions are untouched. W-13's accepted
   `deepFreeze` and `validText` consolidation remains accepted, and its already
   fixed array-form `sha256` obligation is unchanged.

This chooses the seam and the proof obligation, not a validation library or the
private codec syntax. Those remain implementation decisions under the package's
existing dependency and evidence rules.

### Ordering

The **Workspace durable-codec portion is Workspace / first and pulled ahead of
P16B**. Live Changes changes the exact Snapshot family whose stale cast reproduced
the defect; establishing compiler-checked codecs afterwards would only describe
what the rewrite happened to produce. The Local Runtime and Application portions
remain in normal P16C package order because P16B does not change their input
shapes.

No implementation changed in this decision. The ledger and map carry the amended
obligation, and the earlier W-13 resolution links here as the later ruling.

## Blocked by

- [Disposition the Workspace reviewing and diff findings](./WF-073-disposition-workspace-reviewing-and-diff-findings.md)
