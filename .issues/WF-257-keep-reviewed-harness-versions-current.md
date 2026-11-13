---
id: WF-257
title: "Keep reviewed Harness versions current"
status: open
labels:
  - wayfinder:task
parent: WF-051
assignee: juanan
blocked_by: [WF-256]
created: 2026-09-23
---

## Outcome

Neoflow's reviewed Harness version policies stay current through one bounded,
repeatable update, without ever trusting the user's installed or auto-updated
build. Pi already carries a verified-version list and compatibility range
(`VERIFIED_PI_HOST_VERSIONS`, `>=0.80.6 <1.0.0`); Claude Code is pinned to one
reviewed version (`2.1.209`). This task owns the procedure that widens or moves
either policy: probe the newer build, re-run the deterministic matrices and a
human live pass against that exact build, record what changed, and publish the
new reviewed policy. A version bump deliberately changes the compatibility
identity, so frozen capability snapshots and old Context Budget Evidence are
invalidated explicitly instead of silently carrying over.

## Acceptance

- [ ] The update procedure names the artifacts to refresh per adapter (reviewed
      host versions, manifest digest, adapter implementation identity) and the
      evidence bar for each.
- [ ] A newer build is supported only after the deterministic matrices, seam
      checks, applicable adversarial trust-boundary probes, and a human live
      pass run against that exact build. A route requiring Native Dispatch
      Provenance must prove that prerequisite before its functional matrix.
- [ ] The probe report records what changed in payloads, hooks, and the status
      line, or states explicitly that nothing changed.
- [ ] A version bump invalidates frozen capability snapshots and old Context
      Budget Evidence exactly as the current design does, with no silent
      carry-over.
- [ ] Canonical verification and applicable risk probes pass locally, with the
      local run recorded in this issue (GitHub Actions stays unfunded per the
      owner decision).

## Constraints

- The user's installed or auto-updated CLI is never authority; only a probed,
  reviewed build is.
- Live evidence stays human-driven, synthetic, and non-transcript.
- No silent acceptance of a newer build, and no fallback that weakens
  availability or evidence truthfulness.
- Settle this child's pre-implementation Resolution (update procedure and
  evidence bar) before code.

## Notes

- **Amendment, 2026-11-11 (corrected 2026-11-12), from
  [WF-287](./WF-287-ship-the-0-1-0-public-preview.md).** For 0.1.0 the Claude
  Code policy moves from one exact pin to the 2.x family from the tested floor
  upward, for the connect-once Direct connector (WF-259). Builds newer than
  the last live-verified one are admitted, and `neoflow doctor` labels them
  "untested". This relaxes the "no silent acceptance of a newer build"
  constraint, while WF-259's safety proofs still gate the connector itself.
  This procedure still owns moving the tested floor and the last-verified
  marker. The repository going public is expected to fund GitHub Actions.
- Current pressure: the operator's installed Claude Code is already newer than
  the reviewed `2.1.209` pin, and Pi's reviewed range already lists eight
  verified builds.
- Inputs: the `2.1.209` probe assets on `task/claude-attached-paths`, the WF-256
  proof and limitations matrix in
  `docs/research/claude-user-pull-proof-wf256.md`, the Claude matrices under
  `packages/workspace/test/scenarios` and
  `packages/claude-adapter/test/contracts`, and the existing Pi live probe
  (`pnpm risk:pi`).
- One procedure should cover both reviewed adapters rather than splitting into
  two workflows.
- WF-258's disposable `2.1.282` probe proved managed Direct mechanics, and the
  follow-up `2.1.284` production-gates probe proved marker-free duplicates,
  normal tools, permissions, attach, and respawn. Neither admits a production
  route: the adversarial provenance probe at
  `prototype/wf258-managed-direct-provenance` commit `de87ce1` proved that the
  setup instruction needed for normal tool use also grants indistinguishable
  unauthenticated, wrong-token, spoofed, and native peer messages `Read`/`Write`
  authority. Managed Direct is safety-blocked. A future exact build proceeds to
  its setup/queue/correlation/withdrawal matrix only after a supported native
  provenance boundary passes this adversarial gate; model refusal alone is not
  evidence. Gateway URLs and credentials never enter an artifact.
- [WF-259](./WF-259-prove-claude-direct-attachment-through-a-native-mod.md)
  investigates a separately attached native Mod, not the rejected inbox. Exact
  `2.1.291` passes 15 offline engine-contract checks; live framing, external
  authorization, provenance, and lifecycle correlation are still open. Mods
  began at `2.1.287`, but the official `2.1.290` changelog includes a
  configured-gateway activation fix, so neither a minimum-version range nor the
  operator's installed build can bypass exact gateway/organization-policy
  admission. Keep the current `2.1.209` production pin until full review.
- **WF-259 live follow-up (2026-10-07):** 6 of 8 approved synthetic turns used.
  Native `2.1.291` passes bounded `asUser` model-bound text, duplicate native
  turns, and corrected normal Read/Write through the configured gateway. A new
  peer sender launched through the 291 executable instead reports native
  `2.1.292`, so its Mod refuses before `SendMessage`. A zero-model identity-only
  attempt with scoped auto-update disabling and frozen-executable PATH still
  starts 292. Native `$.session.version()` and build-generated declarations must
  gate admission; launcher `--version` is insufficient. Do not widen the pin,
  count the unexecuted peer control as a pass, or silently substitute a build.
  Captured live primary source: `prototype/wf259-claude-native-mod-live`, `ac3c363`.
- **WF-259 foreground follow-up (2026-10-07):** Direct fresh foreground execution
  verifies native291/session/checkout without funding calls or waiving the guard.
  One real native peer is consumed before context; a CLI-startup composer control
  keeps exact fixture bytes. The full 8-turn budget is now used. Source `773dabd`;
  no full provenance/version admission. Background-worker pinning stays unknown;
  the production candidate is a Mod in the user's existing interactive session,
  not the throwaway foreground launcher.
