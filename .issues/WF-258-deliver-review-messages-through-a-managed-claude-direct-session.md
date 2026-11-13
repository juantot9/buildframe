---
id: WF-258
title: "Deliver Review Messages through a managed Claude Direct session"
status: open
labels:
  - wayfinder:task
parent: WF-051
assignee: juanan
blocked_by: []
created: 2026-09-23
---

## Outcome

After one explicit setup from Reviewing, Neoflow launches and retains one
Claude Code background conversation for the canonical checkout. Every later
committed Review Message targets that exact conversation through a managed
**Direct** route: Workspace owns a durable FIFO delivery queue, permits only one
externally in-flight turn, and advances the queue only from correlated semantic
evidence. The user may attach to the conversation with Claude's native terminal
at any time.

The setup is workspace-scoped rather than Review-scoped. Starting another
Current Review does not create another Claude conversation. New Reviews remain
`retained`; Current Review identity, not the legacy `active` status, is the
Reviewing authority.

This is now a desired conditional outcome, not an admitted Capability. Exact
Claude Code `2.1.284` failed the Native Dispatch Provenance gate described
below, so production implementation is blocked until a supported native ingress
can distinguish each authorized Neoflow dispatch before its authority can be
exercised.

## Finding

A disposable live prototype on branch `prototype/wf258-managed-claude-direct`,
commit `eb635d5`, answered the route question on exact Claude Code `2.1.282`:

- `claude --bg` created one normal background conversation and `claude attach`
  could remain open while Neoflow delivered another turn;
- later peer messages became distinct turns in the same conversation and kept
  prior conversation context;
- `UserPromptSubmit` and `Stop`/`StopFailure` shared a `prompt_id` suitable for
  Adapter-local lifecycle correlation;
- `claude respawn` retained the session identity and conversation while
  `SessionStart` republished a fresh process-scoped inbox socket and token; and
- two back-to-back inbox writes could merge into one model turn, proving that
  Neoflow—not Claude Agent View—must own durable ordering and single-flight.

The accepted native presentation is visibly a peer message: Claude renders
“Another Claude session sent a message” plus its peer-safety notice. This is an
accepted v1 limitation, not something Neoflow should hide or relabel. Custom
Channels are not the selected fallback: they remain research preview, require a
development-channel warning, may be disabled by organization policy, and have
not been proved through the configured gateway.

The prototype is evidence only. Its scripts, model-visible correlation header,
no-tools launch, private event files, polling, and direct socket writes are not
production code and must not be promoted.

A second disposable probe on branch
`prototype/wf258-managed-direct-production-gates`, commit `ba5bb8c`, proved the
mechanical production gates on exact `2.1.284`: marker-free duplicate bytes,
normal `Write`, native attach overlap, duplicate-name refusal, exact
stop/respawn identity, and manual permission attention. It also found that
identical bodies require per-dispatch native `from` values and that peer-framed
requests use normal tools only after an initial user turn tells Claude that
later Neoflow peer messages represent individually authorized Sends.

That setup-context workaround is rejected by the adversarial primary source on
branch `prototype/wf258-managed-direct-provenance`, commit `de87ce1`. On exact
`2.1.284`, an ordinary first frame with no authentication line, a later frame
preceded by a wrong token, a correctly authenticated but Adapter-uncorrelated
spoof, and a separate real Claude session using native `SendMessage` all reached
the managed conversation, invoked `Read` and `Write`, and wrote the exact
synthetic bytes. Positive managed and attached-user controls did the same. The
socket was owner-`0600` inside an owner-`0700` directory, which excludes another
OS user but not same-user Claude peers. Native `from` prevents duplicate-body
collapse but proves no authority; Adapter-local pending data and hook
correlation arrive too late to constrain tool choice; and `UserPromptSubmit`
provides no usable source discriminator.

## Acceptance

- [ ] A reviewed Native Dispatch Provenance boundary distinguishes the exact
      authorized Neoflow dispatch from unauthenticated local frames, wrong-token
      frames, spoofed native metadata, and unrelated same-user Claude peers
      before Claude may exercise its tools. Content markers, sender labels,
      owner-only socket permissions, post-submit hook correlation, and setup
      instructions that trust all peer traffic do not satisfy this gate.

- [ ] Reviewing offers one explicit **Set up managed Claude** action that names
      the exact checkout, reviewed Claude version, native peer-message
      presentation, workspace-write posture, and text-only limitation before
      launch.
- [ ] Successful setup projects one exact managed conversation and a native
      attach command. Setup alone discloses no Review content and authorizes no
      future Message; each ordinary Send remains its own Consent Boundary.
- [ ] A committed Review Message durably records its Message, Handoff, receipt,
      frozen Capability Snapshot, and ordered Direct Delivery before any native
      effect. Later Messages may queue while one turn is active.
- [ ] Workspace dispatches queued deliveries in commit order and creates at
      most one nonterminal Invocation for the managed Attachment. A second
      native write cannot occur before the first correlated `Stop` or
      `StopFailure` commits.
- [ ] Queue state survives application, runtime, Adapter, and Claude process
      restart. A stopped worker may be respawned only as the same proved
      conversation; Neoflow never substitutes a fresh conversation or replays
      an ambiguous dispatch.
- [ ] `SessionStart`, `UserPromptSubmit`, `Stop`, `StopFailure`, and
      `SessionEnd` become only normalized Availability or Invocation evidence.
      Raw hook objects, raw hook prompt fields, `prompt_id`, socket paths,
      tokens, Agent View rows, transcripts, and credentials never cross from
      the Adapter into Workspace or the application.
- [ ] Production correlation preserves the exact outgoing Review Message bytes.
      It must use proved native metadata or an ambiguity-safe Adapter-local
      match; the prototype's model-visible `[NEOFLOW_MESSAGE ...]` prefix is
      forbidden unless the outgoing-message contract is separately reopened
      and the added disclosure is explicitly accepted.
- [ ] Explicit setup withdrawal commits before process control, prevents every
      future dispatch, and terminally marks each still-queued Delivery as not
      dispatched. It neither deletes the Claude conversation nor rewrites an
      already-started Invocation; missing terminal evidence remains unresolved.
- [ ] Current Review with `retained` status is sufficient. No new path writes or
      requires legacy Review `active`.
- [ ] The managed Direct Capability claims only correlated start, normal end,
      and failure. It claims no arbitrary foreground-session injection, native
      cancellation, replay, semantic success, binary/file delivery, or Review
      Response Artifact.
- [ ] Exact-version deterministic matrices and a human live pass cover setup,
      attach, FIFO delivery, duplicate text, active-turn queuing, process
      respawn, runtime restart, interactive overlap, withdrawal races,
      permission attention, workspace-write behavior, and gateway use before
      WF-257 admits the version.
- [ ] Focused app/Workspace/Adapter scenarios and canonical local verification
      pass on Node `26.5.1`; no GitHub Action is triggered without explicit
      funded approval.

## Conditional design (settled 2026-09-29; safety-blocked 2026-10-05)

### Safety amendment

The queue, setup lifecycle, withdrawal semantics, and Adapter seam below remain
a conditional design that may be reused only if a future reviewed Claude ingress
satisfies Native Dispatch Provenance. They are not authority to implement or
advertise the `2.1.284` inbox route.

Do not promote the setup-context workaround, depend on optional inbox
authentication, treat per-dispatch `from` as identity, add a model-visible
secret or correlation prefix, or install a tool hook that cannot preserve normal
attached-user turns. The currently reviewed Claude Review route remains User
Pull. A newer Claude version reopens this path only by exposing a real native
provenance boundary and passing this adversarial matrix; changed model behavior
alone is insufficient.

### Route and scope

Managed Claude delivery is a Direct Handoff Route, not User Pull and not a
fourth route. Neoflow initiates each exact committed Message. The destination is
only the Neoflow-launched background conversation proved by this setup; the
design makes no claim about injecting into an arbitrary user-started foreground
Claude session.

The existing `/neoflow:review` User Pull implementation and its evidence remain
valid history and may remain available until later route-selection work. WF-258
does not reinterpret a Preparation as a queue item, migrate one route's
records, or silently fall back between them.

Input is the existing exact UTF-8 Review Message material. Binary and file
attachments are out of scope. A Live Repository Reference still lets Claude
use its own workspace tools; it is not a transported attachment.

### Managed Session Setup

Harness Interaction owns one revisioned, workspace-scoped **Managed Session
Setup** with these states:

- `requested` — the setup decision committed, but no native launch attempt is
  yet authorized;
- `launching` — one controller atomically claimed the setup and may make exactly
  one native launch attempt;
- `established` — one exact Claude session/job, canonical checkout, reviewed
  host version, Adapter implementation identity, and Attachment Identity are
  bound;
- `failed` — launch failed before an exact conversation was established;
- `lost` — an established native conversation can no longer be proved; and
- `withdrawn` — the user revoked future managed delivery.

`failed`, `lost`, and `withdrawn` are terminal. Availability of an established
setup is separate: a worker may be stopped, its process endpoint may be stale,
or the runtime generation may need revalidation without changing the setup's
identity or inventing a terminal disposition.

The setup command Durable-Commits `requested` before launch. A controller must
atomically claim it as `launching` before making exactly one launch attempt. The
Claude Adapter uses the deterministic setup identity and name to reconcile an
ambiguous attempt and may continue only on exactly one matching native job.
After an attempt becomes ambiguous, zero, multiple, or identity-mismatched
candidates fail closed and never cause a guessed adoption or second launch.
`SessionStart` supplies semantic establishment evidence. The production fault
matrix must prove this recovery rule before setup is enabled.

Only non-secret native locators needed to re-find the conversation may be
retained. The inbox socket and authentication token are process-scoped Adapter
state in an owner-only location and are never Authoritative Workflow State or a
projection. Respawn must preserve both the setup and Attachment Identity; a new
session requires a new explicit setup.

Reviewing projects `Starting`, `Ready`, `Temporarily unavailable`, `Lost`, and
`Withdrawn`, the concrete Claude destination label, and the exact native attach
command when available. It also exposes **Stop managed delivery**. Native
conversation deletion is deliberately separate and out of scope: withdrawal
stops Neoflow management but preserves the conversation for inspection.

Withdrawal is one atomic semantic transition. In the same commit it closes the
setup and changes every bound `queued` Direct Delivery to
`not-dispatched / setup-withdrawn`. Only then may the Adapter best-effort stop
the worker and discard endpoint secrets. A Delivery already claimed for
external dispatch is not recalled; correlated terminal evidence may still
settle it, and lost evidence becomes unresolved. Re-establishing later creates a
new setup and Attachment and never revives old queued Deliveries.

### Durable Direct Delivery queue

A Review Message commitment creates a revisioned **Direct Delivery** separate
from an Invocation. Its states are:

- `queued` — exact Handoff authority exists, but no native turn is claimed;
- `dispatched` — Workspace atomically linked one new Invocation before issuing
  the semantic dispatch directive; and
- `not-dispatched` — setup withdrawal or proven destination loss ended the
  queued authority before an Invocation existed.

The queue has an explicit bounded sequence assigned by Authoritative Workflow
State; timestamps and Adapter arrival order never order it. A queued Delivery
is not Harness activity, does not start a no-start window, and does not count as
an active Invocation. It remains bound to its original Message, Handoff,
receipt, Attachment, and Capability Snapshot and can never migrate to another
conversation.

A Workspace-owned dispatch pump may claim only the oldest queued Delivery when
all of these are true: its setup and exact Adapter are revalidated, no
`awaiting-start` or `active` Invocation exists on the Attachment, and no earlier
unresolved or rejected delivery requires a user decision. The claim and new
`awaiting-start` Invocation commit atomically before the directive leaves. A
runtime restart may claim an untouched `queued` Delivery; it must never replay a
`dispatched` Delivery.

Correlated `Stop` or `StopFailure` releases the single-flight slot and may
advance the next queued Delivery. A proven pre-start rejection and any
unresolved outcome pause the queue rather than skipping the missing context;
retrying, skipping, or accepting overlap is a later explicit decision, never an
automatic replay. The Adapter independently refuses a concurrent directive as
defense in depth, but it does not own queue truth.

This queue exception is Capability-specific. Existing Pi Direct behavior is not
silently changed by WF-258 merely to reuse its types.

### Capability and evidence

Do not force managed Claude into Pi's current Direct contract. Add a closed
managed-Direct Review Capability profile within the `route: 'direct'` union. It
truthfully declares:

- Workspace-owned FIFO/single-flight delivery;
- workspace-write authority communicated over the tools and permission policy
  of the managed Claude session, never an OS sandbox;
- correlated `UserPromptSubmit` start and correlated `Stop`/`StopFailure`
  terminal evidence;
- a bounded dispatch-to-start observation window whose loss is `unresolved`,
  not rejection;
- interruption and replay unavailable; and
- no Artifact Result Contract.

A socket connection failure before any frame can leave the Adapter may prove
`not-dispatched`. Once frame acceptance is ambiguous or successful, absence of
a matching start hook cannot prove rejection. Agent View's `working`/`idle`
fields are observability only and cannot start, settle, or free the queue.

The production Adapter keeps the active directive's exact bytes and native
correlation data in memory, maps the accepted `UserPromptSubmit` to its
Invocation, and thereafter maps only the shared `prompt_id` to terminal
semantic evidence. Unrelated or ambiguous prompts are never guessed into the
Invocation. An attached user's own turn must block native dispatch until its
terminal hook; a race or unproved overlap loses correlation conservatively.

Assistant text, including `last_assistant_message`, is discarded. The
prototype inspected it only to prove context continuity; WF-258 does not use it
to create a Review Response or infer that Claude understood or applied a
Message.

### Production module seam

```text
Reviewing
   │ Workspace.execute / Workspace.read only
   ▼
Harness Interaction Module
   ├─ Managed Session Setup owner
   ├─ Direct Delivery queue + single-flight owner
   └─ Invocation/evidence owner
          │ semantic control directives, dispatch directives, and evidence
          ▼
Claude Managed Adapter
   ├─ exact-version CLI launch / agents / stop / respawn
   ├─ private settings and endpoint registration
   ├─ inbox frame encoding
   └─ hook sanitization and prompt correlation
          ▼
Neoflow-managed Claude background conversation
   └─ user may run the projected native attach command
```

The runtime composition root supplies a Claude managed-session controller to
Harness Interaction; Reviewing never imports or calls it. The controller owns
native process lifecycle and, once established, satisfies the existing internal
reviewed Adapter role for Direct directives and normalized evidence. The
Workspace-facing control Interface contains only setup identity, checkout,
reviewed compatibility, lifecycle disposition, and semantic refusals. It never
contains a CLI argument bag, hook JSON, socket path, token, `prompt_id`, Agent
View row, or raw status.

The Module remains deep: tests drive setup, queue, withdrawal, and evidence
through the same Workspace `execute`/`read` Interface as the application. A
scripted controller and Adapter replace the native implementation in those
tests. Native fixtures and exact-version live probes stay in
`packages/claude-adapter`; the throwaway prototype is not imported, copied, or
made a package dependency.

### Current Review and presentation

The route consumes the existing one-message Reviewing contract. Inspection and
commitment require the exact `currentReviewIdentity` and its retained basis;
they do not inspect or mutate legacy `active`. The old WF-258 activation problem
therefore disappears rather than being patched.

Ordinary Enter remains Send: it performs exact target revalidation and any
existing composed commitment gate, then records the Message and queues its
Delivery. While another managed turn is active, the Message card says
`Queued` rather than refusing the commitment. Lifecycle presentation remains
truthful: `Queued`, `Waiting to start`, `Active`, `Ended`, `Failed`,
`Not dispatched`, or `Outcome unknown`. None is called applied or complete.

The setup disclosure and destination detail preserve the accepted native UX
limitation verbatim enough for recognition: incoming turns appear as another
Claude session's message and carry Claude's peer-safety notice.

### Version and proof gate

The prototypes are exact-version evidence for `2.1.282` and `2.1.284`, not a
reviewed production policy update. The first proved route mechanics; the second
proved both the normal-tool mechanics and the failed provenance boundary.
Production remains pinned to Claude Code `2.1.209`, and its reviewed User Pull
profile is unchanged.

WF-257 must now treat Native Dispatch Provenance as a prerequisite rather than
merely adding setup/queue matrices to a newer-version review. Only a candidate
with a supported provenance boundary proceeds to deterministic setup, queue,
correlation, withdrawal, permission, attach, respawn, gateway, and human live
passes. A version whose model happens to refuse the synthetic adversary without
a native guarantee does not pass.

Any later live pass must use normal reviewed tools and permission behavior.
Production must not inherit `--tools ''`, `dontAsk`, permission bypass, or a
setup instruction that turns indistinguishable peer traffic into user
instructions. Permission prompts remain Claude-owned and may require the user
to attach; Neoflow neither answers them nor treats them as Invocation outcome.
Custom-gateway compatibility is tested without recording its URL, tokens, or
credentials.

## Native Mod follow-up (2026-10-06)

The user instead requires Pi-like explicit attachment to an existing interactive
conversation, with persistent connection and ordinary native turns from Neoflow
Send. [WF-259](./WF-259-prove-claude-direct-attachment-through-a-native-mod.md)
now investigates Anthropic's documented session-local Mod ingress. Its exact
`2.1.291` offline native-contract probe passes 15 checks, but live framing,
runtime authorization, provenance, and correlation remain unproved.

This is a separate explicit-attachment candidate, not successful recovery of
this managed-background/private-inbox route. The WF-258 safety amendment,
reviewed `2.1.209` User Pull profile, and conditional queue constraints remain
unchanged. Do not promote this issue's scripts or setup trust workaround.

## Constraints

- No push, GitHub Action, or funded external operation without explicit owner
  approval.
- No arbitrary foreground-session injection claim and no silent fallback to
  User Pull, Channels, Manual Handoff, or a new conversation.
- No direct authoritative-state writes; application and controller behavior is
  driven through Workspace semantic Interfaces.
- No raw hook/status payloads, raw hook prompt fields, endpoint secrets,
  transcripts, or credentials in the application or Authoritative Workflow
  State.
- No binary/file attachment, assistant-text capture, remote permission answer,
  cancellation, replay, semantic-success, or Agent View busy-state claim.
- Only exact probed Claude versions may enter the reviewed compatibility policy.
