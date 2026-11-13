---
id: WF-029
title: "Define Artifact Lineage Comparison semantics"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: JuanAn Aranda Triana
blocked_by: [WF-017, WF-023]
created: 2026-07-16
assets: []
---

## Question

Which Artifacts may be selected for v1 Artifact Lineage Comparison, what exact saved content is compared for Plan Revisions and structured Review Snapshots, and how should identity, provenance, Anchors, Annotations, mappings, Review Coverage, unavailable or unrenderable content, and oversized comparisons be presented without consulting the current workspace, generating judgment, or implying semantic derivation, replacement, or supersession?

## Blocked by

- [Test the blueprint for completeness](./WF-017-test-blueprint-completeness.md)
- [Define the workspace and change-set evidence contract](./WF-023-define-workspace-change-set-evidence.md)

## Resolution comment

Artifact Lineage Comparison is a read-only saved-to-saved projection, not an Artifact, a workflow transition, or a claim about the workspace. An eligible pair is exactly two distinct Plan Revisions from one Plan or two distinct Review Snapshots from one Review and its unchanged Change Set. Cross-kind, cross-lineage, and cross-Workflow pairs are ineligible. Any two occurrences in the lineage may be selected, including distinct Artifacts with identical payloads. The presentation orders them as the earlier and later occurrences, retains both Artifact Identities, and explains that chronology establishes neither derivation nor replacement. Focus, approval, Review completion, and recency do not make one Artifact authoritative over the other.

Comparison has two deliberately separate layers. The primary layer compares the complete immutable semantic payload saved inside each Artifact. A contextual layer presents identity, provenance, Anchors, Annotations, Re-anchor Mappings, and Review Coverage as records scoped to one exact side; changes in those records never masquerade as Artifact-content changes. The comparison reads Authoritative Workflow State only. It neither reopens source files nor asks Git, an editor, a Harness, or the current workspace to reconstruct or refresh either Artifact.

For Plan Revisions, the primary payload is the complete ordered sequence of saved plan-text segments, their exact decoded text bytes and boundaries, and Artifact-owned structure required to render and anchor them under the frozen Artifact Result Contract. The default comparison preserves every textual, structural, whitespace, encoding, and line-ending difference; it performs no hidden normalization. Deterministic line, word, and captured-structure alignment may aid presentation, but remains a mechanical view over the saved payload rather than a semantic section mapping. A zero delta is reported as “No saved content differences,” not as one identity, a duplicate to discard, or evidence that the revisions have the same meaning.

For Review Snapshots, the primary payload includes the exact recorded Change Set intent and resolved endpoint evidence, the complete changed-file manifest, selected Review-context captures, and every per-side saved fact: lossless path, kind, Git mode, size, object identity or digest, staging and evidence provenance, availability, classifications, stored rename or copy presentation evidence, and captured bytes. A Snapshot comparison first exposes any difference in its recorded basis, compared state, scope, or context before presenting file deltas. It may align manifest records and render textual deltas only where exact saved keys, structure, or bytes support that mechanical operation. A path match is not file identity, and stored rename or copy evidence remains labelled derived presentation evidence. Unmatched records stay visibly side-specific; Neoflow never guesses a cross-Snapshot file correspondence or describes a delta as “changes since” when the saved endpoints do not establish that claim.

Each side’s header keeps its concrete kind, lineage and occurrence, human-readable creation label and time, Artifact Identity in progressive detail, creation action, source records, and correlated Invocation evidence where observed. Review headers also identify the Workspace Identity, Change Set, resolved endpoint evidence, and verification evidence recorded with the Snapshot. A previously recorded later Workspace Verification may appear only with its observation time and freshness; opening comparison never refreshes it. Missing provenance remains unknown rather than inferred from content or chronology.

Anchors remain bound to their original Artifact and appear only on that side. Mechanical visual alignment does not move an Anchor or create correspondence. Committed Annotations retain their original Anchor, declared intent, Batch, human disposition history, and optional Evidence References; mutable Annotation Drafts, if shown, remain unmistakably drafts against one selected side. Neither matching text nor a changed region resolves, carries forward, or invalidates an Annotation. An existing human-confirmed Re-anchor Mapping may connect its exact original and successor locations when both are in the selected pair, while preserving the original Anchor. Unconfirmed candidates remain labelled suggestions, indirect chains are not composed into a new Mapping, and comparison itself creates no Mapping or disposition.

Review Coverage is a side-specific contextual overlay, never part of the Snapshot-content delta. Each selected Snapshot independently reports its exact file-level viewed, unviewed, collapsed, and unrenderable records, associated Review Pass or frozen Review Result where applicable, and observation time. Retained viewed state appears only where the successor’s recorded Coverage retained it under the existing exact-content rule; comparison does not infer transfer from similar text. Counts may be placed side by side, but there is no combined coverage score, no claim that later means more complete, and no implication of correctness.

Unavailable, unrenderable, binary, and over-limit material remains represented rather than omitted. Every affected block, file, and side keeps its manifest facts, exact size or identity evidence, and a precise reason. “Content unavailable,” “captured but unrenderable,” “different but delta not rendered,” and “equality unknown” remain distinct. Digest or byte identity may establish exact equality; absent bytes never do. Binary content receives the already-promised metadata and exact-byte access without a semantic binary diff, and text is never lossily decoded. Preserved Anchor excerpts may help identify unavailable content but never substitute for the missing Artifact payload or authorize a range comparison.

Within the existing v1 stress floor, all saved textual payload participates in deterministic comparison while the TUI may progressively render it. The complete manifest and factual summary appear first; unchanged regions, large files, and expensive deltas may be collapsed and opened on demand. Wide, narrow, linear, no-color, and ASCII-safe presentations preserve the same side labels and evidence. Beyond the supported envelope, named and versioned comparison or render limits disclose exact counts and sizes, preserve navigation and exact-side access, and identify every unevaluated region. Summary totals distinguish proven equal, proven different, unavailable, and not evaluated; no limit may silently omit content, report unevaluated content as equal, or fail the whole comparison when a truthful partial projection remains possible.

All generated statements are deterministic evidence descriptions such as present only in the earlier occurrence, exact saved evidence differs, or delta unavailable. Neoflow produces no natural-language judgment, importance ranking, compliance assessment, resolution claim, semantic mapping, or preferred revision. Diff alignment and collapsing are presentation transforms only; comparison creates no durable derivation, replacement, or supersession relationship.

“Compare with current changes…” is available only from a Review Snapshot and is a compound action outside the comparison itself. Neoflow first performs the existing explicit refresh/capture behavior under the same Review and unchanged Change Set. A coherent changed capture creates a successor Review Snapshot; an unchanged capture reuses the exact existing Snapshot. Only then may two distinct saved Snapshots be compared. If coherent capture cannot be established, Neoflow shows the exact failure and never substitutes a live workspace side. Changing checkout, comparison basis, compared-state kind, or scope creates a new Review and is therefore not Artifact Lineage Comparison. Comparing a Plan Revision with implementation changes belongs to Plan-to-Review Continuity, not this feature.
