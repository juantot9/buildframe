---
id: WF-252
title: "Establish the Claude attachment and bridge transport"
status: open
labels:
  - wayfinder:task
parent: WF-251
assignee: juanan
blocked_by: []
created: 2026-09-19
---

## Outcome

A reviewed `packages/claude-adapter` package ships the Claude Code plugin — plugin
manifest, hooks, the `/neoflow:review` skill, and Node bridge scripts — plus the
reviewed manifest and command payloads the running workspace accepts from it.
Every hook event reaches the workspace runtime through a short-lived per-event
connection; the attachment identity is exact and stable across a session's
events; a missing or unreachable runtime fails workflow gates closed while
ordinary Claude use continues; and nothing outside the reviewed, bounded hook
fields is read, stored, or relayed.

## Finding

Claude Code 2.1.209 probes (`task/claude-attached-paths`) established the native
facts this child must preserve: `UserPromptExpansion` must persist identity
before dynamic skill resolution; `UserPromptSubmit` carries only the original
slash command; every hook carries current `cwd`, so workspace identity is
revalidated per event; `CwdChanged` is not reliable; a linked worktree has a
distinct root and must be refused; with the plugin absent the command is simply
unknown (no events at all), while a present bridge with no host can exit 2 and
fail the gate closed. See `docs/research/claude-attached-live-probes.md`.

## Interface

- New package `packages/claude-adapter`, mirroring `packages/pi-adapter`'s
  posture (own manifest, tests, build; no workflow policy).
- `plugin/` static assets: `.claude-plugin/plugin.json`, `hooks/hooks.json`,
  `skills/review/SKILL.md`, plus the built bridge entry the hooks invoke.
- The bridge speaks the existing Workspace Interface (`execute`/`read`) as a
  reviewed client; it does not learn Harness Interaction policy and does not
  construct durable records itself.
- New closed command vocabulary in Harness Interaction for the hook facts
  (`attach`, `arm`, `claim`, `observe`, `availability`); naming and exact
  payloads are settled in this child's Resolution and the owning child's
  records.
- No new `local-runtime` role and no directive channel: Claude has no push.

## Resolution (settled 2026-09-19)

### Transport: per-event reviewed client, not a new runtime role

- Each hook is a short-lived Node process that sanitizes its stdin payload,
  connects to the workspace runtime's existing local socket, executes one
  reviewed command, writes its hook response, and exits. The runtime remains
  the single long-lived host; no per-session bridge daemon exists.
- The `harness-adapter` role and `ReviewedHarnessAdapter` seam stay the Pi (and
  future push-capable) transport. Claude User Pull inverts the direction — the
  host calls Neoflow, never the reverse — so routing it through a role built
  for directive dispatch would distort attachment/availability semantics
  (per-event connect/disconnect churn) without adding any guarantee.
- The reviewed boundary is the manifest plus the closed hook-fact commands;
  the same structural validation, compatibility identity, refusal reasons, and
  evidence records used for Pi apply. If P37/P38 later needs a gating hook
  response, it uses the same synchronous client call, not a push channel.
- Rationale for the workspace Interface: arming, claiming, and observing are
  semantic actions with durable records owned by Harness Interaction, so they
  belong in the command vocabulary — not in transport code.

- The bridge connects under the existing `cli` client role (owner-settled
  2026-09-19). `harness-adapter` stays Pi's push transport and no new role is
  introduced, so `cli` is the honest description of a short-lived process that
  connects, executes one reviewed command, and exits. Consequence to carry into
  WF-255: the bootstrap role alone cannot distinguish a Claude hook from the
  user's own CLI, so availability records must key on the attachment identity
  rather than the role.

### Attachment identity

- `(harness = claude-code, session_id, canonical git root, canonical git dir)`;
  `git-common-dir` is related-checkout metadata only.
- Every event canonicalizes its `cwd` and revalidates the full identity; a
  mismatch refuses the event. Subdirectories resolve to the git root; a linked
  worktree is a distinct checkout and is refused unless it is the attached one.
- The manifest declares only the Review User Pull capability with the
  communicated-only effect constraint, correlated submission/Stop/StopFailure
  evidence, and no interruption or replay claim.

### Capability contract shape (settled 2026-09-19)

- `DirectReviewCapabilityContract` could not express this route honestly: it
  requires `route: 'direct'`, `evidenceProfile.dispatchRejection`,
  `evidenceProfile.interruption: 'correlated'`, and
  `interruption.route: 'direct-request'` as closed literals. Claude User Pull has
  no dispatch, no interruption channel, and no push, so filling those in would
  have been four false claims.
- Resolution: a sibling `UserPullReviewCapabilityContract` beside the direct one,
  with `ReviewedCapabilityContract` as the union and `route` as the discriminator;
  `ReviewedCapabilityManifest.capabilities` now holds the union. The owner chose a
  sibling type over widening the shared one so that a *direct* Adapter still
  cannot declare the weaker profile by omitting fields — the direct contract's
  literals stay closed, and `normalizeCapability` dispatches on `route` and
  refuses an unknown one.
- The user-pull evidence profile is `submission`/`normalEnd`/`failure`
  correlated, `interruption` and `replay` unavailable. It carries no
  `noStartTimeoutMs`: nothing is dispatched, so nothing can fail to start.
- Every Harness Interaction site that consumes a capability already filtered on
  `route === 'direct'`; those `find` calls now carry type predicates, and the
  frozen-snapshot rehydration path fails closed if a stored direct handoff ever
  presents a non-direct capability.

### Manual entry point (settled 2026-09-19)

- The command is `/neoflow`, not `/neoflow:review`. The plugin uses the
  single-skill layout — one `SKILL.md` at the plugin root, no `skills/`
  directory — with frontmatter `name: neoflow` setting the invocation name.
- **Open, needs live confirmation:** the probe only ever exercised
  `/neoflow:review`, and the plugin reference does not state whether a
  single-root skill whose name matches the plugin renders as `/neoflow` or as
  `/neoflow:neoflow`. WF-256's live matrix must confirm the literal command
  string and the `command_name` the expansion hook receives before any surface
  quotes it to the user.

### Payload discipline

- The bridge forwards only reviewed bounded fields: event name, session/prompt
  identity, canonicalized paths, command name for the namespaced skill,
  digests and lengths (never prompt or plan text), and the resolver's batch
  marker. Transcript paths, ordinary prompt text, assistant text, tool results,
  credentials, and arbitrary tool payloads are never read or stored.
- Envelope and reply bounds match the probe's conservative limits; oversized or
  invalid input blocks a workflow gate and is ignored for lifecycle hooks.
- Plugin absent = capability unavailable (Claude reports an unknown command);
  plugin present + runtime absent = workflow gates denied with an explicit
  reason while non-gating hooks continue.

### Packaging

- The bridge builds from TypeScript in-package and is invoked by `hooks.json`
  through `${CLAUDE_PLUGIN_ROOT}`; the dogfood path may reference the built
  repository artifacts. Portable single-file packaging and release coordinates
  remain P54's problem and are recorded as a known limitation, not promised.
- Reviewed host versions are declared from tested behavior; a version outside
  the reviewed set refuses attachment rather than guessing.

### Bridge increment: process shell, seam, and fixture host (settled 2026-09-19)

- **Sequencing (owner-approved).** The bridge entry is built now, against a
  fixture host; WF-253's Preparation vocabulary is not a prerequisite. WF-252
  stays transport-only: it relays sanitized facts and constructs no durable
  records.
- **The command builder is the reconciliation point.** Until WF-253 settles the
  Harness Interaction hook-fact commands, the bridge sends two bridge-owned
  transport requests (`claude.bridge.hook-fact.relay`,
  `claude.bridge.review.resolve`) through the existing `cli` client as Workspace
  `execute` payloads. A real runtime does not yet accept them, so it answers
  `workspace.error` and the bridge fails closed; the fixture host is the only
  accepting host in this increment. WF-253 replaces command construction only —
  endpoint discovery, `cli` bootstrap, framing, bounds, and reply validation do
  not change.
- **Gate occurrences, not gate event names.** Only a `UserPromptExpansion` for
  the Neoflow command and a `UserPromptSubmit` carrying a resolver batch marker
  are workflow gates. A plain prompt is relayed as a fact when the runtime is
  reachable and ignored when it is not, matching the probe: an absent host never
  denied ordinary Claude use.
- **Entry layout.** `plugin/bridge/hookBridge.js` and
  `plugin/bridge/resolveReview.js` are checked-in ESM shims over the built
  `dist/bridge/` entry; `${CLAUDE_PLUGIN_ROOT}` remains the only path the hooks
  and skill know. Portable single-file packaging stays P54's problem.
- **Fixture host.** A real `startLocalRuntimeServer` over a scripted Workspace,
  reached through the real socket and the real `cli` bootstrap; the probe-era
  newline protocol is not reintroduced. Process-level entry verification runs in
  `smoke:build`, after the build that produces the entry the hooks invoke; unit
  verification runs in `pnpm test`, before any build.

## Acceptance

- [ ] Plugin assets parse and load in a synthetic `CLAUDE_PLUGIN_ROOT`; hooks
      invoke the bridge and a fixture host without any real Claude process.
- [ ] Deterministic fixtures replay the recorded, sanitized hook payload shapes
      for expansion, submit, stop, stop-failure, session start/end, and cwd
      changes.
- [ ] Subdirectory canonicalization, linked-worktree refusal, `/cd`
      revalidation, and session/prompt/workspace mismatch refusals are covered.
- [ ] Runtime-absent gates block with an explicit reason; lifecycle hooks are
      non-blocking; no event reaches a transcript, credential, or prompt text.
- [ ] The reviewed manifest declares only User Pull Review with the honest
      evidence profile and limitations.
- [ ] Focused package tests, canonical verification, dependency/package seams,
      and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0.

## Constraints

- No Preparation, claim, or Invocation semantics here; the bridge only relays
  facts. WF-253 owns the lifecycle.
- No push, cancellation, or busy-state claim. No transcript parsing, no
  `CwdChanged` dependence, no daemon.
- Settle this Resolution before code; record any reversal here rather than in
  chat.
