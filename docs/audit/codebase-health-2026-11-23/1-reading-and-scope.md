# Codebase health ledger (2026-11-23): How to read it, scope and summary

Part of [the ledger](../codebase-health-2026-11-23.md).

## How to read a finding

Each finding names its area, file and line, a category, a severity, the evidence, the mechanism, and a proposed disposition. The vocabulary is the one the 2026-11-16 ledger used.

**Categories:** correctness, durability, concurrency, performance, security, testing, duplication, maintainability, documentation.

**Severity** (by consequence, not principle):
- **high** — can lose or corrupt saved State, mislead the user about something they act on (sent / answered / unknown, current / stale), breach the same-user trust boundary, or break a documented guarantee.
- **medium** — degrades correctness, safety or resource use under conditions this product will actually meet.
- **low** — real but bounded; costs clarity or future effort more than behaviour.
- **not a defect** — a fact worth knowing.

This run is about how easy the code is to change, so almost everything it found is **low** by that scale. The Summary therefore also gives a **priority for the owner's goal** (what makes Planning and the next connector cheaper), which is a separate ordering from severity.

**Proposed disposition** (the owner decides): **fix** (scope named), **accept** (why), **defer** (to named planned work), **delete-bound** (code scheduled for removal).

IDs: `HI-` harness interaction, `RT-` local runtime, `AD-` connectors, `ST-` State and durability, `WS-` Workspace evidence/projection/reviewing, `APP-` the terminal app, `TEST-` test structure, `X-` cross-cutting. IDs are never reused; this ledger continues the numbering of the 2026-11-16 one.

## Review log

| Date | Commit range | Areas covered | Added | Closed |
| --- | --- | --- | --- | --- |
| 2026-11-16 | baseline at `7f4e037` | all six areas, partial depth | 11 | — |
| 2026-11-23 | `7f4e037..f69243c` (HEAD became `a311d3e` mid-run: Pi devDependency 1.5.0 → 1.6.0 and the lockfile only; no file cited below except `packages/pi-adapter/package.json` changed) | connector kit and four connectors, app shell/screen migration, Workspace routing, tests' structure, drift pass (cycles, direction, duplication, naming, docs) | 11 | 11 |

The working tree was dirty at the start (`packages/pi-adapter/package.json`, `pnpm-lock.yaml`, another session's work, committed as `a311d3e` while this ran). The ledger is the only file this run wrote in the repository.

## Project intent brief

**What it is.** BuildFrame is a terminal app for reviewing what a coding agent changed. The developer reads a Review as Files and a Diff, writes Messages anchored to exact lines, and sends them to one connected agent session; the agent's Response comes back under the Message. 0.1.0 is a Reviewing-only preview for macOS and Linux on Node 26. Since the last audit it connects four agents: Pi, Claude Code, OpenCode (`/buildframe`) and Codex (`!buildframe`).

**Processes and packages.** `packages/workspace` (Reviews, Messages, State, Git evidence) depends on nothing of ours. `packages/local-runtime` (one background process per repository, owner-private socket, framed JSON) depends on workspace and now holds the **connector kit** (`src/connector/`, exported as `@buildframe/local-runtime/harness-adapter`: `openConnectorSession` keeps a session attached, owns retry/replace rules, the evidence outbox and the one correlation rule). Each connector package (`pi-`, `claude-`, `opencode-`, `codex-adapter`) writes only its host glue on that kit. `apps/buildframe` is the OpenTUI app, launcher and doctor; it also hosts the Codex helper, so it depends on `@buildframe/codex-adapter-source` (allowed on purpose in the firewall). `scripts/check-dependencies.mjs` refuses unlisted packages and confines connectors to the kit subpath and the Workspace harness types.

**Claimed invariants.** Unchanged from the 2026-11-16 brief: Durable Commit before anything leaves; Messages sent as written; nothing replayed; unknown stays unknown; truth-critical distinctions never collapsed; one connected session per repository, newest wins; removing code never removes user data; same-user programs trusted; bounded reads; keyboard-complete, `--no-color`, `--ascii`. The Workspace Interface is exactly `execute`, `read`, `subscribe`.

**The plan this delta executes (WF-289).** Two parallel streams after a shared clean-up: connectors (WF-292 firewall, WF-293 kit, WF-295 OpenCode, WF-303 Codex — all closed) and features (WF-296 routing by owner declaration — closed; WF-297 shell and screens — closed; WF-301 Reviewing onto the shell — open, in progress; WF-300 Planning's first slice — open, on the `planning` branch). The shared clean-up WF-290 is closed; WF-213 (split harness interaction, stage 2) and WF-291 (one State record module) are open.

**Deliberate scaffolding (not defects).**
- `extend` in `shellScreen.ts` and `ReviewingExtension` in `reviewingApplication.ts`: Reviewing still loads, listens and draws for itself on a terminal the shell lends it. It is meant to shrink and then go (WF-301).
- `reviewingShellState.ts` (`lendShellState`): Reviewing's state fields for `?`, `!`, Configuration, theme and background are turned into accessors that read and write the shell's, so there is one of each during the migration.
- Two Homes: the shell's (`shellHome.ts`, `shellHomeScreen.ts`) runs only when no screen uses `extend`; in the product Reviewing still draws Home and lists other screens' rows through `reviewingHomeRows.ts`. Home moves to the shell later in WF-301.
- Two key-dispatch paths: Reviewing's ordered `KeyAction` lists (`shellKeys.ts` `dispatchKey`, `reviewingActions.ts`) and new screens' `ScreenKey` tables (`shellScreen.ts` `dispatchScreenKey`).
- Planning plugs into `createReviewingApplication({ screens })` (`reviewingScreen.ts`) until the inversion finishes (owner decision 2026-11-23).
- The frozen-file rule (`AGENTS.md`, `scripts/check-staged-file-size.mjs`): files over 20,000 bytes may only shrink. `reviewingView.ts`, `reviewingModel.ts`, `reviewingApplication.ts`, `projection/index.ts`, `projection/contracts.ts` and others are knowingly over.
- Everything the 2026-11-16 brief listed as kept on purpose (internal `neoflow` identifiers, readable User Pull records, legacy import, `.issues/` as the working method, no telemetry, no Windows).

**Planned work that owns known problems.** WF-213 (harness interaction split), WF-291 (shared record module), WF-301 (finish the inversion, renderer-free screen tests, split the frame suite), WF-288 (CRLF files diff as rewritten), WF-205 (September repository-health findings).

**Checks at `f69243c`** (Node 26.5.1, run by this audit). Dependency firewall: passed. Lint: 0 errors, 35 warnings (baseline was 36). Format: clean. Typecheck (all seven projects plus `tsconfig.tests.json`): clean. Tests: 94 files, 626 tests; 624 passed in the full run and the two that failed (`runtimeLocation.test.ts`, `workspaceEvidencePerSideDegraded.test.ts`) failed only because this audit pointed `TMPDIR` at a long scratch path, which pushed a Unix socket path past the macOS length limit; both files pass (14/14) with the default temp folder. Build and smoke tests were not run because they write `dist/`. Vitest ran with `--no-cache`. Credential sweep: no key, certificate or `.env` files and no private-key headers.

## Coverage

| Area | Status | Notes |
| --- | --- | --- |
| Prior findings (11) and carried leads (24) | done | Every finding re-checked against its fixing commit and the code; leads re-classified below. |
| Connector kit (`local-runtime/src/connector/`) and four connectors | done | Interface, host port, entry points (`extension.ts`, `helperEntry.ts`, `plugin.ts`, `helper.ts`), capability manifests, version admission, support facts. Not reached: the kit's correlation rule in depth (WF-293 tests it as a table), the Claude Mod plugin, OpenCode's TUI part. |
| App shell and screen migration (`apps/buildframe/src/shell*.ts`, `reviewingScreen.ts`, `reviewingShellState.ts`) | done | Screen interface, `extend`, Home paths, key paths, imports. Not reached: drawing code inside `reviewingView.ts`. |
| App frozen files (`reviewingModel.ts`, `reviewingView.ts`, `reviewingApplication.ts`) | partial | Structure measured (declaration map, byte split, cycles) to propose seams; behaviour not re-read. |
| Workspace routing and owners (`workspace.ts`, `kindRoutes.ts`, `*/kinds.ts`, projection and harness subscriptions) | done for structure | What a new owner touches; subscription delivery in both owners. Not reached: owner internals beyond the delta. |
| Workspace evidence, State, Git process | not covered | Only the prior fixes were verified. Unchanged since the baseline except the fix commits. |
| Cross-cutting: direction, cycles, duplication, naming, docs | done | Cycles measured with a throwaway script over all three source roots, value and type imports separately. |
| Tests (structure and quality) | partial | Structure, helper copies, reach-ins, the frozen scenario files. Assertion quality not sampled. |
| Release and packaging | not covered | Only read to count what a connector touches. |

## Summary

The delta is good work and moved the architecture the way WF-289 wanted. **All eleven findings from 2026-11-16 are fixed**, each with a regression test. The connector kit is a real deep module: a connector is now 28–36 KB of host glue, and the attach loop, evidence queue and retry rules that were copied twice are gone. Workspace commands and views route by owner declaration. The app has a shell with 26 small parts and a checked screen interface. No over-budget file grew after the size hook landed (all 60 measured).

What remains is about **finishing seams, not fixing behaviour**. This run confirmed **11 findings: 0 high, 0 medium, 11 low**. It carries forward **20 untested leads** (18 still open from the last run plus 2 new), which are not findings.

**Priority for the owner's goal** (Planning and more connectors), most leverage first:
1. **APP-04** — the shell's generic parts are typed with Reviewing's names and import from Reviewing files (18 imports in 15 shell files). A Planning screen's key handler takes a `ReviewingInput`. Planning lives on its own branch, so edits to those Reviewing files will conflict across branches.
2. **X-03 + X-02** — adding a Workspace owner (Planning) still edits `workspace.ts` in about nine places, and the file has 1,388 bytes of budget left. The same file holds `WorkspaceIdentity`, which 18 lower modules import, so the whole package (72 files) is one type-level import loop.
3. **X-04** — Planning is not sequenced behind WF-291, so it would add a fourth copy of State record handling. WF-291 itself waits on WF-213, which is unblocked but has not moved.
4. **APP-05** — splitting the frozen model keeps re-forming import loops, because the state type lives inside the 250 KB file. A new runtime import loop landed today (`3730338`), right after WF-301 removed one. Moving the state and effect types to a small leaf module fixes this for every future split.
5. **AD-01 + AD-02** — the app writes "run /buildframe in Pi or Claude Code" in five sentences (wrong for Codex, which uses `!buildframe`). Each connector's supported versions are written in about five places and only partly tied together. A fifth connector repeats both.

**Corrections to the previous ledger:** APP-03 is closed but narrowed. The caches now clear when the Review source changes, so they are bounded by one source's files, not truly size-bounded. That is reasonable. Carried lead 14 is narrowed: reads no longer commit. The silent swallow in the harness subscription remains (see Carried forward 2).

## Extension paths at this commit (facts, not findings)

These are measured counts of what a change touches today, so a reader can check the findings above against them.

**A fifth connector.** Its own package: an `XAdapter` class around `openConnectorSession` (a manifest, a `naming`, a `ConnectorHost` with `submit`/`interrupt`, optional `isIdle`/`prepare`/`release`), an entry that resolves the workspace and calls `attach`, and `capability.ts`. Outside the package, OpenCode touched 9 files (`df8ee21`, `73edaa1`, `3798d2a`): `scripts/check-dependencies.mjs`, root `package.json` (the typecheck and build filters), `vitest.config.ts`, `tsconfig.tests.json`, `apps/buildframe/src/{supportFacts,supportManifest,doctor}.ts` plus `doctor.test.ts`, `scripts/assemble-release.mjs` (+65 lines, packaging differs per host), `support/manifest.json`. Missed in both OpenCode and Codex: the app's connect sentences (AD-01).

**A Planning screen.** `defineScreen({...})` in a new file (state, `open`, `title`, `mode`/`modes`, one `keys` table, `body`, optional `views`/`receive`/`settled`/`home`/`settings`/`checks`), passed in `screens` to `createReviewingApplication`. Key handlers take `ReviewingInput` and use `Key` from `reviewingInput.ts` (APP-04). Its Home rows appear on Reviewing's Home through `reviewingHomeRows.ts`, not on the shell's Home (see the brief). A saved setting has no slot (see Observations).

**A Planning Workspace owner.** A `kinds.ts` (checked complete at compile time), plus about nine edits in `workspace.ts` (X-03), its own State record helpers unless WF-291 lands first (X-04), and its own subscription delivery if it has live views (X-05). The local runtime needs no change: it routes Workspace operations generically.
