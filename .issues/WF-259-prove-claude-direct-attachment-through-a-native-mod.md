---
id: WF-259
title: "Prove Claude Direct attachment through a native Mod"
status: closed
labels:
  - wayfinder:research
parent: WF-051
assignee: juanan
blocked_by: []
created: 2026-10-06
assets:
  - "prototype/wf259-claude-native-mod-contracts at 4ba70b3"
  - "prototype/wf259-claude-native-mod-live initial evidence at ac3c363"
  - "prototype/wf259-claude-native-mod-live foreground/native origins at 773dabd"
  - "prototype/wf259-direct-attachment-state offline authority/custody at 36d35c6"
  - "prototype/wf259-native-correlation-contract zero-model native joins at 2ebd63d"
  - "https://github.com/anthropics/claude-code/issues/101742 — native submit receipt/turn association"
  - "prototype/wf259-trusted-pairing offline root/control custody at f75106c"
  - "prototype/wf259-runtime-owner-enrollment actual owning-startup/control slice at 408360a"
  - "prototype/wf259-owned-workspace-channel authenticated UI command/commit slice at 2c67276"
  - "prototype/wf259-post-commit-authentication exact frozen DTO at actual callback at 2a432d9"
  - "prototype/wf259-message-pre-native-refusal durable local rejection/no replay at 205b8c6"
  - "prototype/wf259-committed-message-occurrence actual atomic receipt binding at 4c01d63"
  - "docs/research/claude-native-mod-bootstrap-contract-wf259.md — protected enrollment review/upstream question"
  - "https://github.com/anthropics/claude-code/issues/102463 — protected Mod bootstrap/fact/UI contract"
  - "prototype/wf259-plannotator-session-controller lifecycle scaffold/source counterexamples at b9870b4"
  - "docs/research/claude-native-mod-controller-lifecycle-wf259.md — nonblocking lifecycle/fault captures at 820c4a8"
  - "prototype/wf259-controller-startup-confirmation diagnostic acknowledgment/scope recheck at 7a450ed"
  - "docs/research/claude-native-mod-assumptions-review-wf259.md — trusted-installed-code option vs independent turn custody"
  - "prototype/wf259-control-pairing-integration at 6a16bd8 — Mod-shaped control + actual owned writer, no native execution"
  - "prototype/wf259-native-control-ui at 448d0ed — readable operator trial + guarded one-shot launcher; native NOT RUN"
  - "prototype/wf259-installed-306-contract-review at b222f1c — actual CLI validation/offline hook exposes unsupported crypto key owner"
---

## Question

Can a native Claude Code Mod provide the user's Pi-like interaction contract:
explicitly attach one existing interactive conversation to Neoflow, keep it
attached while both run, and make each Neoflow Send a normal turn in that exact
conversation with exact Review Message bytes and normal Claude permissions?

This is **explicit Direct attachment**, not a Neoflow-launched Managed Session
Setup, another background conversation, a User Pull action per Message, terminal
paste automation, or the private peer inbox rejected by WF-258.

## Resolution — investigation scope settled 2026-10-06

The user confirmed the persistent Pi-like interaction and directed pursuit of
the native Mod after inspection of Plannotator. Investigate this native ingress
first, without admitting a production Capability or widening the version policy.
The current reviewed Claude route remains `2.1.209` User Pull.

The independent primary source is Anthropic's documented Mods Interface:
`$.prompt.submit` for a session-local turn; engine-set plugin/user/peer origin;
`session.receive` consumption before context; `prompt.submit` refusal before a
turn; and native turn lifecycle. Plannotator's newer Mod uses the same submission
method in the open interactive conversation. See
[research](../docs/research/claude-native-mod-direct-wf259.md) and the earlier
[Plannotator investigation](../docs/research/plannotator-tui-claude-delivery.md).

### Conditional ownership shape

```text
Reviewing → Workspace / Harness Interaction
                          ↕ semantic directives and normalized evidence
                  Claude Adapter runtime client
                          ↕ Adapter-private native bridge
              Neoflow Mod in the explicitly attached Claude session
                          ↓ $.prompt.submit
                   that same native conversation
```

- One explicit harness action establishes the exact session/checkout Attachment,
  like Pi's attachment command. Installing the Mod alone establishes neither an
  Attachment nor standing Message consent. No automatic discovery/adoption.
- Harness Interaction remains the semantic owner. Reviewing never calls a Mod,
  hook, socket, helper process, or native CLI directly.
- The Mod owns native session identity, source discrimination, and native
  submission. A bounded Adapter-private helper may supply Node/IPC that the
  module cannot perform directly; it must neither become a second runtime host
  nor accept arbitrary caller-supplied prompt bodies for publication.
- Each Send Durable-Commits the existing exact Message, Handoff, receipt, frozen
  Capability, and Invocation authority before dispatch. Only that exact
  authorization can reach the native submission call.
- Reconnection restores availability only after exact session and canonical
  checkout revalidation. Session change, `/clear`, checkout change, Mod unload,
  unsupported version, policy refusal, or identity loss must not silently
  substitute a destination. Missing outcome evidence never causes replay.
- Begin with Pi-like single-flight behavior. The native API's wait-until-idle
  behavior is not authority to implement an application-owned delivery queue or
  reuse WF-258's conditional queue unnoticed.
- Normal native user turns and normal Claude tools/permission prompts remain
  Claude-owned. No permission bypass, tool approval, transcript read, assistant
  capture, cancellation, or semantic-success claim is added.

These are proof/design constraints, not authorization to transplant the
throwaway module. Its deliberately broad filter is not production behavior.

### Native provenance gate

Prove all of the following before production design/code:

1. Neoflow receives directives only from the exact reviewed runtime Attachment
   and only for already-committed authority. The native plugin stamp does not
   authenticate arbitrary traffic outside the Mod. Owner-only files/sockets,
   sender labels, and optional shared tokens are insufficient by themselves.
2. Native peer/unclassified/local/spoofed traffic cannot enter context or inherit
   a Neoflow Handoff's authority. Check the pre-context native event, not a
   post-submit digest or a model refusal.
3. Ordinary attached-user input continues to use normal tools, including input
   with bytes identical to a Review Message. Other native origins and installed
   Mods need an explicit reviewed policy; never install the probe's blanket
   filter as an undisclosed change to normal conversation behavior.
4. Error/timeout handlers for every provenance gate fail closed. Native hooks
   without `.catch` are skipped on failure; policy and unloaded-Mod cases are
   unavailable. Review behavior when other Mods rewrite/drop prompts or execute
   earlier in the chain.

### Exact bytes and lifecycle gate

- Evaluate exact-build `submit({ text, asUser: true })`: body bytes must remain
  the exact outgoing Review Message with no native plugin sentence, added
  heading, prefix, marker, secret, file substitution, trimming, or Unicode/newline
  normalization. Preserve provenance in native metadata, not in model text.
- Record build-generated declarations before interpreting newer API options.
  Public GitHub types lag the observed `2.1.291` `asUser` metadata.
- Prove two identical bodies are distinct turns. Establish an exact per-dispatch
  native start/terminal correlation chain through a source discriminator and
  native turn identity, not text equality alone. Identical user/peer bodies and
  interleaved user turns must not be guessed into an Invocation.
- A successful native submit is not terminal evidence. Correlated native end
  reports only end/failure; interruption/cancellation remain unclaimed here.
  Lost or ambiguous evidence becomes unresolved, never rejection or replay.
- Dispatch outside blocking handlers: `$.prompt.submit` from `command.run` is
  rejected by the native engine because it would wait on that hook's turn.

## Evidence — offline, 2026-10-06

Primary source branch `prototype/wf259-claude-native-mod-contracts`, commit
`4ba70b3`, at `/private/tmp/neoflow-wf259-claude-native-mod-contracts`:

- Exact installed native Claude Code `2.1.291`; canonical Node `26.5.1`.
  The operator's CLI had auto-updated since the WF-258 handoff. This is a
  research candidate, not reviewed-version admission.
- Strict native plugin validation passes and lists `.catch` handlers for both
  ingress gates.
- **15 offline engine-harness checks pass**: source filtering before core;
  native user controls; exact duplicate synthetic inputs; actual module calls
  stamped with native plugin identity; another module's forged identity refused,
  including `asUser`; and the presentation metadata diagnostic.
- The exact build carries `asUser: true` inside engine-stamped plugin-origin
  metadata, not in the submitted text. Live model framing remains unproved.
- The test kit stubs core, model, network, store, and tool operations. Supplied
  peer-origin fixtures do not prove authentic local-frame classification. No
  tool ran, no transcript was accessed, and no live/funded model turn occurred.

Run from that worktree with a frozen exact CLI executable and canonical Node:

```sh
NEOFLOW_PROBE_CLAUDE=/path/to/claude-2.1.291 \
  sh packages/claude-adapter/prototypes/wf259-native-mod-contracts/run
```

## Approved live partial proof — 2026-10-06 / 2026-10-07

The owner authorized at most 8 short synthetic turns via the configured gateway.
**6 used**, all synthetic sessions stopped; no existing conversation adopted,
transcript/assistant capture, terminal input injection, or permission bypass.

Live primary source `prototype/wf259-claude-native-mod-live`, **`ac3c363`**:

- Exact native `2.1.291` declares `asUser?: true`, preserving stamped plugin
  provenance while removing the native plugin frame. Two identical 75-byte
  fixtures retain spaces/CRLF/Unicode at native model-bound `turn.start`, produce
  distinct native turn IDs, and terminate with matching IDs. Default presentation
  expands to 275 bytes, so plain `{ text }` is unsuitable for exact Message bytes.
- Corrected Read-then-Write controls pass with ordinary `acceptEdits`, exact
  fixture bytes, no denies/errors/staging, and no other tracked checkout changes.
  Original Write-only fixture was invalid for an existing file; exact builtin
  tool metadata requires Read first. The first observer also used the wrong
  nested path field; neither its error cause nor wrong-target behavior is claimed.
- Real native `SendMessage` was **not executed**: its freshly launched sender's
  actual engine was `2.1.292` despite invocation through the 291 executable. The
  startup guard refused it before tools. Generated types confirm 292.
- Zero-model identity-only follow-up with scoped `DISABLE_AUTOUPDATER=1` and a
  private frozen-executable PATH symlink still starts native 292, then refuses it.
  CLI `--version` alone and those launch controls do not prove worker pinning.

The owning [research](../docs/research/claude-native-mod-direct-wf259.md) names
run directories, generated-type hash/contracts, corrected controls, and limits.
These are newly created background fixtures (`isInteractive: true`), not a
proved foreground user Attachment. Native model-bound bytes are observed; a raw
model/network transcript is neither captured nor claimed. Correlation remains
single-flight in isolated fixtures, not a general native dispatch join.

**Stop on missing exact native identity.** Resolve worker pinning using supported
controls or a human-operated exact foreground build without funding more calls.
Do not widen to 292 or retry functional sends under an unreviewed native engine.
The runtime ingress, authentic adversarial origins, foreground user/permission
attention, reconnect/interleaving, and policy-failure matrix remain open. Confirm
any subsequent live scope/budget explicitly; do not silently reset the prior cap.

## Foreground/native-origin follow-up — 2026-10-07

The owner directed continuation within the two remaining turns. **8 of 8 approved
model turns now used**; all owned synthetic sessions/processes cleaned up.
Follow-up primary source: `prototype/wf259-claude-native-mod-live`, **`773dabd`**.

- Zero-model fresh foreground execution keeps native291, exact session/checkout,
  and the same exact-build declarations. Its owned PTY is never written to;
  rendering is discarded, not inspected/captured. No terminal-delivery mechanism,
  existing-session adoption, permission bypass, or version substitution exists.
- One new positive normal Read/Write turn, then real public native `SendMessage`
  from a separate native291 foreground session. Recipient receives **peer** and
  consumes before core/context. No additional recipient turn/tool or fixture
  mutation; sender uses no model. Zero-model follow-up confirms the expected
  synthetic body is contained in the received input, which has extra native text.
  Body containment is a diagnostic only, never an authority predicate.
- Final turn: native CLI startup user input uses the exact75-byte fixture from
  earlier Mod tests, is stamped **composer**, retains bytes through prompt/native
  start, and has a matching end. No native Mod submission is used for this control.
  It is not a human keyboard or existing-user Attachment test.

The proof-rig foreground build and one real peer pre-context gate pass. `--bg`
worker pinning remains unresolved; do not transplant the launcher into production.
Runtime ingress authorization, actual existing-session attachment, all remaining
local/spoofed/error/policy cases, general native correlation/interleaving/recovery,
and interactive permission attention remain open. Settle those interfaces before
production; any further funded proof requires new explicit owner approval.

## Offline authorization/custody design — 2026-10-07

The owner approved design/offline work after the live8-turn budget was exhausted.
[Design findings](../docs/research/claude-native-mod-attachment-design-wf259.md)
and source `prototype/wf259-direct-attachment-state`, **`36d35c6`**, capture an
interactive Node26.5.1 model with19 scripted scenario snapshots (not a test suite).
No CLI/model/network/runtime/workflow store or additional funding was used.

- Candidate private runtime publisher is reached only through the existing
  post-commit `ReviewedHarnessConnection.perform` seam. It resolves committed
  authority itself, never signs externally supplied bodies or durability flags.
- Actual Ed25519 verification in the fixture rejects modified exact bytes and
  foreign keys; private committed-ID lookup refuses uncommitted authority.
  One-use grants bind exact destination, frozen snapshot, Invocation, native
  session/epoch/version, runtime/channel occurrence, and bytes. No signature,
  token, heading, file fallback or marker enters the model body.
- Real trust bootstrap, helper lease/role attestation, reciprocal evidence
  authentication, full DTO checks and durable acknowledgments remain **open**.
  Constructor-pinned keys/in-memory ledgers are fixture assumptions, not a
  production proof. Private socket/UID/role checks alone are insufficient.
- Generated291 submit results lack a new native turn ID; native start lacks a
  submitted occurrence/source; generic trace/classic prompt_id fields have no
  documented exact join. This is an unproved contract, **not a demonstrated
  engine race or impossibility proof**. Investigate a native handle/returned ID
  or reviewed causal/ordering guarantee; do not adopt matching text/timing.
- The default observed291 model refuses before publication (count0). A plainly
  labeled **HYPOTHETICAL-native-join** mode exercises separate duplicate custody,
  normal-user separation, single-flight, failure/abort, unresolved disconnect,
  fenced reconnect, no replay/substitution, and ignored late old events. It does
  not pretend that extra field/option exists in Claude.

```sh
# Offline only; default observed291 profile explicitly unavailable.
sh /private/tmp/neoflow-wf259-direct-attachment-state/packages/claude-adapter/prototypes/wf259-direct-attachment-state/run
# Scripted walkthrough instead of interactive terminal:
# append --demo
```

**Next gate:** establish a supported native occurrence-to-turn contract and
settle explicit trusted pairing/root/evidence custody. The proposed signature
shape is conditional, not a settled production Resolution. Do not implement the
real publisher/Mod transport or seek more funded functional delivery runs until
those prerequisites have a reviewed plausible design. Existing persistent human
Attachment and the remaining actual adversarial/permission/recovery matrix still
need separately approved end-to-end proof.

## Native zero-model correlation diagnostic — 2026-10-13

Owner-approved exact291 diagnostic captured on
`prototype/wf259-native-correlation-contract`, **`2ebd63d`**.
[Findings and upstream question](../docs/research/claude-native-mod-correlation-wf259.md)
replace the abstract counterexample with bounded actual native observations.

- Isolated A:1 call returned with1 later native start/end. During an active
  initial composer turn, A:2+B:1 calls all returned but only1 later start/end
  was observed; separate **single-flight-per-producer A:1+B:1** control likewise
  returned twice with1 later start/end. Observe55 seconds, no inferred model
  consumption/coalescing guarantee, replay, or permanent-loss claim.
- Classic prompt IDs never equal native turn IDs in these samples. Starts report
  caller engine, not producer; API results expose no checked join ID. Source
  labels are missing/unrecognized in the classic recorder. Per-event traces
  do not supply a cross-event handle; overlapping windows are not custody.
- Six native steps across3 fresh synthetic conversations were answered with
  fixed stub text/stop chunks, **0 actual model calls,0 requests to the local
  rejecting gateway,0 tools**. External outbound IP traffic was sandboxed.
  Actual291/session/root/interactive/base guards and the original declaration
  hash pass. All owned PTY/process wrappers stopped; no PTY writes/output reads.
- This is not physical keyboard input, authenticated production ingress,
  configured real-gateway/model framing, tools/permissions, or recovery proof.
  It does not rule out every other supported native ordering Interface.

**Next:** ask Anthropic for a supported exact submission-to-turn contract or a
native receipt/handle with explicit queued/batched/running/new-turn disposition
(and clarify new-turn-only guarantees if the product contract requires them).
After owner approval, the sanitized contract question was posted as
[anthropics/claude-code#101742](https://github.com/anthropics/claude-code/issues/101742),
**open, awaiting an authoritative answer**. Related delivery-ID/priority/idle-hang
requests did not supply the contract. No private logs/paths/credentials/branches
were uploaded, no push/workflow dispatch, and no new native/model call. Do not
build/admit the bridge based on timing/body/classic-ID guesses; real pairing/
evidence authenticity remain independent gates.
No additional funded budget, production code or Capability/version admission.

## Trusted-pairing candidate — 2026-10-13

Owner-approved offline authentication work captured on
`prototype/wf259-trusted-pairing`, **`f75106c`**.
[Pairing findings](../docs/research/claude-native-mod-trusted-pairing-wf259.md)
specify an initial genuine dual-UI comparison ceremony, private-memory owner
keys, whole-transcript scope binding, and mutual fresh encrypted control channels.
No root is fetched/pinned as authoritative from the socket being authenticated.

- 46 asserted offline scenarios passed, plus a real two-Node-child custody proof:
  keys created inside separate owned processes, private parent control IPC versus
  untrusted wire entry, no key files, remote approval/root substitution/copied
  labels/reflection/tampering/replay/identity loss refused. All owned workers stop.
- Only control ping/pong is admitted. **Message/evidence publication is hard
  disabled**, no Workflow consent or Semantic Attachment/Capability follows.
  No native/model/network/store calls,0 native publications; all40 pre-existing
  Workspace modifications are hash-verified unchanged. No production/push change.
- Concrete existing-code gap: `lifecycle.ts` has private startup IPC but closes it;
  existing discovery can return without owner enrollment. Genuine UI→runtime root
  custody/control must come from an authenticated owned startup/enrollment path,
  not a role/code-hash label or a public confirmation RPC. An existing runtime
  without such an owning path is pairing unavailable, never a new parallel host.
- Real UI authenticity, native composer/fact acquisition, helper/Mod lease,
  launcher enrollment, authoritative post-commit signer and durable evidence are
  still unproved. The custom crypto codec is a fixture, not audited production
  transport; independent receipt/turn correlation remains blocked on#101742.

**Next bounded work:** review the existing-owner enrollment policy and initial
 two-surface UX, then integrate authenticated launcher/runtime owner-root and
 narrowly scoped UI control enrollment on the prototype branch. Publication stays
 disabled. Actual operator/native proof needs separate approval; funded budget
 remains exhausted. Native helper/root loss requires fresh pairing, not label-
 based recovery or workflow replay.

## Actual owning-startup/control integration — 2026-10-13

Owner approved the next integration. Source **`408360a`** on
`prototype/wf259-runtime-owner-enrollment` modifies actual Local Runtime lifecycle
ONLY on that throwaway branch. [Findings](../docs/research/claude-native-mod-trusted-pairing-wf259.md#actual-owning-startup-integration--2026-10-13).

- Opt-in launcher enrollment derives the runtime root from the captured private
  owning child IPC, scoped to real writer/Workspace/checkout/Git/runtime generation
  and code witness. UI/root keys remain per-owner private memory. Retained closed
  metadata control admits only mutually authenticated bounded single-flight probes.
- Existing owners (even different code builds or after UI-control loss) remain
  enrollment unavailable: no public role/execute enrollment, fetched-root pin,
  legacy `retire` instruction, replacement, parallel host or Workflow replay.
  Control close leaves the independent Workspace and other clients usable.
- **16 real-startup scenarios pass**, including forged UI key, signed replay,
  public-socket copied labels, invalid owned-ready signature, budget, loss and
  fresh roots. **34 existing regressions pass**. Three owned Node writers exit
  naturally; only disposable scratch Git/XDG state was used and removed. No
  Workflow operation or real store, native/model/external network/publication call.
  All40 pre-existing Workspace changes hash-identical; main production untouched.
- **Owner control is authenticated; the ordinary Workspace socket is NOT.**
  Generation equality does not prove socket custody. Genuine UI/native facts,
  helper lease, UI→committed authority/post-commit producer, durable evidence and
  independent native receipt/turn correlation remain open. No grant/confirm/sign/
  publish operation, consent, Semantic Attachment or Direct admission follows.

**Next:** review real UI and retained-owner enrollment/custody policy, then obtain
separate genuine UI/native-helper proof scope with publication still disabled.
No funded turns are authorized; upstream#101742 remains an independent gate.

## Owned UI→Workspace command custody — 2026-10-13

Owner approved continued work. **`2c67276`** on
`prototype/wf259-owned-workspace-channel` extends the real owning-startup seam:
actual UI Workspace calls now use the private owning IPC, with key/scope/lease/
direction/sequence-bound bytes checked before semantic handling. Existing client/
server/Workspace command and commit handlers are reused, no widened semantic
Interface, shared context bag, new executor or arbitrary sign endpoint.
[Findings](../docs/research/claude-native-mod-trusted-pairing-wf259.md#owned-uiworkspace-channel-follow-up--2026-10-13).

- Candidate-only public endpoint is compatibility/identity metadata, not mutation,
  private views, subscription, Adapter/evidence admission or code-label retirement.
  Default legacy/main behavior unchanged; actual CLI/editor/retention policy open.
  Copied roles or even valid private packets on the public socket cannot commit.
- **17 scenarios pass**, seven actual owned Node writers, two synthetic durable
  Review-start commits, all children stopped/scratch removed. Replay, reflection,
  valid-next-sequence tampering, foreign enrollment and signed sequence gaps fence
  the private session. No fallback, auto-reconnect, reorder queue or replay.
- Lost authenticated response keeps UI unresolved even when the command committed.
  Fixture-only execution/state facts establish a single durable commit, not a
  successful UI/native receipt or semantic success. Control loss revokes the UI
  session, preserving the independent owner/other metadata clients.
- Prior16 enrollment scenarios plus34 existing regressions pass; builds/checks
  pass. All40 unrelated Workspace edits hash-identical.0 native/model/publication/
  external-network calls; no real checkout/store, push or policy/admission change.

**Next bounded slice:** bind/authenticate exact already-durable frozen directives
at the owned `RemoteReviewedHarnessAdapter.#perform` callback, without generic
signing or Workflow-store reconstruction; publication disabled. Genuine UI/native
helper proof and independent#101742 turn custody remain separately gated. Funded
budget exhausted; no supported Claude Direct admission follows from this slice.

## Exact owned post-commit DTO authentication — 2026-10-13

Approved source **`2a432d9`**, `prototype/wf259-post-commit-authentication`,
adds a branch-only assembly-private authenticator inside the existing
`RemoteReviewedHarnessAdapter.#perform` callback reached after actual durable
Message commit. A plainly synthetic offline fixture, never Claude/Pi Direct,
signs the whole frozen normalized DTO plus owning scope/fresh occurrence using
the private root pinned from owned IPC. No generic signing endpoint, State/store
reconstruction, model-visible markers, native publisher or semantic widening.
[Findings](../docs/research/claude-native-mod-trusted-pairing-wf259.md#exact-post-commit-dto-authentication--2026-10-13).

- **11 actual-node scenarios pass**, one real synthetic Message/Handoff/receipt/
  frozen Capability/Invocation; exact BOM/CRLF/Unicode/emoji bytes cross-checked.
  Inspection, untrusted/public/generic sign calls, invalid/stale commands and
  durable command-result reuse never issue/reissue. Wrong root and five frozen
  DTO/scope/occurrence mutations fail verification. Bounded one-use tombstones.
- **60 existing regressions pass**, including transaction failure/post-commit
  crash/no replay, plus prior17 channel and16 enrollment cases. Owned child and
  scratch cleaned; all40 Workspace edits hash-identical.0 native/model/publication/
  external-network calls; main production/policy/version untouched, no push.
- **Not a full production grant:** Message/receipt IDs exist in the commit result
  but are absent from the normalized Directive. No invented fields or store query
  substitutes for a reviewed authoritative private post-commit occurrence seam.
- **No fake settlement:** existing Message handling does not consume the local
  `proven-not-dispatched` observation (unlike older Review dispatch). Message stays
  awaiting-start/unresolved; next Send is blocked by `active-invocation-exists`.
  Core observation-consumption needs review; no native evidence is fabricated.

**Next bounded review:** committed-occurrence/receipt binding and Message local
pre-native-refusal consumption, then receiver/helper/evidence custody. Physical
UI/native helper proof and#101742 correlation remain independently gated. Budget
still exhausted; no Claude Direct admission or native publication.

## Message pre-native refusal candidate — 2026-10-13

**`205b8c6`**, `prototype/wf259-message-pre-native-refusal`, resolves the
observation-consumption gap on the prototype only. Existing post-commit local
refusal→normalized rejection now covers both Direct Message and older Review
dispatch, excluding interruption. No new Interface/executor/public signing/profile
or main implementation change. [Findings](../docs/research/claude-native-mod-trusted-pairing-wf259.md#message-pre-native-refusal-consumption--2026-10-13).

- **14 actual owned-runtime snapshots:** two explicitly committed Messages with
  identical exact bytes have distinct receipts/Invocations/signature occurrences;
  durable local refusal has no native start/Response. Fresh owner restart retains
  rejections, changes root/generation, no callbacks/reissuance on command recall.
- **13 private assembly controls:** supported reasons reject; missing/invalid/
  accepted/thrown facts or rejection-write failure stay awaiting-start, no evidence.
  Message-write failure creates no durable effect/signature. Synthetic start is
  not overwritten by rejection; interrupt no-dispatch never means cancellation.
  Each single writer restarts without replay. Not actual native evidence.
- **60 regressions**, prior17 channel/16 enrollment cases pass; builds/whitespace
  pass; all40 main Workspace edits byte-identical. All writers/scratch cleaned;
  zero native/model/publication/network calls. No production/version/policy change.

Message commitment and rejection evidence are distinct commits. Accepted command
result is commitment acknowledgment, NOT native receipt/success. Lost evidence
commit must not be retried or assumed applied. Old blocked-Message walkthrough is
superseded, not reported as an unchanged regression.

**Remaining next slice:** private authoritative Message/receipt committed-occurrence
binding (still absent from normalized DTO), without caller context/store reconstruction.
Native/helper/receiver/evidence and upstream#101742 gates remain; budget exhausted.

## Actual owned committed occurrence/receipt — 2026-10-13

**`4c01d63`**, `prototype/wf259-committed-message-occurrence`, closes the
runtime-side receipt-binding gap on the prototype. [Findings](../docs/research/claude-native-mod-trusted-pairing-wf259.md#owned-committed-message-occurrence--2026-10-13).

Workspace Interface and `perform(committedDirective)`/normalized DTO unchanged.
Private owning host factory enrolls a per-Adapter one-use occurrence reader:
only exact current live Directive object during callback, no caller IDs/JSON,
generic signer, public role/RPC, context bag or Workflow-store reconstruction.
Only NEW exact atomic commit return offers actual committed result + exact LOCAL
receipt write payload. Full consent/Message/receipt/Handoff/Capability/Invocation/
material/acknowledgment facts are signed with owning root/scope/fresh occurrence.
Consumed before signer/transport, expires before evidence writes. Object identity
establishes local callback custody, not native submit→turn custody.

- **16 actual owning Node snapshots**,3 writers/3 synthetic durable Messages;
  exact bytes, distinct identical-Send receipts/Invocations,10 signature tamper
  cases, no recall/restart reissuance. Actual lost UI response can coexist with
  durable occurrence/signature/rejection; no retry or native/UI receipt claim.
- **25 private owner controls:** real local receipt/result WRITE BYTES match;
  copies/foreign/refused/replaced/expired/second claims fail; wrong receipt/Message/
  State/consent has no signature. Lost commit return/crash/corrupted return can
  leave durable Message with zero callback; never reconstruct. Existing refusal/
  uncertain evidence/active ordering/interruption/no replay semantics preserved.
- **60 regressions +17 channel/16 enrollment cases** pass. Build/whitespace pass;
  all40 main Workspace edits unchanged; all writers/scratch cleaned;0 native/
  model/publication/network calls, no production/profile/version/policy admission.

**Next review:** this candidate private host Interface and diagnostic codec under
genuine assembly/UI/OS custody; separately authenticate native-helper roots/facts/
leases and receiver/durable evidence/restart. Native#101742 join independently
blocked, not re-polled here; budget8/8 exhausted. No Direct/version admission.

## Review/upstream checkpoint — 2026-10-14

`4c01d63` safely captures the owning runtime slice, not genuine UI/native/helper
or engine-turn authority. Factory enrollment depends on known owning assembly/
OS/private key custody; never expose it through roles/public RPC. Object-keyed
callback and signed historical artifact do not establish native receipt/current
lease or durable receiver acknowledgment/restart.

Anonymous read-only [#101742](https://github.com/anthropics/claude-code/issues/101742)
check **2026-10-14T09:10:28Z**: OPEN,0 comments, updatedAt unchanged at
2026-10-13T10:46:27Z. No upstream answer there; not evidence of universal absence
or version admission. Two public HTTP reads, no native/model/credential access,
post/workflow or budget change. [Review](../docs/research/claude-native-mod-trusted-pairing-wf259.md#post-occurrence-review-and-upstream-checkpoint--2026-10-14).

Next: DESIGN bounded zero-model native bootstrap/root/fact/lease proof; get explicit
operational approval before native execution/existing-session actions. No prompt
submission/transcript reads/permission changes/adoption. Missing authentic root/
facts stay unavailable, not another admitted synthetic fixture. Funded8/8 exhausted.

## Native bootstrap contract gate — 2026-10-14

Read-only exact291 declaration review found assumptions that must be settled
BEFORE a native receiver/proof: `process.spawn` is hook-interposable (including
output); stdin input is one-shot then closed, not persistent owning IPC. Session
id/root/repo/version are method-hook-facing, and `ui.ask` returns through tool/
render hooks—not alone proof of authentic facts or genuine operator approval.
Existing SHA256 use does not prove native private-key custody. [Primary-source
review](../docs/research/claude-native-mod-trusted-pairing-wf259.md#native-bootstrap-design-gate--exact291-declarations-review-2026-10-14).

Do not promote Mod-spawn stdout/self-signature/roles or an answered UI tool into
root enrollment. Need protected genuine Mod-root/fact/UI path and reviewed whole-
hook-chain/interposition policy. A helper-as-untrusted-relay is only a design
option, not an admitted architecture. Missing evidence stays unavailable.
No native process/model call or permission change performed; native execution
still needs explicit operational approval, acceptance budget remains exhausted.

## Protected bootstrap review outcome — 2026-10-15

[Primary-source review / sanitized upstream draft](../docs/research/claude-native-mod-bootstrap-contract-wf259.md).
Six current official docs + exact291 types establish no complete protected ordinary-
Mod enrollment path in this review (not an impossibility claim). `crypto.subtle`
allows exploring keys inside the trusted Mod/helper-as-untrusted-relay, but custody/
genuine root comparison/native facts/profile lease remain unproved. Immutable API
or custom namespace is not raw-core transport; host-owned trace/origin useful only
in actual local callback, not external-root/turn receipts. Policy-tier `next.to`
is not an ordinary user-tier privilege; no policy workaround selected. UI event
hooks can precede/rewrite callbacks, and default guard is not blanket bootstrap.

**Next external action requires approval:** post the sanitized contract question,
or review an explicitly different deployment policy. Do not implement a native
receiver on guessed bootstrap trust. Draft ONLY, no posting. No native/model/Claude-
CLI/test call, state/credential/transcript read or policy/version change;40 main files
preserved, `4c01d63` clean.6 public-doc GETs only; no new#101742 poll or budget use.

## Posted bootstrap question + Plannotator-shaped implementation — 2026-10-15

Owner explicitly approved posting and continued work following Plannotator.
[Anthropic#102463](https://github.com/anthropics/claude-code/issues/102463) posted,
readback15:32:43Z OPEN/0 comments; approved sanitized body SHA256
`0bf140dc27b4e09476dca1ee444e7599e45831869cdb4e961859bbc06a4fcb18`.
No private artifacts uploaded. No new#101742 poll or funded turn.

Fresh source `773a923917cd5876c8aa0f62a6fc770e1119b91b` (Plannotator0.28.21)
still uses session-local `$.prompt.submit`, thin entrypoint + persistent controller.
Follow that structure, not automatic restore, bearer-root trust or text ownership.
New isolated source **`b9870b4`**, `prototype/wf259-plannotator-session-controller`:

- Actual native-shaped entrypoint exercised under SYNTHETIC Engine,20 lifecycle
  snapshots pass; exact291 strict declaration check and interactive/EOF pass.
  Late callbacks/end/clear/scope loss fence; no lazy owner adoption or queue.
- Normal/identical user input/receive/turn/tool/permission paths unchanged; exactly
  scoped connect command. Metadata/source claims never authenticate; all attached/
  available/authority/publisher fields remain false. No native grant receiver.
-4 pinned pure Plannotator source controls show first/last text matching, foreign
  buffer eviction and cancellation return heuristics cannot supply Neoflow causal
  custody. No native event/abort reproduced; not an upstream vulnerability report.
-0 native/model/publication/workflow-write calls, no native CLI validation, real
  session/store, credentials/transcript/assistant reads or permission changes.
 40 main Workspace hashes unchanged; no production source/contract/Manifest change.

[Full findings/commands](../docs/research/plannotator-tui-claude-delivery.md#current-plannotator-follow-up--2026-10-15).
This supersedes the earlier pause-only next step, NOT authentication/native join
or budget gates. Continue from the scaffold, not guessed receiver trust; Direct
remains unavailable until native enrollment and receipt→turn contract proofs.

## Nonblocking controller fault follow-up — 2026-10-15

Continued in **`820c4a8`**, `prototype/wf259-controller-nonblocking-lifecycle`, based
on `b9870b4`.3 synthetic faults reproduced on the prior source: startup metadata
blocks forwarding, failed command registration leaves unpaired, cancellation
throw also breaks fallback/end forwarding. Fixed with deferred startup, pending
registration ticket, exact-work timer disposal and defensive invalidation.

14 current-entrypoint fault snapshots +20 adapted lifecycle scenarios +4 unchanged
pure-source controls pass; exact291 TypeScript and interactive/EOF checks pass.
The host-clock watchdog is COOPERATIVE, not a protected lease, cancellation proof
or native refusal evidence. A late registration may have installed a command but
cannot revive authority. No receiver/publisher or semantic Interface change.

[Source/captures/limits](../docs/research/claude-native-mod-controller-lifecycle-wf259.md).
Two anonymous issue reads at20:11:03Z: **#101742 and#102463 both OPEN/0 comments**;
this supersedes earlier last-poll timestamps.0 native/model/publication calls,
40 protected main hashes unchanged, no native CLI or funded turn. Existing60
production tests not claimed as rerun. Native bootstrap/turn join remain gated.

## Recovered-session startup confirmation — 2026-10-15

Continued in **`7a450ed`**, `prototype/wf259-controller-startup-confirmation`, based
on unchanged `820c4a8`. Two forced source faults reproduced: a reply naming another
command still completes unpaired; reported checkout drift during registration still
retains pre-await scope. These are synthetic entrypoint observations, not native
engine failures or proof that native lifecycle events were absent.

The thin entrypoint now validates the exact declared registration acknowledgment,
then rereads reported session/root/version under the same ticket/deadline. A one-use
prepared scope must match; stale replies are not inspected. No native installation,
authentication, atomic snapshot, lease, cancellation or attachment is inferred.
The command may already exist when confirmation fails; no native undo is claimed.

**18 new controls +14 prior fault/20 adapted lifecycle/4 pure-source controls** pass;
exact291 typecheck and interactive/EOF pass. Fake registration now returns declared
`{ command }`, not undefined; pure-owner startup explicitly prepares before finishing.
No byte-identical driver compatibility or production test rerun is claimed.
[Source/captures/recovery commands](../docs/research/claude-native-mod-controller-lifecycle-wf259.md#recovered-session-continuation--startup-confirmation-2026-10-15).

40 protected main hashes unchanged; old source worktrees unchanged/new source clean.
0 native/model/publication/network/Workflow-write calls, no native CLI, production/
semantic/profile/policy/version change or push. No upstream repoll;20:11:03Z remains
the last captured checkpoint. Budget8/8 exhausted. Resume from `7a450ed`; native
bootstrap and engine-owned submit→turn gates remain, receiver/publisher disabled.

## Read-only upstream checkpoint — 2026-10-19

Anonymous issue reads begun at08:30:25Z: **#101742 and#102463 remain OPEN/0 comments**,
with unchanged updated timestamps. Neither thread supplies an upstream answer;
this is not a fresh official-docs review or evidence of universal contract absence.
[Sources, capture and disposition](../docs/research/claude-native-mod-controller-lifecycle-wf259.md#read-only-upstream-recheck--2026-10-19).

Park completed `7a450ed` rather than extend synthetic confirmation without a
concrete new question. Native bootstrap and engine-owned submit→turn remain
independent blockers.2 public GETs only;40 protected Workspace hashes match,
prototype clean, no source/test/native/model/publication/Workflow/push changes.
Receiver/publisher disabled; budget8/8 exhausted; native proof still needs separate
explicit approval. No deployment-policy change selected.

## Assumptions review — 2026-10-19

Owner approved challenging the trust/tracking assumptions, not changing deployment
policy or running Claude. [Primary-source review and options](../docs/research/claude-native-mod-assumptions-review-wf259.md)
supersede the preceding blanket park recommendation: work can continue without an
issue reply.13 anonymous public GETs; no native/model/CLI/tool execution.

Claude documents installed Mods as trusted, unsandboxed user-privileged code.
Resisting malicious installed Mods is stronger than that baseline. An explicit
trusted-installed-code profile could simplify bootstrap, but is only a proposal:
no trust narrowing, policy change, native enrollment or Direct admission selected.
External callers/peers still must not inherit committed-message authority.

Honest concurrent producers/user input remain independent of code trust. Reviewed
submit results/classic IDs/origin/per-event traces/counts still establish no exact
Send→turn join. Current public types lag exact291 (`asUser` absent); no new native
build verified. Existing Direct contract fields also need explicit Message-only
production review, not fabricated evidence or expanded capture/cancellation scope.

**Subsequent owner confirmation:** trust our own reviewed code; authenticate
incoming requests; treat other Mods as a compatibility/trust dependency rather
than hostile code this ordinary Mod must isolate itself from. This selects a
candidate design basis, not a blanket third-party endorsement, deployment-policy
change, production Resolution or weaker Evidence Profile. Hostile-hook-proof
bootstrap/profile attestation is no longer a prerequisite for investigating this
candidate; native facts/identity and compatibility still require actual proof.

[Minimal pairing/loss design](../docs/research/claude-native-mod-assumptions-review-wf259.md#owner-confirmed-design-baseline--2026-10-19)
reuses the existing owning-runtime enrollment, one-time genuine-surface comparison
and control-only authentication. No new crypto layer or public confirmation/signer
Interface. Pairing cannot confer Message consent or enable publication; exact
post-commit authority and the independent native join remain required.

**Next bounded proof question:** genuine Mod-local owner key/comparison and
reload/loss fencing in a fresh synthetic session, publication disabled. Prepare
in isolation; native execution/operator scope and any funding still need separate
explicit approval. No adopted user session, prompt/model/tool call, terminal
injection, transcript/assistant capture, Workflow state or permission change.
`7a450ed` stays clean, all40 protected hashes match, receiver/publisher disabled,
budget8/8 exhausted; no source changes or tests rerun.

## Control-only pairing integration — 2026-10-19

Owner approved isolated implementation, not native execution. Source **`6a16bd8`**,
`prototype/wf259-control-pairing-integration`, based on `7a450ed`.
[Findings, exact commands and capture limits](../docs/research/claude-native-mod-control-pairing-integration-wf259.md).

Actual writer-side pairing actor is installed only by known assembly after private
owner enrollment. Bounded signed owning-IPC control actions reuse that path; no
Workspace/public-socket confirmation or signer. The native-shaped entrypoint keeps
`$` calls local and imports inside its plugin, reusing the pure lifecycle owner.
A WebCrypto port of the SAME diagnostic codec interoperates with the original
Node codec inside the owning child; no new protocol/crypto dependency or production
crypto admission. Local comparison remains explicit and separate from Message consent.

**15 integration scenarios** pass with one actual scratch writer,59 loopback HTTP
requests, synthetic native Engine/UI, all resources cleaned. Includes mutual
confirmation, bidirectional encrypted probes, valid-next private packet on public
socket/replay, clear/scope/owning-IPC loss and stale HTTP/crypto callbacks.16 prior
actual enrollment scenarios,18/14/20 original-scaffold controls,11 existing Local
Runtime fast tests, worktree builds/public-declaration typecheck/import audit and
interactive/EOF pass. Original-scaffold controls do not cover the new entrypoint
byte-identically. No full production verification or exact291 check claimed.

No Claude launch/validation/native API/model/tool/prompt submission, real workflow
store, transcript/assistant/credential capture, installation, permission/profile/
version change, merge/push/dispatch or new upstream poll. Main at `a48220c`,40
protected Workspace hashes unchanged, old worktrees unchanged/new source clean.
Native identity/Attachment/Direct/admission stay false; grant receiver/publisher
and normalized native evidence remain absent; budget8/8 exhausted.

**Next:** separately approved fresh disposable native loader/API/crypto/UI/loss
proof. User/operator comparison and actual Neoflow UI integration are not proved
by this synthetic driver. Engine-owned Send→turn custody remains independent;
control pairing is not reason to enable publication or weaken evidence.

## Real operator flow preparation — 2026-10-21

Owner rejected manually inspecting diagnostic JSON as acceptance work and directed
continuation. Isolated source **`448d0ed`**, `prototype/wf259-native-control-ui`,
prepares a real readable control window, native comparison/disconnect pane and
automatic handshake/liveness. Default user flow imports no synthetic Engine;
developer checks remain developer-owned. [Exact scope, verification and custody](../docs/research/claude-native-mod-control-pairing-integration-wf259.md#real-operator-flow-preparation--2026-10-21).

Separate native launcher is explicit-approval/TTY gated, fresh-scope/source-hash
checked, one-shot even on failed startup, scratch-config/unusable-auth/rejecting-
provider/outbound-sandbox contained, without prompts/resume/permission override or
terminal output capture. It was NOT run. Closed control RPCs serialize at most4
requests to handle real UI/poll overlap;1024 private trial RPCs is not a Message
queue, new consent or additional funded budget.

9 automated preparation controls +15 integration/16 actual enrollment controls
and11 Local Runtime fast tests pass, plus builds/public-declaration/import checks.
No exact291/native compatibility or full production-suite claim. Prior18/14/20
captures retained, not newly rerun. All sending/Attachment/Direct flags stay false.

**Next prerequisite:** formerly used frozen2.1.291 executable is missing at its
recorded location (presence only; no CLI run). Select/restore an existing exact
candidate or obtain separate approval for a newer-build review. No auto-install,
PATH/version fallback or reviewed-version widening. Actual native UI/crypto/API
proof still requires separately scoped operational approval; Send→turn remains
independent and funded budget8/8 exhausted.

Main source was not edited; old scratch custody manifests are now missing, so no
historical40-file hash match is claimed. Fresh40-file private fingerprint baseline
captured in Git metadata for subsequent checks; source worktrees clean/unchanged
apart from the new committed branch. No native/model/public writes or upstream poll.

## Installed2.1.306 contract review — 2026-10-21

Owner explicitly approved installed-version/Mod-contract checks, no prompts or
model calls. Native alias resolves to **2.1.306**; executable hash pinned in
[primary-source findings](../docs/research/claude-native-mod-installed-306-contract-review-wf259.md).
Source **`b222f1c`**, `prototype/wf259-installed-306-contract-review`, based on448d0ed.

Strict CLI validation accepts the hooks after adding author attribution. The
codec then FAILS in the official offline kit at `crypto.subtle.generateKey`.
A separate Mod hook confirms only digest/randomness (and listed encoding globals)
are exposed; key import/export/sign/derive/encrypt functions are undefined. The
public SDK already declared that restricted global. Our old DOM-based typecheck
masked it; corrected SDK-global checking now rejects the port. This is our
verification error, not a demonstrated upstream regression or full live-worker proof.

Both operator/native trial entrypoints are withheld with no override. Old Node
protocol/lifecycle captures remain valid for their scope, not native compatibility.
No version-only fix, DOM type workaround, user JSON acceptance task or supported
native key owner is inferred. The native guard/main reviewed profile is unchanged.

Twelve authorized CLI metadata/help/validation/offline-test invocations,7 anonymous
primary-source GETs. No conversation, native prompt/model/real tool/store call,
credentials/transcripts/assistant capture, install/update, public write or issue
poll. Full generated306 declarations require an interactive load and were NOT
obtained. Public types remain the earlier pinned copy, not exact306 declarations.
Full production suite not rerun; known codec/SDK failures captured intentionally.
Source committed/clean; main source untouched and fresh40-file custody retained.

**Next:** use a trusted bounded Node child for keys/the existing Node pairing
codec, with genuine owning startup, scoped local control/lifetime and local-only
comparison. No socket-root lookup, generic signer/confirm endpoint, key files or
standing Message consent. Helper not implemented by this review. Send→turn remains
independent; no receiver/publisher/admission, funded budget8/8 exhausted.

## Implementation — 2026-10-26

Owner chose to build the connector now, tracking honestly: correlate start/end
only when unambiguous, otherwise `Outcome unknown`. Pinned to exact Claude Code
**2.1.310**, separate from the reviewed `2.1.209` User Pull profile; no live
Claude session has run it yet.

- `packages/claude-adapter/plugin-direct`: thin Mod (`/neoflow`,
  `/neoflow status`, `/neoflow disconnect`). Observers only; submits only text
  its helper hands it, with `asUser: true`, and only while no turn runs and no
  other prompt waits. Reports content-free facts (ids, booleans, reason words).
- `src/direct/helperEntry.ts`: the Mod runs a one-shot launcher via
  `$.process.run`; it starts a detached Node daemon and returns its loopback
  port and a random 32-byte token on stdout, so only the launching Mod holds it.
  The daemon connects as the reviewed harness Adapter with the existing
  `connectHarnessAdapterRuntime` reconnect loop and exits when the Mod detaches,
  the session ends, or polling stops for 45 s. This uses the trusted-installed-code
  baseline, not Mod-local crypto.
- `ClaudeDirectAdapter` owns correlation. A Send owns the next main-loop turn
  only if Claude was idle, no foreign prompt entered before it started, and
  `turn.start` text equals the exact submitted text, falling back to submit
  resolution when its own `turn.start` is not observed. Overlap, mismatch,
  missing start (30 s), unconfirmed submit (10 s) and session/runtime loss are
  `correlation-lost`; a native drop is `rejected`; busy is `proven-not-dispatched`.
  `turn.complete` `answer`/`aborted`/`refusal|error` → ended/interrupted/failed.
  Interrupt uses `$.turn.abort({ turnId })`. Review Messages only. The Review
  Response is `turn.complete`'s `answer` (final visible text) of the Mod's own
  turn only, bounded at 16 KiB like Pi; user turns' text never crosses.
- No Workspace or application change: the existing Direct contract and Message
  route select it like Pi.

Verified on Node 26.5.1: 16 adapter contract, 6 helper-server and 1 real-Workspace
scenario tests; full `pnpm test` (596); typecheck/lint/format/dependency firewall;
`scripts/smoke-claude-direct.mjs` against a real runtime (in `smoke:build`);
`claude plugin validate --strict` and 3 offline `claude plugin test` cases. Not
proved: real-session framing/bytes, actual `turn.start` visibility for a Mod's
own submission, permission prompts, `/clear`/resume, reload, gateway, and the
adversarial matrix below.

**First live Send (2026-10-26).** Owner-driven, real interactive Claude Code
2.1.310 loaded with `--plugin-dir`, Neoflow `pnpm dogfood -- .`, `/neoflow`
attached. Two Workspace refusals preceded it and were not connector faults:
`review-basis-not-found` on a historical Review without a basis tree (a new
Review avoids it; app/Workspace gap left open), and `message-file-unavailable`
from an ignored nested repository at `.local/wf231-wf232-manual/worktree/`
breaking every live context capture, fixed in `0420041`. The next Send settled
**`ended-normally` with correlated start and terminal evidence** (2 evidence
items), read back from the running runtime. Loading also generated exact
2.1.310 declarations, which confirm `asUser` (`{ kind: 'plugin', name,
asUser: true }` origin, bare model text, transcript still names the plugin, no
`@file` expansion), `turn.start`/`turn.complete` fields and
`$.turn.abort({ turnId })`. Source: `e9f173b` on
`wf259-claude-direct-connector`. That first Send carried no Response: the
connector settled lifecycle only. The Mod now forwards `turn.complete`'s
`answer` for its own turn (and ignores subagent `turn.start`s, which would
have broken correlation); the owner confirmed live that **Claude's reply
appears as the Message's Response**.

**Live lifecycle cases (2026-10-27 – 2026-11-03).** Owner-driven, same setup,
outcomes read back from the running runtime (status, evidence counts,
interruption intents, Response presence only; no text retained):

| Case | Result |
| --- | --- |
| Esc in Claude during a Neoflow turn | `interrupted` / `interruption-observed`, no intent. The app card said "awaiting Harness": Message cards ignored the Invocation outcome (Pi too); fixed in `2ad8ff1`, card now shows Interrupted. |
| User types during a Send; second Send while that prompt waits | First Message `ended-normally` with Response; second Send refused as busy, nothing entered. |
| Interrupt from Neoflow | `interrupted` with one interruption intent: `$.turn.abort({ turnId })` stopped the turn. The app has **no interrupt control**; exercised through `harness.invocation.interruption.request` from a runtime CLI client. |
| `/clear` while attached | First run **failed**: the Send went `unresolved` / `correlation-lost`. The helper never learnt the session ended and handed the submit to a poll the Mod had already let go. Fixed in `fdd3b80` (direct `session-ending`; a stale poll's submit is refused). Re-run: Send refused while unavailable; after `/neoflow`, a new attachment and a normal end with Response. |
| Tool permission prompt (normal mode, approved write) | `ended-normally` with Response. Auto mode never prompts. |
| Identical body sent twice | Two Invocations, each `ended-normally` with its own Response. |

Claude Code auto-updated during the run; 2.1.311 and 2.1.317 were admitted
after diffing their generated Mod declarations against the reviewed set: no
API the connector uses changed. Still not proved: reload, gateway, an app
interrupt control, the historical-Review `review-basis-not-found` gap, and the
adversarial rows below.

## Remaining bounded live matrix — subject to new approval

Use exact `2.1.291`, Node `26.5.1`, a disposable trusted synthetic checkout,
normal reviewed tools/permissions, and the configured gateway without retaining
its URL or credentials. Inspect build-generated types and stage only the probe
Mod/helper, never real Neoflow workflow state or user plugins/transcripts.

Run positive Neoflow/user controls; absent and wrong authority; another local
caller; spoofed native metadata; real native `SendMessage`; identical bodies;
user input before/during dispatch; tool permission attention; reconnect;
`/clear`/resume/session/checkout replacement; Mod absent, unloaded, failed, and
policy-blocked. Observe content-free counts/digests and normalized lifecycle;
never retain raw prompt/hook bodies, terminal output, assistant text, or native
credentials. Stop at the first missing guarantee rather than retrying until a
model happens to refuse an adversary.

The runtime-to-Mod ingress is not yet designed/proved. A first session-local
live test can answer bytes, native origins, and correlation but cannot be
reported as end-to-end authenticated Neoflow delivery. Once the bridge has a
reviewed plausible authorization mechanism, rerun the entire adversarial matrix
through it before production.

## Acceptance

- [x] Anthropic/Plannotator primary-source evidence identifies a plausible native
      session-local ingress, independently of the unsafe private inbox.
- [x] A frozen throwaway offline source demonstrates native API dispatch/filter
      behavior and documents its stubs and limitations.
- [x] Exact foreground fixture identity, one real native peer consumed before
      context, and a CLI-startup composer source control are captured with limits.
- [x] Offline signed-grant/state walkthrough captures assumptions and keeps the
      unproved291 correlation profile unavailable instead of guessing custody.
- [x] Exact-build types and live bytes/framing prove the outgoing contract.
- [x] Runtime-to-Mod authorization plus real adversarial cases prove Native
      Dispatch Provenance before context/tool authority.
- [x] Exact native lifecycle correlation survives duplicate/interleaved user
      input without markers, transcript access, or outcome inference.
- [x] Explicit attach, sustained connection, loss/reconnect, and exact identity
      revalidation match the Pi-like user contract.
- [x] Normal permissions, configured gateway, and organization policy pass on
      the exact candidate; unsupported environments fail unavailable.
- [x] A production Resolution is settled, with native facts confined to the
      Claude Adapter and focused seam/matrix verification named, before code.

## Constraints

- WF-258's private inbox remains rejected; none of its setup trust workaround,
  frame encoding, peer labels, or private authentication assumptions is reused.
- No reviewed-version bump, production controller/Mod, queue, broad setup trust,
  model-visible secret, terminal injection, replay, or silent route fallback.
- No push, GitHub Action, or funded external operation without explicit owner
  approval. Live evidence is separately approved, synthetic, and human-driven.
- Keep prototype source off main. Preserve unrelated unstaged Workspace changes.

## 0.1.0 scope — 2026-11-12

Reopened by [WF-287](./WF-287-ship-the-0-1-0-public-preview.md): this
connector is how Claude Code reaches Neoflow in 0.1.0. Owner decisions:

- **Safety bar (Q37).** Programs running as the same user on the same machine
  are trusted, the standard Pi's runtime socket already uses. The connector
  must prove that every caller without the exact launch token is refused and
  changes nothing: no or wrong credentials, near-miss tokens, the right token
  through another `Host` (DNS rebinding), wrong methods and paths, oversized
  bodies, forged facts and detach. These are now automated
  helper-server tests. Malware running as the user is out of scope for
  0.1.0. The adversarial live matrix above is narrowed to this bar.
- **One plugin.** `plugin-direct/` moved to `plugin/` and is named `neoflow`.
  The per-message User Pull plugin and bridge are removed.
- **One session per repository.** A newer connection releases this one; the
  helper detaches the Mod with that reason and does not reconnect.
- **Old Reviews.** A Review saved before Messages now refuses a Send with
  `review-predates-messages` and tells the user to start a new Review, in
  place of the misleading `review-basis-not-found`.

Still to verify live: `/neoflow` after the plugin rename, plugin reload, the
configured gateway, and a full connect-send-Response round trip on a current
Claude Code 2.x.

## Resolution — 2026-11-12

Closed for 0.1.0. The connector is the production route for Claude Code under
the owner's safety bar (Q37): same-user programs are trusted, as for Pi. The
acceptance boxes above are checked against that bar, not the original
adversarial-provenance research bar, which is out of scope for 0.1.0.

- **Live (owner, Claude Code 2.1.322, scratch repository).** All seven cases
  passed:
  1. `/neoflow` still registers after the rename.
  2. A Send arrives as a normal turn, with the reply as Response.
  3. A Pi session connecting takes over, and Claude says so.
  4. Claude takes the connection back.
  5. Plugin reload either keeps the connection or reports a disconnect that
     `/neoflow` repairs, never silently.
  6. The configured gateway works.
  7. `/neoflow disconnect` stops Sends.

  Earlier live cases (2026-10-26 to 2026-11-03) covered interrupt, user input
  during a Send, `/clear`, permission prompts and identical bodies.
- **Automated.** Adapter correlation contracts, helper refusal tests for every
  caller without the exact token, the real-Workspace delivery scenario, and
  the `smoke-claude-direct` runtime smoke.
- **Versions.** Any stable 2.x attaches. 2.1.322 joins the live-verified list
  (2.1.310, 2.1.311, 2.1.317, 2.1.322); `doctor` labels newer builds
  "untested" (WF-257 amendment).
- **Not covered.** Organization-managed policy that blocks plugins (expected
  to fail as "unavailable"; not exercised), and protection against malware
  running as the user.
