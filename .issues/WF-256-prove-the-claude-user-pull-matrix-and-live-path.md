---
id: WF-256
title: "Prove the Claude User Pull matrix and live path"
status: closed
labels:
  - wayfinder:task
parent: WF-251
assignee: juanan
blocked_by: [WF-254, WF-255]
created: 2026-09-19
---

## Outcome

The Claude User Pull route closes with versioned evidence: the probe's
deterministic protocol suite ported into the repository's test tree (expiry,
duplicate, failure, interruption, disconnect, workspace mismatch), a fault
matrix over commit-before-arm, claim races, restart, release-before-response,
and identity loss, and a human-driven live path against the pinned Claude Code
build using only synthetic fixtures. Claims beyond the blueprint — push,
cancellation, semantic success, replay — are explicitly listed as unproven.

## Resolution (settled 2026-09-23)

### What this child adds on top of WF-252–WF-255

The happy path and most refusals are already exercised by `userPullLifecycle`,
`claudeBridgeCommands`, `claudeBridgeSocketHost`, `claudeHookBridge`,
`claudeSanitizer`, `claudeStatusLine`, and `smoke-claude-bridge`. WF-256 adds
four things: one deterministic transition/refusal matrix with named mutations
and reversion, the probe's recorded payload shapes as fixtures, a human-driven
live procedure against the pinned build, and the written limitations matrix.

### Deterministic matrix shape

- Workspace matrix: `packages/workspace/test/scenarios/userPullMatrix.test.ts`.
  One table row per `(command, guard, mutation, expected reason or
  disposition)`. Each row starts from the canonical prepared fixture, applies
  the named mutation, executes the command, asserts the exact outcome, reverts
  the mutation, and executes a fresh command identity to assert the guarded
  transition succeeds. A final assertion compares the covered reasons with an
  explicit User Pull reason list derived from `HarnessCommandRejectionReason`,
  so a new reason without a matrix row fails the suite.
- Named mutations include: `attachment-record-missing`,
  `attachment-identity-mismatch`, `checkout-moved`, `host-version-unsupported`,
  `capability-revised`, `preparation-withdrawn`, `preparation-expired-deadline`,
  `occurrence-missing`, `occurrence-ambiguous`, `occurrence-conflict`,
  `bridge-protocol-mismatch`, `state-version-stale`, `command-identity-reused`,
  `commit-fails-before-evidence`, `commit-fails-after-evidence`,
  `payload-oversized`, `runtime-generation-changed`,
  `observability-record-missing`, `compatibility-changed`,
  `background-work-present`, `stop-before-start`, `observation-window-elapsed`.
  Existing fault wrappers (`MissingRecordState`, `FailingEvidenceState`,
  `FailingClaimState`) are reused; new wrappers stay test-local.
- Adapter matrix: extend the existing bridge suites into one table over
  request/event × host outcome (`observed`, `blocked`, `unavailable(reason)`,
  thrown) asserting gate allow/deny/ignore and status-line refusal mapping,
  including `bridge-request-rejected`, unsupported host versions, and the
  status-line field allowlist.
- Native shapes: port `docs/probes/claude-attached/observed-results.json`
  (branch `task/claude-attached-paths`) into synthetic fixtures under
  `packages/claude-adapter/test/fixtures/`; no transcript, prompt, credential,
  or user data is copied. A sanitizer assertion proves those fields are dropped.

### Live procedure (human-driven)

- Pinned build: install `@anthropic-ai/claude-code@2.1.209` under
  `/private/tmp/neoflow-claude-2.1.209` with the probe's documented commands and
  verify `--version`; never substitute the operator's newer CLI.
- Isolation: synthetic repo under `/private/tmp` (main, subdir, linked
  worktree), isolated `CLAUDE_CONFIG_DIR`, only `--plugin-dir
  packages/claude-adapter/plugin` (built), no user plugins, MCP servers, or
  sessions.
- Neoflow side: the operator runs the app against the synthetic checkout,
  creates the immutable Review, and prepares User Pull (`Ready to pull`).
- Claude side: a new `scripts/live-claude-user-pull.mjs` launcher prints the
  human steps, never injects terminal input, and after the session reads the
  Workspace views through the runtime socket to write a machine-readable
  evidence file under `/private/tmp`.
- Scenarios: `review-stop`, `review-stop-failure`, `review-interrupt` (operator
  Ctrl+C), `review-disconnect` (launcher stops the runtime on request),
  `review-nohost`, `plugin-absent`, `worktree-mismatch`, and `context-budget`
  with the status-line compositor opt-in. Negative controls: duplicate pull in
  one session and subdirectory canonicalization.
- Evidence: a redacted record lands in
  `docs/research/claude-user-pull-proof-wf256.md` with scenario names, observed
  event sequences, workspace view lines, the exact build, and the limitations
  matrix. Conversation output, transcripts, and credentials are discarded.

### Limitations matrix

`docs/research/claude-user-pull-proof-wf256.md` records, per claim: plugin
absent, host absent, hook delivery not durable or replayable, transcript
independence, background tasks/crons, Ctrl+C without a terminal event, `/cd`
without `CwdChanged`, other platforms/versions/authentication, release
packaging, question-only/read-only not enforced, and no
push/cancellation/busy/semantic-success claim.

### Local verification

`pnpm verify` plus the applicable `pnpm risk:*` probes run locally on Node
26.5.1 / pnpm 11.10.0; `git diff --check` stays clean. GitHub Actions is
unfunded per the owner decision, so landing run links are explicitly deferred
rather than required.

### Settled owner decisions

1. Acceptance bullet 5 records local verification evidence; landing run links
   stay deferred under the unfunded-CI decision.
2. The live path installs the pinned `@anthropic-ai/claude-code@2.1.209` under
   `/private/tmp/neoflow-claude-2.1.209`.
3. The Neoflow side of the live path is runner-staged: `scripts/live-claude-user-pull.mjs`
   hosts the runtime and stages an active Review plus prepared User Pull through
   the Workspace seam. The app-driven path was originally chosen but the app has
   no prepare action and new Reviews are never `active`, so the route is staged
   exactly as the deterministic fixtures do.
4. Isolated Claude uses an operator-supplied `CLAUDE_CODE_OAUTH_TOKEN`; no
   keychain scraping and no credential persistence.

## Acceptance

- [x] Deterministic matrix covers every Preparation/Invocation transition and
      refusal reason with named mutations tripping each guard before reversion.
- [x] Native payload fixtures are recorded shapes, not captured user data;
      no transcript, credential, or prompt text is retained.
- [x] The live path (human-driven, pinned build, synthetic repository) proves
      arm → claim → payload release → correlated Stop/StopFailure and the
      unresolved fallbacks.
- [x] A written limitations matrix records exactly what remains unproven and
      why (plugin absent, transcript independence, background tasks, other
      platforms/versions, release packaging).
- [x] Canonical verification and risk probes green locally; local evidence
      recorded in this issue (GitHub Actions is unfunded per the owner decision,
      so landing run links are explicitly deferred).

## Completion evidence (partial, 2026-09-23)

- `userPullMatrix` covers 22 reachable guards with named mutations, a
  coverage invariant, and 5 transition rows (28 tests); unreachable defensive
  guards are listed explicitly. `claudeUserPullMatrix` covers 8 recorded hook
  events × 5 host outcomes plus status-line outcomes and refusals (48 tests).
  `claudeObservedEvents` ports the probe's recorded shapes with forbidden
  markers asserted dropped.
- `docs/research/claude-user-pull-proof-wf256.md` records the matrix shape,
  the live procedure, and the full limitations matrix.
- Local verification on Node 26.5.1 / pnpm 11.10.0: `pnpm verify` green on the
  final tree (70 files / 573 tests, lint, format, dependency firewall,
  typechecks, build, both smokes), and `risk:state`, `risk:runtime`, `risk:pi`,
  and `risk:dogfood` all passed; package and test code is unchanged since
  `bb8b3b6`, with only the live launcher and the record changing afterward.
- Live runs complete on 2026-09-28/29 against the pinned `2.1.209` build:
  `review-stop` (Invocation `ended-normally`, start and terminal evidence),
  `review-stop-failure` (`failed`, `harness-failed`), `review-interrupt`
  (`unresolved`, `session-ended-without-terminal`), `review-disconnect`
  (Invocation left `active`, terminal evidence missing, availability stayed
  `revalidated`), `review-nohost` (gate blocked, no Invocation),
  `plugin-absent` (unknown command, nothing staged), `worktree-mismatch`
  (refused, no Invocation), and `context-budget` (budget timeline:
  unavailable → `awaiting-response` → `available` 15,817/200,000 then
  16,554/200,000 → `session-ended`). Redacted observations are in
  `docs/research/claude-user-pull-proof-wf256.md`.

## Constraints

- Budget: GitHub Actions is unfunded (owner decision 2026-09-23); no push or
  CI run, and verification is local. Landings are deferred, not batched.
- Live evidence is human-driven; the agent never injects terminal input or
  inspects real Claude sessions.
- Settle this child's pre-implementation Resolution (matrix shape and live
  procedure) before code.

## Closure (2026-11-12)

Superseded by
[Ship the 0.1.0 public preview](./WF-287-ship-the-0-1-0-public-preview.md).
The owner's model is connect-once: `/neoflow` in a Claude Code session
connects it, and every Send then goes directly to it through the native Mod
connector (WF-259). The per-message `/neoflow:review` plugin, its status-line
attach and their bridge code are removed. The owner used them only in early
testing. The Workspace User Pull lifecycle stays, so recorded history still
reads.
