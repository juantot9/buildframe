---
id: WF-202
title: "Normalize context overlap without erasing provenance"
status: closed
labels:
  - wayfinder:task
parent: WF-199
assignee: juanan
blocked_by: [WF-201]
created: 2026-09-07
---

## Pre-implementation resolution (2026-09-07)

- **Capture admits the union.** When several selections of one capture name the same exact path, the occurrence is captured once with every admitting scope: an absent (whole-source) scope subsumes all ranges; otherwise each distinct half-open range is one exact segment read and retained on its own (`path#offset#length` storage keys). The capture item stays one per occurrence with `byteLength` equal to the total exact bytes captured for it. No range is ever widened, and identical bytes never merge distinct paths or identities.
- **One closed resolution read.** `workspace.context.resolution` (read) normalizes one retained capture: each exact source occurrence appears once with its ascending origins, its effective payload scope — `whole` when whole-source was captured, otherwise the exact ascending union of captured intervals (adjacent/overlapping intervals merged, never widened) — and the occurrence's captured byte total. Source groups stay in the caller's selection order, and occurrences inside an expansion stay in stable lossless path-byte order; normalization reorders nothing.
- **Conflicts are recorded, vacuous in P20.** A disk locator versus a caller-declared immutable occurrence of one nominal path can only arise once P21 introduces Editor contributions and unsaved evidence; P20's normalization therefore always reports an empty conflict list while preserving the rule and its shape in the closed result, so P21 can populate it without a new vocabulary.
- **Content windows address segments.** `workspace.context.content` gains an optional byte `scope`; a window without a scope addresses a whole-source capture, and a window with a scope addresses exactly that captured segment. Malformed combinations return closed diagnostics.

## Outcome

Workspace Evidence normalizes overlapping context selections without erasing provenance. One exact source occurrence selected through multiple locators is carried once while retaining every inclusion origin; overlapping ranges from that occurrence are represented by their exact union; whole-file inclusion subsumes its ranges for payload bytes. Content equality alone never deduplicates distinct paths, source versions, old and new sides, or saved versus unsaved evidence, and a differing disk-versus-unsaved occurrence of one nominal path stays visibly distinct for the caller's curation decision.

## Interface

Extend the closed Workspace Evidence context family with one normalized-resolution result over the already-inspected and captured selections. The normalization result preserves:

- one occurrence per exact source identity and scope, with the complete ordered list of inclusion origins;
- exact range unions (half-open, byte-exact) and whole-file subsumption for payload bytes;
- stable user source-group order and stable lossless path order within an expansion;
- distinct occurrences for distinct identities even when content bytes are equal, and a surfaced conflict when a disk locator and a caller-declared immutable occurrence of one nominal path differ.

No normalization rule silently drops an origin, reorders user groups, or merges by content hash.

## Module seam

`WorkspaceEvidence` owns overlap identification, range-union arithmetic, ordering, and conflict surfacing as one private implementation. Callers receive the normalized result; they never compute unions or provenance themselves.

## Acceptance

- [x] The same exact occurrence selected through multiple origins appears once with every origin retained; removing one origin keeps the others' provenance.
- [x] Overlapping ranges collapse to their exact byte union, and whole-file inclusion subsumes its ranges without changing payload bytes.
- [x] Equal bytes never merge distinct paths, source versions, sides, or saved-versus-unsaved evidence; a differing disk-versus-declared occurrence of one nominal path surfaces as a distinct conflict, not a merge.
- [x] Source-group order and lossless path order stay stable across repeated normalizations of unchanged selections.
- [x] Focused Workspace suites, canonical verification, the four compiled risk probes, dependency/package seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with the unrelated root package-manager bump unstaged.

## Constraints

- Normalization is derived evidence over already-resolved selections; it performs no Git, filesystem, or network access.
- Ordering is interface truth, not presentation preference: provenance order survives every projection.

## Implementation (2026-09-07)

Landed in `packages/workspace/src/contextEvidence.ts` and wired through the unchanged three-method Interface. Capture admission now plans per occurrence: every admitting selection contributes its scope, an absent scope subsumes all ranges, distinct ranges become exact retained segments (`path#offset#length` storage keys), and multi-segment items digest the ascending concatenation. `workspace.context.content` gained the optional byte `scope` for segment-addressed windows. The new `workspace.context.resolution` read normalizes one retained capture into one occurrence per exact source with ascending origins, the exact merged interval union (adjacent and overlapping intervals collapse without widening), captured byte totals, caller-ordered source groups each carrying its members in lossless path-byte order, and an empty conflict list pending P21's declared occurrences.

One defect was found and fixed during proof: `pathUnderPrefix` mishandled the empty repository-root prefix, silently dropping inclusion origins for whole-checkout selections; the helper now treats the root prefix as "any non-empty path", re-proved by every origin assertion. Scenario coverage in `packages/workspace/test/scenarios/workspaceContextEvidence.test.ts`: adjacent-union and disjoint-interval captures with exact origins; whole-over-range subsumption with whole-content windows; segment-addressed windows; distinct occurrences for equal bytes across distinct paths; and repeat-read stability of groups, ordering, and the conflict list. Canonical `v1:verify` passed (35 files / 297 tests), all four compiled risk probes passed, and `git diff --check` is clean with the unrelated root `packageManager` bump unstaged.
