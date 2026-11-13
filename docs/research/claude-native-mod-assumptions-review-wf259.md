# WF-259 — challenge the trust and turn-custody assumptions

## Outcome — 2026-10-19

**We can continue without waiting for an issue reply.** The next useful decision
is the trust contract, not another registration-confirmation test. The owner
subsequently confirmed the trusted-code basis for continued candidate design
[below](#owner-confirmed-design-baseline--2026-10-19). This does **not** enable Direct
or change the deployed policy, Capability contract or reviewed-version admission.

Two different things were being treated as one blocker:

1. Resistance to **malicious installed Mods** is stronger than Claude's documented
   baseline. Trusting installed code is a plausible explicit alternative, not an
   impossibility result that must await a new native primitive.
2. Correct association of a Neoflow Send with its native execution remains a real
   requirement even with honest Mods. Normal user input and independent producers
   can overlap; trusting them does not supply an occurrence identifier.

Recommendation: review an **explicit trusted-installed-code profile**, preserving
external caller authentication and exact committed-message authority. Separately
continue investigating a supported causal join. Do not promise that the trust
choice alone makes Direct implementable.

## Scope and source custody

Read-only review, **2026-10-19T08:34:21Z–08:36:03Z**. Thirteen anonymous public GETs:
11 documentation/index pages, one GitHub file-history request, one pinned public
declaration file. No credentials, public writes, Claude CLI execution, native
session adoption, prompt/model/tool calls, policy changes or funded operations.
The two issue reads at08:30:25Z belong to the preceding
[upstream checkpoint](claude-native-mod-controller-lifecycle-wf259.md#read-only-upstream-recheck--2026-10-19),
not this source review.

Source copies and URL/hash inventory:
`/private/tmp/neoflow-wf259-assumptions-review/sources.json`.
All six previously reviewed Mod guides changed since October15; their diffs add
VS Code rendering/typography, clarify plan-mode permission behavior and network
policy, or edit wording. Those diffs supply no submission-to-turn receipt or
protected pairing contract. This is a comparison of these pages, not all releases.

Public declarations are pinned to
[`bf2323b3021c9d3db7a31e1e7d61068c3f704497`](https://github.com/anthropics/claude-code/blob/bf2323b3021c9d3db7a31e1e7d61068c3f704497/mods/types/claude-code.d.ts),
last file change2026-10-13T04:34:03Z, SHA256
`e51e637fbbebb2a6a49c4bdc3860a251c2ca2295884822dff0f4c3e3ec802163`.
It still lacks the exact291 `asUser` option already captured in generated types.
It is **not** a new tested build or a replacement for generated declarations:
[official precedence rule](https://code.claude.com/docs/en/plugins/mods/create#get-the-types-for-your-build).

Exact291 claims below use the committed public declaration excerpts at `2ebd63d`,
`packages/claude-adapter/prototypes/wf259-native-correlation-contract/evidence/native291-contract-excerpts.txt`,
and the qualified [native diagnostic](claude-native-mod-correlation-wf259.md).
The earlier scratch full-declaration path used by the prototype typecheck is now
missing; it was not regenerated. No current typecheck or native compatibility
verification is claimed.

**Implementation follow-up:** approved isolated control integration is captured
at **`6a16bd8`**. [Findings and verification](claude-native-mod-control-pairing-integration-wf259.md)
connect the native-shaped callbacks to an actual enrolled writer using the same
diagnostic protocol, with a WebCrypto port for the Mod import graph. No native
execution or stronger native identity/turn claim follows. This supersedes the
prepare-only next step below, not its admission/operational constraints.

## 1. Which assumptions can change, and at what cost?

| Requirement or assumption | Finding | Consequence |
| --- | --- | --- |
| One explicit attachment to the intended existing conversation/checkout | User's product requirement, not an incidental scaffold choice | Keep; no auto-adoption, managed replacement or per-message pull substitution |
| Exact committed Message is the only Neoflow publication authority | Existing semantic/provenance requirement | Keep; installation/pairing does not authorize arbitrary bodies |
| Arbitrary local callers and native peers cannot inherit that authority | Independent of whether installed code is trusted | Keep authenticated owning-runtime ingress and native source policy |
| Survive a malicious installed Mod rewriting facts/UI/process output | Stronger than Claude's baseline plugin trust model | Could become an explicit unsupported-environment assumption; requires user approval |
| Cryptographically attest every loaded hook/profile generation | Needed by the proposed hostile-chain design, not inherently by every extension integration | Do not demand this of a trusted-code option while pretending it is a universal native prerequisite |
| Matching reported scope proves authentic/atomic identity | False under the hostile-chain design; still not an atomic snapshot under a trusted chain | Never promote the current startup diagnostic into that claim |
| A successful submit is the exact new turn's identity | Neither reviewed declarations nor prior overlap evidence establishes it | Keep unproved; installation trust does not fix it |
| Unknown evidence permits retry or guessed completion | Contrary to the existing semantic contract | Keep unresolved/no replay |

The existing [WF-259 scope](../../.issues/WF-259-prove-claude-direct-attachment-through-a-native-mod.md)
and [Harness Interaction seam](../blueprint/harness-capability-seam.md#no-silent-fallback)
still govern. This table distinguishes possible policy choices from changes already
approved; it does not rewrite them.

## 2. Trust installed code, without trusting every local caller

### Primary-source facts

- [Mods overview: what a Mod can reach](https://code.claude.com/docs/en/plugins/mods/overview#what-a-mod-can-reach)
  says Mods run with the user's permissions, can read secrets, change prompts,
  approve tools and spend usage, and are not sandboxed.
- [Plugin security](https://code.claude.com/docs/en/plugins/security#understand-what-a-plugin-can-do)
  distinguishes Claude's tool permission/sandbox checks from plugin code, whose
  own processes run outside that sandbox. Trusting installed code is an explicit
  part of the documented model, not a security property supplied by a socket.
- [Mod method dispatch](https://code.claude.com/docs/en/plugins/mods/api#reach-files-processes-and-the-network)
  and [hook semantics](https://code.claude.com/docs/en/plugins/mods/events#how-a-hook-handles-an-event)
  permit interception and rewriting. A trusted Mod can also accidentally change
  behavior; trust is not compatibility or exact-byte proof.
- [Worker failures](https://code.claude.com/docs/en/plugins/mods/troubleshoot#it-crashed-the-hooks-worker)
  document that installed Mods share a worker. The built-in guard protects
  [specified managed behavior](https://code.claude.com/docs/en/plugins/mods/admin#know-what-happens-by-default),
  not general isolation between every pair of installed Mods.

### Design inference, not a newly accepted policy

An ordinary trusted-installed-code option could rely on the genuine Mod's methods
and comparison surface **under the assumption that the loaded code is trusted and
compatible**. It would not claim resistance to a malicious Mod controlling that
surface. The operator would maintain that trust; Neoflow would not claim to have
certified a complete immutable profile when no such evidence was obtained.

That removes the need to authenticate *around* an adversarial middleware chain.
It does not authenticate an arbitrary socket endpoint, a fetched self-signed root,
a copied plugin name, or a same-user caller. The existing owning-runtime/post-commit
custody and explicit reciprocal root comparison remain useful. The difference is
that the Mod-side surface/facts would have a declared trusted-code dependency,
rather than a fictitious protected path through hostile code.

Smallest candidate shape, still unimplemented:

```text
existing semantic post-commit callback → owning runtime authenticator
                       ↕ exact scoped authenticated grants/evidence
                Mod-local authority and lifecycle owner
                       ↓ session-local native submission
```

Keep native method spelling and native result handling local to the thin entrypoint;
keep the persistent controller responsible for local state. A helper may relay
traffic, but may not become an arbitrary signer, Workflow reader or second runtime
host. No new shared-context Interface is justified by choosing trust.

### Change and loss still matter

[Reference session events](https://code.claude.com/docs/en/plugins/mods/reference#session)
say module reload reruns startup, while clear/resume/branch end the old window
without a new startup. [Troubleshooting](https://code.claude.com/docs/en/plugins/mods/troubleshoot#mods-that-run-in-the-hooks-worker-are-off-for-this-session)
describes worker-wide unload after repeated crashes. These support investigating
fresh in-memory pairing on load and fencing on loss, not silent restoration.

[Plugin loading](https://code.claude.com/docs/en/plugins/loading#when-auto-update-runs)
distinguishes on-disk updates from the running set; other paths, including command
sources and development hot reload, can reload during a session. Do not claim
that disabling one updater or observing one registration freezes the whole chain.
A host-clock heartbeat can detect cooperative loss, not certify a protected lease
or retract a native call already made. Loss after publication remains uncertain.

## 3. Recheck the alternative turn-tracking candidates

| Candidate | What its owning source establishes | Remaining gap |
| --- | --- | --- |
| `$.prompt.submit` return | Exact291 excerpt `PromptSubmitResult`: text/context/origin or drop; public pinned types lines7261–7314 explicitly permit queued resolution | No returned native submission/new-turn identifier; acceptance is not terminal evidence |
| `PromptSubmitInput.turnId` | Exact291 excerpt: identifies a turn already running; absent for a plugin's own submission | Cannot name that submission's later new turn |
| `turn.start` and `turn.complete` | Exact291 excerpt plus [turn guide](https://code.claude.com/docs/en/plugins/mods/events#follow-a-turn): turn ID joins native lifecycle events | No joining identifier from this exact committed Send to that start |
| `next.origin` | Pinned public `Next` lines5297–5308: host owns the dispatch caller stamp | Caller identity is not an occurrence ID; starts in earlier diagnostic identify engine, not producer |
| `next.trace` | Pinned public `Next`/`TraceEntry` lines5310–5319/10468–10511: links of this dispatch, data not a cross-event handle | Useful local evidence, but no declared parent submission→turn relation |
| Classic `prompt_id` | Exact291 `BaseHookInput` excerpt: classic/OTel prompt-grain correlation | Different from turn ID is not itself disqualifying; the missing fact is a supported association from the authorized Mod call to this exact classic prompt occurrence |
| `$.session.turns()` | Pinned public types lines2370–2378: a count | Counts do not identify occurrences under overlap |
| Conversation rows/message IDs | [Reference](https://code.claude.com/docs/en/plugins/mods/reference#session): `session.append` observes/rewrites retained rows | No reviewed submit→row→turn join; observing/storing conversation rows would also expand the approved no-capture scope |
| Idle check + one pending Send | App-local serialization only | No documented atomic reservation against ordinary user input/other native producers; checking idle cannot establish that reservation |

The public [background-submit guide](https://code.claude.com/docs/en/plugins/mods/api#start-a-turn-from-a-background-job)
says the call waits until idle, starts a new turn and resolves at start. That
higher-level description is promising, but does not define cross-producer
association/disposition and is less precise than the queued-result declaration.
Prior exact291 overlap observations also prevent treating it as proof of an
unconditional one-return/one-new-turn guarantee. Do not resolve this discrepancy
by selectively quoting the more convenient sentence.

**Bounded finding:** this review found no additional supported join in these
sources. It did not search every possible mechanism or inspect private engine
implementation, and does not establish that an upstream change is necessary.
A supported causal/ordering guarantee would be sufficient; numeric turn IDs are
not the only acceptable design. Identical-body and interleaving controls must
still validate whichever contract is proposed.

## 4. Simpler product shapes are choices, not hidden fixes

| Option | What it buys | What it costs or still lacks |
| --- | --- | --- |
| Original hostile-chain profile | Strong protection against interposing installed code, if a supported protected path is found | Bootstrap remains unproved; turn join remains independent |
| **Trusted-installed-code profile — recommended for review** | Matches Claude's documented extension trust baseline; makes a conventional pairing design plausible | Explicitly excludes malicious loaded code; honest concurrency still needs a supported join and exact-byte/lifecycle proof |
| Managed policy deployment | Documented ordering/admission controls | Different deployment contract, not permission to promote a user Mod or bypass policy; still no submission→turn receipt |
| Submission-only delivery | Could report only that a native submission call returned, with outcome unknown | Does not meet the requested one-normal-turn-per-Send/tracked Direct contract; requires an explicit product/Capability decision, not a misleading completed status |
| Per-message user action, a second conversation or suppressed ordinary input | Can reduce some scheduling ambiguity | Changes the requested experience; not selected |

The current
[`DirectReviewCapabilityContract`](../../packages/workspace/src/harness-interaction/contracts.ts)
requires correlated lifecycle evidence (and other fields inherited from existing
Direct support). Its `accepted-for-observation` result is deliberately distinct
from start/terminal evidence. A submission-only option cannot masquerade as this
Capability by leaving an Invocation unresolved every time. No Interface or
Capability change is made here. The same type also requires direct-request
interruption and a Review Response Artifact contract, beyond this narrow WF-259
proof scope. Production design must reconcile those existing fields with the
Message-only candidate explicitly; no permission to capture assistant text or
implement cancellation follows from this review.

## Owner-confirmed design baseline — 2026-10-19

After clarifying that **our own reviewed code is trusted**, the owner confirmed
continuation on this basis: authenticate incoming requests; treat other installed
Mods as a compatibility/trust concern, not as hostile code this ordinary Mod must
isolate itself from. This is approval of the candidate's design assumptions, not
native execution, a managed-policy installation, production admission, or weaker
turn evidence. It does not declare every third-party plugin reviewed or harmless.

### What is now simpler

- Trust the known Neoflow UI/runtime/Mod implementation. Do not demand independent
  code attestation from our own callbacks or a cryptographic certificate of the
  entire installed hook profile before investigating ordinary pairing.
- Read native scope through the normal declared methods, under that explicit
  trust/compatibility assumption. Session/checkout/build checks still matter;
  repeated values still do not form an atomic snapshot or a protected lease.
- Use the trusted Mod's comparison/input surface for local enrollment. No attempt
  to bypass other Mods, promote to policy tier or repurpose permission prompts.
- Preserve real peer authentication. A request's role, UID, endpoint name, copied
  code hash or self-signed introduction does not prove it came from our code.
  Trusting the implementation is not trusting whoever calls its public Interface.

### Minimal pairing design, using the existing work

1. **Start unpaired.** Reuse the thin `7a450ed` entrypoint/persistent controller
   shape. Installation and successful registration do not attach or publish.
2. **Establish local intent.** An explicit native connect command plus the
   Neoflow UI starts one comparison for the existing conversation and canonical
   checkout. No discovery/adoption, arbitrary peer-selected scope or automatic
   startup pairing. Missing native facts stay unavailable.
3. **Authenticate the owners once.** Reuse the `f75106c` whole-transcript
   comparison: both keys/nonces, roles and locally obtained scope appear on the
   two trusted surfaces. Confirm against the other genuine surface, not an
   endpoint-supplied approval. Keep those confirmations local-only. This remains
   a candidate one-time UX, not a proven one-command or per-message flow.
4. **Use the real owning-runtime path.** `408360a`/`2c67276` already exercise
   private startup enrollment/control. An existing runtime without that owning
   path remains unavailable; do not replace it or fetch its own root as proof.
5. **Authenticate control only.** Reuse fresh scoped channel challenges; admit
   fixed control probes, not messages or normalized Invocation evidence. A relay
   has no authority to approve pairing or choose a destination. Prefer keys in
   the Mod; exact-build crypto support must be established before relying on it.
   Do not add another crypto codec or promote the hand-built fixture to production.
6. **Fence loss, do not repair history.** End/clear/resume, scope mismatch,
   reload/key loss and control loss invalidate pending local actions. Fresh owner
   memory needs fresh pairing. Ordinary channel reconnect can restore only
   control after exact scope revalidation; never consent, an old grant or outcome.
   No guarantee that a cooperative timeout cancels an already-issued native call.
7. **Keep Send separate.** The existing `4c01d63` post-commit occurrence is the
   candidate authority source for future message publication, not the connect
   action or a generic signing RPC. Pairing success does not enable that path
   while the native join and remaining admission gates are unproved.

Only the Adapter-private enrollment/control Implementation changes in this design.
The Workspace Interface, Consent Boundary, Attachment Identity, Invocation and
Native Dispatch Provenance keep their glossary meanings; no new domain term or
production Resolution is needed for this reversible diagnostic choice.

### Next meaningful proof, not another synthetic confirmation loop

Existing offline root-substitution/replay/local-confirmation controls already
answer their fixture questions. Do not repeat them as new bootstrap evidence.
The next useful native question is: can trusted ordinary Mod code retain a fresh
owner key, show/accept a genuine scope-bound comparison, and fence reload/loss
in a fresh disposable session, **with publication disabled**?

Prepare that control-only integration in isolation; do not load it into Claude
without separately explicit operational scope. A proposed proof must use a fresh
synthetic conversation (never adopt an existing user's session), exact native
identity checks, operator-driven comparison and content-free diagnostics. No
`prompt.submit`, model/tool call, transcript/assistant capture, terminal injection,
permission change, workflow-store read/write or funding is authorized here.
Failure to establish those prerequisites ends the attempt, not a retry/version
substitution. Continue causal-join research independently; trusting our code is
neither a native turn receipt nor approval of submission-only delivery.

This supersedes the preceding **blanket recommendation to park all work**, not
its recorded issue statuses or safety constraints. Source remains `7a450ed`,
receiver/publisher disabled, main production unchanged. All40 protected Workspace
hashes match the retained manifest. No test suite/typecheck was rerun, no new native
behavior was observed, and the8/8 funded allowance remains exhausted.
