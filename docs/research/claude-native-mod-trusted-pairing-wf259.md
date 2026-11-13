# WF-259: trusted pairing and key-custody candidate

**Owner-confirmed simplification (2026-10-19):**
[trusted-code pairing/loss design](claude-native-mod-assumptions-review-wf259.md#owner-confirmed-design-baseline--2026-10-19)
trusts our reviewed implementation while authenticating external callers. Other
Mods are a compatibility/trust dependency, not hostile code we must isolate an
ordinary Mod from. Reuse this candidate's local-only comparison and existing owned
runtime integration; do not add another crypto layer or treat helper/root labels
as authentication. Historical hostile-hook bootstrap gates below apply to that
stronger model, not every future candidate. No native run, new fixture result,
Message consent, weaker turn evidence or production admission follows.

**Control-only integration (2026-10-19):** source `6a16bd8` installs the original
Node pairing actor in the actual enrolled writer, with a same-codec WebCrypto port
in the native-shaped entrypoint and no Node import into its plugin graph.
[Findings/captures](claude-native-mod-control-pairing-integration-wf259.md) distinguish
15 integration scenarios from actual native UI/crypto/identity proof, which remains
unperformed. Local confirmations stay on owning UI/native callback paths; relay/
public role traffic cannot confirm or publish. No native execution/admission,
Message consent or Send→turn join follows.

## Result — 2026-10-13

Owner-approved **offline authentication work**, no native/model/network calls.
Source captured at `prototype/wf259-trusted-pairing`, **`f75106c`**, under
`packages/claude-adapter/prototypes/wf259-trusted-pairing/`.

**Candidate bootstrap is now specified and exercised:** explicit comparison on
both genuine local UI surfaces pins reciprocal owner keys; self-signed hello,
role/UID/socket ownership, fetched public keys or a bearer setup token do not.
A transcript binds both signing/DH keys, roles, nonces, workspace/canonical Git
facts, runtime generation/code and native session/epoch/build/code/helper lease.
Fresh authenticated channel challenges protect reconnection; encrypted control
protects confidentiality against a transparent relay. Pairing confers no Message
consent, Semantic Attachment or production Capability.

- **46 asserted offline scenario snapshots passed**, not production tests.
- A separate proof ran two **actual owned Node children**: keys created inside
  them, private parent IPC distinct from untrusted wire parsing, no key files,
  copied remote approval refused, encrypted control/replay fencing exercised.
  Both children stopped after private owning control lease loss.
- **0 native calls,0 model calls,0 native publications**, no workflow store.
  Message/evidence payload kinds are hard-disabled in both proofs.
- All40 pre-existing modified Workspace files remain byte-identical to the
  before-work hash manifest. No production code/policy/version admission, push,
  native CLI operation, credential/transcript/assistant read, or funded testing.

That initial `f75106c` phase does **not** prove genuine UI/native facts, actual
runtime enrollment, helper/Mod attestation, authoritative grant emission, or native
turn correlation. The subsequent owning-startup integration is recorded below.
An encrypted authenticated channel is necessary hygiene, not durable-commit or
native-event evidence. The custom crypto framing is a fixture, not audited
production transport; prefer a reviewed mutual-authenticated stack using verified
roots/scope binding, or obtain explicit protocol review before adapting it.

## Actual owning-startup integration — 2026-10-13

After explicit owner approval, source **`408360a`** on
`prototype/wf259-runtime-owner-enrollment` integrates the existing
`ensureWorkspaceRuntime` / `runWorkspaceRuntimeProcess` seam. Capture lives at
`packages/local-runtime/prototypes/wf259-runtime-owner-enrollment/` plus the
branch-only `src/ownerEnrollment.ts` and opt-in lifecycle changes. Main retains
only findings; no production code, public protocol or version/policy admission.

- Launcher-only `ownerEnrollment: 'require-owned-startup'` creates a private UI
  key only for a fresh owned startup. Public key and fresh challenge cross the
  captured child IPC; the real writer creates its memory-only root after owning
  state and server readiness. Signed metadata binds actual Workspace/checkout/
  canonical Git directory/runtime generation/code witness, that UI key/challenge
  and a fresh enrollment ID. The root is NOT fetched from the ordinary socket.
- A narrowly scoped owner-control lease retains private IPC. `probe` verifies
  mutual key possession, bound direction/type/scope/lease/sequence/challenge,
  single-flight and a64-operation bound. `dispose`/IPC/child/UI loss revokes control
  without retiring the independently held Workspace or other clients. The UI
  AbortSignal still ends its semantic connection after earlier control disposal.
- An existing runtime, including a different code witness or one whose control
  was lost, reports enrollment unavailable. This opt-in path never sends the
  legacy discovery code-mismatch `retire`, silently re-enrolls, creates a parallel
  owner or replaces an existing owner. Subsequent authenticated enrollment for a
  retained runtime is a separate production policy/integration question.
- **16 asserted actual-startup scenarios pass**, with three real owned Node
  writer children, including a deliberately corrupted ready-signature child.
  Cancelled intent starts nothing; root metadata tampering, forged UI signatures,
  replay, wrong scope, public-socket enrollment/copied labels and publication
  opcode are refused. All three children exit naturally; scratch files removed.
- **34 existing Local Runtime fast/contract regressions pass** across8 files;
  TypeScript builds and whitespace checks pass. All40 pre-existing Workspace
  edits remain hash-identical. No push or workflow dispatch.
- This phase uses a disposable Git/XDG scratch **actual authoritative writer**,
  solely to prove the real ownership/startup seam. It reads only Workspace
  identity metadata; performs no Workflow operation and never uses the real store.
  **0 native/model/publication/external-network calls.** Private IPC and synthetic
  Unix sockets are exercised; no Claude process or native session is involved.

**Critical qualification:** this authenticates owner control, **not the ordinary
Workspace socket**. A matching generation is only a compatibility fence, not
transport custody; role/code labels and a valid self-signature are not sufficient.
Known reviewed loaded code, authentic launcher/UI assembly and protected owning
OS IPC remain trust prerequisites, not claims manufactured by this metadata.
No generic confirm/sign/publish operation or Message/evidence path exists. The
metadata signatures over an already-private channel are not promotion of the
previous custom network crypto codec. The original genuine UI/native comparison
ceremony, helper lease/facts, committed-authority binding and native turn join
still need independent proof.

Reproduce ONLY in the throwaway worktree (builds its own packages):

```sh
sh /private/tmp/neoflow-wf259-runtime-owner-enrollment/packages/local-runtime/prototypes/wf259-runtime-owner-enrollment/run --proof
# omit --proof for the interactive scratch owner-control fixture, not native UX
```

The initial cleanup-only harness assertion used an exit observer removed by
normal startup handoff. It was fixed to use actual ChildProcess exit/signal facts;
its Node child had stopped, and its leftover scratch directory was removed.
This is not a native delivery failure or a new funded diagnostic.

## Owned UI→Workspace channel follow-up — 2026-10-13

Source **`2c67276`**, `prototype/wf259-owned-workspace-channel`, extends `408360a`
in the actual Local Runtime seam. Capture:
`packages/local-runtime/prototypes/wf259-owned-workspace-channel/`.

The previous owning control channel did **not** authenticate the ordinary
semantic socket. This slice does not pretend to fix that by copying a generation
label or returning a self-signature. Instead, the actual UI `workspace` returned
in opt-in owned-startup mode uses the existing **private owning OS IPC**. Its
Duplex stream carries scope/enrollment/direction/sequence-bound signed bytes,
checked before JSONL semantic parsing. The existing client/server handlers,
Workspace validators and authoritative commit path are reused; no new execute
implementation, context bag, general signer or semantic Interface is introduced.

In **candidate mode only**, the public socket supports compatibility and Workspace
identity metadata, not execute/subscribe/private views/Adapter admission/evidence.
It cannot retire the owner through an untrusted code-mismatch label. Thus public
role claims cannot bypass the private UI command path. Existing default legacy
behavior and main production remain unchanged; CLI/editor authorization and a
retained-owner enrollment policy still need review. No silent product-policy
admission or reinterpretation of User Pull as Direct.

**17 asserted scenarios pass**, with seven real owned Node writers, two durable
scratch Review-start commits, all children naturally stopped and scratch removed.
Public tui/cli/editor writes and confidential reads cannot change/access state.
Valid private signed packets copied to the public socket are still refused.
Real authenticated reads/commands/subscriptions reuse existing handlers. Signed
replay, foreign scope/enrollment, response reflection, genuine next-sequence byte
substitution and a valid-signature sequence gap fence the private channel.

The lost-response case is deliberately not semantic-success evidence: the UI call
remains unresolved when its genuine result signature is corrupted. Harness-only
observation of its own pre-tamper synthetic result and a fresh explicitly owned
writer confirm one durable commit, without auto-retry, invented recovery or
alternate socket route. An initial fixture used Review cancel after restart and
correctly received `review-not-active`; replacing it with a valid Review start
settled the intended control. No delivery/commit claim rests on the rejected case.

Prior16 enrollment scenarios and34 existing Local Runtime regressions still pass;
TypeScript/whitespace checks pass. All40 pre-existing Workspace edits remain
hash-identical.0 native/model/publication/external-network calls; no native or
real user store/checkout, credential/transcript/assistant reads, push or dispatch.
Unlike the earlier metadata-only phase, this command performs two explicitly
synthetic Workflow commits in disposable actual state to prove command custody.

```sh
sh /private/tmp/neoflow-wf259-owned-workspace-channel/packages/local-runtime/prototypes/wf259-owned-workspace-channel/run --proof
# omit --proof for the scratch private UI read/probe/public-write-refusal fixture
```

**Still not established:** genuine rendered UI/installed assembly trust, retained
owner re-enrollment, full CLI/editor authorization, exact Message consent/frozen
committed-directive grant creation at the private post-commit callback, genuine
native UI/helper lease/facts, durable normalized evidence or native receipt/turn
custody. Signatures over protected IPC are not an audited network transport.
Next bounded slice is closed post-commit committed-directive authentication with
native publication disabled; native/helper acceptance requires separate approval.

## Exact post-commit DTO authentication — 2026-10-13

Source **`2a432d9`**, `prototype/wf259-post-commit-authentication`, extends the
actual runtime Adapter seam. Capture:
`packages/local-runtime/prototypes/wf259-post-commit-authentication/`.

An assembly-only, plainly **SYNTHETIC** offline attachment reaches the existing
`RemoteReviewedHarnessAdapter.#perform` from the real
`HarnessInteraction.#performAfterCommit`. The runtime's private enrollment root
signs the whole exact frozen normalized Message Directive plus owned scope and
fresh occurrence, using an explicitly diagnostic/native-publication-disabled
purpose. There is no generic sign/publish/confirm RPC, external Adapter enrollment,
Workflow-store reader/reconstruction, new semantic executor or model-visible
signature. Root keys stay inside the actual owning child; the artifact file is
not a trust root/inbox, and verification pins the root from prior owned IPC.

Strict supported-DTO/frozen-contract/authority/manifest checks, canonical base64,
fatal UTF8/BOM preservation, byte/codepoint/digest aliases and one-use bounded
invocation tombstones are checked before capture. Batch/interruption are not
admitted by this narrow slice. Valid occurrences are consumed before artifact
transport; failure does not authorize reissuance. No native publisher exists.

**11 asserted actual-node scenarios pass**, one durable synthetic Message with
real Handoff/receipt/frozen Capability/Invocation. Real committed result and
inspection cross-check the signed exact outgoing bytes/IDs, including leading
spaces/BOM/CRLF/blank lines/combining Unicode/emoji. Inspection, a generic sign
request, copied public UI role, invalid inspection and State conflict produce no
signature; durable command-result reuse never issues again. Foreign root and five
byte/snapshot/Invocation/scope/occurrence mutations fail verification. Private
keys never leave memory. The one owned writer stops and scratch is removed.

**60 existing regressions pass**:34 Local Runtime plus26 Harness Interaction
(including transaction failure, post-commit crash, command recall/no replay).
Prior17 channel and16 enrollment scenarios still pass; build/whitespace checks
pass; all40 unrelated Workspace edits remain byte-identical.0 native/model/native
publication/external-network calls; no real user checkout/store, credentials,
transcripts/assistant read, push, workflow dispatch or version/policy admission.

### Concrete remaining semantic/authority gaps

1. The normalized Directive does **not contain Message identity or commitment
   receipt identity**, although the actual committed result contains both.
   This slice does not invent those fields or reconstruct them from State. It
   authenticates the owned post-commit DTO, **not a complete production grant**.
   Full authority binding requires a reviewed private authoritative committed-
   occurrence/receipt seam at the Workspace owner, preserving existing semantics.
2. The no-publication diagnostic truthfully returns `proven-not-dispatched /
   host-unavailable`. Current `#performAfterCommit` consumes this observation for
   older Review dispatch, but not Message dispatch. The Message consequently
   remains unresolved/awaiting-start; another Send is blocked by
   `active-invocation-exists`. We preserve that uncertainty, do not fake native
   evidence/settlement or force a second Send, and do not change core semantics.
   This observation-consumption gap needs explicit review independently of crypto.

Initial fixture-only invalid manifest maximum and Attachment pattern were
fail-closed; corrected to existing semantic constraints. An unknown sign operation
correctly rejects as a Workspace call error. None is native evidence.

```sh
sh /private/tmp/neoflow-wf259-post-commit-authentication/packages/local-runtime/prototypes/wf259-post-commit-authentication/run --proof
# omit --proof for the synthetic inspection/commit/capture-count fixture
```

Next: review committed-occurrence/receipt authority and Message pre-native-refusal
consumption, then receiver/helper key custody and durable evidence. Native/helper
physical proof remains separately approved;#101742 native receipt/turn custody
remains an independent gate and the funded budget is exhausted. Do not admit
Direct because the runtime can authenticate an already-committed diagnostic DTO.

## Message pre-native refusal consumption — 2026-10-13

Source **`205b8c6`**, `prototype/wf259-message-pre-native-refusal`, based on
`2a432d9`. Capture: `packages/local-runtime/prototypes/wf259-message-pre-native-refusal/`.
This resolves the second gap above **only on the prototype**, not in main.

The existing `#performAfterCommit` observation→normalized durable rejection path
now includes Message as well as older Review dispatch. Missing status remains
unknown; interruption is excluded. Existing evidence normalization, exact
Attachment/Invocation association, awaiting-start ordering and authoritative
commit are reused. No new Interface, profile, sign/publish endpoint or executor.
A trusted Adapter must actually prove non-publication; timeout/transport loss,
accepted submission, a signed capture or native origin alone is not that proof.

**14 actual owned-runtime snapshots pass:** two independent explicitly committed
Messages have identical exact BOM/CRLF/Unicode/emoji outgoing material but distinct
Message/receipt/Invocation/signed-occurrence identities. Each proven no-publisher
refusal persists one exact local rejection, no native start/Response/interruption.
Fresh owned restart retains durable rejections without callbacks/replay, gets a
new root/generation, and never reissues signatures on historical command recall.
An accepted Message result acknowledges commitment, not native receipt/success.
Message and rejection are separate commits; result State version precedes evidence.

**13 private owning-assembly controls pass:** all supported rejection reasons;
accepted/throw/undefined/null/invalid reason/missing evidence leave awaiting-start;
Message commit failure creates no Message/Invocation/callback/signature; rejection
write failure preserves durable Message and awaiting-start, zero rejection evidence.
Explicitly synthetic start-before-refusal preserves active status; interruption
no-dispatch observation never becomes cancellation/rejection. Every control
restarts its sole writer and verifies durable facts/no replay. These controls
are not physical UI/native/helper proof and never authorize native publication.

Initial fault-control expectation was corrected: a Message write failure throws,
not a semantic rejected result. Absence of durable effects/signatures is asserted.
The old `2a432d9` blocked-Message assertion is intentionally superseded rather than
claimed as an unchanged regression. Main protected files remain untouched.

**60 existing tests**, prior17 authenticated Workspace channel and16 enrollment
scenarios pass; builds/whitespace pass, all40 unrelated main Workspace edits
hash-identical (including main `harnessInteraction.ts`). Two owned Node writers
exit; all private controls/writers/scratch cleaned.0 native/model/publication/
external-network calls. No credentials/transcripts/assistant capture, push/workflow
or production policy/version admission. Funded8/8 budget remains exhausted.

```sh
sh /private/tmp/neoflow-wf259-message-pre-native-refusal/packages/local-runtime/prototypes/wf259-message-pre-native-refusal/run --proof
# --controls for observation/order/write-failure walkthrough; omit flags to inspect state interactively
```

**Next:** full Message/receipt committed-occurrence authority at the private owner
seam; this DTO still lacks those IDs. Do not add shared caller context, invent
receipt fields or reconstruct authority from the store. Native/helper roots/leases,
receiver replay custody and#101742 receipt→turn join remain separately unresolved.
Upstream was not re-polled in this slice. Reviewed Claude2.1.209 User Pull unchanged.

## Owned committed Message occurrence — 2026-10-13

Source **`4c01d63`**, `prototype/wf259-committed-message-occurrence`, based on
`205b8c6`; capture: `packages/local-runtime/prototypes/wf259-committed-message-occurrence/`.
The owning runtime's Message/receipt-binding gap now has a bounded concrete proof.
This is not main/product admission or a complete native dispatch grant.

**Chosen seam:** Workspace remains execute/read/subscribe; reviewed Adapter still
uses `connect(sink).perform(committedDirective)` with unchanged normalized DTO.
A prototype-only INTERNAL host `establishOwnedMessageAdapter(factory)` enrolls a
per-Adapter, one-use accessor in the known owning assembly—not a public role/RPC
or shared caller-context bag. Normal Adapter establishment grants no reader.
This is an explicit private host Interface candidate, not installed policy.

Harness Interaction offers only after a NEW actual atomic Message commit returns
its exact expected result bytes. It uses the locally built receipt write from
that transaction, NEVER a Workflow-store lookup/reconstruction. The immutable
owned occurrence contains owning Workspace/checkout, committed State version,
actual committed result and exact encoded receipt payload. Runtime signs that
whole occurrence WITH frozen Directive, owning scope and fresh dispatch occurrence.
Receipt consent/destination/assessment/acknowledgments/Message/material/capability
join the real Handoff/Invocation, not caller-invented receipt fields or labels.

Per-Adapter private WeakMap keys exact original Directive object; its accessor
checks the still-current live Adapter slot. Copies/JSON, foreign/refused factories,
pre-callback/second/expired/replacement reader claims fail. `take` consumes BEFORE
validation/signing/transport; offers expire as perform settles BEFORE evidence
writes, including throw/unclaimed/owner loss. No global context/ID registry,
queue, reissuance or alternate executor. **Object identity supplies only local
owned-call custody; it is not native receipt→turn association.**

**16 actual owned-startup scenarios pass:**3 owned writers and3 actual durable
synthetic Messages. Exact BOM/whitespace/CRLF/Unicode/emoji preserved; explicit
identical Sends have distinct receipts/Invocations/occurrences. Signed original
receipt and result match authenticated commit facts; foreign root and10 mutations
(including Message/receipt/State/acknowledgments) fail verification. Historical
command recall/fresh root restart never reissue. Actual corrupted UI response
fences after durable Message/signature/local rejection; call remains unresolved,
no retry or native/UI receipt inference. Fresh owner confirms durable facts only.

**25 private owning-assembly controls pass:** exact successful signed receipt/result
match the actual local transaction WRITE BYTES. Wrong receipt/Message/State/consent
consumes owner offer but produces no signature. Refused/foreign/copy/replacement/
expired claims fail. Pre-durable Message failure has zero effect; lost Message
commit return, post-commit crash or corrupted returned result can leave a durable
Message with ZERO callback/signature—never reconstruct/retry. Rejection write loss
can coexist with durable rejection; pre-write rejection failure remains pending.
Accepted/missing/invalid/thrown facts preserve uncertainty; synthetic start order
and non-cancellation interruption invariants remain. Every sole writer restarts
without callback replay. Controls are not genuine UI/native/helper evidence.

**60 existing tests**, prior17 channel and16 enrollment scenarios pass; builds and
whitespace checks pass;40 unrelated main Workspace files remain hash-identical,
including main counterparts of branch-changed Harness files. All owned Node/private
writers/scratch cleaned.0 native/model/native-publication/external-network calls;
no credential/transcript/assistant reads, key persistence/export, permission changes,
push/workflow dispatch or production/profile/version policy changes. Previous raw
private scripts without an accessor are historical captures; current owning controls
migrate to enrolled factory, not claimed as unchanged compatibility tests.

Implementation corrections were fixture/type-only: optional property undefined
under exact TS rules; local write observer must select Message-kind results because
Harness results also cover interruption. No native cause/evidence invented.

```sh
sh /private/tmp/neoflow-wf259-committed-message-occurrence/packages/local-runtime/prototypes/wf259-committed-message-occurrence/run --proof
# --controls for private receipt/custody/write-loss cases; omit flags for interactive scratch state
```

**Remaining:** review the private host seam and diagnostic codec under genuine
owning assembly/OS/UI assumptions; then authentic native-helper root/facts/lease,
receiver one-use/durable acknowledgments and restart policy. Actual engine/session/
frozen native profile, physical existing-session persistence and normal tools/
permission attention remain unproved. Native#101742 receipt→turn gate remains
independent (not re-polled here); funded8/8 turns exhausted. Reviewed Claude2.1.209
User Pull unchanged; cryptographic runtime receipt binding is NOT Direct admission.

## Post-occurrence review and upstream checkpoint — 2026-10-14

Review of `4c01d63` distinguishes the proven runtime slice from remaining trust:

- `harnessInteraction.ts` offers actual locally-built receipt/result only after
  the new atomic commit; `ownedMessageOccurrence.ts` consumes/expires per exact
  current Adapter callback. `postCommitAuthentication.ts` validates the full
  receipt/DTO join before signing. No added Workspace command, reconstructed
  Workflow directive, receipt-ID lookup, model-visible marker or native publisher.
- `establishOwnedMessageAdapter(factory)` is owning-assembly enrollment, **not
  authorization for arbitrary installed code**. Its protection depends on known
  loaded assembly/OS/private owning path and memory key custody. Exposing it by
  ordinary bootstrap/roles/public RPC would invalidate the argument. Genuine
  rendered UI/installed assembly and retained-owner re-enrollment still unproved.
- An object-keyed offer proves local callback occurrence only. Historical signed
  artifacts are not native receipt evidence or current lease authority; receiver
  trust root/facts/current lease and durable consume/ack/restart require their own
  reviewed design. No signature establishes engine-owned submit→turn custody.
- Fail-closed publication is mandatory until ALL runtime/UI/native/helper/profile/
  session/root/lease/consent/correlation gates hold. Single-flight has no automatic
  retry or replay; real input cannot be filtered by body similarity. Diagnostic
  identity-only public restrictions and the unaudited codec are not product policy.

Anonymous **read-only** primary-source check of [Anthropic#101742](https://github.com/anthropics/claude-code/issues/101742)
at **2026-10-14T09:10:28Z** via GitHub issue/comments API: **OPEN**,0 comments,
upstream `updated_at` **2026-10-13T10:46:27Z**. Thus no upstream answer there to
resolve the sampled291 occurrence-custody gap. This does not establish that no
contract exists elsewhere, nor admit another engine/version. No posting/workflow
or credential access; two public HTTP reads are separate from the prototypes'
zero-external-network evidence. Private source snapshot:
`/private/tmp/neoflow-wf259-upstream-after-occurrence.json`.

**Next useful gate:** design a bounded zero-model native bootstrap/root/fact/lease
proof, then obtain explicit operational approval before touching a native process
or genuine existing conversation. It must never submit a prompt, read transcripts/
messages/credentials, bypass permissions, adopt an unrelated session or invent
helper authenticity from a socket/role/self-signature. If actual native facts or
trusted root enrollment are missing, stop—do not promote another offline fixture.
Further model acceptance requires a NEW funded budget;8/8 remains exhausted.

## Native bootstrap design gate — exact291 declarations review, 2026-10-14

No native process launched. Read the retained exact291 generated declarations
(SHA256 `c05419d753bc81d991ddec4b66af17a9172f498e59d28fad07a8e676635c07ce`)
under correlation fixture `1791886643138-20248/observer/.claude-plugin/types/claude-code/index.d.ts`.
Primary contract facts, NOT new live observations:

1. **A Mod-spawned helper stream is not equivalent to owning Node IPC.**
   `$.process.spawn` (3430–3500) permits `process.spawn` hooks to interpose on
   chunks; its example explicitly rewrites output above another plugin's spawn.
   Request is itself hook input (6928), result output (7059); argv/cwd/env/input
   cross that method seam. Native plugin origin cannot turn a helper's self-signed
   stdout hello into protected root enrollment. Do not carry over the Node
   `ensureWorkspaceRuntime` captured IPC custody argument to this stream.
2. **No persistent bidirectional owning pipe is declared by spawn input.**
   `ProcessSpawnRequest`7838–7870 takes a STRING written to stdin, then closes it.
   Streaming output/lifetime support does not grant a private persistent command
   channel. Existing public socket/role/name discovery cannot fill this gap.
   A helper can potentially be an untrusted relay only; trusted helper authority
   requires a separately demonstrated owning path. No silent transport substitution.
3. **Metadata methods are hook-facing.** `session.id/root/repo/version` appear
   in declared method hook inputs6668–6711 and outputs6968–6989. No reviewed
   non-interposable, engine-sealed fact contract has been established here.
   Current sampled guard observations remain evidence for that isolated profile,
   not proof against hostile method interposition. Need supported native facts or
   a reviewed frozen whole-hook-chain policy before authentic fact/lease admission.
4. **`$.ui.ask` is not by itself genuine user approval.**2364–2380 declares a
   `tool.call` through every hook except the caller and rendering via `ui.render`.
   A returned choice cannot alone establish genuine rendered surface/user input
   custody; remote/fabricated approval remains refused. Toast docs2382 onward
   promise transcript/model untouched, not authentic reciprocal root comparison.
5. **Crypto/lifetime are separate proof obligations.** Previous291 Mod source
   exercised `crypto.subtle.digest(SHA256)`, not protected key generation/signing/
   non-exportability. Spawn declares child lifetime ends on loop exit/unload/abort;
   neither declaration proves helper/root/lease lifecycle custody under the full
   proposed native profile. Missing evidence stays unavailable, not a fixture label.

[Official Mods API](https://code.claude.com/docs/en/plugins/mods/api) and
[build-specific types guidance](https://code.claude.com/docs/en/plugins/mods/create#get-the-types-for-your-build)
are context; exact291 declarations above own these build-specific claims.

**Do not yet implement a native grant receiver against guessed bootstrap trust.**
First settle a protected genuine Mod-root/fact/UI enrollment path and reviewed
interposition policy. Prefer authority inside the actually trusted loaded Mod;
never make a rewritable helper stream or remote approval attest that Mod. This is
an unresolved design option, not an admitted relay/helper architecture.

Only then scope an explicitly approved zero-model operational diagnostic:
no prompt.submit/sendUserMessage/tools/model requests/transcript or credential
reads, no real-store writes/adoption/permission changes. Actual build/session/
checkout/declared profile guards; content-free results; root/helper/key/session
loss fences/fresh pairing, no replay. If it cannot establish owning facts/root
before semantic/native/context use, stop. Full Direct still additionally needs
#101742 receipt→turn custody and a new funded acceptance budget.

## Bootstrap contract review outcome — 2026-10-15

[Focused primary-source review and sanitized upstream question](claude-native-mod-bootstrap-contract-wf259.md).
Six first-party docs read; exact291 declarations remain authoritative for291.
No protected COMPLETE ordinary-Mod enrollment path established; this is not an
impossibility claim. Do not implement a native grant receiver from assumed trust.

- Standard Web APIs include `crypto.subtle`: keeping keys inside the actual
  trusted Mod could remove helper-root custody from the path, with helper only
  untrusted relay. Algorithms/non-exportability/isolation/lease/genuine enrollment
  remain unproved. Earlier private child I/O crypto delegation is a conditional
  offline shape, NOT an established native protected pipe.
- Immutable `$`/`engine.create` does not make dispatch raw-core/private. Host-owned
  `next.origin`/`next.trace` are useful local callback facts, not an external root
  enrollment, actual whole-profile receipt or submit→turn association. Missing
  core entry stays unresolved; no trace is fabricated from a method return.
- `next.to` is policy-tier privilege, not an ordinary user-tier bypass. Current
  personal-settings exceptions require explicit separate policy choice; no tier,
  managed/user setting, permissions or extension admission changed here.
- Other Mods' input/press hooks precede native UI callbacks; public docs explicitly
  allow rewriting/answering there. A pane/private-looking callback does not fix
  genuine comparison. Built-in guard protects specified managed behavior, not a
  blanket Mod bootstrap. Current docs say Mods are NOT an OS sandbox.

**Next:** obtain upstream clarification of a protected Mod-root/fact/UI/profile-
lease contract, or explicitly review a different deployment trust policy. Sanitized
question was initially draft-only in this source-review phase (subsequently approved
and posted as#102463; see continuation below). No native/model/Claude-CLI/test execution, state/
transcript/credential reads or funded turn;6 anonymous public HTTP reads separate
from previous native-free proof counters. No new issue poll; latest#101742 record
is still2026-10-14T09:10:28Z.40 main Workspace files hash-identical, `4c01d63` clean.
No Direct/version/profile/product policy admission or automatic receiver work.

## Owner-directed Plannotator continuation — 2026-10-15

Approved sanitized bootstrap question posted as[#102463](https://github.com/anthropics/claude-code/issues/102463);
readback15:32:43Z OPEN/0 comments, approved body SHA256
`0bf140dc27b4e09476dca1ee444e7599e45831869cdb4e961859bbc06a4fcb18`.
No private artifacts uploaded; not an upstream answer or native-operation approval.
The owner also directed continued implementation following Plannotator.

[Fresh pinned source and implementation findings](plannotator-tui-claude-delivery.md#current-plannotator-follow-up--2026-10-15):
`b9870b4`, `prototype/wf259-plannotator-session-controller`, follows thin native
entrypoint/persistent controller.20 actual-entrypoint SYNTHETIC Engine snapshots,
exact291 TypeScript and interactive/EOF controls pass. Lifecycle/late-callback
fencing and ordinary input/tool/permission transparency are implemented, not a
receiver/signing/crypto extension. Reported metadata/source is never authenticated;
all authority/attached/available/publisher fields remain false. No lazy adoption.

Four pinned pure Plannotator turn-bookkeeping controls show body/snippet matching,
foreign-buffer eviction and text-based cancellation cannot supply Neoflow causal
custody. No actual native event/abort reproduced; not an upstream vulnerability
report. Follow its architecture, not bearer-root trust, restored ownership or
heuristic native evidence. Existing owning Message occurrence `4c01d63` is unchanged
and NOT wired to an unauthenticated native endpoint.

0 native/model/publication/real Workflow writes in captures; all40 main Workspace
hashes unchanged. No native CLI validation, real session/transcript/assistant/
credential read, permissions/policy/version change, dependency install or merge.
The earlier pause-only next step is superseded by bounded scaffold work, NOT by a
native grant receiver or production admission. Bootstrap and turn-join gates remain.

## Nonblocking lifecycle continuation — 2026-10-15

[Source/fault captures](claude-native-mod-controller-lifecycle-wf259.md), `820c4a8`,
`prototype/wf259-controller-nonblocking-lifecycle`:3 prior-source faults reproduced
synthetically (startup waits, consumed registration ticket, throwing cleanup).
14 fault/20 adapted lifecycle/4 pure-source controls and exact291 compile pass.
Startup observations/registration are now deferred; registration keeps its ticket;
exact work owns timer cleanup. Late failures/finally cannot revive or clear new
work. Cooperative clock timeout is NOT authenticated time/lease/cancellation or
native refusal evidence; a late registration could still have installed a command.
All authority/available/publisher fields remain false; no receiver or sender.

Latest public checkpoint20:11:03Z: both#101742/#102463 OPEN/0 comments (two anonymous
GETs).0 native/model/publication calls;40 protected main hashes unchanged. No native
CLI validation, user data/state/transcript/credentials, permissions/policy/version
change or new funded turn. Native authentication/turn-join gates unchanged.

## Source facts / seam placement

- [`lifecycle.ts`](../../packages/local-runtime/src/lifecycle.ts), `spawnRuntime`,
  already launches the known runtime entrypoint with private Node IPC and sends
  `runtime.start`. But `detachChild` closes that startup IPC; successful existing
  discovery returns without any owned child enrollment. Compatibility hashes and
  endpoint roles are not private-key/code-possession evidence.
- [`apps/neoflow/src/launcher.ts`](../../apps/neoflow/src/launcher.ts) opens the
  Reviewing UI using that generation-scoped ordinary runtime session. Therefore
  calling a UI “trusted” is not enough: its runtime-root/control enrollment must
  be authenticated, rather than displaying a key fetched from the socket it is
  supposedly authenticating.
- [`server.ts`](../../packages/local-runtime/src/server.ts),
  `RemoteReviewedHarnessAdapter.#perform`, is the existing private callback reached
  by the Workspace post-commit semantic seam. The real private committed-grant
  producer still belongs there/at that owned reviewed Adapter, not a general
  sign endpoint, arbitrary prompt RPC, Node helper inspecting Workflow records,
  Reviewing callback or a second runtime.
- [`harnessAdapter.ts`](../../packages/local-runtime/src/harnessAdapter.ts) has
  role/private-endpoint bootstrap and directive/evidence plumbing. This candidate
  adds no shared context bag or production frame/profile to those Interfaces.
- Exact291 `CommandRunInput`, generated lines1743–1769, carries engine-set
  `origin` and says a plugin's command call has plugin origin. Native local intent/
  confirmation must be a genuine composer action (or separately reviewed bridge
  path), not an external caller's source label. That declaration is a candidate
  integration fact, not a live source/physical-UI proof in this stage.

## Conditional design choices

### 1. Authenticate both roots through one explicit pairing ceremony

Neoflow and the native Mod each require local intent. Introductions have bounded
self-proofs but remain untrusted. Both genuine panels show the same128-bit grouped
fingerprint of the **whole** transcript, plus exact scope. Local confirmations
compare against the **other genuine surface**, never against a code supplied by
an endpoint or an unlabeled approval button. Both must confirm before peer roots
become trusted. There is no remote `approved:true`/confirm RPC.

This is one initial, explicitly user-driven ceremony, potentially with two local
confirmations, not a per-Message action. It remains a UX candidate requiring
operator validation; do not equate it with an already-proved one-command Pi flow.
Installation alone is unpaired and cannot publish. Signing ownership authenticates
only a verified owner key; code/session facts must still be locally measured by
reviewed owners, not asserted by peer metadata.

### 2. Private memory ownership; no root/key file workaround

Runtime owns its publisher signing root per Workspace/runtime generation. The
native Mod owns a bounded helper lease and its private signing root per live
session/epoch/helper occurrence. Native measurement/control belongs to the Mod;
private child I/O delegates crypto, never a local listening signing endpoint or
model host. Roots are not shared credentials; private keys are not put in files,
arguments, logs or model text.

The process proof demonstrates this custody shape with real Node children, but
hardcodes native/runtime facts and automatically simulates the trusted UI actions.
It does not integrate the real daemon or native process/loader. Normal transport
loss can retain roots; owner/key/memory loss, unload, code/build change, session
replacement or /clear epoch requires explicit fresh pairing. Do not recover trust
from unchanged labels or silently substitute a destination. Key zeroization is
best effort, not hardware attestation or a process-memory compromise defense.

### 3. Encrypt after authenticating; role-owned authority is still separate

Signatures without encryption would let a transparent relay observe later Review
bytes while forwarding valid authorizations. The fixture derives sender-separated
channel keys with X25519 + transcript-bound HKDF and authenticates headers and
ciphertext with AES-GCM. Pairing fingerprints are public, not secret bearer tokens.

Fresh signed opening/answer/ack/ready challenges bind pinned roots and the exact
pair. Old channels, challenges and ciphertext cannot restore activity. Counters
reject duplicates; authenticated sequence gaps fence the channel, not buffer or
retransmit it. Monotonic local deadlines and bounded no-eviction tombstones prevent
expired/saturated attempts from weakening replay protection. A new control channel
restores availability only; it settles or resumes no Invocation.

Only fixed ping/pong crosses the fixture. Even a cryptographically paired caller
cannot request Message publication or submit normalized evidence through it. Real
messages must still come from the closed post-commit publisher with exact signed
one-use authority; real evidence requires the genuine native controller/turn join,
role-owned authentication, stable IDs and durable Workspace acknowledgments.

## Concrete integration prerequisite uncovered

Extend the **existing owning-runtime startup exchange**, not the public role/
`execute` protocol, to hand the genuine launcher/UI only the runtime public root
and enroll a narrowly scoped UI control public key. The root arrives over the
private owned process channel from known loaded code, not generic discovery.
Retain a protected control lease or derive an authenticated continuation from
those pinned roots. Never expose pairing approval on an ordinary socket with
`role:'tui'` or a claim of the right code hash.

An already-running runtime without authenticated owner enrollment is **pairing
unavailable**. Re-enrollment through an already pinned owner or deliberate
single-runtime replacement needs a reviewed policy/explicit user action; this
prototype does neither. It must not start a parallel host, quietly kill/restart
the existing owner, use a same-UID/key-file token workaround, or replay Workflow
activity. The existing independently retained runtime lifetime must be preserved;
losing a UI-control lease is not permission to terminate the whole Workspace.

On the native side, the equivalent prerequisite is genuine composer/Mod UI input
and a bounded parent-held helper control lease with measured current native facts.
Self-signed context/code labels are not attestation. Current fixtures isolate these
facts and callbacks so the untrusted wire cannot invoke them, but their real
provenance remains a named acceptance gate.

## Threat coverage and limits

Covered under trusted-owner/UI assumptions: unrelated callers copying all labels/
public metadata, making their own keys, mutating scope, forwarding encrypted
traffic, injecting approval flags, replaying or reflecting signed/ciphertext
frames, changing source identity/lease, and presenting valid foreign keys.
Substituted native/runtime roots fail comparison against the genuine panels.
Wrong signed workspace/canonical Git facts fail before review; code/build/session/
epoch/runtime-generation/helper changes invalidate rather than rebind.

Not solved: malicious modification of trusted programs, stolen process keys,
debug/memory access, hostile UI rewriting by other Mods, compromised OS/control
lease, a user comparing the wrong/fake panel, actual canonicalization/Native API
fact acquisition, policy or native availability, actual authoritative commit
publisher, full schema/framing compatibility, durable evidence recovery. These
must be reviewed/admission-gated; do not silently narrow Native Dispatch Provenance.

No receipt-to-turn association is manufactured by pairing. Native291 Direct
continues unavailable while
[Anthropic #101742](https://github.com/anthropics/claude-code/issues/101742)
awaits a supported custody contract. This stage did not poll or mutate the issue.

## Next bounded implementation

1. Review the ownership/enrollment policy and one-ceremony UX, especially existing
   independently running owners. Keep the generic public role protocol incapable
   of enrolling a UI or approving a pair.
2. Cold owned startup is captured at `408360a`; `2c67276` binds UI Workspace
   calls to owning IPC; `2a432d9` authenticates the actual post-commit DTO. Review
   genuine UI/retained-owner/CLI/editor policy before production. `205b8c6`
   captures Message pre-native refusal; `4c01d63` binds actual owning Message/
   receipt occurrence without changing the normalized Directive. Review private
   host enrollment, receiver/helper root/lease, durable evidence/restart next.
   No arbitrary sign endpoint, store reconstruction or automatic promotion of
   diagnostic formats; native publication/evidence disabled.
3. With separately approved operator/native scope, prove genuine existing-session
   UI comparison, context measurement, helper key/lease custody and disconnect/
   unload behavior. No funded native turns are currently authorized.
4. Only after the independent native join contract is established, connect the
   owned post-commit grant producer and normalized durable evidence path and seek
   a focused end-to-end acceptance budget. No silent fallback or replay.

### Offline commands

```sh
sh /private/tmp/neoflow-wf259-trusted-pairing/packages/claude-adapter/prototypes/wf259-trusted-pairing/run --demo
sh /private/tmp/neoflow-wf259-trusted-pairing/packages/claude-adapter/prototypes/wf259-trusted-pairing/run --process-proof
# omit flags for the small interactive fixture UI
```
