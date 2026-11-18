---
id: WF-289
title: "Prepare the code for parallel connectors and features"
status: open
labels:
  - wayfinder:map
parent: WF-051
assignee: juanan
blocked_by: []
created: 2026-11-17
---

## Destination

After 0.1.0, two streams of work run at the same time without editing the same
files: new connectors (OpenCode first, then Codex and others) and new
features (Planning first). Each stream starts on code shaped for it:

- A new connector is one package that writes only its own host glue on top of
  a shared connector kit; it copies no attach loop, evidence queue or retry
  rule.
- A new Workspace domain (Planning) declares the commands and views it owns
  and saves records through one shared module; `workspace.ts` and the
  projection need no hand-kept kind lists.
- A new top-level screen plugs into an app shell; the shell owns rendering,
  input routing, dialogs, theme, settings and Workspace I/O, and each screen
  declares its key bindings once for both dispatch and help.

The Workspace Interface stays exactly `execute`, `read`, `subscribe`. No
change to State formats, saved records, or the truth rules in `HANDOFF.md`.

## Owner decisions (2026-11-17)

- Run connectors and features **in parallel**. This amends WF-051's "one
  package at a time" operating contract: two streams kept to separate files
  (see Collision rules), with the shared harness clean-up landing first; each
  ticket still follows the rest of that contract. Whether Planning still waits
  for P30, and what its first slice is, is decided in WF-298. (Recorded here,
  not in WF-051, which is past the file size budget.)
- Features: **Planning** first. Connectors: **OpenCode** first.
- File the tickets with their evidence before any code changes.

## Streams and order

Shared clean-up first, because both streams build on the harness core:

1. [Refuse the retired User Pull write commands](./WF-290-refuse-the-retired-user-pull-write-commands.md)
2. [Split harness interaction along its internal seams](./WF-213-split-harness-interaction-along-its-internal-seams.md) — stage 2, blocked by WF-290
3. [Share one State record module across the Workspace owners](./WF-291-share-one-state-record-module-across-the-workspace-owners.md) — blocked by WF-213

Connectors stream (only `local-runtime`, the adapter packages and `scripts/`):

- [Make the dependency firewall refuse unlisted packages](./WF-292-make-the-dependency-firewall-refuse-unlisted-packages.md)
- [Build the connector kit and move Pi and Claude onto it](./WF-293-build-the-connector-kit-and-move-pi-and-claude-onto-it.md)
- [Can an OpenCode plugin carry BuildFrame's connector contract?](./WF-294-can-an-opencode-plugin-carry-the-connector-contract.md) — research, can start now
- [Connect OpenCode](./WF-295-connect-opencode.md) — blocked by WF-292, WF-293, WF-294

Features stream (only `workspace.ts`, `projection/` and `apps/buildframe`):

- [Route Workspace commands and views by owner declaration](./WF-296-route-workspace-commands-and-views-by-owner-declaration.md)
- [Split the app into a shell and screens](./WF-297-split-the-app-into-a-shell-and-screens.md) — supersedes WF-214's pane-split framing
- [Move Reviewing onto the shell](./WF-301-move-reviewing-onto-the-shell.md) — blocked by WF-297, alongside WF-300
- [Re-scope Planning's first slice for the post-0.1.0 product](./WF-298-re-scope-plannings-first-slice.md) — resolved 2026-11-18
- [Try plan review with today's Reviewing](./WF-299-try-plan-review-with-todays-reviewing.md) — owner, no code
- [Build Planning's first slice](./WF-300-build-plannings-first-slice.md) — blocked by WF-296, WF-297, WF-299

## Collision rules

- `packages/workspace/src/harness-interaction/` belongs to the shared
  clean-up until WF-213 closes. Neither stream edits it before then.
- WF-291 touches every Workspace owner; it lands alone, between streams'
  commits, not interleaved with WF-296.
- The connectors stream never edits `packages/workspace`. If a connector needs
  a new directive or evidence kind, that is a harness-core ticket of its own.

## Evidence (at `f7e4ac7`)

The survey behind this map, in short; each child carries its own detail.

- **Workspace routing.** `workspace.ts:343-416` routes by hard-coded kind
  lists and prefixes. Change announcements are asymmetric: `workspace.ts`
  publishes for Reviewing and legacy import (`:359-360`, `:373-374`); harness
  interaction publishes through its own callback (`harnessInteraction.ts`
  `#publish`). Live view kinds are listed four times in `projection/index.ts`
  (around `:478`, `:526`, `:622`, `:635`).
- **State record handling.** The recall → version check → commit → map
  failure → decode sequence exists three times (`reviewing/index.ts:806-860`,
  `harnessInteraction.ts:6184-6260`, `legacyReviewImport/index.ts` near
  `:2503`); `encode`/`decode`, `immutableRecord`, `revisionedRecord` and
  `rejected()` three times each; domain-salted identity hashing four times;
  the `rev_` identity pattern three times. Harness interaction writes
  Reviewing's records directly, including `review.index`.
- **Connectors.** About 300 lines per connector are copies:
  `#emit`/`#queueEvidence`/`#flushEvidence` (`piAdapter.ts:743-816`,
  `claudeDirectAdapter.ts:526-595`, identical apart from line breaks),
  `retryable()` (byte-identical), `wait()`, the reconnect loop
  (`extension.ts:115-176`, `helperEntry.ts:172-228`), bridge evidence
  identity (a third copy in `local-runtime/src/protocol.ts:602-611`), the
  `#perform` preamble and availability evidence. `connectHarnessAdapterRuntime`
  is one connection attempt only.
- **App.** One state object (`ReviewingApplicationState`,
  `reviewingModel.ts:437-543`); `state.screen` is checked 58 times across the
  model and view; `handleInput` (`:2925-3230`) has 73 hard-coded key
  comparisons and the `?` list (`reviewingView.ts:4718-4811`) is written
  separately; overlays are a hard-coded list in `screen()`
  (`reviewingView.ts:6267-6276`). Behaviour is tested almost only through
  terminal frames (`test/scenarios/reviewingApplication.test.ts`, 6,004
  lines).
- **Harness core.** `harnessInteraction.ts` is 6,305 lines; retired User Pull
  is about 2,000 of them, with all seven commands still dispatched and expiry
  running on every interaction read (X-01 in
  `docs/audit/codebase-health-2026-11-16.md`).

## Not yet specified

- **Codex and further connectors.** One research ticket per host, filed once
  OpenCode's research shows what the kit must cover.
- **Role permissions.** `editor-adapter` (and every non-harness role) can run
  every command today (`local-runtime/src/server.ts:380-395`). Decide a
  per-role table before the Neovim adapter, not before.
- **Smaller hygiene, ticket when touched:** the `./legacy-review-import`
  subpath is imported only by `source-island.test.ts`; most exported types of
  `./runtime`, `./reviewing` and `./workspace-evidence` are unused by name;
  value cycle `contextEvidence.ts` ↔ `workspaceEvidence/index.ts`; type cycle
  `reviewing` ↔ `legacyReviewImport`; projection normalizers accept unknown
  keys (`projection/normalization.ts:218-236`) where Reviewing and harness
  interaction reject them; theme values live in three places.

## Out of scope

- A schema library for validation; the hand-written validators stay.
- New packages beyond the connector packages themselves.
- Any change to the `execute` / `read` / `subscribe` Interface.
