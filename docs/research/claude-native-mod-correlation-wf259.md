# WF-259: exact native correlation diagnostic and upstream question

## Verdict — 2026-10-13

**The tested native291 origin/classic-ID/turn-ID candidate does not establish
exact dispatch-to-turn custody.** An isolated success is not enough: overlapping
native submissions produced successful API returns without one observed new
native turn per return or an authoritative association to the later turn.

This does not prove every possible native ordering design impossible. It does
rule out equating classic prompt IDs with turn IDs, treating start's caller as
the producer, using submit resolution as execution identity, and treating one
Neoflow pending slot as a unique cross-producer event window.

**Decision:** keep Direct unavailable; request a supported authoritative native
association/receipt or documented causal contract before building the bridge.
Do not relax the semantic seam, hide ordinary input, introduce a marker, capture
transcripts, replay ambiguity, or silently substitute User Pull. Runtime/helper
trusted bootstrap and evidence-channel authenticity remain independent gates.

## Authorization and primary sources

The owner approved this zero-model native diagnostic after the offline model.
The earlier8 funded model turns remain exhausted; **no additional funded turn**
was authorized or used. Six native loop steps across three fresh conversations
were explicitly answered by synthetic `turn.step` hooks, not a model.

Primary source capture: branch `prototype/wf259-native-correlation-contract`,
**`2ebd63d`**, directory
`packages/claude-adapter/prototypes/wf259-native-correlation-contract/`.
Its `README.md`, `register.ts`, `probe.mjs` and per-run `evidence/` contain the
method, exact staged registrations, ordered metadata and results. Main retains
only findings/issue pointers, never this diagnostic implementation.

- [Official event middleware/turns/error behavior](https://code.claude.com/docs/en/plugins/mods/events):
  `next` chains, synthetic streaming answers, classic hooks and fail-closed catch.
- [Build-generated types authority](https://code.claude.com/docs/en/plugins/mods/create#get-the-types-for-your-build):
  native generation outranks potentially older public copies.
- Exact engine291 declarations were generated for all loaded diagnostic plugins;
  each matches SHA-256
  `c05419d753bc81d991ddec4b66af17a9172f498e59d28fad07a8e676635c07ce`.
  Public declaration excerpts are captured under
  `evidence/native291-contract-excerpts.txt`, with original line numbers/hash.
- Earlier [authority/state design](./claude-native-mod-attachment-design-wf259.md)
  and [live native findings](./claude-native-mod-direct-wf259.md) remain qualified;
  the new diagnostic does not retroactively settle their acceptance gaps.

## What native291 declares

| Native declaration | Relevant contract |
| --- | --- |
| `PromptSubmitArgs`,8702 | Omits origin/current turn/wait/context; accepts `asUser:true`. No supported occurrence marker/handle is supplied by the caller. |
| `PromptSubmitInput`,8740 | Engine-set source origin. Optional turnId refers to an **already-running** turn; absent for a plugin's own submission which waits for idle. It is not a promised newly created turn ID. |
| `PromptSubmitResult`,8793 | Text/context/origin or drop. Resolution means entered/started **or queued**, not completed; no new turn/submission ID. |
| `TurnStartInput`,12982 | Model-bound prompt text after prompt/settings hooks and fresh turnId; no occurrence/prompt ID/origin. |
| `BaseHookInput`,787 | Classic prompt_id correlates classic/OTel prompt grain; no declared equality to native turnId. |
| `UserPromptSubmitHookInput`,14221 | Optional broad source may be omitted during rollout; not an exact module-call identifier. |
| `Origin`,7081 / `TraceEntry`,12826 | Caller identity/per-event middleware trace, not a documented cross-event causal occurrence join. |

These line references are to the exact generated file, not the public GitHub copy.
The API description says a plugin submits a turn of its own once idle, but the
result also permits queuing. The overlap observations below make explicit
one-input/one-new-turn disposition and authoritative receipt semantics important
questions; they do not establish how actual model context consumes queued inputs.

## Method

Two or three disposable Mods: observer + producerA, optionally producerB.
A fixed49-byte body contains leading spaces, CRLF, combining Unicode and emoji.
The CLI startup argument carries that same body and is natively stamped composer.
There is no PTY input automation or existing human-session adoption.

The observer records only known source/caller labels, byte digest/length, hashed
classic/native IDs, known trace caller labels, ordering and diagnostic window
counts. It never reads messages/context/transcripts or assistant output.

Every `turn.step`, including catch fallback, returns fixed synthetic text/stop
chunks without `next`; the initial step deliberately waits4 seconds so producers
try submission while a native turn is active. Every run also has:

- OS outbound-IP sandbox, numerical remote-connect control returning `EPERM`;
- scoped synthetic auth and loopback `ANTHROPIC_BASE_URL`, proxies removed;
- loopback HTTP blocker discarding/rejecting all requests without reading paths,
  headers or bodies; **0 requests reached it in every run**;
- user/project settings sources, custom MCP, hooks and auto-memory disabled;
- a no-tool-output stub and explicit disposable tool refusal (0 calls observed);
- actual engine version291, expected root/session/interactive/base guards passing;
- owned fresh foreground process/PTY, rendering drained unexamined, no PTY writes;
- bounded private metadata recorder, not a production-authenticated evidence sink.

Native's own normal synthetic-session retention may occur; Neoflow does not read
or copy it. All owned wrappers stopped. No deliberate CLI installation/update,
production code/store/Manifest/version admission, or unrelated Workspace edits.

## Observations

| Run | Producer API calls / nondropped returns | Subsequent native starts / ends | Concurrent prompt windows |
| --- | --- | --- | --- |
| isolated (`1791886643138-20248`) | A:1 /1 | 1 /1 | 1 |
| overlap (`1791886441441-19603`) | A:2+B:1 /3 | 1 /1 | 3 |
| per-producer single-flight (`1791887031076-21271`) | A:1+B:1 /2 | 1 /1 | 2 |

Counts exclude the initial composer control: each run had two total native
starts/ends/short-circuited steps. Both overlap runs were observed for55 seconds;
no additional lifecycle event was seen before cleanup. This is **not** a claim
that every queued input reached a model, was permanently lost, or universally
coalesces. There was no model/context inspection at all.

In all three cases:

1. Prompt middleware distinguishes engine-stamped composer/A/B source and caller.
2. No recorded classic prompt_id (nor classic Stop prompt_id) equals any recorded
   native turnId. Hash equality preserves the equality test without exposing IDs.
3. Classic source has no recognized public label in the recorder. Its encoding
   combines missing/unrecognized; stronger absence claims are not justified.
4. Native starts report caller `engine`, no recognized origin or checked join ID.
5. API returns exact fixed body/plugin origin, with none of the checked
   `turnId/prompt_id/promptId/turn_id` fields. Declared results also have no join.
6. The same body hash appears for every prompt/start, so equality carries no
   occurrence identity. In overlap, multiple source windows are live together;
   the per-producer single-flight case still has two windows and one later start.
7. Per-event traces show engine core, not an authoritative dispatch-to-start link.

The isolated sample remains consistent with a straightforward sequential adapter,
but provides **no contract for overlap/recovery**. The cross-producer case is not
an application queue in A: each independent producer calls once. Native waiting
and return metadata do not by themselves serialize source custody globally.

## Limits

- The synthetic step delay and per-record helper calls affect scheduling. This
  is native ingress/lifecycle evidence under instrumentation, not funded model,
  tools, permissions or production persistence proof.
- Initial composer is a public startup argument, not physical keyboard input.
  User-mid-turn interleaving, bridge/local spoofing, other hook chains and `/clear`
  remain unproved. No standing permission to perform their live matrix is inferred.
- The triple-call fixture intentionally exceeds A's intended production
  single-flight. The separate A:1+B:1 fixture avoids that limitation but still
  does not prove ordinary-user keyboard behavior or every source policy.
- Root binding and collector trust are controlled proof fixtures; real signer/
  helper pairing and authenticated evidence transport are not implemented.
- Other API/telemetry contracts could potentially help; this finding is not a
  proof that no supported mechanism can ever exist or that an upstream change
  is strictly necessary. A documented supported causal contract is an acceptable
  answer; undocumented timing or guessed hidden fields are not.

## Upstream question / proposed minimal feature — posted 2026-10-13

After owner approval, published as
[anthropics/claude-code#101742](https://github.com/anthropics/claude-code/issues/101742):
**[FEATURE] Mods: engine-owned prompt.submit receipt linked to native turn IDs**.
The public body was checked against the submitted sanitized Markdown;
SHA-256 `9a0e6ac0aadfc27c526094e3e4650d353c17c44b5669f53d9427596f439300b2`.
It contains synthetic findings only: no private logs, local paths, raw session/
turn IDs, credentials or branch uploads. No push or workflow dispatch occurred.

Before posting, searched own-submit/receipt/turn-ID/correlation requests and read
related [#101380](https://github.com/anthropics/claude-code/issues/101380),
[#95682](https://github.com/anthropics/claude-code/issues/95682), and
[#101222](https://github.com/anthropics/claude-code/issues/101222).
These request peer-delivery IDs, mid-turn priority, or diagnose idle hangs;
none supplied the required own-submit-to-native-lifecycle contract. They are
related reports, not independent reproduction or authority for this profile.
The current public declaration copy still lacks the checked join fields; it
remains subordinate to the exact-build generated declarations. No newer native
build was tested or admitted.

**Status:** open, awaiting an authoritative answer; receipt/association capability
is not established by posting a request. Root/helper/evidence authentication also
remains open. Below is the pre-publication proposal outline; the linked issue
contains the actual formatted public request.

**Title:** Native Mods: authoritative `prompt.submit` receipt-to-turn association,
including concurrent/queued disposition

We are integrating exact, user-authorized review messages into an explicitly
attached existing interactive Claude conversation. Native `submit({text,
asUser:true})` preserves sampled bytes and plugin provenance, but we need to
associate each accepted call with its exact native start/end without text
matching, model-visible tags, transcript reads or blocking ordinary user input.

On exact native2.1.291 (generated declaration hash above), classic prompt IDs are
not turn IDs; native turn-start caller is engine rather than the submit producer;
submit results contain no new native turn ID. With one active synthetic composer
turn, independentA/B calls with identical text each returned nondropped, while
only one subsequent native start/end was observed. A single-flight isolated
control has a separate later start/end. All model steps were stubbed,0 requests
reached a loopback-only blocker, and no tools ran.

**Question:** Is there a supported engine-owned occurrence/causal contract that
joins each exact API call to its native turn(s), including queued/merged/injected
cases and ordinary-user interleaving?

If not, a minimal useful Interface would expose:

- an engine-minted submission ID in the receipt, also pinned in prompt middleware;
- an authoritative submission-ID→native-turn-ID association, via result or native
  lifecycle fact (IDs remain metadata, never model text);
- explicit new-turn/queued/running-turn/batched disposition, without guessing from
  API resolution or a single slot;
- documented stability under concurrent producers, identical bodies, other hooks,
  native failure/abort and session replacement.

For a strict one-new-turn-per-accepted-Send integration, please clarify whether
that guarantee exists; otherwise provide an atomic new-turn-only submission that
refuses before publication when it cannot guarantee it. A receipt can establish
lifecycle custody after start; our independent authorization must already be
verified before native publication. We are not requesting permission approval,
semantic-success guarantees, assistant capture or a model-visible secret.

A documented sound existing contract is preferable to inventing another API.
The approved question is now posted; no branch was pushed and no production
bridge authorized. Next gate is a supported authoritative custody answer (or an
implemented native primitive), followed by targeted exact-build proof. Additional
funded functional probes should not precede a plausible custody contract.
