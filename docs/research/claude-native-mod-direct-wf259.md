# Claude native Mod Direct attachment — WF-259

## Verdict

**A documented native candidate exists; production admission remains pending.**
The user wants Pi-like Direct attachment to one existing interactive Claude
conversation, not per-message User Pull or a second managed conversation.
Anthropic's newer Mods Interface offers session-local native prompt submission
and pre-context source handling. Exact Claude Code `2.1.291` offline harness
checks passed, followed by an approved **8-of-8-turn live partial proof**.
Native `asUser` text/duplicate turns and normal Read/Write passed on `2.1.291`.
Foreground fixture execution resolves the background worker build mismatch:
real native peer input is consumed before context, while a CLI-startup user
control retains composer origin and the same exact fixture bytes. These remain
partial observations, not end-to-end provenance or production admission.

The owning scope, seam, acceptance gates, and next live procedure are in
[WF-259](../../.issues/WF-259-prove-claude-direct-attachment-through-a-native-mod.md).
WF-258's private inbox remains safety-blocked; the currently reviewed Claude
Manifest remains `2.1.209` User Pull.

## Primary-source findings

| Claim | Primary source and qualification |
| --- | --- |
| A Mod lives inside the running Claude session and can keep background work running between turns | [Anthropic Mods overview](https://code.claude.com/docs/en/plugins/mods/overview), [background timers/API](https://code.claude.com/docs/en/plugins/mods/api#run-work-in-the-background) |
| Native `$.prompt.submit({ text })` starts a new turn once idle; its completion does not mean the model turn ended | [Anthropic native submission](https://code.claude.com/docs/en/plugins/mods/api#start-a-turn-from-a-background-job) |
| Default submission adds a native plugin sentence; documented `asUser: true` requests user-style presentation | Same official API page; the follow-up below observes exact `asUser` native model-bound turn text, not intercepted HTTP/model transcripts |
| `session.receive` can consume input before context, and `prompt.submit` can drop before the turn | [Official events/reference](https://code.claude.com/docs/en/plugins/mods/reference); [frozen public origin/receive types](https://github.com/anthropics/claude-code/blob/8e60c4cac989c0e0cc6d2c49407a5c67f5a4a8e6/mods/types/claude-code.d.ts) |
| Native origin distinguishes plugin, composer, bridge, peer, peer-send-message, and unclassified; the caller cannot assign it | Frozen types: `PromptOrigin`, `PromptSubmitArgs`, `PromptSubmitInput`; actual module stamping also exercised by the offline harness |
| An unauthenticated same-user socket is not a native composer origin | Frozen `PromptOrigin` declaration says an ingress the engine cannot attest arrives unclassified, never composer; authentic frame classification still needs live proof |
| `turn.start` mints a native turn ID, reused by step/complete; public start input has text/turn ID, not prompt origin | Frozen types: `TurnStartInput` / `TurnCompleteInput`; precise dispatch-to-turn correlation must be proved, not inferred from equal text |
| Hook failures are fail-open unless caught before delegation | [Official failure handling](https://code.claude.com/docs/en/plugins/mods/events#handle-a-hook-that-fails); the probe registers `.catch` handlers, but failure/unload/policy cases still need a live matrix |
| Mods began in terminal version 2.1.287; they can be disabled by organization policy or remotely | [Official overview](https://code.claude.com/docs/en/plugins/mods/overview), [troubleshooting](https://code.claude.com/docs/en/plugins/mods/troubleshoot) |
| Version 2.1.290 fixes Mods remaining off through a configured gateway without an Anthropic account | [Official changelog](https://github.com/anthropics/claude-code/blob/8e60c4cac989c0e0cc6d2c49407a5c67f5a4a8e6/CHANGELOG.md); not proof of the operator's actual gateway |
| Mods are trusted, unsandboxed code; normal Claude tool permissions are not a sandbox for the Mod | Official overview's trust section; do not mistake plugin privileges for authorized external ingress |
| Build-generated declarations are authoritative over GitHub copies | [Official types workflow](https://code.claude.com/docs/en/plugins/mods/create#get-the-types-for-your-build); the public copy inspected did not declare the observed newer `asUser` metadata |
| Plannotator actually uses the native method without Herdr | [Frozen Plannotator register](https://github.com/backnotprop/plannotator/blob/e44ae1c071af3b43a8df2f01bfcca3ad7fac3d39/apps/hook/hooks/mod/register.ts), `hostOf.submit`; [controller](https://github.com/backnotprop/plannotator/blob/e44ae1c071af3b43a8df2f01bfcca3ad7fac3d39/apps/hook/hooks/mod/controller.ts#L1400-L1455) |

More detail separating the TUI, modern Mod, and classic hook appears in
[the Plannotator investigation](./plannotator-tui-claude-delivery.md).

## Captured offline primary source

- Branch: `prototype/wf259-claude-native-mod-contracts`
- Commit: `4ba70b3` — `Probe Claude native Mod dispatch contracts (WF-259)`
- Worktree: `/private/tmp/neoflow-wf259-claude-native-mod-contracts`
- Assets: `packages/claude-adapter/prototypes/wf259-native-mod-contracts/`
- Exact native CLI: `2.1.291`; canonical Node: `v26.5.1`.
- The auto-updating installed CLI was newer than the handoff's `2.1.289`; the
  captured run explicitly used its exact installed versioned executable. No CLI
  installation/update or compatibility-policy change occurred.

Command from the worktree:

```sh
NEOFLOW_PROBE_CLAUDE=/path/to/claude-2.1.291 \
  sh packages/claude-adapter/prototypes/wf259-native-mod-contracts/run
```

Strict plugin validation passed and listed two gating hooks **with `.catch`**.
The native engine test kit reported **15 pass, 0 fail**:

| Cases | What they establish |
| --- | --- |
| Five supplied native ingress kinds: peer, peer-send-message, unclassified, task-notification, scheduled-trigger | The probe consumes each before its core stub runs |
| Four supplied prompt origins: peer, peer-send-message, unclassified, other-plugin | The probe drops each before its core stub runs |
| Composer and Remote Control bridge controls | Their synthetic text and native origin reach core unchanged |
| Two native API calls with identical synthetic bodies | Distinct calls preserve leading whitespace, CRLF, blank lines, combining Unicode, emoji, and get the probe plugin's engine-stamped origin |
| `asUser` diagnostic | The emitted event has unchanged text and native origin `{ kind: 'plugin', name: 'neoflow-native-probe', asUser: true }`; there is no top-level `asUser` field |
| Another module passing a forged authorized plugin name, with and without `asUser` | The attempt is dropped by the gate; the other module observes the drop and core is not reached |

The test kit's own `$` supplies the ingress-fixture origins. That is not a real
socket/native-peer control. Module-origin cases exercise actual native API
stamping in the kit, but core prompt handling remains stubbed. The diagnostic
cannot show rendered/model framing. **Do not call these 15 checks a passed
end-to-end Native Dispatch Provenance gate.**

The deliberately broad probe filters are not a production origin policy. They
exist only to exercise consume/drop placement; installing them would change
other native task/plugin behavior and is explicitly prohibited by the README.

### Failed hypotheses recorded, not erased

1. Submitting inside `command.run` was rejected by the native engine: it would
   wait on the turn that handler holds. The fixture now schedules submission
   through `$.clock.after(0, ...)`. Future native dispatch belongs in background
   Adapter work, not a blocking hook.
2. The initial presentation diagnostic expected a top-level `asUser` field and
   found none. A second assumed plain plugin origin and instead observed
   `asUser: true` nested in that origin. Final assertions match that observed
   contract, not an assumed schema. Live framing remains an open gate.
3. Inline test plugins have isolated module scope; their code cannot capture a
   test file's top-level constant. The adversarial inline fixture now supplies
   its forged label locally. This was a fixture error, not provenance evidence.

The proof uses only synthetic source literals, no persistence/bridge, no models,
no tools, no transcript/session-message access, and no permission changes.
Anthropic documents the [offline test kit](https://code.claude.com/docs/en/plugins/mods/test)
as running without a session, sign-in, or network. This offline experiment ran
no live/funded turns. Its separately approved follow-up is below.

## Approved live partial proof — 2026-10-06 / 2026-10-07

The owner explicitly authorized **at most 8 short synthetic turns** through the
configured gateway. **6 were used**, then the run stopped; no further model
turn is automatically authorized. All synthetic native sessions were stopped.
No existing conversation was adopted, no terminal input was injected, and no
private inbox, SDK session, transcript read, assistant capture, permission answer,
or permission bypass was used. Native Claude retains its own synthetic sessions
normally; Neoflow copied none of their transcripts/logs.

Captured primary source: `prototype/wf259-claude-native-mod-live` at **`ac3c363`**,
`packages/claude-adapter/prototypes/wf259-native-mod-live/`. It contains the
runner, Mod, primitive allowlist recorder, results, and metadata events. Exact
staged source/config and generated types remain in the cited private run folders;
the final runner includes later corrections, not byte-identical earlier fixtures.

| Run | Turns | Observation |
| --- | --- | --- |
| `/private/tmp/neoflow-wf259-native-live/1791299155104-14164` | 4 | Native `2.1.291`: default presentation changed the 75-byte fixture to 275 bytes at `turn.start`; `asUser: true` preserved leading spaces, CRLF, blank lines, combining Unicode and emoji exactly twice. Native plugin origin retained `asUser` metadata; identical bodies had distinct native turn IDs and matching ends. |
| `/private/tmp/neoflow-wf259-native-live/1791299429242-14824` | 1 | Corrected Read-then-Write succeeds on the sole synthetic fixture under normal `acceptEdits`; exact final bytes, no denies/errors/staging. |
| `/private/tmp/neoflow-wf259-native-live/1791357995709-26139` | 1 recipient, 0 sender | Positive recipient uses native `2.1.291`; newly launched sender instead loads `2.1.292`, so the guard refuses before native `SendMessage`. **No peer classification/rejection proof exists.** |
| `/private/tmp/neoflow-wf259-native-live/1791358332246-28632` | 0 | Identity-only follow-up disables auto-updating in child env and adds a private PATH symlink to the frozen executable. Native background engine still reports `2.1.292`; refused with no prompts/tools. Those controls do **not** pin the worker. |

### Exact generated declarations

The `2.1.291` engine emitted
`plugin/.claude-plugin/types/claude-code/index.d.ts` in the first run; SHA-256
`c05419d753bc81d991ddec4b66af17a9172f498e59d28fad07a8e676635c07ce`.

- `PromptSubmitArgs` (8702) explicitly declares `asUser?: true`: remove the
  native plugin frame, retaining `{ kind: 'plugin', name, asUser: true }`.
  Neither file mentions nor pasted images are expanded for plugin submissions.
- `TurnStartInput` describes text after prompt and settings hooks, as the turn
  proceeds to the model. Hash/UTF-8 length match the literal native submission.
  This is an observed native model-bound boundary, not capture of a raw HTTP
  request, context, or model transcript. Full outgoing framing admission remains
  separate from this bounded synthetic sample.
- `SessionReceiveResult` says consumption queues nothing, writes nothing to the
  transcript, and never reaches the model. This remains an unexecuted live gate.
- `ToolCallEnvelope` (12319) spreads arguments beside the tool (`e.file_path`),
  not under `e.input`.

Native `$.session.version()` checks and generated declaration headers establish
the actual build; the sender's declarations begin `Written by Claude Code
2.1.292`. The 291 executable still reports 291 under `--version`; the installed
launcher now points at 292. No deliberate install/update was performed. The
background worker-selection mechanism remains unknown; no private runtime
inspection/workaround was used. [Official `DISABLE_AUTOUPDATER`](https://code.claude.com/docs/en/env-vars)
disables auto-updates, not a demonstrated background-worker pin.

### Failed/limited controls, not erased

- Initial strict validation failed for missing author metadata, before native
  launch/model execution. The manifest was fixed; no safety gate was waived.
- The first Write fixture existed but its prompt prohibited Read. Exact-engine
  `$.tool.list()` proves the builtin description says `MUST use the Read tool
  first`; the positive fixture was invalid. Original tool error text was not
  captured, so its exact failure cause is not asserted.
- The original tool observer incorrectly inspected nested `e.input.file_path`.
  Its `targetMatches: false` cannot be interpreted as a wrong target. Corrected
  flat-field observations and a revised Read-then-Write fixture pass.
- Correlation here is single-flight with frozen fixtures and no concurrent user
  input. Source-stamped submit plus native start/end is not a proved general
  dispatch-to-turn join under interleaving, identical user bodies, or reconnect.
- `isInteractive: true` is a native background-worker observation. This is not
  proof of explicit attachment to an existing human foreground conversation.
- Ordinary file tools on an enabled Mod/gateway passed; interactive permission
  attention, default-mode approval, unloaded/blocked Mods, and organization
  failure cases did not run.

This initial stage stopped at build mismatch. The owner then directed continuation
within its two remaining turns; the foreground follow-up is below.

## Exact foreground and real native origins — 2026-10-07

**8 of 8 approved model turns now used; no funded rerun is authorized.**
Captured follow-up: `prototype/wf259-claude-native-mod-live`, **`773dabd`**.
Earlier source/evidence at `ac3c363` remains historical, not rewritten.

| Run | New model turns | Observation |
| --- | --- | --- |
| `/private/tmp/neoflow-wf259-native-live/1791361274481-33156` | 0 | Fresh foreground process stays native291 and matches the explicit session ID/canonical checkout. Exact generated declarations retain the same SHA-256. |
| `/private/tmp/neoflow-wf259-native-live/1791361367142-33411` | 1 | Both foreground engines native291. Recipient's normal Read/Write succeeds; separate sender uses public native `$.tool.call({ tool: 'SendMessage', ... })`. Recipient receives **peer** and consumes without core delegation. No additional recipient turn/tool or fixture change; sender uses no model. |
| `/private/tmp/neoflow-wf259-native-live/1791361540607-33991` | 0 | Real peer repeat confirms the complete expected synthetic body is contained in the received input. Received hash is not the bare-body hash: native input has additional text. Consume decision uses origin alone, not containment/digest. No recipient/sender model turn or file change. |
| `/private/tmp/neoflow-wf259-native-live/1791361770520-34815` | 1 | Public CLI startup argument carries the same75-byte fixture as earlier Mod turns. Native engine stamps **composer**, preserves exact text at prompt gate and native turn start, and reports matching native end. No module submission is used. |

The throwaway `foreground.py` creates only a fresh owned terminal/process group;
it never writes to the PTY and discards rendering without decoding, inspecting,
retaining, or forwarding it. Native `$.prompt.submit` remains the actual delivery
API; this is **not terminal automation for delivery**. Its process cleanup is
not a cancellation Capability. No existing user's conversation is adopted,
resumed, attached, or stopped. No permissions/version guard was bypassed.

Direct foreground execution avoids the `--bg` worker-selection problem; that
background mechanism is still unpinned. This fixture launcher must not become
production Managed Session Setup. The product candidate remains a native Mod
in the exact existing interactive conversation explicitly attached by the user.

The observed CLI **composer** input is an engine source control, not physical
keyboard input or proof of an existing human Attachment. The live peer case is
one source-discriminator/pre-context test, not the full local/spoofed-input,
mod-error/policy, authenticated runtime-ingress, or correlated lifecycle matrix.

**Next:** settle runtime-to-Mod authority and the exact existing-session attachment
Interface, then prove them with interleaving/recovery and the remaining
adversarial/permission/policy cases under fresh explicit approval. Do not
promote the private inbox, widen versions silently, or infer production admission.

## Offline attachment design follow-up — 2026-10-07

The owner then approved design/offline work only. Source
`prototype/wf259-direct-attachment-state`, `36d35c6`, captures a Node interactive
model and19 scripted snapshots with actual Ed25519 verification, exact-byte
validation, one-use custody, disconnect/reconnect fencing and no substitution.
The authority ledger/bootstrap/transport/native join are explicitly fixtures;
the observed291 profile publishes nothing and the successful lifecycle mode is
labeled hypothetical. Full findings and unresolved root/join gates are in
[the attachment design note](./claude-native-mod-attachment-design-wf259.md).
No new live/model calls were run; the8-turn budget remains exhausted.

## Exact native correlation diagnostic — 2026-10-13

Owner-approved zero-model native follow-up, source `2ebd63d`, confirms that classic
prompt IDs are not native turn IDs and engine caller/start/submit-result metadata
do not supply the tested join. An isolated call has1 later turn; overlapping
native requests, including one per independent producer, return successfully
without one observed later start per return. All6 steps were stubbed,0 requests
reached the loopback gateway blocker,0 tools. This is bounded pipeline evidence,
not a universal coalescing/consumption or impossibility claim. See
[findings and the posted upstream question](./claude-native-mod-correlation-wf259.md).
The8 funded-turn budget remains exhausted; production Direct remains unavailable.

## Offline trusted-pairing follow-up — 2026-10-13

[Candidate root/control custody](./claude-native-mod-trusted-pairing-wf259.md),
source `f75106c`, now exercises genuine dual-UI comparison assumptions with real
crypto,46 offline scenarios and separate owned Node key-holding children. Only
fenced encrypted controls are allowed; publication/evidence, native/model/network
calls and production admission stay disabled. A concrete integration prerequisite
is authenticated launcher/UI→runtime owner enrollment: startup IPC is currently
closed, and role/private-endpoint/code-label discovery is not a trust root. Actual
UI/Mod/source/lease proof and native turn custody remain independently open.

## What remains before implementation

1. Bind runtime authority to the session-local Adapter. It should receive only
   already-committed directives for its exact attachment, never publish arbitrary
   externally supplied prompt text. Native source stamping does not authenticate
   an external helper/socket/HTTP caller.
2. Extend the exact-build declarations and bounded live model-bound text evidence
   to the full marker-free outgoing contract and supported inputs/environment.
   Retain native origin; do not introduce a model-visible
   secret, marker, heading, or correlation identifier.
3. Prove per-dispatch native correlation across identical user/Message bytes,
   active-turn queuing, user overlap, failure, interruption, and loss. A bare
   `turn.start.text` match or submit resolution is insufficient.
4. Repeat the real adversarial matrix before tools can exercise Handoff authority.
   A valid source classification plus deliberate consumption must precede
   context, not depend on later model behavior.
5. Prove exact attachment, sustained connection, checkout/session transitions,
   Mod error/unload/policy restrictions, normal permissions, and the configured
   gateway. Recover availability without destination substitution or replay.

Only after these findings should a production Resolution settle the Module
Interface, Capability profile, normalized evidence, and verification matrix.
The WF-258 private socket, setup trust workaround, and managed queue design do
not enter production on the strength of this different native candidate.
