---
id: WF-222
title: "Publish provenance-bound Context Budget Evidence"
status: closed
labels:
  - wayfinder:task
parent: WF-216
assignee: juanan
blocked_by: [WF-221]
created: 2026-09-07
---

## Superseded (2026-09-08)

[Reframe Reviewing around the current repository](./WF-225-reframe-reviewing-around-the-current-repository.md) and its confirmed child map replace this child. Reviewing no longer pairs Handoffs with provenance-bound Context Budget telemetry: the user rejected token estimates and model-capacity arithmetic for the ordinary flow. The exact proposed-message byte and character counts survive inside [Define the outgoing review message contract](./WF-228-define-the-outgoing-review-message-contract.md); no token estimates, no route choice, and no automatic payload behavior exist anywhere. The research below remains valid reference material for any future, separately justified telemetry work.

## Superseded resolution (2026-09-14)

Ruled out of scope after the replacement behavior was verified live with a real Pi `0.85.1` host. No Context Budget Evidence is planned for Reviewing: the ordinary flow carries exact byte and character counts inside the [outgoing review message contract](./WF-228-define-the-outgoing-review-message-contract.md) and no token estimates, model-capacity arithmetic, or automatic payload behavior. No replacement child remains for the original scope below.

## Outcome

Each Review Handoff Preview pairs always-known exact proposed-payload measurements with optional provenance-bound attached-session telemetry without false parity. Exact bytes, characters, selected records/items, and files come from the route projection. Model-specific token estimates appear only with a named counting method. Active model, declared capacity, and current usage appear only while normalized Harness evidence proves the matching Attachment/session/model generation and freshness; invalidation produces an explicit unknown reason rather than stale arithmetic.

## Interface

Extend the reviewed Harness Adapter evidence union and Harness Interaction projections with closed Context Budget observation and invalidation facts. An observation binds stable evidence identity, Attachment identity, session/model generation, model label, unit, source, declared capacity, current usage if available, observation cadence/freshness witness, and optional named estimate method. Model/session movement, compaction, Attachment or telemetry loss, and the pre-fresh-response interval invalidate affected fields while preserving historical evidence locally.

Compute proposed-payload metrics from the exact candidate disclosure encoding and expose them separately from telemetry. The current production Adapters may truthfully emit no telemetry in P21; scripted Adapter scenarios prove the semantic contract. Native Pi production and Claude status-line/compaction bridges remain P25/P26.

## Module seam

Harness Interaction owns normalization, binding, freshness, and bounded projection. Reviewing sees no native model, hook, usage, or compaction fact. The disclosure builder supplies exact payload measurements; Context Budget Evidence cannot alter it.

## Acceptance

- [ ] Exact payload byte, character, item/record, and file counts deterministically match the proposed disclosure and remain available when Harness telemetry is absent.
- [ ] Usage/capacity preserves unit, source, model/session/Attachment binding, observation generation, and freshness; incomparable facts are never merged into a universal percentage.
- [ ] Model or session change, compaction, Attachment/bridge loss, stale generation, and the period before fresh matching evidence produce exact unknown reasons; a later valid observation restores only matching fields.
- [ ] Token estimates require a named model/counting method; characters/4 or transcript length never masquerades as a tokenizer-specific count.
- [ ] Budget evidence never chooses a route, drops context, triggers compaction/session change, grants authority, or blocks solely on a percentage.
- [ ] Focused Harness/scripted-Adapter/Runtime suites, canonical verification, four compiled risk probes, dependency/package seams, and `git diff --check` pass with unrelated work unstaged.

## Constraints

- Telemetry is advisory Harness Observability, not Invocation lifecycle or Workflow context.
- No network token-count request, credential acquisition, transcript reconstruction, quality prediction, or automatic threshold behavior.
