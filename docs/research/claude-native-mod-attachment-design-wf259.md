# WF-259: offline Direct attachment authority and custody design

## Result — 2026-10-07

The owner approved **design/offline work only**, after the8-turn live budget was
exhausted. A throwaway interactive model and19 scripted scenario snapshots are
captured on `prototype/wf259-direct-attachment-state`, **`36d35c6`**, at
`packages/claude-adapter/prototypes/wf259-direct-attachment-state/`.

Actual Node Ed25519 verification refuses altered signed bytes, foreign issuers,
and uncommitted signing requests. One-use custody, single-flight, fenced reconnect,
no substitution/replay, and unresolved loss can be exercised in memory. **These
are model observations, not production tests or end-to-end native evidence.**

Two production gates remain explicit:

1. Authenticate/bootstrap the runtime publisher and native helper/evidence
   channel; a constructor-pinned key in a fixture is not real root custody.
2. Prove native dispatch-to-turn custody without text/timing inference. The
   current public291 Interface does not supply a documented occurrence join.

The **observed291 profile refuses before publication**, even with a valid signed
grant. A separate **HYPOTHETICAL-native-join** mode demonstrates the desired
lifecycle. It invents no supported Claude option, silently downgraded profile,
model-visible correlation marker, or production capability admission.

## Keep the existing semantic seam

```text
Reviewing → Workspace/Harness Interaction: exact consent + atomic commit
                  ↓ existing ReviewedHarnessConnection.perform(directive)
       runtime-side Claude Adapter private grant publisher
                  ↕ authenticated, lease-fenced Adapter-private transport
       Node helper + Mod in the exact explicitly attached native session
                  ↓ native submit({ text, asUser:true })
                  ↕ source-joined native turn identity / normalized evidence
```

Workflow callers and semantic directives learn no signature, helper, socket,
credential, native turn ID, or new context bag. The native Module retains normal
Claude permissions/tools; the runtime does not become a model host or launcher.
The intended interaction stays one explicit attachment to an **existing**
interactive conversation, followed by persistent connection and ordinary Send.
No per-Message command, User Pull substitution, background process creation,
terminal delivery, or WF-258 private inbox enters this design.

### Repository facts grounding the design

- [`ReviewedHarnessAdapter` / `ReviewedHarnessConnection`](../../packages/workspace/src/harness-interaction/contracts.ts)
  already carry `connect(sink).perform(committedDirective)` and normalized evidence.
  The Review Message directive freezes Attachment/Handoff/Invocation, Capability
  Snapshot, and exact outgoing material. There is no generic publish-context bag.
- [`HarnessInteraction.#performAfterCommit`](../../packages/workspace/src/harness-interaction/harnessInteraction.ts)
  calls the Adapter after commitment. This is the signer authority origin to
  preserve, not a socket caller's assertion of durability or consent.
- [`RemoteReviewedHarnessAdapter.#perform`](../../packages/local-runtime/src/server.ts)
  is the existing runtime-side private send point. A candidate private signing
  wrapper belongs there/at the reviewed Adapter role, not in Reviewing or a
  second runtime. No production wrapper/frame change is made here.
- [`connectHarnessAdapterRuntime`](../../packages/local-runtime/src/harnessAdapter.ts)
  validates a private endpoint and bootstrap workspace/role, then receives
  directives. Those checks remain useful hygiene; they do not implement the
  candidate signed-grant/real key-root guarantee. The classic
  [`SocketClaudeBridgeHost`](../../packages/claude-adapter/src/bridge/socketHost.ts)
  is short-lived `cli` User Pull/hook transport, not a persistent Direct publisher.
- Pi's [extension](../../packages/pi-adapter/src/extension.ts) establishes one
  explicit attachment and retries availability without adopting a new session.
  Its mechanism is not transplanted as native Claude correlation proof.

## Candidate authorization shape — conditional, not admitted

A runtime-owned publisher resolves one already-committed Invocation through the
owned semantic callback. It may issue one bounded grant, and **must not expose
an endpoint that signs caller-supplied prompts, arbitrary directives, or
`committed:true` flags**. Existing durable state remains the authority source;
the Mod/helper cannot browse or reconstruct it.

The grant binds exact Message bytes/digest, Handoff/Invocation, Attachment/frozen
Capability, workspace/canonical Git root and directory, native session/epoch/
version, runtime generation, connection occurrence, and one dispatch occurrence.
The receiver validates its pinned root, exact frozen contract and current native
facts, consumes valid occurrences once, and calls only the native exact-text
submission path. Signatures/IDs/receipts/authority metadata remain local, never
model text. A grant rejected as busy/unavailable cannot later replay the same
Invocation. There is no Adapter-owned delivery queue.

**Required trust bootstrap is not settled.** A reviewed installed root or a
one-time explicit pairing from the trusted Neoflow UI with fingerprint
confirmation are candidates, not accepted choices. Pinning a key fetched from
the untrusted endpoint itself is circular. Same UID, owner-only files/sockets,
claimed labels, nonces, or a shared bearer token alone do not establish the
required provenance. The real design must establish both publisher authenticity
and native-helper/evidence authenticity, including attachment-role attestation,
helper lease ownership, key rotation/loss, and hostile same-user frame cases.
It must not pretend to defend arbitrary modification of trusted code or stolen
process keys; the exact threat assumptions require review, not silent narrowing.

The prototype's runtime ledger is an in-memory fixture, its directive a deliberate
slice of the shared type, and its trust root constructor-injected. Production
requires full DTO/profile validation, actual atomic post-commit authority,
authenticated bootstrap/control/evidence frames and durable acknowledgments.
A mathematically valid signature does not make those omitted guarantees true.

## Correlation: do not invent the missing fact

Authoritative generated291 declarations from the earlier live run:
`/private/tmp/neoflow-wf259-native-live/1791299155104-14164/plugin/.claude-plugin/types/claude-code/index.d.ts`,
SHA-256 `c05419d753bc81d991ddec4b66af17a9172f498e59d28fad07a8e676635c07ce`.
[Official guidance](https://code.claude.com/docs/en/plugins/mods/create#get-the-types-for-your-build)
says these build-generated declarations outrank GitHub/docs copies.

| Declaration | Available fact / remaining gap |
| --- | --- |
| `PromptSubmitArgs` / `PromptSubmitResult` (8702/8789) | Exact text and engine-set plugin origin; result has text/context/origin or drop, **no new native turn ID**. |
| `TurnStartInput` (12982) | Text and minted native turn ID, **no submitted occurrence/source origin**. |
| `Origin` (7081), `next.origin`, `TraceEntry` (12826) | Native plugin/tier and per-event chain trace; no documented cross-event occurrence-to-turn identifier. Do not assume a nested causal link. |
| `UserPromptSubmitHookInput` (14221) / `BaseHookInput` (786) | Optional classic prompt_id, broad optional user/system/etc source; no documented relation to this exact module call or its native turn ID. It remains a research candidate, not a passed join. |

Equal outgoing text, one pending Invocation, API-call timing, or native turn
start/end observed in isolation cannot establish that relation under identical
ordinary user input/interleaving. The model's abstract observational
counterexample is **not a demonstrated actual engine race or impossibility
proof**; a reviewed causal/ordering contract could make the join sound. The
existing live traces show submit return before *and* after native start, so do
not replace a proof with a fixed return-order assumption.

A supported engine-owned submission handle, a returned exact native turn ID,
source-bearing start/occurrence, or a proven causal/ordering contract could close
this gate. Lifecycle evidence may arrive after start; that is distinct from the
requirement to authenticate dispatch authority **before publication/context/tool
use**. Post-submit text matching cannot supply authority. No model-visible marker,
secret, transcript read, or temporary suppression of normal composer input is
selected to manufacture correlation.

The hypothetical native fixture emits an occurrence+turn fact and demonstrates
how the controller would use it. That field is **not** asserted to exist in
Claude291 and is never passed as an unsupported `$.prompt.submit` argument.
The default observed profile remains unavailable with zero publications.

## Offline state walkthrough

- Explicit establishment binds identity only, never standing Message consent.
- A private committed-ID lookup precedes signature issuance; foreign signatures
  or modified bodies fail before any additional native publication.
- Bytes are validated as canonical base64/fatal UTF-8 and exact digest/size,
  retaining CRLF, BOM, combining Unicode and emoji; no text wrapper/file fallback.
- Duplicate signed deliveries are fenced once, including pre-native refusal.
  Identical bodies in distinct explicitly committed Invocations have distinct
  custody under the hypothetical join, not a content-addressed identity.
- Native ordinary-user fixture input stays separate even when body matches;
  native peer refusal is modeled only, not added to the prior live peer evidence.
- One pending call owns the slot. Another delivery is rejected, not queued.
- Disconnect after crossing native-call custody is unresolved, never rejected,
  retried, retargeted, or repaired from late events/native history.
- Same identity and a fresh authenticated-channel fixture restores availability
  only; old channel grants stay invalid and old tombstones remain. Session,
  canonical Git-directory, runtime-generation/root changes are not substitution.
- A native failure maps to failure with exact hypothetical turn custody. Abort
  stays unresolved; no interruption/cancellation Capability is inferred.
- Actual Workspace duplicate-execution risk assessment, durable evidence acks,
  process restart/memory-loss behavior, native scheduling/permissions, and real
  authenticated reconnect are **not** implemented by this memory model.

## Native diagnostic follow-up — 2026-10-13

[Exact291 zero-model findings](./claude-native-mod-correlation-wf259.md), source
`2ebd63d`, now test the suggested classic-ID/caller path against the real native
pipeline. Isolated1-call control has1 later turn; overlapping3-call and separate
single-flight-per-producer2-call cases each return successfully with only1 later
start/end observed. Classic prompt IDs differ from turn IDs, start caller is
engine, returns expose no checked join. This rejects those simple candidate
joins, not every possible causal Interface. All6 native steps were synthetic
short circuits,0 requests reached even the local gateway blocker, no tools.
The owner subsequently approved posting the narrow upstream question/receipt
proposal as [anthropics/claude-code#101742](https://github.com/anthropics/claude-code/issues/101742).
It awaits an authoritative contract answer; no private artifacts/branches were
uploaded. Native pairing/root/evidence authentication still needs independent
design/proof.

## Trusted-pairing candidate follow-up — 2026-10-13

[Pairing findings](./claude-native-mod-trusted-pairing-wf259.md), source `f75106c`,
select an explicit genuine dual-surface comparison candidate with per-owner
memory keys and fenced encrypted control only.46 asserted offline scenarios and
actual two-child key custody pass; no native/model/network/Workflow operation or
Message/evidence publication. This replaces constructor-injected peer trust with
an explicit out-of-band trust assumption, not a proven physical UI/bootstrap.
Existing runtime startup IPC is currently detached and discovered-runtime role/
code claims are not root authentication. Genuine launcher/UI owner enrollment,
native fact/lease acquisition and published-grant authority still require real
integration/proof. Do not promote this custom codec or establish a Capability
because pairing succeeded; the native occurrence join is independently open.

## Next bounded work

1. Investigate the native join candidate with exact generated contracts and
   targeted offline engine/source evidence; if no supported contract can be
   established, request an upstream stable submission-to-turn handle rather
   than weaken the Capability or waste funded turns on a timing heuristic.
2. Settle explicit pairing/root custody and bidirectional evidence authentication
   with a reviewed threat model and runtime-owned publisher placement.
3. Only then implement a bounded real persistent attachment bridge on the
   prototype branch and seek fresh approval for operator-driven end-to-end proof.

No production Module Interface, reviewed Manifest/version, authoritative glossary,
Workspace implementation, real workflow store, CLI, model, network/socket,
credential, transcript, assistant text, tool, or permission policy changed in this
stage. Existing40 unrelated Workspace edits stay untouched. The prototype source
stays off main; main contains only these findings and issue pointers.
