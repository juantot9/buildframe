---
id: WF-044
title: "Validate the Harness Interaction Module implementation seam"
status: closed
labels:
  - wayfinder:prototype
parent: WF-039
assignee: juanan
blocked_by: [WF-041, WF-042, WF-043]
created: 2026-07-17
assets:
  - "ab9e1ce:apps/harness-interaction-prototype/ on evidence/validated-implementation-probes (disposable evidence only)"
  - "ba374d1:evidence/validated-implementation-probes/README.md on evidence/validated-implementation-probes"
---

## Question

How should the conceptual Harness Interaction Module map to TypeScript Interfaces, internal Adapter seams, transactions, normalized events, and contract tests; and can thin Pi and Claude Code probes show that Planning and Reviewing receive only semantic outcomes while native capture, correlation, transport, failure, and lifecycle asymmetry remain local to reviewed Adapters?

## Blocked by

- [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
- [Choose the local runtime and Workspace Writer topology](./WF-042-choose-local-runtime-topology.md)
- [Choose the Authoritative Workflow State architecture](./WF-043-choose-authoritative-state-architecture.md)

## Resolution comment

Implement the **Harness Interaction Module** as one deep semantic owner with two distinct internal Interfaces: a workflow-facing command/projection Interface and a reviewed Adapter evidence/directive Interface. Keep the only application-facing seam as the Workspace Interface chosen by [Define the target Module architecture](./WF-041-define-target-module-architecture.md); Planning, Reviewing, the TUI, and other clients issue typed Workspace commands and consume scoped projections rather than importing Harness Adapters or native integration types.

```text
Planning / Reviewing ── semantic facts and commands ──▶ Harness Interaction
                                                               │
                                           closed evidence/directive Interface
                                                               │
                         Pi Adapter ◀────────────────────────────┴────────▶ Claude Adapter
                          native Pi hooks                                  native Claude hooks
```

The governing implementation rule is: **native correlation ends in the reviewed Adapter; semantic correlation begins in Harness Interaction**. A Pi Adapter may prove which `agent_start`, settlement-time stored assistant source, `agent_settled`, abort, or session epoch belongs together. A Claude Adapter may prove which `PreToolUse:ExitPlanMode`, expansion, resolver claim, `UserPromptSubmit`, `Stop`, or `StopFailure` belongs to one native occurrence. Harness Interaction receives only the normalized evidence required to bind that occurrence to an Attachment, Preparation, Offer, Invocation, or Artifact result. It validates that semantic binding and owns every durable state transition. Native hook names, payload containers, prompt and tool identities, socket fields, arbitrary error text, and lifecycle sequences never enter Planning or Reviewing records or projections.

### TypeScript Interfaces and locality

Keep the semantic operation family equivalent to `inspectHandoff`, `commitHandoff`, `associateOffer`, `decideOffer`, and `requestInterruption`, with reads and change notification supplied through scoped Workspace `read` and `subscribe`. These are closed command and result unions, not one method per Harness and not generic record operations. The Harness Interaction implementation owns Handoff Payload Contract resolution, Capability matching, exact disclosure, path selection, Offer association, normalized evidence interpretation, result materialization, interruption intent, and recovery rules.

The internal Adapter seam should have this shape conceptually:

```ts
interface ReviewedHarnessAdapter {
  readonly manifest: ReviewedCapabilityManifest;
  connect(sink: AdapterEvidenceSink): HarnessAdapterConnection;
}

interface AdapterEvidenceSink {
  accept(evidence: AdapterEvidence): Promise<EvidenceAcknowledgement>;
}

interface HarnessAdapterConnection {
  perform(directive: CommittedAdapterDirective): Promise<DirectiveObservation>;
}
```

`AdapterEvidence` and `CommittedAdapterDirective` are closed, versioned tagged unions. Evidence includes such meanings as Invocation start observed, correlated terminal outcome observed, correlation lost, exact User Pull claim requested, exact Plan Offer observed, and Offer Decision delivery observed. Directives include dispatch an already-committed Direct Invocation, arm an already-committed User Pull Preparation, deliver an already-committed Offer Decision, and pursue an Interruption Route. This is not a generic event bus: every variant names one semantic fact, its stable evidence identity, the exact semantic record it concerns, its legal ordering, and its acknowledgement or refusal behavior.

A directive contains only its Capability Snapshot basis, minimum correlation identity, Handoff kind and authority, and accepted exact disclosure projection. It contains no generic workflow store handle. An Adapter cannot browse Authoritative Workflow State, resolve Context Locators, fetch a newer Artifact, infer authority from text, add ambient context, or omit a disclosed component. Native serialization and transport remain private Adapter implementation.

Locate the Module, records, transitions, projections, and Interface-level tests together under `packages/workspace/src/harness-interaction/`. Its Adapter contract is an explicitly exported internal integration subpath owned by that Module, not a revived generic `ai-harness` package. `packages/local-runtime` transports this contract over the private Adapter client role without adding semantic interpretation. Host-required Pi and Claude packages implement the two reviewed Adapters; their native hook types and compatibility fixtures stay in those packages. No package-per-logical-Module split is introduced.

### Capability and evidence contracts

A reviewed Capability Manifest is static, versioned compatibility evidence shipped with the first-party Adapter, not a set of runtime self-asserted broad Booleans. Each contract is specific to one Handoff kind and declares route, Effect Constraint, fact-by-fact Evidence Profile, Interruption Route, limitations, and any Artifact Result Contract. Inbound native Plan Offer support is a separate contract from outbound `Request Plan Generation`; Claude does not gain a correlated outbound generation route merely because it can capture an `ExitPlanMode` Offer.

The Module validates the Manifest schema and supported host-version envelope before establishing an Attachment. An Adapter upgrade or changed Manifest creates new current compatibility evidence and never rewrites a frozen Capability Snapshot. Pi and Claude satisfy the same Interface without pretending to emit the same evidence: contract-conditioned behavior is the commonality, while unsupported evidence remains absent.

Adapter-native failure capture also stops at this seam. Reviewed Adapters normalize only evidence they can prove:

- proven no-start becomes `rejected`;
- correlated failure after start becomes `failed`;
- correlated interruption Terminal Evidence becomes `interrupted`;
- lost attachment, bridge, terminal callback, or lifecycle correlation becomes `unresolved`;
- Preparation withdrawal or expiry remains a Preparation disposition rather than an Invocation failure.

Native error text remains bounded diagnostic detail and never drives workflow branching. Dispatch acceptance, hook return, idle observation, local interruption intent, and disconnect are not upgraded to start or terminal evidence.

### Transaction and effect ordering

Every semantic command or inbound evidence occurrence carries a stable idempotency identity and produces one complete State transition. The Module prepares the whole transition; the Authoritative State Module commits all records or none; only then may the Adapter receive a directive or acknowledgement.

The required path orderings are:

1. **Direct:** atomically commit Workflow Handoff, Commitment Receipt, frozen Capability Snapshot, Invocation in `awaiting start`, and command result; then dispatch the exact directive. The dispatch observation is a later evidence transaction. A crash in between remains committed with missing evidence and is never replayed automatically.
2. **User Pull:** atomically commit Handoff, receipt, and one-use Preparation before exposing its exact harness action. The native command occurrence then atomically changes that Preparation to claimed and creates its Invocation; only the successful claim acknowledgement may return the exact disclosure payload. A same-occurrence callback is idempotent, while a fresh occurrence cannot consume it again.
3. **Native Gate intake:** validate and atomically preserve the exact Harness Offer and contract-valid candidate before acknowledging the synchronous hook. Offer Association is a separate semantic transaction that materializes the Plan Revision. Feedback deny or implementation allow then atomically commits its Handoff, receipt, decision, and any post-allow Invocation before decision delivery. Delivery is independent append-only evidence.
4. **Terminal and result evidence:** atomically append the normalized terminal fact and, when an Artifact Result Contract is satisfied, the exact immutable Plan Revision plus result evidence. Pi's Adapter joins its settlement-time stored source and settlement observation before presenting the candidate; the Module still validates the frozen result contract. Normal settlement without a valid candidate records no Revision, while evidence loss records capture unknown.

Do not implement a replaying outbox or generic retry worker. The committed path record is durable authority; the immediate post-commit continuation may attempt its native effect once. Missing acknowledgement follows the route-specific rejected, unresolved, Explicit Resubmission, or local-presentation rules already settled by the blueprint. Exact duplicate Workspace commands and Adapter evidence return their prior committed results; fresh conflicting evidence fails closed rather than rewriting terminal history.

### Projection and contract-test surface

Harness Interaction projections expose semantic Attachments, Availability, Preparations, Offers, Invocations, Artifact-result evidence, and normalized failures. Planning and Reviewing may branch on those meanings, never on Harness name, native payload, transport, callback sequence, diagnostic string, or current Adapter implementation. Harness Observability remains a separate optional projection and cannot mutate lifecycle.

Use four complementary verification layers:

1. **Module Interface scenarios** with a scripted Adapter and substitutable State Adapter, asserting only semantic commands, records, projections, and post-commit directives.
2. **Capability-conditioned Adapter contract suites** shared where guarantees are genuinely common, without requiring unsupported parity. They verify closed-union validation, identity binding, one-flight behavior, idempotency, payload confinement, and failure normalization.
3. **Adapter-specific native fixtures and pinned live compatibility probes** for Pi event ordering/result selection and Claude Offer/User Pull hook correlation. These test each reviewed Adapter through its internal Interface, not through native details copied into workflow tests.
4. **Fault-injection scenarios** around commit, effect, acknowledgement, duplicate evidence, correlation loss, and restart. A failed commit must perform no effect; a post-commit loss must preserve authority without automatic replay.

Delete the legacy `AiHarness`, `MockHarness`, `sendMessage`, generic mode, broad capability Boolean, Promise-to-completion, raw event, and disconnect-means-failed shapes rather than layering this Module around them.

### Probe verdict

The disposable Harness Interaction seam probe preserved at `ab9e1ce:apps/harness-interaction-prototype/` on `evidence/validated-implementation-probes` implements the selected TypeScript shape with an in-memory transactional State Adapter and thin Pi 0.80.10- and Claude Code 2.1.209-shaped reviewed Adapters. The evidence report at `ba374d1:evidence/validated-implementation-probes/README.md` records the exact `pnpm prototype:harness-interaction -- --all` reproduction route.

Every automated route passed: Pi Direct start/retry/final-source settlement produced one exact two-segment Plan Revision while excluding thinking; Claude Native Gate capture committed before acknowledgement and decision committed before delivery without inferring start; Claude Review released payload only after atomic User Pull claim and correlated start/normal end; duplicate commands and same native occurrences were idempotent; fresh duplicate claims failed closed; failed State commit produced no effect; Pi session replacement and Claude terminal-evidence loss became unresolved while `StopFailure` became failed; Handoff-specific Manifests preserved route asymmetry; and workflow projections contained no native hook, correlation, transport, Adapter, or diagnostic vocabulary.

The probe intentionally uses deterministic native-shaped fixtures rather than new model calls and is untracked planning evidence pending explicit capture approval. `pnpm verify`, standalone strict TypeScript checking of the probe, and `git diff --check` pass. No product terminology changed, so `CONTEXT.md` remains unchanged. This decision surfaces no new ticket or fog.
