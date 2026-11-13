# Harness capability seam

Decision record for [Define the harness capability seam](../../.issues/WF-008-define-harness-capability-seam.md). This is a conceptual product Interface, not an implementation plan or wire-protocol specification.

## Amendment (2026-09-08)

[Reframe Reviewing around the current repository](../../.issues/WF-225-reframe-reviewing-around-the-current-repository.md) and its confirmed child map reshape the Reviewing rows below: the ordinary Reviewing Handoff is one small message (user text plus a `file:line` Live Repository Reference; plus exact labelled historical lines for saved-origin messages) per [Define the outgoing review message contract](../../.issues/WF-228-define-the-outgoing-review-message-contract.md), not an ordered Batch with Anchors, intents, and selected supporting context. A message itself never authorizes an edit; the Attachment's direct Review Capability carries the authority, and [Let the harness modify the workspace by default](../../.issues/WF-239-let-the-harness-modify-the-workspace-by-default.md) settles workspace write as the direct default with an explicit per-session read-only narrowing. The seam placement, ownership, and route facts remain as decided; the Submit Review Batch rows are retained as historical contract definitions superseded for Reviewing's ordinary flow.

## Amendment (2026-09-14)

[Compose Review context commitment assessment](../../.issues/WF-223-compose-review-context-commitment-assessment.md) settles how the seam assesses the exact outgoing Review Message before commitment. Harness Interaction resolves one composed `direct`/`gate`/`blocked` Commitment Assessment over the already-composed exact outgoing bytes, their exact Review/origin occurrences and provenance, the frozen destination and Capability facts, and exact prior Invocation facts. An ordinary message stays `direct` and keeps one Send action with optional preview. The outgoing material is never scanned for secrets ([Send to the Harness as written](../../.issues/WF-266-send-to-the-harness-as-written.md)); only an unresolved prior Invocation on the same Attachment opens one composed gate; the commit command carries only the exact ordered requirement identities returned by the bound inspection, and newly accepted requirements are written atomically as immutable `harness.commitment-acknowledgement` records referenced by the Commitment Receipt and Handoff. An acceptance covers only that exact proposal and state; the next Message asks again, so it is never standing trust. Invalid identity, unavailable Capability or availability, active single-flight work, unrepresentable material, and incoherent assessment input remain non-overridable blockers. Adapters still receive only the already-committed exact outgoing bytes and no policy metadata to reinterpret or enrich.

## Amendment (2026-09-29)

[Deliver Review Messages through a managed Claude Direct session](../../.issues/WF-258-deliver-review-messages-through-a-managed-claude-direct-session.md) accepts an exact-version-proved managed Direct route for ordinary Claude Reviewing. One explicit workspace-scoped setup launches a background conversation the user can attach to; each later Review Message retains its own Consent Boundary and targets only that exact conversation. Harness Interaction owns a durable ordered Direct Delivery queue separately from Invocation lifecycle, claims at most one Delivery at a time, and pauses rather than replaying or skipping after rejection or unresolved evidence. The Claude Adapter owns launch/stop/respawn, process-scoped inbox credentials, native frame encoding, and hook correlation behind semantic control/directive/evidence Interfaces. Setup withdrawal closes every queued Delivery before process control but neither deletes the native conversation nor rewrites an already-started Invocation.

This decision does not claim arbitrary foreground-session injection, binary/file delivery, cancellation, replay, assistant-result capture, or semantic success. The native “Another Claude session sent a message” presentation and peer-safety notice are accepted limitations. The proof is exact to Claude Code `2.1.282`; the current reviewed production profile remains the pinned User Pull profile until WF-257 completes its deterministic and human live gates. Active single-flight work therefore remains a blocker for existing Direct Capabilities unless their exact Capability explicitly declares the Workspace-owned durable queue.

## Amendment (2026-10-05)

The managed Direct candidate above is safety-blocked by the exact-`2.1.284`
adversarial provenance result in
[WF-258](../../.issues/WF-258-deliver-review-messages-through-a-managed-claude-direct-session.md),
branch `prototype/wf258-managed-direct-provenance`, commit `de87ce1`. The setup
context needed to make exact peer-framed Review Messages use normal tools also
made indistinguishable unauthenticated frames, wrong-token frames, spoofed
metadata, and a separate native Claude peer inherit `Read`/`Write` authority.
Owner-only socket permissions separate OS users but do not separate same-user
Claude peers. Native sender metadata solved duplicate delivery only;
Adapter-local hook correlation was post-submit evidence, not Native Dispatch
Provenance.

Therefore no managed Claude Direct Capability is currently accepted. The
workspace queue and setup lifecycle remain a conditional reusable design, but
must not enter production until a supported native ingress distinguishes the
exact authorized dispatch before its authority can be exercised while retaining
normal attached-user turns. The reviewed Claude route remains User Pull. A
model-visible marker or secret, optional inbox authentication, sender-label
trust, permission bypass, or broad setup instruction is not an admissible
substitute.

## Research follow-up (2026-10-06)

[WF-259](../../.issues/WF-259-prove-claude-direct-attachment-through-a-native-mod.md)
investigates a different Claude Direct candidate: one native Mod in the exact
interactive conversation the user explicitly attaches, matching Pi's persistent
attachment experience without launching another conversation. Anthropic now
documents session-local `$.prompt.submit`, native origin metadata, and pre-context
consume/drop hooks. An exact-`2.1.291` offline engine probe passes 15 checks;
this is not production Capability admission or a passed end-to-end provenance
gate. The Claude Adapter must prove external directive authorization, exact
bytes, native per-dispatch lifecycle correlation, and gateway/policy behavior
before implementation. WF-258's private inbox remains rejected and the reviewed
Claude User Pull profile is unchanged.

**Live follow-up (2026-10-07):** WF-259 used 6 of 8 approved synthetic turns.
Native `2.1.291` preserves `asUser` model-bound bytes and plugin provenance,
mints distinct duplicate turns, and permits corrected normal Read/Write. A
new native peer sender instead loads `2.1.292`; its Mod refuses before
`SendMessage`, so peer rejection remains untested. Zero-model launch controls
still fail to pin that background worker. Exact native version—not merely the
launcher—must gate availability. Resolve that proof-rig identity before more
functional tests. These background fixtures establish neither a foreground user
Attachment nor authenticated runtime ingress, general correlation/recovery, or
production Capability admission. See the [captured live evidence](../research/claude-native-mod-direct-wf259.md).

**Foreground follow-up (2026-10-07):** The final two approved turns bring WF-259
to 8 of 8. Fresh foreground fixtures verify exact native291 without bypass,
consume one real native peer before context, and accept a CLI-startup composer
control with the same exact text as earlier Mod fixtures. Captured at `773dabd`.
No PTY input is written, no real user's conversation adopted, and no launcher
becomes product architecture. Runtime-to-Mod authorization, actual existing
Attachment, general correlation/recovery, and the remaining adversarial/policy/
permission cases are still unproved; production admission remains pending.

**Offline design follow-up (2026-10-07):** Source `36d35c6` models a Claude
Adapter-private, post-commit signed-grant publisher and one-use lifecycle custody,
without changing the existing semantic `perform`/evidence Interface. Real root/
helper/evidence authentication and native occurrence-to-turn correlation remain
unproved; the observed291 fixture profile refuses before publication. Successful
lifecycle examples use an explicitly hypothetical native join, never text/timing
inference. See [design findings](../research/claude-native-mod-attachment-design-wf259.md).
No production Interface/version admission or additional funded run follows from
this model.

**Native join follow-up (2026-10-13):** Zero-model native source `2ebd63d` tests
classic prompt IDs, callers and overlapping submit/start observations on exact291.
IDs differ, start caller is engine and API returns carry no tested join. Independent
single-flight producers can overlap;2 successful returns had only1 later native
start/end observed. This rejects those candidate heuristics, not every supported
causal design. [Findings/upstream question](../research/claude-native-mod-correlation-wf259.md)
keep Direct unavailable;0 real model requests/tools, no Interface/version change.

**Pairing candidate (2026-10-13):** Source `f75106c` exercises explicit genuine-
surface root comparison, private owner key custody and fenced encrypted control
only:46 offline scenarios and two owned Node children, no native/model calls.
[Findings](../research/claude-native-mod-trusted-pairing-wf259.md) name the missing
actual launcher/UI owner enrollment—closed startup IPC and caller role/code claims
are not root trust. Publication/evidence stay hard-disabled; no Semantic Attachment,
Workflow consent, Interface or version admission follows from cryptographic pairing.

**Owning-startup slice (2026-10-13):** Branch-only `408360a` integrates actual
launcher/runtime private IPC enrollment and bounded owner control.16 scratch-
writer scenarios and34 regressions pass; publication disabled,0 native/model
calls. Existing owners are enrollment unavailable, not retired/replaced. This
**does not authenticate the ordinary semantic socket** or establish committed
publication authority, native UI/helper provenance, turn custody or admission.
[Findings](../research/claude-native-mod-trusted-pairing-wf259.md#actual-owning-startup-integration--2026-10-13).

**Owned UI session (2026-10-13):** Branch-only `2c67276` binds actual Workspace
calls to the private owning IPC, reusing existing handlers/commits. Candidate
public socket becomes identity-only, not mutation/Adapter/evidence authority.
17 scratch scenarios, prior16 enrollment cases and34 regressions pass; no native/
model/publication call. Lost result stays unresolved, no retry/fallback/replay.
This is not actual Message grant/native helper/evidence/turn-custody proof or
production policy admission. [Findings](../research/claude-native-mod-trusted-pairing-wf259.md#owned-uiworkspace-channel-follow-up--2026-10-13).

**Post-commit diagnostic (2026-10-13):** Branch-only `2a432d9` authenticates
exact frozen Message DTO at the actual owned callback, without general signing,
store reconstruction or native publication.11 scenarios/60 regressions pass.
Not a full grant: normalized DTO omits Message/receipt IDs; current Message path
also leaves local no-dispatch observation unresolved. Both owner-seam/consumption
questions remain explicit, not invented fields or synthetic native settlement.
[Findings](../research/claude-native-mod-trusted-pairing-wf259.md#exact-post-commit-dto-authentication--2026-10-13). No Interface/profile/version admission.

**Message local-refusal candidate (2026-10-13):** `205b8c6` reuses the
existing post-commit normalized rejection path for proven pre-native Message
refusal. Missing/invalid/lost observations remain unknown; active status cannot
be overwritten and interruption is not cancellation.14 owned-runtime/13 private
controls pass,60 regressions and prior17/16 channel/enrollment cases pass. Main
implementation/Interfaces/profiles unchanged; no native publication. Full private
Message/receipt committed-occurrence authority remains open.
[Findings](../research/claude-native-mod-trusted-pairing-wf259.md#message-pre-native-refusal-consumption--2026-10-13).

**Owned committed-occurrence candidate (2026-10-13):** `4c01d63` binds
actual atomic Message/receipt/Handoff/Capability/Invocation using a per-owned-Adapter
one-use accessor at the existing callback. Normal Directive/perform and Workspace
Interfaces unchanged; prototype-only private host factory enrollment is explicit,
not a public caller-context/signing endpoint. Uses actual LOCAL receipt write,
not workflow reconstruction.16 actual Node/25 private controls and60 regressions
plus17/16 channel/enrollment scenarios pass. Loss stays uncertain; no replay or
native receipt manufactured. Genuine UI/assembly/helper/receiver/native correlation
remain gated, no production/profile admission.
[Findings](../research/claude-native-mod-trusted-pairing-wf259.md#owned-committed-message-occurrence--2026-10-13).

**Native bootstrap review (2026-10-15):** [primary-source findings and upstream
question](../research/claude-native-mod-bootstrap-contract-wf259.md) establish no complete
protected ordinary-Mod enrollment path in this review. Mod-local crypto could
reduce helper trust; genuine root/fact/UI/profile-lease custody remains open.
Immutable API/origin/trace is not external-root authentication; policy-tier bypass
and a rewritten UI callback do not provide it. No receiver, deployment-policy or
Direct/version admission follows.0 native/model calls; initially draft-only in
this source-review phase, approved publication recorded below.

**Plannotator-directed continuation (2026-10-15):** approved bootstrap question
posted as[#102463](https://github.com/anthropics/claude-code/issues/102463). Isolated
`b9870b4` follows thin native entrypoint/persistent controller, not bearer-root trust,
automatic session restoration or body-matched turn attribution.20 synthetic-entrypoint
snapshots/4 pure-source controls and exact291 typecheck pass; publication absent,
no receiver, semantic Interface change or native/model call. [Findings](../research/plannotator-tui-claude-delivery.md#current-plannotator-follow-up--2026-10-15).
Native enrollment/turn-custody/profile gates remain; no product admission.

**Nonblocking lifecycle follow-up (2026-10-15):** isolated `820c4a8` fixes startup
metadata blocking, registration-ticket settlement and throwing timer cleanup in
that scaffold.3 prior faults reproduced;14 fault/20 adapted lifecycle/4 pure-source
controls and exact291 typecheck pass. Cooperative deadlines are NOT protected
leases/native cancellation/refusal evidence. No receiver, publication, semantic
Interface change or native/model call. [Findings](../research/claude-native-mod-controller-lifecycle-wf259.md).
Both upstream issues OPEN/0 comments at20:11:03Z; same admission gates apply.

## Purpose

Planning, Reviewing, and cross-session continuation need one coherent way to commit work toward a correlated Attached Harness or an explicit Manual Handoff destination without pretending Pi and Claude Code behave alike. The seam must preserve Neoflow-owned Workflow Handoffs, Artifacts, decisions, and Invocation evidence while hiding each harness’s transport and lifecycle details.

The current MVP shape—`chat | plan | review`, broad Boolean capabilities, a generic message string, `cancel`, and `done`—cannot represent Claude’s User Pull Review or Native Plan Gate honestly. It also makes connector acceptance look too much like execution success.

## Seam placement

Planning, Reviewing, and cross-session continuation call one deep **Harness Interaction Module**. They never call Pi or Claude Adapters directly.

```text
Planning ─────────────┐
Reviewing ────────────┼── Harness Interaction Module ── internal Adapter seam ── Pi Adapter
Workflow continuation ┘                                      └────────────────── Claude Adapter
```

The Module owns:

- Capability Manifest validation and matching;
- Harness Availability interpretation;
- Attachment Identity validation;
- Artifact Result Contract validation, exact result capture, and atomic Artifact materialization;
- Handoff Payload Contract validation, exact disclosure projection, commitment, correlated-route selection, and explicit Manual Handoff selection;
- Harness Offer intake, Workflow association, decisions, and decision-delivery evidence;
- Invocation identity, idempotency, and evidence normalization;
- Interruption semantics;
- disconnect and reconnect behavior; and
- durable normalized records and change notifications.

Each Harness Adapter owns:

- native SDK, extension, hook, plugin, and transport dependencies;
- native session and checkout identity extraction;
- its reviewed Capability Manifest;
- native command or prompt serialization;
- lossless extraction of reviewed native result sources into normalized candidates;
- translation of native events into normalized evidence; and
- Adapter-specific contract tests and live probes.

Adapters receive only the exact resolved disclosure projection or Offer Decision they must encode, plus minimum correlated identities. They never receive a generic context bag or gain access to the Handoff’s local authority graph and evidence merely because those records validate the commitment, and they cannot browse Neoflow’s workflow store.

## Conceptual Interface

```ts
interface HarnessInteraction {
  inspect(proposal, optionalAttachment): HandoffOptions;
  commit(proposal, selectedOption): CommitOutcome;
  associate(offer, target): AssociationOutcome;
  decide(offer, decision): DecisionOutcome;
  requestInterruption(invocation): InterruptionOutcome;
  snapshot(): InteractionSnapshot;
  subscribe(listener): Unsubscribe;
}
```

This is a semantic sketch. Exact language-level types belong to later implementation planning.

### `inspect`

`inspect` accepts a proposed Handoff, not merely a broad mode or a caller-selected capability identifier. The Module derives:

- Handoff kind and Handoff Payload Contract version;
- required authority and provenance records, exact disclosure components, and local-only evidence;
- discussion-only or mutation-authorizing intent;
- required Effect Constraint;
- required Evidence Profile;
- required Artifact Result Contract for a result-producing Handoff;
- exact Attachment Identity for correlated options; and
- acceptable Handoff Routes plus any explicit Manual Handoff option.

It returns compatible options and current Availability. The result is advisory: `commit` revalidates identity, capability, availability, and route prerequisites because all may change after inspection. Absence of a live attachment removes correlated options but does not remove an otherwise valid destination-declared Manual Handoff.

The strongest compatible available route is the coherent default. User choice is required only for a Capability Downgrade, Manual Handoff, destination identity change, or materially different alternatives.

### `commit`

`commit` accepts one exact structured Handoff proposal and the selected inspected option. It never accepts a generic prompt string or a supposedly committed Workflow Handoff that does not yet exist. The Module validates the proposal’s complete immutable authority graph, resolves its ordered exact disclosure projection, and atomically materializes the Workflow Handoff, Commitment Receipt, and selected path records while keeping local-only evidence away from the Adapter unless the contract deliberately discloses a component. For Begin Implementation, the workflow transaction consumes the exact active Plan Approval and, when Planning is still open, establishes Planning Completion atomically with the Handoff and route-specific records. An already-completed Workflow references its existing Completion instead; retries of the same Handoff preserve its authority rather than manufacturing another Approval or Completion.

It returns after the selected commitment has been durably established, not after harness settlement or manual use:

- `direct_committed` — a Direct Invocation awaits correlated start;
- `user_pull_prepared` — a correlated one-use Preparation, not an Invocation, awaits the user’s exact harness action;
- `manual_committed` — exact destination-scoped material is ready for local reveal, with no Invocation or Harness lifecycle claim;
- `rejected` — correlated evidence proves the Invocation did not start;
- `blocked` — current Availability prevents a correlated commitment; or
- `unsupported` — no matching correlated Capability exists.

Direct success preserves Handoff Identity, Attachment Identity, Capability Snapshot, route, and Invocation Identity. User Pull success instead preserves a User Pull Preparation identity and returns its exact one-use harness action; an Invocation Identity is created only by atomic claim. Manual success preserves the Handoff, declared Manual Handoff Destination, exact human-carriable rendering, and Commitment Receipt before reveal; it has no Capability Snapshot unless one is referenced only as evidence of an explicitly declined stronger option.

Repeated handling of the same commit command is idempotent. Reopening or retrying local presentation of one Manual Handoff reuses its exact saved material, while authorizing another manual attempt creates a new destination-scoped commitment. Re-preparation after a proven-unclaimed ending and Explicit Resubmission after an unresolved Invocation follow [Define prepared User Pull lifecycle](../../.issues/WF-033-define-prepared-user-pull-lifecycle.md).

`commit` never waits for a generated Artifact. Later normalized evidence may materialize at most one Plan Revision for a result-producing Direct Invocation, but only when its frozen Artifact Result Contract is satisfied and the exact Artifact plus result evidence commit atomically. An Invocation may end normally without a Revision, and lost result evidence never becomes success by inference. This behavior remains behind the existing `snapshot` and `subscribe` Interface rather than adding transport-shaped result callbacks for workflow callers.

### `associate`

An inbound native Plan proposal is first validated against its Artifact Result Contract and durably preserved as one exact, deadline-bound Harness Offer. It does not become workflow-owned merely because an Attachment, workspace, focused Workflow, matching content, or prior Manual Handoff looks related.

`associate` accepts that exact Offer and one explicit existing-Workflow or create-new target. It revalidates Offer, Attachment, Workspace, target eligibility, and result evidence before atomically materializing the capture as a Plan Revision and committing its Offer Association. A create-new target additionally requires the exact user-confirmed goal and atomically establishes the Workflow, Plan, harness-neutral associated-offer Planning Origin, and initial Artifact focus while recording that Neoflow captured no pre-Offer context; the Adapter supplies neither the goal nor inferred conversation context. An existing target retains its immutable Planning Origin. Association creates no Workflow Handoff, Approval, Offer Decision, Invocation, or inherited consent. A successor Offer may retain association only when native evidence proves it is the revised occurrence following this exact Offer’s delivered deny; it still receives new Offer and Plan Revision identities.

This separate semantic operation is necessary because association may commit before or without a gate decision. Hiding it inside `decide`, a workflow store write, or an Adapter callback would either collapse distinct durable facts or leak native Offer mechanics across the seam. Exact target and outcome types remain implementation-planning choices.

### `decide`

`decide` applies one durable user Offer Decision to one exact associated live Harness Offer. Plan Approval remains a separate local decision and never allows the gate. Submitting Planning Feedback atomically commits the exact Feedback Batch, Workflow Handoff, receipt, and deny decision; beginning implementation requires an already-active Approval and atomically commits Planning Completion when needed, the exact Implementation Handoff, receipt, allow decision, and post-allow Invocation before delivery is attempted. A user may explicitly deny without Feedback, but a timeout, invalid identity, unavailable authority, or other fail-closed response is a Native Gate Refusal rather than user Feedback or an Offer Decision.

Decision commitment and Offer Decision Delivery are separate facts. Delivery proves only that the exact response reached the exact live gate. Proven non-delivery may establish that an allow Invocation did not start; ambiguous or delivered allow without later start evidence remains unresolved under Claude’s v1 profile. Disconnect after commitment preserves every semantic record but cannot redirect or automatically replay the decision. Only a repeated callback for the same still-live native occurrence may idempotently retrieve the same decision; no later Offer inherits it, even when content matches.

### `requestInterruption`

This records and pursues the declared Interruption Route:

- Direct Request;
- User Action; or
- Unavailable.

It never changes Invocation Status by itself. Only correlated evidence can establish interruption.

### `snapshot` and `subscribe`

Adapter events are validated, normalized, and durably applied before callers are notified. Callers read Module-owned Attachment, Preparation, Offer, Invocation, Capability, Availability, Artifact-result, and evidence records. They never consume raw Pi or Claude event streams.

After restart, callers rebuild from durable records rather than requiring an in-memory event replay.

## Closed Handoff kinds

V1 uses a closed, versioned union rather than an open string registry:

- Start Planning Exploration;
- Request Plan Generation;
- Submit Feedback Batch;
- Begin Implementation;
- Submit Review Batch;
- Continue Workflow.

Continue Workflow is a dedicated discussion-only kind carrying one exact Continuation Brief to a fresh destination. It grants no authority owned by Plan generation, Feedback, Review Batch, Approval, or Implementation Handoffs and has no Artifact Result Contract. Harness Offer remains a separate inbound type. There is no generic Chat Handoff; free-form conversation remains harness-owned. Code Inquiry is post-v1 and would require a deliberate future Handoff Payload Contract rather than reusing another kind.

Adding a Handoff kind requires a deliberate contract version change.

## Handoff payload contract

Every kind uses one destination-scoped, route-neutral semantic envelope with three independently explicit concerns:

- authority and provenance references that validate what the user may commit;
- an ordered exact disclosure manifest resolved from immutable records; and
- local-only evidence that remains available for truth and recovery without becoming Harness context.

Authority does not imply disclosure, and context does not enlarge authority. A correlated Attachment or declared Manual destination is frozen per Handoff; Native Gate Feedback and Implementation additionally bind the exact associated Offer. Another destination, authority, or semantic payload creates another Handoff, while exact resubmission reuses the original.

The six bodies remain deliberately deep and workflow-shaped:

| Handoff | Required semantic material | Authority |
| --- | --- | --- |
| Start Planning Exploration | Exact Planning goal and accepted Planning Context Snapshot projection | Discussion-only exploration |
| Request Plan Generation | Exact Planning Origin and its available or explicitly unavailable context basis; optional exact basis Revision, committed Feedback, and verbatim user direction | Produce one candidate Plan Revision under a valid result contract when correlated |
| Submit Feedback Batch | Exact target Plan Revision and ordered Feedback Batch with Anchors, intents, replacements, and selected evidence | Discussion or successor-Plan change bounded per Annotation intent |
| Begin Implementation | Exact approved Plan Revision, Planning Origin and goal, available context projection or explicit origin-context limitation, with local Approval, Completion, Baseline or accepted absence, and drift evidence where assessable | Workspace mutation bounded by the approved Plan |
| Submit Review Batch | Verified-current Review Snapshot evidence and ordered Review Batch with Anchors, intents, replacements, and selected supporting context | Discussion or workspace mutation bounded per Annotation intent |
| Continue Workflow | Exact Continuation Brief and deliberately selected source records | Orientation and discussion only |

Exact destination-native references may avoid retransmitting material only when reviewed correlation proves that the destination already holds the same source occurrence. Metadata-only or unavailable components require an explicit allowed limitation; the known absence of pre-Offer context in an associated-offer Planning Origin is such a limitation, never an empty Snapshot or permission to omit selected content. Unknown scope, silent omission, or an unrepresentable required Plan or Concrete Replacement blocks commitment. Implementation Baseline bytes, receipts, capability evidence, lifecycle records, transcripts, observability, live locators, Editor Presence, ambient workspace state, and unselected Workflow records remain local unless a kind explicitly selects a source-backed component.

The TUI derives a compact action, destination, scope, and at most one material limitation from this contract. Progressive detail exposes exact components, provenance, exclusions, and degradation without turning the semantic contract into primary-interface jargon. The full product decision is recorded in [Define v1 Workflow Handoff payload contracts](../../.issues/WF-031-define-v1-workflow-handoff-payloads.md).

## Capability contract

A Harness Capability is specific to one Handoff kind and contains:

- **Handoff Route** — Direct, User Pull, or Native Gate;
- **Effect Constraint** — enforced, communicated only, or none, with exact limitations;
- **Evidence Profile** — independently declares route acceptance, start, normal end, failure, interruption, and reconnect reconciliation or replay;
- **Artifact Result Contract**, when the interaction may produce a Neoflow Artifact — independently declares accepted source occurrence and shape, lossless semantic payload, capture bounds, completeness evidence, and required provenance;
- **Interruption Route** — Direct Request, User Action, or Unavailable;
- route-specific expiry behavior; and
- known limitations.

A broad `supportsPlanning`, `streaming`, `cancel`, or `terminalEvidence` Boolean is insufficient.

### Capability versus Availability

Capability records what a reviewed Adapter can reliably do. Availability records whether it can be used now:

- `available` — enough evidence exists to begin the route;
- `blocked` — a known temporary condition prevents it; or
- `unknown` — authoritative readiness is unavailable.

Direct routes block on unknown readiness. User Pull may be prepared with explicit disclosure because the user controls invocation timing. A live Harness Offer establishes Native Gate readiness.

`inspect` never converts unknown into available.

### Route expiry

- **Direct:** a bounded no-start deadline; expiry is unresolved unless rejection is proven.
- **User Pull:** waiting is not a harness timeout; an unclaimed Preparation ends through user withdrawal, semantic Attachment or contract invalidation, or a disclosed route deadline. Claim freezes a bounded Start Observation Window for retaining the correlated submit callback. Expiry makes the Invocation unresolved because start evidence was lost; it neither rejects the Invocation nor proves that the Harness did not begin.
- **Native Gate:** the live Offer carries an effective decision deadline. If no decision commits first, it expires undecided and receives only a fail-closed Native Gate Refusal; if a decision commits first but exact delivery cannot be established, delivery and any allow Invocation become unresolved.

### Artifact results

Artifact Result Contracts remain independent from lifecycle Evidence Profiles. A result-producing option is compatible only when the Module can preserve one complete exact Artifact under the reviewed contract; ability to dispatch and observe settlement is insufficient. Contract satisfaction creates one occurrence-identified Artifact with a versioned lossless payload and provenance, while a digest only verifies bytes. It never proves semantic completeness, correctness, or compliance.

For Pi Direct Plan generation, the contract requires an exclusively owned Invocation, observed start and `agent_settled`, and the unique final settlement-time persisted assistant source with normal `stop` and an accepted non-empty plan-text shape. Multiple retry or tool-loop assistants may precede it but never become results. A Neoflow-owned durable result commit must join the exact source and settlement while observable; Pi session history alone cannot repair missing evidence after disconnect or restart.

For Claude Native Plan, the contract source is the exact bounded decoded `tool_input.plan` in one validated `PreToolUse:ExitPlanMode` occurrence. Offer intake durably captures that candidate before response, while explicit Offer Association later gives it a Plan Revision identity. No terminal event, native plan-file read, prior Manual Handoff, content match, or later Offer Decision strengthens or weakens the captured Artifact.

Claude Review User Pull has no Artifact Result Contract in v1. Its reviewed bridge excludes assistant text, tool results, and transcripts, so correlated `Stop` evidence may settle the Invocation but cannot materialize a Review Response Artifact or prove that the Review was understood or applied.

The Plan payload preserves the exact ordered plan text segments and their boundaries without trimming, newline or Unicode normalization, invented separators, or renderer rewriting. Thinking, tools, diagnostics, and native locators are excluded explicitly by the contract rather than silently folded into the Plan. Empty, partial, malformed, ambiguous, unsupported, over-limit, or incompletely persisted values create no Revision and are never truncated or promoted later.

Callers see result evidence separately from Invocation evidence: a Revision may be captured, decisively absent, or unknown. A normal end may coexist with no complete Revision, and a Claude Revision may exist while its Offer remains undecided or its decision delivery is unresolved. A route with lifecycle settlement but no reliable result contract is **Plan Revision capture unavailable** for `Request Plan Generation`; Manual Handoff may expose a fresh request to the user but creates no Invocation or generated Artifact and cannot be used to import or retroactively correlate visible Harness output.

### Observability

Harness Observability—text deltas, tool activity, model labels, and busy hints—is optional awareness data, not a commitment-level capability. Workflows never derive start, result completeness, outcome, correctness, or Annotation disposition from it.

## Normalized failures

The Module exposes stable meanings rather than arbitrary Adapter errors:

- `unsupported` — no Capability exists; no Invocation is created;
- `blocked` — Capability exists but Availability prevents commitment;
- `rejected` — correlated evidence proves the Invocation did not start;
- `failed` — correlated evidence reports failure after start; and
- `unresolved` — Neoflow cannot determine what happened.

Adapter-specific text remains diagnostic detail. Workflows never branch on error strings. A decisively absent or unknown Artifact result is an independent result-evidence state, not another Harness Interaction Failure and not a rewrite of Invocation Status.

## Attachment, concurrency, and reconnect

- V1 permits at most one externally claimable User Pull Preparation or one awaiting-start or active Neoflow Invocation per Attachment Identity.
- A waiting User Pull reserves the single-flight slot but is not an Invocation; atomic claim exchanges that reservation for an awaiting-start Invocation.
- A Capability may explicitly add a Workspace-owned Direct Delivery queue. Its ordered queued Handoffs are not Invocations and do not occupy the external single-flight slot; Workspace creates an awaiting-start Invocation only when it atomically claims the oldest eligible Delivery.
- An unresolved Invocation no longer occupies the single-flight slot, but new work preserves the duplicate-execution warning.
- A reconnect retains Attachment Identity only after exact session and canonical checkout revalidation.
- Reconnect may restore Availability for new work but cannot recover a prior outcome without a declared and verified replay or reconciliation capability.
- Neither Pi nor Claude provides outcome replay in v1.
- A different session or checkout always creates a new Attachment Identity.
- A live Harness Offer is exact inbound authority, not an Attachment-wide consent slot; distinct or revised occurrences remain separate, while duplicate callbacks for one occurrence are idempotent.

Every correlated Handoff, Preparation, and Invocation freezes the exact Capability Snapshot it relied on. A Manual Handoff instead freezes its explicit manual basis and any stronger Capability evidence the user deliberately declined. Adapter upgrades or later Manifest changes never rewrite history.

## No silent fallback

The Module never silently weakens route, Effect Constraint, Evidence Profile, destination, or correlation. Capability Downgrade is an explicit user decision.

Manual Handoff is not a Harness Capability and creates no Invocation. It requires a declared Manual Handoff Destination but no live Attached Harness. Exact material and the local commitment are durable before reveal; display or clipboard success proves only local presentation. Later human workflow actions may proceed, but they cannot manufacture harness evidence. Its full lifecycle is defined by [Define Manual Handoff commitment and lifecycle](../../.issues/WF-034-define-manual-handoff-lifecycle.md).

A scripted in-memory Adapter exists only as the Module’s test Adapter. It is never a production fallback when no live harness is attached.

## Pi v1 profile

| Handoff | Route | Effect Constraint | Evidence | Interruption |
| --- | --- | --- | --- | --- |
| Planning exploration | Direct | Enforced cooperative read-tool gate | Start; normal, failure, interruption settlement | Direct Request |
| Plan generation | Direct | Enforced cooperative read-tool gate | Start; normal, failure, interruption settlement; conditional exact Plan Revision under the frozen Artifact Result Contract | Direct Request |
| Feedback Batch | Direct | Enforced cooperative read-tool gate | Start; normal, failure, interruption settlement | Direct Request |
| Discussion-only Review Batch | Direct | Enforced cooperative read-tool gate | Start; normal, failure, interruption settlement | Direct Request |
| Mutation-authorizing Review Batch | Direct | Communicated only; Pi owns tools and permissions | Start; normal, failure, interruption settlement | Direct Request |
| Implementation Handoff | Direct | Communicated only; Pi owns tools and permissions | Start; normal, failure, interruption settlement | Direct Request |
| Continue Workflow | Direct | Enforced cooperative read-tool gate | Start; normal, failure, interruption settlement; no semantic-progress or Artifact-result claim | Direct Request |

The registered-tool gate is cooperative and request-scoped, not OS isolation and not protection from arbitrary trusted extensions. Pi has no Native Gate and no v1 replay or outcome recovery. A persisted assistant entry without an already-durable Neoflow result commit proves neither settlement nor a Plan Revision.

## Current reviewed Claude Code v1 profile

| Interaction | Correlated route or fallback | Effect Constraint | Evidence / limitation |
| --- | --- | --- | --- |
| Start exploration | Manual Handoff | None claimed | No correlated outbound route |
| Request Plan generation | Manual Handoff | None claimed | No correlated outbound route |
| Plan proposal | Native Gate Harness Offer | Native gate only | Exact contract-valid plan capture; explicit Workflow association materializes the Revision; decision delivery remains separate |
| Planning Feedback while Offer is live | Native Gate deny with Feedback Batch | Limited to the live gate contract | Batch, Handoff, and deny commit atomically; delivery proves no semantic response |
| Implementation while Offer is live | Native Gate allow after exact Approval and Handoff | Limited to the live gate contract | Handoff, allow, and Invocation commit atomically; delivered allow proves no start or outcome |
| Review Batch | User Pull via `/neoflow:review` | Communicated only | Correlated submit, normal `Stop`, and `StopFailure`; no Ctrl+C terminal evidence and no Review Response Artifact |
| Continue Workflow | Manual Handoff | None claimed | The Review User Pull and Native Plan gate are not generic continuation routes; no Invocation or lifecycle claim |

The Review User Pull Adapter accepts only the exact `/neoflow:review` action. Harness Interaction projects its Preparation and Invocation separately from a bounded per-Attachment observability record: no attachment is unavailable, exact current-runtime identity and contract validation is revalidated, an exact runtime/session boundary is blocked, and a durable attachment without a current-generation witness is stale. These readiness states cannot claim, end, or revive a Preparation or settle an Invocation.

Claude's optional status-line compositor may publish host-reported model and context-window facts only after exact attachment validation. The evidence is bound to the Attachment, compatibility identity, runtime generation, session, and model; model/session change, compaction, null current usage, or stale attachment makes usage unknown until a later fresh matching observation. `PreCompact`/`PostCompact` contribute only trigger and phase, never the compact summary. No tokenizer estimate, transcript reconstruction, payload adaptation, or replay follows from this advisory evidence.

Claude interruption is User Action. Foreground busy state is not authoritative. Claude provides no v1 post-allow start, terminal, replay, or outcome-recovery evidence, so an allow Invocation becomes rejected only with proof the allow was not delivered and otherwise becomes unresolved rather than active or complete.

## Safety-blocked Claude managed Direct candidate

WF-258 does not currently add a second Claude Review profile. The candidate
would have had this semantic shape if its native ingress had passed provenance:

| Interaction | Correlated route | Effect Constraint | Evidence / limitation |
| --- | --- | --- | --- |
| Review Message | Direct to one explicitly established managed background conversation | Communicated only; Claude owns tools and permissions | Requires Native Dispatch Provenance before tool authority; then Workspace FIFO/single-flight, correlated `UserPromptSubmit`, `Stop`, and `StopFailure`; start-correlation loss is unresolved; no interruption, replay, binary/file delivery, or Review Response Artifact |

A future Managed Session Setup may remain workspace-scoped launch authority, not
standing Handoff consent, only if unrelated peer traffic cannot inherit that
authority. It would bind one exact conversation and checkout, expose the native
attach action, and keep process Availability separate from setup identity.
Respawn could preserve the Attachment only when exact native evidence proves the
same session; loss could never create or adopt a replacement conversation.
Withdrawal would commit first, terminally mark untouched queued Deliveries not
dispatched, and only then stop management without deleting the conversation.

Every Message would still commit its exact route-neutral outgoing material,
Handoff, receipt, Capability Snapshot, and Direct Delivery before external
contact. The Adapter must preserve those exact outgoing bytes: model-visible
correlation prefixes or secrets are not an allowed encoding. Raw prompt text may
be compared only inside the Adapter for ambiguity-safe correlation, but
post-submit matching cannot establish Native Dispatch Provenance. If a future
route passes that prerequisite, claiming one Delivery and creating its
`awaiting-start` Invocation must commit atomically before dispatch; only
correlated terminal evidence may free the queue, and rejection or unresolved
evidence pauses rather than replays.

The conditional managed-session controller still belongs at the Harness
Interaction seam, with native process and correlation facts inside the Claude
Adapter. No production controller or Capability is currently supplied. The
current `2.1.209` User Pull Manifest remains the reviewed Claude profile.

## Module posture

The logical ownership shape is one deep Harness Interaction Module with separate Pi and Claude Adapters behind its internal seam. The Adapters share normalized semantic records and an internal Adapter Interface, not necessarily one transport. Planning, Reviewing, and cross-session continuation depend only on the central Module. Planning Origin is likewise harness-neutral: a future Adapter such as Codex may produce the associated-offer form only by satisfying the same normalized Offer and Artifact Result contracts; no Harness-specific Origin or workflow branch is added. Exact package names, process placement, and deployment topology remain implementation-planning choices; the ownership and dependency direction do not.

## Rejected designs

### Transport-shaped Interface

`sendMessage`, `cancel`, raw events, and broad mode flags are superficially small but shallow: every workflow must learn Pi/Claude transport differences, correlation rules, and failure semantics.

### Operation-specific Interface

Methods such as `startPiPlan`, `submitClaudeReview`, or one method per workflow/harness pair spread asymmetry across callers and grow for every new capability.

### Promise-to-completion Interface

A Promise that resolves when a harness turn ends cannot represent indefinitely waiting User Pull, process restart, disconnect without replay, or durable unresolved outcomes.

### One transport for every Adapter

Pi’s extension path and Claude’s hooks, skill, and Native Gate differ materially. A common semantic Adapter Interface creates leverage; forcing a common wire transport destroys it.
