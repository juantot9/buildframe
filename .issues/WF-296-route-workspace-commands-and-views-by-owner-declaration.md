---
id: WF-296
title: "Route Workspace commands and views by owner declaration"
status: open
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
