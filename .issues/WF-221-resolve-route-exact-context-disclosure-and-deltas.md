---
id: WF-221
title: "Resolve route-exact context disclosure and deltas"
status: closed
labels:
  - wayfinder:task
parent: WF-216
assignee: juanan
blocked_by: [WF-220, WF-225]
created: 2026-09-07
---

## Design pause (2026-09-08)

The grilling pass changed the product direction before an implementation Resolution was settled. [Reframe Reviewing around the current repository](./WF-225-reframe-reviewing-around-the-current-repository.md) records the accepted decisions and is the next planning frontier: current and unchanged repository files are the ordinary Reviewing surface, history is a separate inspect/Question/reuse flow, and small human-readable Questions may name live repository files for the Harness's own tools instead of transmitting every supporting capture.

The exact outgoing-message guarantee remains; it is not a promise about the Harness's independent later file reads. Exclusion controls Neoflow's message, not filesystem access. A restricted Neoflow file server was not approved. Token estimates were rejected in favor of message size, and arbitrary advisory thresholds must not masquerade as technical limits.

**Do not implement the original scope below unchanged.** It is retained for reconciliation by WF-225, along with WF-222–224. Non-empty context still fails closed in production; no code, record migration, or commitment-policy bypass was authorized by this decision pass. Resume only after the revised work is mapped and a new pre-implementation Resolution is settled and committed.

## Superseded resolution (2026-09-14)

Ruled out of scope after the replacement behavior was verified live with a real Pi `0.85.1` host. [Define the outgoing review message contract](./WF-228-define-the-outgoing-review-message-contract.md) fixes the exact outgoing material, [Implement the diff-first Reviewing view](./WF-227-implement-the-diff-first-reviewing-view.md) delivers the surface with optional exact preview, and [Compose Review context commitment assessment](./WF-223-compose-review-context-commitment-assessment.md) delivers one composed assessment with durable exact acknowledgments. Route-representation choice, disclosure deltas, and all-supporting-captures transmission are not being implemented, and no replacement child remains for the original scope below.

**Superseded by the confirmed child map (2026-09-08).** This issue is not resumed. Its surviving exactness requirements — identical accepted-message bytes/digest across Handoff, receipt, recovery, and Adapter directive; pre-effect target revalidation; fail-closed durability — are carried into [Define the outgoing review message contract](./WF-228-define-the-outgoing-review-message-contract.md). The frozen supporting-context package, manifest/window, and delta machinery below is replaced by the much smaller one-message contract; the replacement goes through WF-228's own tests, never silently.

## Original outcome (pending replan)

Harness Interaction derives an exact ordered Handoff Disclosure Preview and Handoff Disclosure Delta for Review supporting context from one immutable proposed Review Snapshot, exact Batch, destination Attachment, frozen Capability, and Handoff Route. Every occurrence has one explicit representation—exact content/range, correlation-proven destination-native reference, metadata only, or unavailable—with exact boundaries, bytes/digest, provenance, sensitivity, and limitation. The committed Handoff and Adapter directive contain exactly the accepted projection and no ambient or silently omitted material.

## Interface

Extend the closed Submit Review Batch inspection/disclosure contracts with bounded context component manifests, detail/content windows, exact representation limitations, aggregate identities, and a delta against the last exact destination-scoped curated basis. Representation support and route-payload bounds are frozen Capability/route facts, not inferred from Harness name. Exclusions and local-only evidence stay in the local Preview; their source identities cross the destination only when an explicit metadata representation says so.

The existing Direct Question route is the first exercised consumer. This child does not add Pi mutation capability, Claude User Pull, Manual Handoff, or strongest-route selection; later routes must satisfy the same semantic projection without changing Snapshot meaning.

## Module seam

Harness Interaction owns representation, disclosure assembly, and confinement. Reviewing supplies structured immutable Snapshot/Batch facts through an owner-private collaboration. Adapters encode an already-committed disclosure and cannot browse State, recapture files, add context, drop a component, or reinterpret a limitation.

## Acceptance

- [ ] Every admitted, excluded, unavailable, over-limit, binary, unrenderable, and sensitive occurrence receives one exact local Preview status and stable ordering; payload representations preserve exact ranges and boundaries.
- [ ] Delta identifies each added, refreshed, expanded, representation-changed, destination-changed, or newly sensitive occurrence with inspectable exact content or comparable difference.
- [ ] Unknown scope, incoherent source, silent truncation/omission/substitution, or an unrepresentable required item blocks inspection; known metadata/unavailable representation remains an explicit limitation for policy.
- [ ] The accepted disclosure bytes/digest are identical in Handoff content, receipt summary, command recovery, and Adapter directive; excluded/local-only identities and ambient workspace/editor/transcript facts do not leak.
- [ ] Same-version races and changed Capability, destination, Snapshot, selection, or representation invalidate the inspection identity before commit and perform no effect.
- [ ] Focused Workspace/Harness/Adapter confinement suites, canonical verification, four compiled risk probes, dependency/package seams, and `git diff --check` pass with unrelated work unstaged.

## Constraints

- Authority, disclosure, and local-only evidence remain independent; supporting context never widens Review Anchor authority.
- No prompt wording, generic context bag, Adapter-selected files, hidden summarization, or route-specific workflow payload fork.
