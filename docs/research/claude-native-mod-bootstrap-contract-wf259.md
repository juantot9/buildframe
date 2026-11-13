# WF-259: native Mod bootstrap contract review

**Installed-build correction (2026-10-21):**
[2.1.306 CLI/offline-hook review](claude-native-mod-installed-306-contract-review-wf259.md),
source `b222f1c`, rejects the Mod-local full-WebCrypto direction below: declared
and observed crypto provides digest/randomness, not key generation/sign/encryption.
Our later DOM-based check masked that restriction and is corrected. With the
owner-confirmed trusted-code basis, pursue scoped key custody in our own bounded
Node child instead; do not treat helper stdout as protected against hostile Mods
or infer Message/native-turn authority. No helper or live native trial is implemented
by that review; all sending/admission remains disabled.

**Current design basis (owner-confirmed 2026-10-19):**
[trust our reviewed code; authenticate callers](claude-native-mod-assumptions-review-wf259.md#owner-confirmed-design-baseline--2026-10-19).
The protected hostile-hook path examined below is no longer a universal prerequisite
for investigating the ordinary trusted-code candidate. Its historical findings
remain valid for that stronger threat model. Genuine native pairing/compatibility
still needs proof; native execution, receiver/publisher and Direct admission remain
separately gated. No claim that trust supplies an atomic scope or a native turn join.

## Decision — 2026-10-15

**Do not implement or run a native grant receiver yet.** The runtime-side committed
occurrence proof remains `4c01d63`; this review does not add native authority.
An ordinary user-installed Mod has no protected complete bootstrap path established
by the primary sources reviewed below. This is a bounded negative finding, **not
proof that every possible bootstrap design or later engine version is impossible**.

A useful direction is **keys and authority inside the trusted loaded Mod, helper
as untrusted relay only**. It removes dependence on helper stdout authenticating
its parent. It is a design option, not an admitted architecture: native key custody,
genuine UI, engine facts, profile/lease and correlation still require proof.

The owner approved and the sanitized question was posted as
[Anthropic#102463](https://github.com/anthropics/claude-code/issues/102463) on
2026-10-15T15:32:05Z. Readback at15:32:43Z: OPEN,0 comments, exact approved body
SHA256 `0bf140dc27b4e09476dca1ee444e7599e45831869cdb4e961859bbc06a4fcb18`.
No private artifacts/paths/credentials uploaded; no label claimed. The owner also
directed continued work following Plannotator; the bounded session-controller
follow-up does not implement a synthetic signing/relay layer or admit authority.
Native execution still needs explicit operational approval; all8 funded model
turns remain exhausted. Pi Direct and reviewed Claude
2.1.209 User Pull are unchanged; neither is substituted for the requested Direct.

**Later checkpoint (2026-10-15T20:11:03Z):** both#101742/#102463 still OPEN/0
comments (two anonymous issue GETs, no public writes). Continued source work in
`820c4a8` fixes local nonblocking startup/registration/timer cleanup, not enrollment
or a receiver. [Lifecycle captures/limits](claude-native-mod-controller-lifecycle-wf259.md).
No native/model operation, new budget or policy admission follows.

## What was reviewed

Read-only first-party documentation retrieved **2026-10-15T15:13–15:16Z** and
retained exact291 generated declarations. No native CLI/validation/test/session was
launched; no model request, prompt submission, permission/configuration change,
workflow-store operation, credential/transcript/assistant read, push or workflow
was performed. Six public documentation HTTP GETs are separate from the prior
prototype's zero-external-network evidence. No upstream issue re-poll this phase:
latest recorded#101742 check remains2026-10-14T09:10:28Z, OPEN/0 comments.

- [Use the Mods API](https://code.claude.com/docs/en/plugins/mods/api#reach-files-processes-and-the-network)
  owns the availability of standard JS/Web APIs and interposition on Mods methods.
- [Events](https://code.claude.com/docs/en/plugins/mods/events#how-a-hook-handles-an-event)
  owns middleware observation/rewrite/short-circuit semantics and
  [ordering](https://code.claude.com/docs/en/plugins/mods/events#the-order-mods-run-in).
- [Reference](https://code.claude.com/docs/en/plugins/mods/reference#the-hook-function)
  documents `next.to`, method events and `engine.create`.
- [Create](https://code.claude.com/docs/en/plugins/mods/create#get-the-types-for-your-build)
  says build-generated declarations override public pages when they disagree;
  public docs include newer292–300 additions, not a reviewed compatibility range.
- [Admin](https://code.claude.com/docs/en/plugins/mods/admin#know-what-happens-by-default)
  owns the built-in guard's scope; [policy deployment](https://code.claude.com/docs/en/plugins/mods/admin#install-your-organizations-mods)
  owns managed ordering and provenance requirements. **No policy is installed here.**
- [Interface](https://code.claude.com/docs/en/plugins/mods/interface#respond-to-presses-and-typing)
  owns interposition before callbacks on a Mod's controls.
- Exact291 `.claude-plugin/types/claude-code/index.d.ts`, SHA256
  `c05419d753bc81d991ddec4b66af17a9172f498e59d28fad07a8e676635c07ce`,
  retained under the isolated correlation fixture
  `1791886643138-20248/observer/`. These declarations, not newer public types,
  ground the numbered291-specific statements below. No transcript files read.

Private read-only source manifest: `/private/tmp/neoflow-wf259-bootstrap-sources.json`.
The public Markdown copies and their SHA256 values are listed at the end.

## Candidate paths and why none is complete yet

### 1. Capture helper startup through `$.process.spawn` — not protected enrollment

Exact291 lines3430–3500 explicitly show another plugin rewriting spawned output.
`ProcessSpawnRequest`7838–7870 includes argv/cwd/env/input; input is a string written
to stdin and then closed. Public API docs confirm all these methods are events
other Mods can observe/rewrite/refuse. Persistent child lifetime and streaming
output therefore do **not** establish private persistent owning IPC.

An external helper's self-signature authenticates possession of its own key, not
its installation/parent/session. Fetching its root through that same stream/socket
is circular. Native plugin origin, same UID, socket permission and labels do not
repair that. The actual protected Node IPC argument in `408360a`/`2c67276` must not
be copied onto this different Interface.

### 2. Keep keys inside the Mod — plausible reduction, not a proven bootstrap

The public API documents `crypto.subtle` and other standard JS/Web APIs as available
inside the hooks module, without Node imports. This offers a direction for private
in-memory keys and ciphertext through an untrusted relay. It is **not** proof that
exact291 supports the selected algorithms, non-exportable key operations, isolation,
reload/key disposal or a genuinely enrolled native root. Earlier291 captures
exercised SHA256 digest only, not generation/signing/encryption custody.

No keys in `$.store`, files, arguments, public signing RPCs, model-visible command
output or generic state are proposed. No native crypto code/probe is executed.
Even perfect private-key custody cannot authenticate an external root to the UI
without genuine enrollment, or turn hook-mediated labels into authoritative facts.

### 3. Use an immutable `$` or `engine.create` — not a raw-core connection

Exact2912260–2280 declares plugin name/root;3837–3865/4380–4395 describes building
`$` by a fold that adds namespaces and restricts replacement/withholding. Frozen
method tables and static spelling make the Interface inspectable; method dispatch
still passes through hooks. Manifest name/root are not code-possession evidence.

Adding a namespace is not an authenticated owning startup path and must not expose
an arbitrary signer/confirm/publish operation. Current reference further states
that methods another Mod adds execute their `$` calls in the calling hook's
context until that event settles. That newer public statement is a warning to
review call custody, not an exact291 behavior proof or a proposed context bag.

### 4. Use `next.origin` or `next.trace` — valuable local facts, not enrollment

Exact2916314–6387 pins origin from the host's environment/MessagePort, not fields
a plugin supplies. `trace` is per-dispatch, frozen, and includes core's entry when
core was reached. `TraceEntry`12826–12878 carries each link's received/returned
value and outcome. These are potentially useful for **a genuine owning callback's
local causal evidence**; this review does not dismiss them as arbitrary labels.

But `next.origin` identifies who raised a dispatch, not an external publisher's
committed authority. `next.trace` exists on that hook's `next`, not as a receipt
returned by an arbitrary `$.session.version()` caller. An absent core entry cannot
be filled by inference. We have not proved a protected bootstrap that delivers the
required current facts into the trusted key owner using these primitives, nor a
supported submit→turn join. Local trace evidence cannot authenticate a root fetched
from an untrusted helper or certify the human saw a particular comparison screen.

### 5. Jump to core using `next.to` — not the ordinary Mod solution

The reference and exact2916332–6342 restrict this to policy-tier hooks: prepend
may skip to append/builtin/core; append to core. It does not give an ordinary user-
tier Mod this privilege or let it skip organizations' authority. Current admin docs
also describe a limited PERSONAL-settings tier-ordering exception on machines with
no managed settings and users not signed in with Team/Enterprise. That is an explicit
policy configuration option, not a privilege an ordinary Mod may assume. Dependencies
only influence ordinary load order; they are not exclusive, protected admission of
the entire runtime.

No managed/personal policy settings, tier promotion, hook skipping, permission
bypass or removal of other extensions is implemented/proposed as an implicit
workaround. A separately chosen policy-tier deployment would be a new product/trust
contract, not proof of the requested ordinary existing-session experience.

### 6. Ask the user or draw a private-looking pane — needs genuine surface custody

Exact2912364–2380 says `$.ui.ask` uses `tool.call` through other hooks and draws via
`ui.render`. Public interface docs explicitly say other Mods' `ui.press/input/select`
hooks run **before** a control's callback and can rewrite input or answer instead.
A returned approval, familiar pane name, command-origin stamp or plugin directory
alone therefore cannot establish authentic reciprocal root comparison.

A command's `text` is model-visible per the API docs, so it is not a place for
signatures/secrets/markers. A toast/status/pane being model-untouched does not make
it non-interposable or authenticate the displayed root. No dummy permission/tool
request is used to repurpose protected permission UI for pairing.

### 7. Gate other Mods by `plugin.register` or trust the built-in guard — policy, not bootstrap

Exact2917420–7515 says registration facts are pinned, but name/root/version/
provenance remain the module's own word; host-scanned `tier`/`uses` are different.
Structural uses can inform a future reviewed profile, not authenticate the Mod
itself. Admission of later modules does not prove the complete existing session's
already-loaded profile, and a fail-open gate is not durable lease custody.

The current admin page says the built-in guard protects specified managed behavior,
not everything: other UI rewriting, process/file access and method interposition
remain allowed. It also states Mods are **not sandboxed** and have the user's OS
access. Do not equate availability of a JS environment with an OS security sandbox.
No protection against compromised OS/loaded trusted code is claimed.

Trusting a completely reviewed/frozen hook chain could be a policy option. It is
not selected here, and requires supported current whole-profile identity/change
facts—including reload, worker replacement and previously loaded Mods—not a
name allowlist, static source scan alone or endpoint-reported `safe:true`.

## Required contract before a native diagnostic

Need a credible answer to each, within the actual ordinary deployment profile:

1. **Root custody/enrollment:** how the UI authenticates a key held by the genuine
   loaded Mod for THIS existing session, not a self-signed helper or another session.
2. **Authoritative scope:** current actual engine/build, native session/epoch,
   canonical checkout/Git facts, loaded code/profile/policy and generation/lease.
   Hook-mediated return equality is not enough under the proposed hostile chain.
3. **Genuine comparison/intent:** which surface/input is authentic despite permitted
   hooks, or what explicit reviewed trust restriction is required. Installation/
   pairing remains neither standing Message consent nor permission approval.
4. **Revocation:** authoritative change/loss/reload/unload/clear/worker facts fence
   the lease; no label-based adoption, restart, silent reconnection or replay.
5. **Independent turn custody:** supported engine-owned dispatch receipt→turn join;
   [#101742](https://github.com/anthropics/claude-code/issues/101742) remains separate.

Only after a credible bootstrap design is reviewed should an explicitly approved
zero-model diagnostic exercise it: no prompt/model/tool calls, real workflow data,
transcript/session-message/credential reads, permission changes or session adoption.
No receiver-native publication code until authority is authenticated before any
semantic/context/native/tool use. Nothing here admits Direct or a version range.

## Sanitized upstream question — approved and posted as#102463

### Title

`[QUESTION] Mods: protected existing-session pairing, runtime facts and hook interposition`

### Body

We are investigating a local application's explicit, connect-once attachment to
an already-running interactive Claude Code conversation via an ordinary Mod.
Pairing would authenticate reciprocal public keys; it would not authorize messages
or change tool permissions. We are not asking to bypass managed policy.

In generated 2.1.291 types and the public docs:

- `process.spawn` requests/output can be interposed on by other Mods, so helper
  stdout cannot by itself authenticate the helper or its native parent;
- `session.id/root/repo/version` are method-hook-facing;
- `ui.ask` goes through tool/render hooks, and pane input/press hooks can run before
  callbacks;
- `next.origin` and `next.trace` provide host-owned per-dispatch facts, but do not
  appear to expose a complete native-root enrollment or current-profile receipt
  directly to an external application.

Is there a supported path for an ordinary Mod to:

1. Keep its pairing key inside the loaded Mod (for example with `crypto.subtle`)
   and let the user authenticate that root for the exact existing session on a
   genuine comparison/confirmation surface, despite permitted hook interposition?
2. Obtain authoritative current session/engine/checkout and complete loaded-hook
   profile/generation facts, or a protected owning channel for a native helper,
   without trusting a socket-fetched root or self-reported metadata?
3. Reliably fence that enrollment when the module/worker/profile/session changes,
   including reload, `/clear` and resume, without adopting a replacement by labels?

If the supported contract instead requires trusting the entire loaded hook chain
or a managed deployment, please clarify that requirement and how a Mod can verify
it for an already-running session. Is there a documented way to use the core
entries in `next.trace` for these scope facts, without skipping policy hooks?

This is separate from engine-owned submit→turn association in #101742. We are not
inferring native receipt from submission return/timing/body equality, and are not
requesting transcript access, credential access, permission answers, a second
conversation, or a model request. We have not established an ordinary Mod bootstrap
contract from these docs; this is a question, not an impossibility claim.

## Source snapshot hashes

All copies are public documentation; no private artifacts are proposed for upload.
Six anonymous HTTP GETs; manifest completed2026-10-15T15:16:50Z.

| Page | SHA256 |
| --- | --- |
| `api.md` | `e6a04c782102f8d030fa4f41dff78232c838a94d06cc954dcc9d9931b87f63e9` |
| `events.md` | `58c6fd6fbb6a1622eed3e3faf9f194bd4c25d35ad50a9bd517a1486e760fdf87` |
| `create.md` | `9b820aecef3fba43b845f65ec662278a086de4188b59138fcad11b2410241f67` |
| `reference.md` | `dbdb742602611908f5506d4e6f40ff47b5c6df1c5460ec7be5bbe347c73a3df5` |
| `admin.md` | `cb2e78c06e78eb8054193778624dac428c0a54edc1db148fb7b6f349c4679365` |
| `interface.md` | `5d86e539cf9caa13fdfa52cc800a08547dc8325788dd9c6d56553ba2129facec` |

No new implementation branch, native process, fixture scenario or test run was
needed for the original source review. Previous passing tests were not counted as
rerun. Subsequent owner-directed Plannotator work is separately captured in the
[delivery findings](plannotator-tui-claude-delivery.md#current-plannotator-follow-up--2026-10-15).
All40 unrelated main Workspace files remain hash-identical; prototype `4c01d63`
remains clean. Main contains only findings/pointers, no implementation merge.
Approved post/readback artifacts stay private under `/private/tmp/neoflow-wf259-bootstrap-upstream-*`;
only the sanitized question body was submitted.
