---
id: WF-290
title: "Refuse the retired User Pull write commands"
status: open
labels:
  - wayfinder:task
parent: WF-289
assignee: null
blocked_by: []
created: 2026-11-17
---

## Question

The Claude User Pull route left the connectors on 2026-11-12, but the
Workspace still runs it. Make it read-only before WF-213 stage 2 splits the
class, so the split doesn't carry ~2,000 unused lines.

## Evidence (at `f7e4ac7`)

- `harnessInteraction.ts` still dispatches all seven `harness.user-pull.*`
  commands (`:375-386`); any `tui` or `cli` client can reach them
  (`local-runtime/src/server.ts:389`).
- Every interaction read runs `#expireUserPullStartObservations` (`:5925`),
  which can commit inside a read, and `#projectUserPullAttachment` (`:5952`).
- User Pull code spans roughly `:3122-4712`, `:5004-5330`, `:5813-5903`, plus
  `harness-interaction/userPull.ts`.
- Audit finding X-01, `docs/audit/codebase-health-2026-11-16.md`.

## Direction

- Refuse the seven write commands with an `unsupported` rejection.
- Keep parsing saved User Pull records and a read-only projection of them, so
  stores written before 2026-11-12 stay readable.
- Remove expiry from the read path; a read never commits.
- Delete the write paths, their scenario tests, and the docs drift
  (`CONTEXT.md:380-400`, `claude-adapter/src/direct/capability.ts:5`).

## Resolution (2026-11-17, before code)

Owner decision: **parse only**. Views stop showing User Pull; nothing that is
stored stops being readable.

- Only pre-0.1.0 stores can hold User Pull records: the route left the
  connectors on 2026-11-12, and the frozen 0.1.0 store (`format-2`) has none.
- The seven `harness.user-pull.*` commands and the two User Pull views leave
  the Harness Interaction contracts. They are refused like any unknown kind
  (a `TypeError` at the Workspace Interface), with no State movement.
- `harness.review-interaction` loses its `userPull` field; the app drops the
  Claude Code User Pull status line.
- Stored shapes stay parseable: the index's `preparations`, User Pull
  Invocations, arm/attachment/observability/preparation records, User Pull
  capability snapshots, and recorded command results (so
  `harness.command-result` still returns a recorded User Pull result).
- Reads never commit. Start-deadline expiry leaves the read path; instead
  `recoverLostInvocations` at runtime start marks every User Pull Invocation
  still `awaiting-start` or `active` as `unresolved` (correlation lost), the
  same truth it already records for direct Invocations.
- Proof: a frozen store written at `f7e4ac7` with the old code
  (`test/fixtures/authoritative-state/user-pull-era/`: one User Pull turn
  ended normally, one claimed and never started, one context budget) and
  `authoritativeStateUserPullEraGolden.test.ts`. Before the change the test
  fails because an interaction read commits (State 16 → 17).

## Verification

- A State fixture with User Pull records opens, reads and projects unchanged.
- Each `harness.user-pull.*` command is refused; no State version moves.
- An interaction read never commits (a test that counts commits).
- `pnpm verify` and the four risk probes pass.

## Implementation evidence (2026-11-17, uncommitted on `review-commits-and-calm-panes`)

- `harnessInteraction.ts` 6,305 → 4,090 lines; `userPull.ts` and the four
  User Pull scenario files deleted; about 7,300 lines removed in total. The
  private `now` clock seam (`harnessNow`) went with them; only User Pull used
  it.
- Contracts: seven commands, two views, `ReviewHarnessInteractionView.userPull`,
  the three User Pull evidence kinds, and fifteen refusal reasons only User Pull
  produced are gone. Kept for stored data: the index's `preparations`, User Pull
  capability parsing, `harness.user-pull-invocation` lookup, and the five
  recorded result kinds (`attached`, `prepared`, `armed`, `claim-committed`,
  `withdrawn`).
- `recoverLostInvocations` now resolves every live Invocation, User Pull
  included; interaction reads no longer commit.
- App: the Claude Code User Pull status line, its "Claimed—waiting to start"
  label, its scenario, and five unreachable reason sentences removed.
- Docs: `CONTEXT.md` marks User Pull retired; the Claude capability comment no
  longer mentions it.
- Checks on macOS, Node 26.5.1: `pnpm verify` passed (lint at the 36-warning
  baseline, format, dependency firewall, 72 files / 543 tests, typecheck,
  build, build and Claude Direct smokes); `risk:state`, `risk:runtime`,
  `risk:pi` (Pi 1.5.0) and `risk:dogfood` passed.
- Not run: CI, and a manual pass on one of the owner's own pre-0.1.0 stores.
