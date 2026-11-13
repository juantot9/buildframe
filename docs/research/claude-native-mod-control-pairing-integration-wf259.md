# WF-259 — control-only Mod/owned-runtime pairing integration

**Current frontier:** [installed2.1.306 contract review](claude-native-mod-installed-306-contract-review-wf259.md),
source `b222f1c`. The actual CLI accepts the source after attribution is fixed,
but its offline Mod hook and public SDK expose digest/randomness, NOT this port's
key operations. DOM masked that restriction in the earlier typecheck; checking is
corrected and native trials withheld pending trusted Node-helper key custody.
The operator preparation below is historical, not native compatibility proof or
a manual JSON acceptance exercise.

## Result — 2026-10-19

Isolated source **`6a16bd8`**, branch
`prototype/wf259-control-pairing-integration`, based on `7a450ed`.
Worktree: `/private/tmp/neoflow-wf259-control-pairing-integration`.
Source/README/captures:
`packages/claude-adapter/prototypes/wf259-plannotator-session-controller/control-pairing/`.

The owner approved building the smallest control-only integration after
[confirming the trusted-code design basis](claude-native-mod-assumptions-review-wf259.md#owner-confirmed-design-baseline--2026-10-19).
No native execution was approved or performed.

**Answer:** the actual native-shaped connect/render/confirmation callbacks can
pair with a control actor created inside the actual privately enrolled Workspace
writer, exchange authenticated encrypted controls, and fence scope/lifecycle loss
**in the synthetic-Engine integration driver**. This is not genuine native pairing,
existing-session Attachment, Message delivery or turn custody proof.

## Integrated seams

- The known writer entrypoint opts into an assembly-only pairing factory after
  actual owner scope/generation selection. It creates the original `f75106c`
  Node `PairingEndpoint` inside the real owning child; keys are not held by a
  fake runtime in the driver. Startup/public JSON cannot install the factory.
- Existing signed owning-IPC enrollment carries only bounded, sequenced diagnostic
  pairing/control actions. Local UI intent/confirmation/withdrawal remains on
  that private path. The ordinary Workspace Interface/public socket gains no
  pairing, confirmation, grant-signing or publication operation. An existing
  unenrolled owner is still unavailable, not replaced or adopted.
- The loopback relay carries introductions and fixed encrypted controls, not
  authority. Its URL is an untrusted locator. No public begin/confirm/rotate/sign/
  submit/evidence operation; only opaque frames cross the strict existing codec.
- The new entrypoint keeps all native `$` calls in one file and imports only
  within the original plugin root. It reuses the unchanged pure lifecycle owner
  and retains `7a450ed` registration/ticket ordering. The branch's manifest points
  to this control entrypoint; original drivers still import the original scaffold.
- The native-side Implementation ports the SAME diagnostic pairing codec to
  standard asynchronous WebCrypto. Runtime still uses the original Node codec:
  same transcript/wire version/algorithms, interoperating in the driver. No new
  protocol or crypto dependency; this is still hand-built, unaudited diagnostic
  framing, not permission to transplant it into production.
- Explicit configured Workspace identity is compared against the real owner's
  identity, not claimed as a native-generated fact. Native session/build/root and
  fixed metadata-only Git checks are under the approved trusted-code assumption.
  Both local surfaces compare the whole transcript; fixture confirmations model,
  **do not prove**, physical operator comparison or the actual Neoflow app UI.
- Per-round async guards fence late HTTP/crypto/UI results before new effects.
  HTTP200 does not establish liveness: authenticated controls must keep arriving.
  Cooperative 3000ms loss/120s comparison bounds are not protected time/leases,
  native cancellation or Invocation rejection.128 private pairing RPCs per UI
  lease bound this diagnostic; no sustained production Attachment is claimed.

No Node crypto/import enters the Mod import graph. Its private WebCrypto keys
are non-exportable in the Node-hosted proof. Exact native algorithm/global/loader
support remains untested. The old codec's `helperLease` field is a fresh Mod-memory
witness here, not evidence of a real helper, protected parent IPC or attestation.

## Verification and exact limits

Final `evidence/integration.json`: **15 scenario snapshots**, one actual owned
scratch writer, **59 loopback HTTP requests**, all owned resources closed and
scratch removed. Includes mutual local confirmation, encrypted controls in both
directions, valid-next private packet copied onto the public socket before owning
IPC delivery, consumed private replay, transparent ordinary native paths, clear,
fresh comparison, session drift, withheld authenticated traffic, actual owning-IPC
loss, late HTTP and paused-signature completion across a fresh pairing.

Additional reruns captured alongside it:

- **16** existing actual owner-enrollment controls (three scratch writers,
  all exited/scratch removed) without the new factory.
- **18/14/20** existing confirmation/fault/lifecycle controls over the ORIGINAL
  unchanged scaffold entrypoint, not equivalent coverage of the new entrypoint.
- Workspace/Local Runtime builds, plugin-local import/native-call-locality audit
  (three files), strict DOM/public-declaration typecheck and interactive/piped/EOF
  checks pass. **11 existing Local Runtime fast tests in five files pass.**
  No full production verification suite was rerun.

Typecheck uses the pinned PUBLIC declaration snapshot at
`bf2323b3021c9d3db7a31e1e7d61068c3f704497`, SHA256
`e51e637fbbebb2a6a49c4bdc3860a251c2ca2295884822dff0f4c3e3ec802163`.
This is NOT exact291 validation. The old generated scratch declaration file is
missing; no native regeneration, CLI validation or version admission occurred.

Development corrections are recorded in the prototype README: DOM typed-array/
phase-narrowing errors; an initial native layout violating documented import/`$`
locality; lazy readline iteration losing piped input and timing out; and the
first fast-suite run missing an existing-tsx worktree link. All corrected without
native execution or installation. The one known timeout scratch directory was
removed; no owned process remained. None is a reproduced native engine failure.

## Run / next gate

```sh
cd /private/tmp/neoflow-wf259-control-pairing-integration
pnpm prototype:wf259-control-pairing
pnpm prototype:wf259-control-pairing --proof
pnpm prototype:wf259-control-pairing --typecheck
```

The launcher selects existing canonical Node26.5.1. It builds only the isolated
worktree and uses already-installed dependencies through ignored worktree-local
links, not main's Workspace implementation. README documents overrides/custody.

Next is a **separately approved** fresh disposable native loader/API/crypto/UI/loss
proof. Do not launch Claude, load the manifest or run `plugin validate` implicitly.
No existing user's conversation is adopted, terminal input injected, permission
policy altered, real workflow store inspected, transcript/assistant/credential
captured, prompt/model/tool call made or funded operation authorized by this slice.
No new upstream poll was made; the October19 issue-status checkpoint is unchanged.

Pairing confers no Message consent. All native identity/admission/Attachment/Direct
flags remain false; grant receiver/publisher, workflow reconstruction, normalized
native Invocation evidence, queues/replay/fallback remain absent. Engine-owned
Send→turn custody remains independently unproved.8/8 funded turns stay exhausted.

Main stays at `a48220c`; all40 protected Workspace hashes match. Old source
worktrees are unchanged; new prototype committed/clean. Production source,
semantic/glossary contracts, reviewed versions/policy are unchanged; no merge,
push or workflow dispatch. Main keeps only findings and issue pointers.

## Real operator flow preparation — 2026-10-21

Owner feedback clarified that manually inspecting diagnostic JSON was not useful
acceptance work. Source **`448d0ed`**, branch `prototype/wf259-native-control-ui`,
based on `6a16bd8`, now prepares an actual standalone control window rather than
asking the operator to drive a simulation. Worktree:
`/private/tmp/neoflow-wf259-native-control-ui`.

- Default command uses the real disposable writer and readable Waiting/Compare
  codes/Connected (control only)/Disconnected states. It imports no synthetic
  Engine. Human actions are comparison/confirmation and disconnect only; handshake
  opening and liveness polling happen automatically. This is the trial's own UI,
  not completed production Reviewing UI integration.
- Native pane uses the same readable language and a Disconnect action. Sending
  remains disabled. The native trial additionally binds a configured fresh
  session UUID and canonical checkout, refusing another session/root.
- A shared real relay replaces the driver-only HTTP implementation. Native polling
  and local confirmation can overlap: at most4 closed diagnostic control RPCs are
  serialized behind the existing single-flight signed IPC client. Loss fences
  pending work, no retries. This is not a Message/Workflow queue or generic executor.
  Its private trial RPC cap is explicitly1024; the64-probe and8-turn funding limits
  are unchanged.
- Preparation stages only the Mod import graph and explicit defaults in private
  scratch. The separate native launcher requires scoped approval, a real TTY,
  matching staged-source/plan hashes, fresh unexpired scope and an unused launch
  plan. One UUID cannot be retried even after a failed startup. No existing-session
  adoption, prompt argument or permission-mode override.
- Planned native execution inherits terminal I/O directly (no PTY injection or
  output capture), uses scratch HOME/config, an allowlisted environment/unusable
  credential, rejecting loopback provider and outbound-deny sandbox. It is bounded
  to2 minutes and stops its own child on window loss. Lifetime/PID files are not
  keys or approval credentials; cleanup never kills a PID read from a file and
  retains scratch if its native launcher still claims it. No native branch of
  this launcher was executed by this slice.

**Automated verification, owned by the developer:**9 preparation controls,15
integration scenarios,16 existing actual owner-enrollment scenarios and11 Local
Runtime fast tests pass. Worktree builds, three-file import/native-call locality
and strict public-declaration/DOM checks pass. Developer-only synthetic piped/EOF
controls pass; default piped input is deliberately refused instead of silently
simulating. The original18/14/20 scaffold captures are retained, not re-counted
as rerun in this slice. No full production suite or exact291/native validation.

**Concrete native prerequisite:** the formerly used frozen2.1.291 executable is
no longer at its recorded location (executable-presence check only). No CLI was
run, no installed-version inventory/lookup, installation/update, PATH fallback or
reviewed-version expansion was attempted. The default control window now gives
a readable preflight refusal rather than asking the operator to run an unusable
trial. An explicitly selected existing exact-build candidate, restoration of that
candidate, or separately approved review of a newer build is required next.
Do not present executable presence, preparation controls or static typecheck as
actual engine/crypto/UI compatibility.

**Custody:** prototype committed/clean; previous source worktrees unchanged; main
remains `a48220c` and this slice changed no main production source. The older
scratch hash manifests are now missing, so this continuation does NOT claim a
fresh historical40-file hash match. A new40-file fingerprint snapshot was stored
privately in Git common metadata for subsequent custody checks (relative names,
no shared personal paths). It is a fresh baseline, not reconstructed evidence.

No Claude launch, `plugin validate`, native API/tool/prompt/model call, real
workflow-store or transcript/assistant/credential capture, permission/policy change,
public write, upstream poll, merge/push or workflow dispatch.8/8 funded turns remain
exhausted. Native pairing/turn custody and all Direct/admission gates are still
unproved; this is preparation for a meaningful native trial, not a native result.
