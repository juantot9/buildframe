---
id: WF-296
title: "Route Workspace commands and views by owner declaration"
status: closed
labels:
  - wayfinder:task
parent: WF-289
assignee: null
blocked_by: []
created: 2026-11-17
---

## Question

Adding a Workspace domain (Planning) today means editing the constructor,
`execute`, `read` and `subscribe` in `workspace.ts`, plus hand-kept kind lists
in the projection. Make each owner declare what it handles, and make every
accepted command announce the new State version through one path.

## Evidence (at `f7e4ac7`)

- `workspace.ts:343-377`: `execute` routes four `legacy-review.*` kinds by
  name, `harness.*` plus `review.question.ask` and `review.message.commit` to
  harness interaction, everything else to Reviewing.
- `workspace.ts:379-416`: `read` routes by seven named `legacy-review.*`
  kinds, three `workspace.*` prefixes, `harness.*`, else the projection.
- Publishing is asymmetric: `workspace.ts` publishes after Reviewing and
  legacy commands (`:359-360`, `:373-374`); harness interaction publishes
  through its `onCommittedStateVersion` callback (`workspace.ts:328-330`,
  `harnessInteraction.ts` `#publish`).
- Live view kinds are repeated in four lists in `projection/index.ts`
  (around `:478`, `:526`, `:622`, `:635`).
- A new projection view touches `projection/contracts.ts` (three unions),
  `projection/normalization.ts`, the `#readOnce` switch
  (`projection/index.ts:654-720`), and `projection/surface.ts`.

## Direction

- Each owner exports the command kinds and view kinds it handles; `workspace.ts`
  builds its routing from those declarations and refuses unknown kinds
  explicitly. A kind claimed by two owners fails at construction.
- One publish path: every accepted command, from any owner, publishes the
  committed State version to every subscriber once.
- The projection keeps one declaration of which views are live.
- Same-package internal change; the `execute` / `read` / `subscribe`
  Interface and every kind name stay as they are.

## Verification

- A test that every kind in the `WorkspaceCommand` and `WorkspaceViewRequest`
  unions routes to exactly one owner.
- A test that a harness command and a Reviewing command each notify
  projection and harness subscribers exactly once.
- Workspace scenario suites pass unchanged; `pnpm verify` passes.

## Resolution and evidence (2026-11-18)

- Each owner declares its kinds in a small `kinds.ts` beside it
  (`reviewing/`, `harness-interaction/`, `legacyReviewImport/`, `projection/`,
  `workspaceEvidence/`). `kindsOf<Union>()` checks each list complete when
  compiled: leaving one out fails with the missing kind named (tried by
  removing `review.cancel`).
- `workspace.ts` builds three route tables (`KindRoutes`, `src/kindRoutes.ts`)
  from those lists: 25 command kinds, 53 view kinds, 14 subscription kinds. A
  kind claimed twice fails at construction; an unknown kind is refused as
  "Unknown Workspace … kind". Adding a domain now means one `kinds.ts` and
  one line per table. Owners absent from a Workspace opened without State
  refuse with "requires the runtime-owned writer", as before.
- One publish path, `#publishCommitted`: Reviewing and Legacy import commits
  are announced by the Workspace after an accepted result; Harness
  Interaction, which also commits outside commands, announces through the
  same path and is not told about its own commit twice.
- The projection's four hand-repeated live-view lists are one
  `isLive` check in `projection/kinds.ts`.
- Size: `workspace.ts` 5,043 → 4,653 tokens (bootstrap diagnostics moved to
  `workspaceBootstrapDiagnostics.ts` and re-exported; the Interface is
  unchanged); `projection/index.ts` shrank by 610 bytes.
- Tests: `test/fast/workspaceRoutes.test.ts` (every kind has one owner, two
  owners and unknown kinds refused) and
  `test/scenarios/workspacePublishing.test.ts` (a Harness commit and a
  Reviewing commit each reach a projection subscriber and a Harness
  Interaction subscriber exactly once). Found on the way: `harness.connection`
  updates only when the connected agents change, not on every State version;
  that is by design and unchanged.
