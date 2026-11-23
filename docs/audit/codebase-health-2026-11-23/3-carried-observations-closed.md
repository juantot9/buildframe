# Codebase health ledger (2026-11-23): Carried forward, observations, ruled out, closed

Part of [the ledger](../codebase-health-2026-11-23.md).

## Carried forward

Not findings. Each of these has evidence and a named mechanism, and none has been tested. Do not act on one without confirming it first; do not count them among the findings.

New this run:

1. **`!buildframe` can signal an unrelated process** — `packages/codex-adapter/src/helper.ts:39-47`, `:71`, `:85`. The helper's PID file is removed only on orderly exit (`:236`). After a crash the file stays. `runningHelper` checks only that some process with that PID exists, then `disconnect` or a new `!buildframe` sends it `SIGTERM`. With PID reuse, that is some other process of the same user. *Settles by:* write a PID file holding a live unrelated PID (a `sleep` child) and run `!buildframe disconnect`.
2. **The Message-status view can stop updating silently** (narrowed from 2026-11-16 lead 14; reads no longer commit) — `harnessInteraction.ts:4061-4089` ends every scheduled read in `.catch(() => undefined)`. A lasting failure in `#interactionView` (for example a damaged saved record) leaves the app showing the last delivered state with no failure notice, unlike the projection's `projection-failed`. *Settles by:* corrupt one harness record in a fixture store and subscribe to `harness.review-interaction`.

Still open from 2026-11-16 (numbers are that ledger's):

3. **(2) Each verify re-hashes all modified files and re-lists the whole index** — `workspaceEvidence/index.ts`. Unchanged.
4. **(3) The recursive watcher has no filter** — `workspaceInvalidation.ts:14`, still `{ recursive: true }`.
5. **(5) Top-level `git status` descends into submodules** — `enumeration.ts` still has no `--ignore-submodules`.
6. **(6) Rename fallback retries after a timeout** — not re-read.
7. **(8) Establishment timeouts can strand both sessions** — the Claude launcher (`helperEntry.ts`) was rewritten in WF-293; re-check the 12 s versus 15 s arithmetic there.
8. **(9) Claude: the user's own prompt during BuildFrame's turn** and **(10) Pi: input typed during a BuildFrame turn** — both now go through the kit's one correlation rule (`input` facts, `connectorCorrelation.test.ts`). Probably resolved; settle by reading each connector's mapping to `input` facts.
9. **(11) Claude helper hands a command to a request nobody waits on** — `helperServer.ts` still registers no `close` listener.
10. **(12) The `replaced` notice can be lost before `destroy()`** — `server.ts:141-144` unchanged.
11. **(13) A reconnect of a known attachment can win over the newest `/buildframe` after a restart** — `d372d5d` changed reconnect consent; re-check.
12. **(15) Startup time grows with all history** — `quick_check` on every open still at `authoritativeStateWorker.ts:439`.
13. **(16) Registry and marker require an exact format version.**
14. **(17) macOS plain fsync for `CURRENT`, marker and registry.**
15. **(18) Registry lock judges liveness by PID alone when the start time is missing.**
16. **(20) A failed older refresh can overwrite a newer screen** — `reviewingApplication.ts` moved; re-locate.
17. **(21) A local error after a successful command shows "Lost contact".**
18. **(22) Node range and Pi verified versions copied in several places** — the connector half is now finding AD-02. The Pi half remains: the verified list ends at 1.3.0 while development pins Pi 1.6.0 (`a311d3e`) and WF-293's live check used 1.5.2.
19. **(23) The Claude plugin ships from `main`.**
20. **(24) Release assembly doesn't require a verified, clean tree.**

Resolved or re-homed from that list: (1) closed by `4611221`; (4) owned by WF-288 (open); (7) closed by `cf8837a`; (14) narrowed to item 2 above; (19) closed by `299faf5` (cache keys include the live/Snapshot identity).

## Observations

Judgement calls and preferences, plus facts worth knowing. These are not defects.

- **Where to cut the frozen files** (owner asked for seams). The measured split says the cheapest cuts are type and free-function moves, not class surgery:
  - `reviewingModel.ts` (250 KB): lines 1–1145 (45 KB) are types, constants and 46 free functions. Moving the state and effect types out is APP-05's fix. Inside the class, 26 `apply*`/`fail*` methods are the view-arrival handlers. They read naturally as one "receive views" module per family: Home, Review and Diff, search, Messages, step changes.
  - `reviewingView.ts` (206 KB): 192 KB sits before `class ReviewingView` (`:4751`) as 77 free functions. That is the pane split WF-214 and WF-297 described, and it can proceed one pane per commit with no state change.
  - `projection/index.ts` (157 KB): one class with about 80 methods in clear families: subscription and live invalidation (`:463-650`, X-05's shared helper), snapshot and context, history and steps, live capture and verification, diff windows, search, questions and messages. The first two families have no Reviewing-specific rules and are the ones Planning would otherwise copy.
  - `reviewingApplication.ts` (63 KB): mostly the loader that WF-301 says stays Reviewing's until views can carry it.
  - Measured shrink so far under WF-301: view 237.4 → 205.6 KB, model 259.3 → 250.1 KB. The model barely moves because the parts leaving were drawing code.
- **The next hubs are at the budget.** `connector/session.ts` 19,214 bytes, `workspace.ts` 18,612, `shell.ts` 18,431. Each is the file the next connector feature, Workspace owner or shell step edits first.
- **Planning's Home grouping belongs in Reviewing's Home for now.** The product runs Reviewing's Home (`reviewingHomeRows.ts`). The shell's Home (`shellHomeScreen.ts`) is reached only when no screen uses `extend` (`shell.ts:116-118`). WF-300's grouping decision implemented in `shellHome*` would not show.
- **A screen has no saved-settings slot.** Saved preferences are one fixed `ReviewingPreferences` record (`userConfiguration.ts:76-90`, a frozen 21 KB file) that mixes app-wide settings (theme, background, icons, motion) with Reviewing's layout. A screen's Configuration rows can change values but cannot persist them without editing that record. This only matters once Planning needs a saved setting.
- **`lendShellState` relies on `model.state` never being replaced.** It turns seven fields into accessors on one object. Today `this.state` is assigned only in the model's constructor (`reviewingModel.ts:1215`), so it holds. Nothing would catch a future `this.state = {...}`, which would silently detach `?`, `!`, Configuration and theme from the shell. A comment at the assignment, or a test, is cheap while the scaffolding lives.
- **Connector status wording is written per connector.** The kit gives ready-made status text, yet each entry writes its own first line: "BuildFrame Review attached", "BuildFrame connected to this session.", "BuildFrame connected to this Codex session.", and three spellings of "BuildFrame isn't open for … yet". Taste, but it is the kind of drift DESIGN.md's copy rules exist to stop.
- **Three words for one thing.** The glossary says Adapter, the kit and tickets say connector, the UI says agent. The Interaction Language allows "agent" in the UI. Connector versus Adapter is worth one glossary line (X-06).
- **The app now depends on a connector.** It is deliberate and commented in the firewall (`apps/buildframe` hosts the Codex helper). It does mean the CLI bundle carries Codex connector code and the app's dependency list is no longer only core packages.
- **Root scripts list packages by hand.** `typecheck` and `build` name all seven projects; `test:fast` names the five that have `test/fast`. A new connector must be added to each. The firewall's unlisted-package rule does not cover these lists.
- **Status of the 2026-11-16 observations.** Connector duplication: resolved by WF-293. `harnessInteraction.ts` growth: reversed (5,950 → 4,090 lines). App growth: 17,456 → 21,332 lines across 66 files, with the shell parts new. Theme values in three places: not re-checked. Firewall misses relative reach-ins: still true (TEST-01). `@buildframe/cli` as both a retired workspace name and the release name (`check-dependencies.mjs:9`): unchanged. CONTEXT.md User Pull drift: fixed.

## Ruled out

- **Over-budget files growing after the size hook landed:** none. All 60 hand-written code and test files over 20,000 bytes are the same size or smaller than at `d6c246e`, measured with `git cat-file -s` at both commits.
- **Connector production code reaching past the kit:** the firewall confines connectors to `@buildframe/local-runtime/harness-adapter` and three Workspace subpaths, and passes at HEAD.
- **Connectors still copying the attach loop, evidence queue, retry rules or message decoding:** gone. `retryable` exists once (`connector/attachLoop.ts:27`). Connector packages are 27.8–36.4 KB of source, all host glue: Pi's tool gate, Claude's Mod and helper, OpenCode's plugin and toasts, Codex's app-server client.
- **The local runtime hard-coding Workspace command or view kinds:** it routes `workspace.operation` and `workspace.subscribe` generically. The only kinds it names are harness directive and evidence kinds, which are its job.
- **A runtime import loop in `local-runtime`:** none. The kit ↔ `harnessAdapter.ts` loop is type-only (`HarnessAdapterRuntimeDiagnostic`), consistent with WF-293's "no import cycle".
- **WF-301's "model ↔ actions import loop is gone":** true for runtime imports. `reviewingActions.ts` now imports only types from the model. The loop that remains is the type knot and the new `reviewingSearchOpen` loop in APP-05.
- **`lendShellState` already detached:** no; see Observations.
- **Type errors, lint errors, formatting:** none at HEAD.
- **Test failures:** none attributable to the code (see Checks in the brief).
- **Credentials:** no key, certificate or `.env` files and no private-key headers in the tree.

## Closed

All closed by commits in `7f4e037..f69243c`. Each was confirmed by the commit, its regression test, and a spot check of the code where noted.

- **HI-01** (lifetime limits on connections and Messages) — `d372d5d`: settled interactions move to per-Review history, idle attachments retire, and the per-Review limit has its own honest reason (`review-handoff-limit-reached`, `reviewingReasons.ts:50`). Tests: `harnessLiveIndex.test.ts` plus 768 new lines in `harnessInteraction.test.ts`.
- **WS-01** (a common local Git setting blocks opening) — `63b8ecd`: harmless `core.*` keys are allowed; the husky case is tested.
- **APP-01** (wrong status after the 64th handoff) — `d372d5d`: a Review keeps at most 128 handoffs and the app loads all 128 (`HARNESS_INTERACTION_WINDOW_SIZE = 128`, `MAX_PROJECTED_INTERACTIONS = 128`).
- **RT-01** (doctor retires another install's runtime) — `63b8ecd`: the bootstrap can report a mismatch without retiring, and doctor uses that.
- **WS-02** (100,000-file repositories can't be captured) — `1d6dd3b`: capture no longer lists the whole index. The All-files list still has the cap and says so.
- **ST-01** (crash during first State creation blocks the repository) — `b9b1d40`, with an interrupted-creation regression test.
- **ST-02** (no frozen format-2 store) — `22d9ff1`: `test/fixtures/authoritative-state/format-2/` and an open-and-read test.
- **HI-02** (crash between Durable Commit and hand-off leaves "waiting") — `ed3f6a4`: runtime start resolves in-flight turns as unresolved.
- **APP-02** (quadratic Diff pane work) — `c863c3d`: one running total, one build, cached wrap heights, with measured frame times. Spot check: no `slice(0, index).reduce` remains in the app.
- **APP-03** (app caches never evict) — `299faf5`: both caches clear whenever the Review source changes (`#synchronizeSourceCaches`, `reviewingModel.ts:1205-1212`). Narrowed rather than fully bounded: within one source they grow with the files shown. Accepted as reasonable.
- **X-01** (retired User Pull still writable) — `f049ebc` (WF-290): the seven commands and two views left the contracts, reads never commit, old records stay readable, and a User Pull-era golden store proves it. Spot check: no `user-pull` kind in `harness-interaction/kinds.ts` or `server.ts`.
