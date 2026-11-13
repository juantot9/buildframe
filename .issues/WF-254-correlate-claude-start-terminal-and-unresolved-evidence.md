---
id: WF-254
title: "Correlate Claude start, terminal, and unresolved evidence"
status: closed
labels:
  - wayfinder:task
parent: WF-251
assignee: juanan
blocked_by: [WF-253]
created: 2026-09-19
---

## Outcome

After a claim, the resulting Invocation settles only as far as Claude Code's v1
evidence honestly allows: a matching `UserPromptSubmit` records the declared
harness-turn start; a matching normal `Stop` settles the terminal outcome; a
matching `StopFailure` settles failure; and missing, interrupted, disconnected,
or identity-lost evidence leaves the Invocation `unresolved` — never
`rejected`, never complete, never silently retried. Duplicate evidence is
idempotent. A payload already released is never re-sent.

## Resolution (settled 2026-09-22)

### One observation command, owned by Harness Interaction

- `harness.user-pull.observe` is the only Workspace command added by this
  child. The bridge maps `UserPromptSubmit`, `Stop`, `StopFailure`, and
  `SessionEnd` to a closed observation union; availability and attachment
  freshness remain WF-255's concern. This keeps lifecycle policy behind the
  existing Harness Interaction Interface rather than teaching transport code
  how to edit Invocation records.
- Native observations carry protocol version, session, prompt when the event
  has one, canonical git root, and canonical git dir. A reconciliation form
  carries an exact Invocation and Attachment Identity plus one closed loss
  reason. The latter is the seam WF-255 uses when verified freshness proves
  host disconnect or attachment loss; it is not a client claim of success or
  rejection.
- Harness Interaction resolves the claimed Preparation, claimed arm
  occurrence, Invocation, and immutable Attachment itself. It accepts a start
  or terminal observation only when session, prompt, root, and git dir match
  that exact occurrence. An ordinary unrelated Claude turn is ignored rather
  than guessed into the current Invocation.

### Evidence and state transitions

- The claimed Invocation starts `awaiting-start`. A matching
  `UserPromptSubmit` commits exact User Pull start evidence and moves it to
  `active`. The event means the correlated user turn was submitted to Claude;
  it does not prove model output, tool execution, or semantic understanding.
- A matching `Stop` can move only an `active` Invocation to
  `ended-normally`. A matching `StopFailure` moves only an `active` Invocation
  to `failed` with `harness-failed`. Missing start evidence never becomes
  proof that nothing started: a terminal callback against `awaiting-start`
  instead commits `unresolved` with `start-evidence-lost`.
- `SessionEnd` without accepted terminal evidence, verified host disconnect,
  attachment-identity change, and an expired start-observation window all move
  a nonterminal Invocation to `unresolved`. They never create `rejected`,
  `interrupted`, or success. Late terminal evidence conflicts with that durable
  outcome and cannot rewrite it.
- The closed User Pull unresolved reasons are
  `start-observation-window-expired`, `start-evidence-lost`,
  `session-ended-without-terminal`, `host-disconnected`,
  `attachment-identity-changed`, `background-activity-remains`,
  `background-activity-unverified`, and `stop-continuation-active`.
- Every accepted native observation becomes immutable normalized Harness
  Evidence containing the claimed arm occurrence and exact correlation facts.
  Evidence identity is derived from the native occurrence, not State version,
  so duplicate callbacks are idempotent across restart. Conflicting terminal
  callbacks fail closed.

### Observation window and background work

- Claim freezes an exact 30-second **start-observation deadline**. It is an
  evidence-retention window, not a no-start timeout: crossing it proves only
  that Neoflow lost the correlated `UserPromptSubmit`, so the Invocation becomes
  `unresolved`, never `rejected`. Evaluation is lazy during relevant commands
  and projections through the existing private deterministic clock seam; there
  is no timer process and no terminal-duration timeout.
- Normal Stop settles only when the callback explicitly reports zero
  `background_tasks`, zero `session_crons`, and no active Stop continuation.
  Nonzero counts, missing arrays, or an active continuation settle
  `unresolved` with the corresponding exact reason. The pinned probe proved
  only the zero/zero case, so this child does not guess that a foreground Stop
  ended background work.
- Ctrl+C has no native terminal callback. It therefore leaves the Invocation
  nonterminal until an exact later boundary (for example SessionEnd or verified
  correlation loss) commits `unresolved`; idle UI, restored input text, and
  partial output are not evidence.

### Durable shape and recovery

- Harness index format becomes v3. User Pull Invocations carry the exact
  optional start-observation deadline; v1 and v2 read compatibly and every
  subsequent write is v3. Older already-claimed v2 Invocations have no invented
  deadline and require another exact loss boundary.
- User Pull evidence extends the normalized evidence vocabulary with exact
  start, terminal, and correlation-loss variants. The existing evidence owner
  performs the one atomic evidence/index commit, duplicate recovery, and
  conflict handling; Claude does not gain a second state machine.
- Failed evidence commits leave the prior Invocation unchanged. A committed
  observation recovered after an ambiguous bridge response replays only its
  acknowledgement, never payload or another lifecycle transition.

### Artifact Result correction

- Claude's reviewed bridge deliberately excludes assistant text, tool results,
  and transcripts. It therefore has no evidence source satisfying
  `settled-final-assistant-text`, despite the provisional WF-252 Manifest shape.
  The User Pull contract makes `artifactResultContract` optional and the Claude
  Manifest omits it, explicitly stating that no Review Response Artifact is
  captured. Normal Stop settles lifecycle only; it proves neither semantic
  correctness nor a result Artifact.
- Direct capabilities remain unchanged and continue to require their Artifact
  Result Contract. Capturing Claude assistant text later requires a separately
  reviewed disclosure/evidence decision, not an opportunistic change to this
  lifecycle child.

### Bridge behavior

- The command builder maps the four lifecycle events after canonical checkout
  resolution. Expansion remains `arm` and the skill resolver remains `claim`.
  SessionStart/CwdChanged and availability facts stay transitional until
  WF-255.
- Start remains a workflow gate only when the sanitized resolver marker is
  actually present; ordinary prompts and all terminal/session callbacks remain
  non-blocking to Claude even when Neoflow cannot persist them. Neoflow records
  no success in that case and later loss evidence resolves conservatively.
- No transcript parsing, resend, replay, foreground cancellation, or local
  inference from bridge exit status is introduced.

## Acceptance

- [x] Expansion-armed identity is persisted before the resolver returns, and
      exactly one resolver may claim it; the same session, prompt, and
      canonical workspace are required at submit and terminal evidence.
- [x] Start observation is recorded only from the matching occurrence;
      absence of start evidence is never proof that nothing started.
- [x] Normal `Stop` settles ended-normally; `StopFailure` settles failed; both
      are correlated to the exact claim and are idempotent.
- [x] Ctrl+C, session end without terminal evidence, host disconnect during a
      turn, attachment-identity change, and observation-window expiry all
      produce `unresolved`; none produces rejection or success.
- [x] A missing payload release (failed pre-release commit) releases nothing
      and leaves no claimed-looking Preparation; a committed claim with an
      ambiguous response is recovered as claimed, not replayed.
- [x] Background tasks / session crons are either proven safe or block a
      success claim, per the pinned probe finding.
- [x] Focused suites, canonical verification, seam checks, and
      `git diff --check` pass on Node 26.5.1 / pnpm 11.10.0.

## Completion evidence (2026-09-22; landing validation blocked)

- Harness Interaction owns one closed `harness.user-pull.observe` command,
  exact claimed-occurrence correlation, durable start/terminal/loss Evidence,
  the 30-second Start Observation Window, conservative background-work policy,
  and v1/v2-to-v3 index reading. Claude maps the four reviewed lifecycle hooks
  without gaining workflow policy or a replay path.
- Claude's reviewed Manifest now omits the unsupported Review Response Artifact
  Result Contract, while Direct capabilities continue to require theirs.
- Focused Harness Interaction and Claude bridge suites pass: 10 files / 107
  tests, including restart, duplicate, failed-commit, ambiguous-response,
  SessionEnd, reconciliation-loss, background-work, and deadline scenarios.
- Canonical `pnpm verify` passes on Node 26.5.1 / pnpm 11.10.0: 67 files / 489
  tests in 383.02 s, plus lint, format, dependency firewall, package and test
  typechecks, clean build, and both smoke builds. `git diff --check` passes.
- Commits `eb735ba`, `5f52982`, and `3ab7309` were pushed together to `main`
  after explicit landing approval. Verify run
  [35736788315](https://github.com/juantot9/neoflow/actions/runs/35736788315)
  failed before any step or runner started because GitHub reported an account
  billing/spending-limit condition; it produced no code-verification result and
  was not rerun. WF-254 remains open pending valid CI evidence.
- Owner decision (2026-09-23): GitHub Actions is unfunded; no rerun is
  attempted and landing validation stays deferred. Local `pnpm verify` evidence
  is accepted in the interim.

## Constraints

- No transcript parsing, no replay channel, no automatic resend, no local
  cancellation claim substituting for terminal evidence.
- No stronger outcome than the frozen capability's evidence profile declares.
- Settle this child's pre-implementation Resolution (evidence vocabulary and
  state transitions) before code.

## Closure (2026-11-12)

Superseded by
[Ship the 0.1.0 public preview](./WF-287-ship-the-0-1-0-public-preview.md).
The owner's model is connect-once: `/neoflow` in a Claude Code session
connects it, and every Send then goes directly to it through the native Mod
connector (WF-259). The per-message `/neoflow:review` plugin, its status-line
attach and their bridge code are removed. The owner used them only in early
testing. The Workspace User Pull lifecycle stays, so recorded history still
reads.
