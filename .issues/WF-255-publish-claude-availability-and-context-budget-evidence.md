---
id: WF-255
title: "Publish Claude availability and Context Budget Evidence"
status: closed
labels:
  - wayfinder:task
parent: WF-251
assignee: juanan
blocked_by: [WF-254]
created: 2026-09-19
---

## Outcome

The Claude destination's availability and its optional Context Budget Evidence
are published truthfully. Availability distinguishes plugin absent (capability
unavailable), bridge present but runtime unreachable (blocked, fail-closed
gates), and revalidated (available after exact identity and contract checks).
Status-line and compaction telemetry appears only when the bridge and its
freshness are verified, and model/session change or compaction invalidates old
usage. The application shows the exact `/neoflow:review` action and the
Preparation/Invocation language — Ready to pull, Withdrawn, Expired,
Claimed—waiting to start, Active, Did not start, Outcome unknown — without
inventing delivery, cancellation, or success.

## Resolution (settled 2026-09-23)

### One current-evidence projection, not another lifecycle machine

- Harness Interaction owns a bounded User Pull observability record per exact
  Attachment. It projects destination availability, bridge freshness, optional
  Context Budget Evidence, and compaction evidence alongside the already-owned
  Preparation and Invocation. Claude transports only normalized native facts;
  Reviewing never consumes status-line or hook payloads directly.
- The observability record is advisory. It cannot create, claim, withdraw,
  expire, start, settle, retry, replay, or interrupt a Preparation or Invocation.
  WF-253/WF-254 remain the only owners of those transitions. In particular, a
  blocked or stale bridge does not end an open Preparation.
- Each Workspace runtime owner has an opaque process generation. Successful
  exact attachment validation records that generation. A durable attachment
  from an older generation projects as **stale** until the session, canonical
  git root and dir, reviewed host version, Manifest digest, and bridge protocol
  are revalidated. Elapsed silence is not used as a disconnect guess.

### Availability vocabulary

- **Unavailable** means no reviewed Claude User Pull attachment has been
  observed. The UI says that no verified attachment is present; it does not
  claim to have inspected the user's plugin installation.
- **Blocked by runtime** is shown only with an exact bridge/runtime reason, such
  as `runtime-not-running`, runtime incompatibility, or an observed session end.
  A workflow gate fails closed in the Claude process when the runtime cannot be
  reached. Because an unreachable runtime cannot persist its own outage,
  Neoflow never backfills that fact later or calls it an Invocation outcome.
- **Revalidated** means the exact Attachment Identity and reviewed contract were
  accepted in this runtime generation. It is readiness evidence, not a busy,
  delivery, start, or success signal.
- **Stale** means a durable attachment exists but its current runtime-generation
  witness is absent. Reattachment can restore availability for future work but
  never changes a terminal Preparation or Invocation.

### Claude telemetry payload and freshness

- The explicit status-line bridge forwards only: bridge protocol version,
  session ID, current directory for checkout resolution, observed Claude Code
  version, model ID and display label, context-window size, host-reported total
  input/output tokens, nullable current-usage components, nullable
  used/remaining percentages, and optional prompt ID. Transcript path, prompt
  text, cost, rate limits, tool data, and all other status-line fields are
  discarded before transport.
- A Context Budget reading is bound to the exact Attachment, compatibility
  identity, runtime generation, session, and model. The first observation of a
  changed model invalidates prior usage; usage returns only after a later
  matching observation. A null `current_usage` remains unknown before the first
  response and after compaction. Session end, attachment/bridge staleness, and
  compaction also invalidate usage.
- `PreCompact` and `PostCompact` publish only trigger (`manual` or `auto`) and
  phase. `compact_summary` is never forwarded or stored. Compaction proves only
  that Claude started or finished compaction; it authorizes no replay and makes
  no context-preservation claim.
- The application labels a valid reading as the **last response's
  host-reported** token facts. It performs no tokenizer estimate, transcript
  reconstruction, universal percentage comparison, route choice, automatic
  compaction, or payload reduction. Unknown stays explicit with its exact
  invalidation reason.
- Claude plugins cannot install the user's singleton main `statusLine` setting.
  The packaged bridge is therefore an explicit compositor/tap that preserves a
  user-supplied renderer's stdout. Without that verified opt-in, Context Budget
  Evidence is unavailable even when ordinary User Pull hooks are present.

### Application vocabulary

- The plugin skill is named `review`, yielding exactly `/neoflow:review`; old
  `/neoflow` and `/neoflow:neoflow` aliases are not advertised or accepted as
  the workflow gate.
- Reviewing projects the current review's User Pull Preparations beside their
  exact destination and renders: **Ready to pull**, **Withdrawn**, **Expired**,
  **Claimed—waiting to start**, **Active**, **Did not start**, and **Outcome
  unknown**. A normally ended turn is labelled only as ended; it is not called
  complete and no Review Response is implied.
- Start-observation loss always maps to **Outcome unknown**, never **Did not
  start**. The latter is reserved for a correlated `rejected` Invocation.
  Presentation contains no push, busy-state, delivery, cancellation, retry, or
  semantic-success claim.

### Durable loss and recovery

- The existing semantic-expiry rules remain authoritative: exact attachment or
  frozen-capability loss expires an unclaimed Preparation durably, and checkout
  mismatch is visible. The new projection includes terminal Preparations rather
  than hiding them.
- Availability/telemetry revalidation updates only the bounded observability
  record. It cannot revive an expired or withdrawn Preparation, settle an
  unresolved Invocation, or release payload. Duplicate native observations are
  idempotent, and failed commits leave the prior projection intact.

## Acceptance

- [x] Availability projection distinguishes unavailable, blocked-by-runtime,
      revalidated, and stale states with exact reasons; a transient outage
      never ends an open Preparation.
- [x] Optional status-line/compaction evidence is published only with verified
      bridge and freshness; unknown remains unknown; compaction never
      authorizes replay or context reconstruction.
- [x] The app renders the exact command and the honest lifecycle vocabulary;
      no busy-state, push, cancellation, or completion claim is shown.
- [x] Attachment, capability, or checkout loss is durable and visible without
      a reattach reviving a dead Preparation.
- [x] Focused app/workspace scenarios, canonical verification, seam checks,
      and `git diff --check` pass on Node 26.5.1 / pnpm 11.10.0.

## Completion evidence (2026-09-23; local verification, unpushed)

- Harness Interaction owns one bounded observability record per exact
  Attachment. Its projection distinguishes unavailable, revalidated,
  blocked-by-runtime, and stale availability, publishes provenance-bound
  Context Budget Evidence or an explicit unknown/unavailable reason, and
  carries compaction phase/trigger. It cannot create, end, or revive a
  Preparation or settle an Invocation.
- Claude sanitizes only the reviewed status-line allowlist, preserves a null
  `current_usage`, discards transcript/cost/rate-limit/tool fields, and keeps
  unverified usage unknown. `PreCompact`/`PostCompact` relay only trigger and
  phase; `compact_summary` never leaves the process. The built hook and
  status-line entry shims pass `scripts/smoke-claude-bridge.mjs`.
- Reviewing renders `CLAUDE CODE USER PULL · <lifecycle> · /neoflow:review`
  with the exact availability and last-response budget sentences, and no
  delivery, completion, busy, or cancellation claim.
- Scenario evidence: `userPullLifecycle` covers revalidated → model-changed →
  fresh matching usage → compacted → session-ended blocked → reattach
  revalidated → post-restart stale, with the Preparation still `prepared`
  throughout; existing expiry scenarios cover durable attachment/capability
  loss and a restore reattach that does not revive the expired Preparation.
  `claudeStatusLine`, `claudeBridgeCommands`, `claudeSanitizer`,
  `claudeHookBridge`, `claudePluginAssets`, and the app
  `reviewingApplication` scenario cover the new command, evidence, and
  presentation.
- `pnpm verify` passed on Node 26.5.1 / pnpm 11.10.0 (the repo-pinned
  `packageManager`; the Acceptance line's "11.20.0" was a typo): lint with
  pre-existing warnings only, format, dependency firewall, 68 files / 497
  tests, package and test typechecks, build, `smoke-build`, and
  `smoke-claude-bridge`. `git diff --check` is clean.
- GitHub Actions is unfunded (owner decision 2026-09-23): no push or CI run is
  attempted, and local verification is the accepted evidence while WF-255 stays
  open with WF-254's landing state.

## Constraints

- Presentation and evidence projection only; no workflow semantics change.
- No token estimates; size/usage facts are exact or absent.
- Settle this child's pre-implementation Resolution (view vocabulary and
  telemetry payload) before code.

## Closure (2026-11-12)

Superseded by
[Ship the 0.1.0 public preview](./WF-287-ship-the-0-1-0-public-preview.md).
The owner's model is connect-once: `/neoflow` in a Claude Code session
connects it, and every Send then goes directly to it through the native Mod
connector (WF-259). The per-message `/neoflow:review` plugin, its status-line
attach and their bridge code are removed. The owner used them only in early
testing. The Workspace User Pull lifecycle stays, so recorded history still
reads.
