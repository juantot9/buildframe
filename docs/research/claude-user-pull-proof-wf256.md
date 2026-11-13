# Claude User Pull proof and limitations (WF-256)

_Started 2026-09-23. Production compatibility remains pinned to Claude Code
2.1.209. GitHub Actions is unfunded (owner decision), so canonical verification
and risk probes run locally and landing run links are explicitly deferred._

## Deterministic matrix

- `packages/workspace/test/scenarios/userPullMatrix.test.ts` covers every
  reachable User Pull guard with a named mutation: apply the mutation, assert
  the exact rejection, revert, then assert the guarded transition succeeds.
  Rows: `bridge-protocol-mismatch`, `checkout-moved`,
  `attachment-record-missing` (attachment-not-found and identity-lost),
  `state-version-stale`, `command-identity-reused`, `occurrence-missing`,
  `occurrence-ambiguous`, `armed-occurrence-limit-reached`,
  `preparation-already-open`, `batch-already-handed-off`, `batch-unknown`,
  `inspection-changed`, `route-deadline-passed`, `host-version-unsupported`,
  `capability-revised-to-direct`, `attachment-destination-changed`,
  `capability-revised-incompatible`, `preparation-unknown`,
  `preparation-claimed`, `observability-record-missing`,
  `observability-attachment-record-missing`.
- The same file carries the Preparation/Invocation transition rows:
  correlated normal Stop as `ended-normally`, correlated StopFailure as
  `failed`, terminal-before-start and observation-window loss as `unresolved`,
  uncorrelated observation ignored, and withdrawal without an Invocation.
- A coverage invariant compares the matrix rows with the explicit reachable
  guard list, so a new guard without a row fails the suite. The structurally
  defensive guards (`availability-blocked`, `active-invocation-exists`,
  `state-conflict`, `occurrence-identity-conflict`,
  `user-pull-payload-too-large`, `snapshot-stale`, `snapshot-unverified`,
  `review-not-found`, `review-not-active`) are unreachable through the
  reviewed commands within bounded fixtures; the projection layer covers their
  visible effect and they stay enforced in code.
- `packages/claude-adapter/test/contracts/claudeUserPullMatrix.test.ts` covers
  the eight recorded hook events across five host outcomes (`observed`,
  `blocked`, `unavailable` with each reviewed reason, thrown), the status-line
  bridge outcomes and refusals, and the exact gate wording.
- `packages/claude-adapter/test/fixtures/claudeObservedEvents.ts` ports the
  recorded native shapes from `docs/probes/claude-attached/observed-results.json`
  (branch `task/claude-attached-paths`). Every fixture carries the unrelated
  recorded fields (`transcript_path`, `cost.total_cost_usd`, `rate_limits`,
  credential-shaped `secret`, `compact_summary`, `custom_instructions`), and
  the matrix asserts none of them survive sanitization.

## Live path

The launcher is `scripts/live-claude-user-pull.mjs`. It never injects terminal
input: it prepares a synthetic repository under `/private/tmp`, an isolated
`CLAUDE_CONFIG_DIR` and `XDG_STATE_HOME`, hosts the runtime socket, and stages
an active Review plus prepared User Pull through the Workspace seam before
launching the pinned binary at
`/private/tmp/neoflow-claude-2.1.209/node_modules/.bin/claude`. The human
types every action inside the launched Claude Code; the launcher only prints
instructions and records the final Workspace view plus the human observation.

The app cannot stage this itself today: the Reviewing surface has no prepare
action and new Reviews are never marked `active`, so the harness stages the
same shape the deterministic fixtures use. That product gap is recorded here
for a follow-up task.

Procedure per scenario:

1. Export `CLAUDE_CODE_OAUTH_TOKEN` in the operator environment.
2. Run the launcher: `node scripts/live-claude-user-pull.mjs <scenario>`.
3. Press Enter when prompted; Claude Code launches in the synthetic checkout.
4. Type `/neoflow:review` and perform the scenario's action (Ctrl+C for
   `review-interrupt`, `kill -USR1 <launcher-pid>` for `review-disconnect`).
5. When Claude exits, record a one-line observation; the launcher writes
   `evidence.json` under the run root.

Scenarios: `review-stop`, `review-stop-failure`, `review-interrupt`,
`review-disconnect`, `review-nohost`, `plugin-absent`, `worktree-mismatch`, and
`context-budget` (isolated settings enable the status-line compositor).

### Live observations

- `review-stop` (2026-09-28, Claude Code `2.1.209`, synthetic checkout):
  `/neoflow:review` pulled the staged batch, the Invocation settled
  `ended-normally` with both start and terminal evidence (`totalEvidence: 2`,
  `missingStartEvidence: false`, `missingTerminalEvidence: false`), and the
  preparation stayed `claimed`. The `SessionEnd` hook projected availability as
  `blocked-by-runtime`/`session-ended` without changing the settled Invocation.
  Context budget stayed `unavailable`/`status-line-bridge-not-verified` because
  this scenario does not enable the compositor. Human observation: Claude
  reviewed the synthetic file, showed the diff, answered the question, and
  added a "worth flagging" paragraph.
- `review-stop-failure` (2026-09-28): the invalid-model turn settled the
  Invocation `failed` (`missingStartEvidence: false`,
  `missingTerminalEvidence: false`, `totalEvidence: 2`) with terminal reason
  `harness-failed`; the preparation stayed `claimed`. Human observation: Claude
  reported that the selected model does not exist or is not accessible.
- `review-interrupt` (2026-09-28): pressing Ctrl+C once during the streamed
  response left the Invocation `unresolved` with terminal reason
  `session-ended-without-terminal`; start evidence existed, no Stop or
  StopFailure arrived, and the preparation stayed `claimed`. Human observation:
  Claude asked for the tool permission, streaming began, and the operator
  interrupted it.
- `review-disconnect` (2026-09-28): the operator stopped the runtime before the
  turn finished (`runtime_stopped_by_operator: true`). The Invocation stayed
  `active` with terminal evidence missing (`totalEvidence: 1`), availability
  stayed `revalidated` because an unreachable runtime cannot persist its own
  outage and Neoflow never backfills it, and the preparation stayed `claimed`.
  Human observation: the stop worked; Claude produced a partial response.
- `review-nohost` (2026-09-28): with no runtime socket hosted, the
  `UserPromptExpansion` gate was blocked by the hook (Claude showed
  "UserPromptExpansion operation blocked by hook"). The preparation stayed
  `prepared`, no Invocation was created, and availability stayed `revalidated`
  because the absent runtime cannot persist its own outage.
- `plugin-absent` (2026-09-28): without `--plugin-dir`, Claude reported the
  command as unknown (autocomplete did not list it) and no Neoflow hook fired;
  no Review or runtime was staged. This is the capability-unavailable state, not
  a failed-closed gate.
- `worktree-mismatch` (2026-09-28): with Claude launched in the linked
  worktree, `/neoflow:review` was refused before any resolution (the worktree
  carries a different Workspace Identity, so no runtime is discoverable for
  it). The main-checkout preparation stayed `prepared` and no Invocation was
  created.
- `context-budget` (2026-09-29): with the status-line compositor enabled, the
  sampled projection showed the whole budget lifecycle live:
  `unavailable`/`status-line-bridge-not-verified` before the first reading,
  `unknown`/`awaiting-response` with Sonnet 5 and a 200,000-token window, then
  `available` with host-reported input tokens (15,817 then 16,554 of 200,000)
  while the Invocation was `active`, and finally `unknown`/`session-ended`
  after the `SessionEnd` hook. The Invocation settled `ended-normally` with
  start and terminal evidence. Human observation: Claude inspected the prompt,
  ran the synthetic review, showed the diff, and explained what it did.

Each run writes `evidence.json` under its run root with the scenario, build
version, session identity, Claude exit code, the Workspace `userPull`
projection, the Invocation status, and the human observation. Conversation
output, transcripts, and credentials are never retained.

## Limitations matrix

| Concern | Status | Why |
| --- | --- | --- |
| Plugin absent | Capability unavailable | Claude reports the command as unknown and emits no integration events; a missing plugin cannot fail closed. |
| Host absent | Gate fails closed | A present bridge exits 2 for the Review gate and leaves ordinary hooks non-blocking; proven by the probe, the built-entry smoke, and the launcher's `review-nohost` scenario. |
| Hook delivery | Not durable or replayable | Hooks have no acknowledgement or replay channel; a missed terminal event is never backfilled or resent. |
| Normal Stop | Boundary, not success | A correlated Stop proves a normal main-turn boundary, not that feedback was understood or applied. |
| Background work | Conservative | Live background tasks/crons were not probed; the policy withholds a success claim unless the counts are present and zero. |
| User interrupt | `unresolved` only | Ctrl+C emitted no Stop or StopFailure on the probed build; the Invocation stays unresolved and the command is never resent. |
| `/cd` changes | Revalidated every event | `CwdChanged` did not fire for interactive `/cd` on 2.1.209; every workflow event canonicalizes the current cwd instead. |
| Other platforms/versions/auth | Unproven | Only macOS arm64, the first-party claude.ai auth path, and the pinned 2.1.209 build are covered; enterprise policy and alternate providers need their own probes. |
| Release packaging | Out of scope | Plugin shims import the repository build; portable single-file packaging remains a later concern. |
| Read-only Review | Not enforced | The probe's skill needed Bash to resolve the batch and Claude permissions stay authoritative; no read-only guarantee is claimed. |
| Push, cancellation, busy state, semantic success | Not claimed | No host API, transcript reconstruction, or local inference is used to invent any of them. |
| Status-line singleton | Explicit opt-in | A plugin cannot install the user's `statusLine`; without the verified compositor, Context Budget Evidence stays unavailable. |
| Token estimates | Never performed | Facts are host-reported or absent; no tokenizer estimate, transcript reconstruction, or payload reduction exists. |
