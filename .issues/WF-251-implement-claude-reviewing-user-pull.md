---
id: WF-251
title: "Implement Claude Reviewing User Pull"
status: closed
labels:
  - wayfinder:map
parent: WF-051
assignee: juanan
blocked_by: []
created: 2026-09-19
---

## Destination

Claude Code's one-use `/neoflow:review` User Pull route is implemented end
to end through the existing Workspace and Harness Interaction Interfaces: one
exact Preparation is committed and armed before the harness action is exposed;
one native command occurrence claims it atomically and releases the payload
only after the claim commits; correlated start and terminal evidence settle the
resulting Invocation as far as Claude Code's v1 profile honestly allows;
withdrawal and semantic expiry end open Preparations; bridge, session,
checkout, and identity loss fail conservatively with no payload release and no
replay; and availability plus optional Context Budget Evidence are published
only when the bridge and its freshness are verified. No push, cancellation, or
stronger effect guarantee is invented for parity.

## Notes

- **Parallel with P25.** The owner directed this phase to proceed in parallel
  with the remaining Pi Reviewing Direct-route closeout (WF-244/WF-245 manual
  pass). This map does not touch Pi scope.
- **Scope boundary.** Reviewing User Pull only. Claude's Native Plan Gate is
  P37/P38; Manual Handoff and route selection are P27.
- **Blueprint authority.**
  [Establish Claude Code's integration envelope](./WF-003-establish-claude-code-integration-envelope.md),
  [Probe Claude Code's attached Plan and Review paths](./WF-020-probe-claude-attached-paths.md),
  [Establish Pi and Claude Code context-budget evidence](./WF-021-establish-context-budget-evidence.md),
  [Define v1 Workflow Handoff payload contracts](./WF-031-define-v1-workflow-handoff-payload-contracts.md),
  [Define prepared User Pull lifecycle](./WF-033-define-prepared-user-pull-lifecycle.md),
  [Validate the Harness Interaction Module implementation seam](./WF-044-validate-harness-module-implementation-seam.md),
  and the Claude Code v1 profile in `docs/blueprint/harness-capability-seam.md`.
- **Native facts are pinned, not assumed.** Primary report and probe assets:
  `docs/research/claude-attached-live-probes.md` and
  `docs/probes/claude-attached/` on `task/claude-attached-paths` (Claude Code
  2.1.209). Production negotiates and tests actual behavior; the user's local
  build is not authority.
- **Owner decision (2026-09-19):** per-event hook scripts connect to the
  running runtime over its local socket; the runtime stays the single
  long-lived host. A long-lived bridge daemon per Claude session is rejected:
  process supervision, stale sockets, and version skew for no added guarantee.
- **Owner decision (2026-09-23):** GitHub Actions is unfunded; do not push or
  trigger CI. Each child's canonical verification runs locally (`pnpm verify`
  plus its risk probes) and landing stays deferred until the budget changes.
  WF-254 and WF-255 remain open for that reason, not for a code problem.
- **Artifact of record.** Each child records its own pre-implementation
  Resolution before code, then outcome/finding/evidence after.

## Children

1. [WF-252 — Establish the Claude attachment and bridge transport](./WF-252-establish-the-claude-attachment-and-bridge-transport.md)
2. [WF-253 — Own the User Pull Preparation lifecycle](./WF-253-own-the-user-pull-preparation-lifecycle.md)
3. [WF-254 — Correlate Claude start, terminal, and unresolved evidence](./WF-254-correlate-claude-start-terminal-and-unresolved-evidence.md)
4. [WF-255 — Publish Claude availability and Context Budget Evidence](./WF-255-publish-claude-availability-and-context-budget-evidence.md)
5. [WF-256 — Prove the Claude User Pull matrix and live path](./WF-256-prove-the-claude-user-pull-matrix-and-live-path.md)

Order: WF-252 → WF-253 → WF-254 → WF-255 → WF-256. WF-253's record shape
may be settled while WF-252's transport is built; WF-254–256 depend on both.

## Acceptance

- [ ] All five children closed with their own recorded evidence.
- [ ] Learning gate did not fire: no Preparation treated as an Invocation, no
      User Pull consumed by the wrong occurrence, no invented push,
      cancellation, or stronger effect guarantees.
- [ ] Canonical verification and risk probes green on the closed tree; the
      human-driven live path is recorded against the pinned build.

## Constraints

- No CI spend without per-landing approval; landings are batched.
- Never inspect, copy, retain, or relay real Claude transcripts, credentials,
  prompt text, or user configuration; all fixtures are synthetic.
- A missing plugin cannot fail closed; "plugin absent" is capability
  unavailable, never a fabricated failure.
- Truthfulness rules hold: exact outgoing bytes leave only after a claim
  commits; no fabricated Responses; a claim is never replayed; unresolved
  stays unresolved.

## Closure (2026-11-12)

Superseded by
[Ship the 0.1.0 public preview](./WF-287-ship-the-0-1-0-public-preview.md).
The owner's model is connect-once: `/neoflow` in a Claude Code session
connects it, and every Send then goes directly to it through the native Mod
connector (WF-259). The per-message `/neoflow:review` plugin, its status-line
attach and their bridge code are removed. The owner used them only in early
testing. The Workspace User Pull lifecycle stays, so recorded history still
reads.
