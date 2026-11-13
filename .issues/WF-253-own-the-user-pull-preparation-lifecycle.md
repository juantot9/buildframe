---
id: WF-253
title: "Own the User Pull Preparation lifecycle"
status: closed
labels:
  - wayfinder:task
parent: WF-251
assignee: juanan
blocked_by: [WF-252]
created: 2026-09-19
---

## Outcome

Harness Interaction durably owns Claude's User Pull Preparation as a lifecycle
separate from the Invocation: `prepare` commits the exact Workflow Handoff,
Commitment Receipt, and a one-use Preparation (claim handle, frozen capability
snapshot, route prerequisites, disclosed deadline) before any harness action is
exposed; exactly one `claim` atomically revalidates the handle, exact
attachment identity and checkout, payload, contract, and single-flight slot,
marks the Preparation claimed, binds the native occurrence, creates one
Invocation in `awaiting-start`, and only then releases the payload.
`withdraw` (explicit or via Workflow Cancellation) and semantic `expire` are
the only other terminal dispositions. A claimed-versus-withdrawn race has
exactly one winner; restart observes either an open Preparation or a committed
claim, never an in-between state.

## Resolution (settled 2026-09-19)

### Lifecycle and authority

- A Preparation is durable local authority for one future retrieval, not an
  Invocation. States are `prepared` followed by exactly one of `claimed`,
  `withdrawn`, `expired`. An open Preparation reserves the attachment's
  single-flight slot alongside `awaiting-start`/`active` Invocations.
- `prepare` commits the exact Workflow Handoff, Commitment Receipt, frozen
  Capability Snapshot, and Preparation atomically before any harness action is
  exposed. The Preparation references the immutable payload and never
  duplicates disclosure content.
- `arm` records one exact command occurrence `(session, prompt, canonical
  checkout)` as correlation evidence only. It consumes nothing and creates no
  Invocation. More than one live occurrence makes the claim refuse rather than
  guess.
- `claim` is the only path that releases payload. It atomically revalidates the
  handle, exact Attachment Identity and checkout, the frozen capability's
  current ability to be honored, the disclosed deadline, and the single-flight
  slot; marks the Preparation claimed; binds the armed occurrence; creates one
  Invocation in `awaiting-start`; and only then returns the exact payload.
- `withdraw` is available only while open and is the atomic Workflow
  Cancellation disposition. Claim and withdrawal serialize through one State
  commit: the second sees a consumed revision and fails closed.
- A claimed Invocation is never re-prepared without Explicit Resubmission;
  withdrawal or expiry before claim permits a fresh Preparation with a new
  receipt and handle.

### Command vocabulary (closed, added to Harness Interaction)

- `harness.user-pull.attach` — a Claude SessionStart establishes the
  attachment: reviewed manifest, observed host version, and the four-part
  identity `(claude-code, sessionId, canonicalGitRoot, canonicalGitDir)`.
  Availability starts `available`; WF-255 owns every later availability
  transition and its projection. Boundary note: attach is here because the
  Preparation and claim must bind to a durable attachment; it adds no
  availability semantics.
- `harness.user-pull.prepare` — application-side, before `/neoflow` exists for
  the user: review identity, batch identity, attachment identity, inspection
  identity, optional disclosed deadline. Refusals reuse the closed reasons
  (`attachment-not-found`, `attachment-not-live`, `capability-unsupported`,
  `availability-blocked`, `availability-unknown`, `active-invocation-exists`,
  `batch-already-handed-off`, `inspection-changed`) plus
  `preparation-already-open` and the disclosure reasons.
- `harness.user-pull.arm` — bridge-side expansion occurrence. A refusal is
  reported to the hook as a gate block, never as a silent allow.
- `harness.user-pull.claim` — bridge-side resolver. The result is `claimed`
  (with payload), `duplicate` (the existing claim's invocation identity), or a
  closed refusal; the resolver vocabulary stays byte-compatible
  (`batch_missing`, `invalid_batch`, `workspace_mismatch`,
  `resolution_failed`, `host_unavailable`).
- `harness.user-pull.withdraw` — explicit withdrawal or Workflow Cancellation.
- Expiry is deliberately not a client command: it is a semantic transition
  evaluated lazily during `prepare`, `arm`, `claim`, `withdraw`, and read
  projections, and committed with the command that observes it. No timer and no
  arbitrary age timeout.
- `observe` and `availability` stay with WF-254 and WF-255; this child adds no
  evidence or availability command.

### Claim authorization without session identity (owner decision)

Claude Code's skill shell-out gives the resolver only the working directory;
no session or prompt identity is available to present. The claim therefore
identifies the Preparation by canonical checkout and requires exactly one live
armed occurrence for that attachment. Zero arms refuse as
`no-armed-occurrence`; two or more refuse as `ambiguous-armed-occurrence`. This
is the probe's proven behavior and is recorded as a known limitation: the
failure mode is a lost arm event, not a second session, and the exactly-one
rule keeps it closed.

### Payload and release

- `prepare` renders the exact outgoing payload deterministically from the
  disclosure basis and commits it as the Handoff record's content
  (`route: 'user-pull'`), bounded by the frozen transport bound (64 KiB). The
  payload is Neoflow-authored text: a fixed user-pull review header carrying
  the frozen authority and limitations, then the exact disclosure envelope.
- `claim` returns those committed bytes verbatim; it never re-renders. The
  resolver prints the existing marker line (with the claimed invocation
  identity) followed by the payload, so the skill contract and the
  `UserPromptSubmit` correlation regex are unchanged.
- The claim handle is opaque and runtime-held; it never appears in a view, a
  marker, or the payload. User-visible identity is review + batch + attachment.

### Record shapes

- Immutable: attachment (`harness.user-pull-attachment`: four-part identity,
  host version, manifest digest, compatibility identity, destination),
  Workflow Handoff (`harness.workflow-handoff`, `route: 'user-pull'`, payload
  content), Commitment Receipt, frozen capability snapshot
  (`FrozenUserPullReviewCapabilitySnapshot`, a sibling of the direct type per
  the WF-252 precedent), armed occurrence (`harness.user-pull-arm`: session,
  prompt, checkout, armed version), and Invocation
  (`harness.user-pull-invocation`, `initialStatus: 'awaiting-start'`).
- Revisioned: Preparation (`harness.user-pull-preparation`: state, opaque
  handle, disclosed deadline, payload digest, bounded armed occurrence
  identities, terminal reason). One revisioned record carries the whole
  boundary, so claim, withdrawal, and expiry race on one expected revision.
- Identity derivations: `attachmentIdentity` is `att_` plus a digest over the
  four identity parts; occurrence identity is `hpa_` plus a digest over
  (attachment, prompt); preparation identity is `hpp_` plus a digest over the
  command identity; the claim handle is an opaque one-use value recorded at
  prepare and never reissued.
- Index: `preparations[]` entries plus an optional `invocationIdentity` on
  handoff entries. `formatVersion` becomes 2; a stored v1 payload upgrades on
  read to an empty preparation set and every write is v2. New bounds:
  `MAX_PREPARATIONS` and a bounded per-Preparation arm list.

### Expiry reasons (closed)

`identity-lost` (session, checkout, or attachment record gone),
`capability-incompatible` (the frozen snapshot can no longer be honored), and
`route-deadline-passed` (only when prepare disclosed a deadline). A transient
bridge, TUI, or runtime outage is not an expiry: it leaves the Preparation
open and unavailable, which WF-255 projects. Reattachment never revives a
Preparation that already expired.

### Views

- `harness.user-pull.preparation` (read-only, bounded): the preparation for an
  attachment with status, disclosure summary, disclosed deadline, live-arm
  count, invocation identity when claimed, and terminal reason when withdrawn
  or expired. Payload bytes and the claim handle never appear.
- WF-255 layers availability and the application's lifecycle language on this
  view; WF-254 consumes the claimed invocation identity.

### Module seam

- Everything lives in the existing Harness Interaction owner behind
  `Workspace.execute`/`read`; no new local-runtime role, no new adapter seam,
  and `packages/workspace/src/harness-interaction/index.ts` stays types-only.
- The bridge's transitional `claude.bridge.hook-fact.relay` /
  `claude.bridge.review.resolve` requests are reconciled here: the expansion
  hook sends `arm`, the resolver sends `claim`; all other hook facts keep the
  transitional relay until WF-254 defines `observe`. Bridge wiring for attach
  waits for WF-255's host-version and freshness work.
- Scope: this child implements the workspace-side lifecycle and its focused
  tests; the application surface (WF-255) and the live matrix (WF-256) are not
  in scope.

## Acceptance

- [x] Preparation, Handoff, and Receipt commit atomically before the harness
      action is exposed; no payload can leave while the Preparation looks
      unclaimed.
- [x] Claim is exactly-once per Preparation: duplicate callbacks resolve to the
      existing claim; a fresh occurrence on a consumed handle gets no payload
      and creates no second Invocation.
- [x] Unknown handles, mismatched session/checkout, wrong protocol window, and
      post-withdrawal/expiry claims fail closed with exact reasons and never
      fall through to another Preparation.
- [x] Withdrawal/claim serialization proven both ways; Workflow Cancellation
      withdraws an open Preparation atomically.
- [x] Semantic expiry reasons (identity loss, incompatible capability,
      disclosed deadline) are durable and distinct from transient bridge or
      TUI outage, which leaves the Preparation open but unavailable.
- [x] Re-preparation after withdrawal/expiry is a fresh Preparation with a new
      receipt and handle; a claimed Invocation is never re-prepared without
      explicit resubmission.
- [x] Restart, failed commit, and post-commit crash tests preserve the
      unclaimed-or-claimed boundary with no replay.
- [x] Focused suites, canonical verification, seam checks, and
      `git diff --check` pass on Node 26.5.1 / pnpm 11.10.0.

## Completion evidence (2026-09-21, landed)

- Harness Interaction owns atomic prepare/arm/claim/withdraw, semantic expiry,
  v1-to-v2 index reading, exact 64 KiB-bounded payload retention, and
  payload-free duplicate recovery. Claude's two workflow gates map to arm and
  claim; all non-WF-253 hook facts remained on the transitional relay at this
  boundary.
- Focused lifecycle, attachment, bridge-command, protocol, and sanitizer suites
  passed: 5 files / 35 tests.
- Canonical local `pnpm verify` passed: 67 files / 479 tests in 383.84 s,
  including lint, format check, dependency firewall, package and test
  typechecks, clean build, and build smoke.
- Commit `46d31f4` landed on `main`. Verify run
  [35697968273](https://github.com/juantot9/neoflow/actions/runs/35697968273)
  passed on its first attempt in 6m36s; no rerun occurred.

## Constraints

- Preparation is never an Invocation; no harness activity is claimed before a
  claim commits.
- No arbitrary age timeout; elapsed time alone never ends consent.
- One Preparation per exact payload under the attachment's single-flight slot.
- Settle this child's pre-implementation Resolution (record shapes, command
  vocabulary, module seam) before code.
