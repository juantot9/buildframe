# Codebase health ledger (2026-11-23): Findings

Part of [the ledger](../codebase-health-2026-11-23.md).

## Findings

#### APP-04 — The shell's generic parts depend on Reviewing-named modules

- **Area / file:** App — `apps/buildframe/src/shellScreen.ts:4`, `:23`; `shell.ts:5-6`; `shellKeys.ts:2`; `shellInput.ts:1`; `shellConfiguration.ts:2`; `shellHomeScreen.ts:3`; `shellSelection.ts:3`; `shellSettings.ts:1-2`; `shellPulse.ts:1`; `shellCompose.ts:4`; `shellFrame.ts:5`; `shellLook.ts:4`; `shellViews.ts:3`; `shellGlide.ts:3`; `shellCommands.ts:3`
- **Category:** maintainability
- **Severity:** low
- **Evidence:** 18 import lines in 15 `shell*.ts` files reach into `reviewing*.ts`. They import key input (`ReviewingInput`, `ReviewingKeySpec`, `Key`, `matchesKey`, `reviewingInputFromKeyEvent` from `reviewingInput.ts`), notice and status tones plus spinner timing (`NoticeTone`, `StatusTone`, `NOTICE_LIFETIME_MS`, `SPINNER_FRAME_MS`, `noticeGlyph` from `reviewingStatus.ts`), `runtimeErrorSentence` (`reviewingReasons.ts`) and `ReviewingPaneScrollState` (`reviewingScroll.ts`). The screen interface itself is typed with them: `ScreenKey.run(state, input: ReviewingInput)`. `ScreenSurface.preferences` and `savePreferences` are typed `ReviewingPreferences`. Nothing in the other direction is a problem: Reviewing importing the shell is the intended direction.
- **Mechanism:** the shell is meant to be the layer below every screen, but it depends on files that belong to one screen. Three costs follow. (1) A Planning author writes key handlers against types named after Reviewing and must open Reviewing files to learn the shell's input model. (2) Planning lives on the `planning` branch while Reviewing work lands on `main`. Any Reviewing edit to `reviewingInput.ts` or `reviewingStatus.ts` silently changes what every screen gets, and becomes a merge conflict on the branch. (3) When Reviewing's status vocabulary changes (a new `StatusTone`), the shell's frame changes with it.
- **Proposed disposition:** fix — a mechanical move before WF-300 builds on it. Move key input to a shell module (`shellInput.ts` already exists; rename `ReviewingInput` → `ScreenInput` and `ReviewingKeySpec` → `KeySpec`, keeping re-exports in `reviewingInput.ts`). Move `NoticeTone`/`StatusTone`/spinner and notice timing to a `shellStatus.ts`, and `runtimeErrorSentence` to `shellCommands.ts`. Leave Reviewing's message badges where they are. None of these files is frozen (`reviewingInput.ts` 4.5 KB, `reviewingStatus.ts` 4.7 KB). A firewall-style check that `shell*.ts` never imports `reviewing*.ts` would keep it that way.
- **Confidence:** confirmed by measurement (grep of import lines).

#### APP-05 — Splitting the frozen model keeps re-forming import loops

- **Area / file:** App — `apps/buildframe/src/reviewingSearchOpen.ts:4-11` ↔ `reviewingModel.ts:68`; type loop `reviewingActions.ts:1`, `reviewingFileList.ts:3`, `reviewingHomeRows.ts:1`, `reviewingSettings.ts:3`, `reviewingSearchOpen.ts` ↔ `reviewingModel.ts:64-71`; also `reviewingApplication.ts:40` ↔ `reviewingScreen.ts:4`
- **Category:** maintainability
- **Severity:** low
- **Evidence:** a throwaway cycle finder (Tarjan over relative imports) found one runtime import loop in the app: `reviewingModel.ts` imports `searchResultTarget` from `reviewingSearchOpen.ts`, which imports `DIFF_WINDOW_SIZE`, `LIVE_FILE_WINDOW_SIZE` and `MANIFEST_WINDOW_SIZE` back from the model. It was added today in `3730338`, two days after WF-301's `682c980` removed the model ↔ actions loop. With type imports counted, six files form one loop around the model. Every one of them imports `ReviewingApplicationState` (or `ReviewViewBundle`) from the model, and the model imports their functions. The model's first 1,145 lines are 45 KB of types, constants and 46 free functions. The class starts at `:1146`.
- **Mechanism:** each slice carved out of the frozen 250 KB file has to import the state type back from it, so the model can never become a leaf and a reader must still open it to understand any slice. The runtime loop works today only because the three constants are read inside a function body. A top-level use (`const PAGE = DIFF_WINDOW_SIZE / 2` in the slice) would make one module read the other before it is initialised. Which module that is depends on import order: a startup `ReferenceError`, not a type error. Nothing checks for loops: `check-dependencies.mjs` checks only package edges.
- **Proposed disposition:** fix — move `ReviewingApplicationState`, its sub-state types, `ReviewingModelEffect`, `ReviewViewBundle`, `ReviewLoadTarget` and the window-size constants into a leaf `reviewingState.ts` (types and constants only, re-exported from the model). This shrinks the frozen file and turns every existing and future slice into a leaf importer. Add a cycle check for `apps/` and `packages/*/src` to `pnpm verify` (runtime imports at least).
- **Confidence:** confirmed by measurement (cycle script output; `git log` of `reviewingSearchOpen.ts`).

#### X-02 — The Workspace's top-level file is also its base-type file, so the package is one import loop

- **Area / file:** Workspace — `packages/workspace/src/workspace.ts` (defines `WorkspaceIdentity`, imports every owner at `:1-46`); importers include `authoritativeState.ts:18`, `workspaceIdentity.ts:36`, `reviewing/index.ts`, `projection/index.ts`, `harness-interaction/contracts.ts`, `legacyReviewImport/contracts.ts`, `workspaceEvidence/contracts.ts` (18 modules in all)
- **Category:** maintainability
- **Severity:** low
- **Evidence:** the names lower modules import from `workspace.ts` are `WorkspaceIdentity` (18 imports) and `WorkspaceAttention` (1). `workspace.ts` imports every owner, so counting type imports all 72 files of `packages/workspace/src` form one loop. Counting runtime imports only, the one loop is `contextEvidence.ts` ↔ `workspaceEvidence/index.ts`, already listed in WF-289's "ticket when touched".
- **Mechanism:** no owner can be read or type-checked without the composition root, and the root imports everything. A Planning owner will import `WorkspaceIdentity` from `workspace.ts` too and join the loop. A runtime import of anything else from `workspace.ts` by a lower module would turn the type loop into a runtime one with the startup-order hazard described in APP-05.
- **Proposed disposition:** fix — move `WorkspaceIdentity` and `WorkspaceAttention` to a leaf module (for example `workspaceTypes.ts`), re-exported from `workspace.ts` and `index.ts`. This is a one-commit change with no format impact. Fold the `contextEvidence` loop into the same change if cheap.
- **Confidence:** confirmed by measurement.

#### X-03 — Adding a Workspace owner still edits `workspace.ts` in about nine places, with 1.4 KB of budget left

- **Area / file:** Workspace — `packages/workspace/src/workspace.ts:58-62` (`WorkspaceCommand`, `WorkspaceCommandResult`), `:68-73` (`WorkspaceViewRequest`), `:83-88` (`WorkspaceView`), `:90-100` (`WorkspaceViewFor`, nested conditional), `:106-118` (scope, update, `WorkspaceViewUpdateFor`), owner construction `:204-284`, routes `:293-328`, `#publishCommitted` `:332-335`; file size 18,612 bytes
- **Category:** maintainability
- **Severity:** low
- **Evidence:** WF-296's resolution says "Adding a domain now means one `kinds.ts` and one line per table." The route tables are that cheap. A new owner also extends four or more public unions and two nested conditional types, adds its construction to the constructor, adds imports, and, if it has live views, edits `#publishCommitted`, which names the two live owners and special-cases `'harness-interaction'`. The file has 1,388 bytes left under the 20,000-byte budget.
- **Mechanism:** Planning's owner (WF-300) will very likely push `workspace.ts` over the budget, so the pre-commit hook blocks the Planning commit until someone splits the composition root mid-feature, on the `planning` branch, in a file that `main` also edits. The understated claim also leads a planner to underestimate the change.
- **Proposed disposition:** fix before WF-300's owner lands — move the public unions and conditional types to `workspaceContracts.ts` (types only), and owner construction to `workspaceOwners.ts`. Let each owner hand the Workspace one declaration (`commands`, `views`, `scopes`, whether it publishes), so `#publishCommitted` iterates instead of naming owners. Correct WF-296's sentence.
- **Confidence:** confirmed by reading and byte count. The overflow is an estimate (about 1.5–2 KB of additions for one owner).

#### X-04 — Planning will add a fourth copy of State record handling unless WF-291 is sequenced first

- **Area / file:** Planning tickets — `.issues/WF-300-build-plannings-first-slice.md` (`blocked_by: [WF-296, WF-297, WF-299]`), `WF-291` (`blocked_by: [WF-213]`), `WF-213` (open, `blocked_by: [WF-290]`, which closed in `f049ebc`); code copies at `reviewing/utils.ts:6`, `harness-interaction/utils.ts:10-14`, `legacyReviewImport/utils.ts:145-149` (encode/decode); `reviewing/parsingReview.ts:1435`, `harness-interaction/records.ts:14`, `legacyReviewImport/records.ts:10` (`immutableRecord`); `reviewing/records.ts:9`, `harness-interaction/records.ts:32`, `legacyReviewImport/records.ts:28` (`revisionedRecord`); `rejected()` ×3; the `rev_` pattern ×3 (`projection/limits.ts:54`, `legacyReviewImport/limits.ts:58`, `harness-interaction/limits.ts:67`)
- **Category:** duplication
- **Severity:** low
- **Evidence:** WF-289's destination says a new domain "saves records through one shared module". The copies WF-291 lists are all still present. WF-300 is not blocked by WF-291. WF-291 waits on WF-213 stage 2, whose blocker closed on 2026-11-18. WF-213 still has an open design question that needs owner review, and no commit has touched `harness-interaction/` since `cb9d8e2`.
- **Mechanism:** Planning writes the fourth copy of recall → version check → commit → map failure → decode. Each copy is a place where a durability fix must be repeated. WF-291 then has four owners to unify instead of three.
- **Proposed disposition:** fix the sequence (owner decision). Either add WF-291 to WF-300's `blocked_by` and let WF-291 start without waiting for WF-213 (it needs only the commit sequence in `harnessInteraction.ts`, not the class split), or record in WF-300 that a fourth copy is accepted and WF-291 absorbs it later.
- **Confidence:** confirmed by reading tickets and code.

#### X-05 — Live-view delivery is written twice, with different rules

- **Area / file:** Workspace — `projection/index.ts:502-575` (`publishCommittedVersion`, `#schedule`, `#deliver`); `harness-interaction/harnessInteraction.ts:400-402`, `:4048-4089` (`#publish`, `#schedule`)
- **Category:** duplication
- **Severity:** low
- **Evidence:** both owners keep subscriptions, schedule a re-read on each committed State version, and deliver only newer views. The rules differ. The projection allows one read in flight per subscription and re-reads once afterwards if asked (`refreshRequested`). It guards the subscriber's callback, and on a lasting record failure it delivers a `workspace.projection-failed` update. Harness interaction batches through a microtask but can start a second read while one is in flight. It relies on `view.stateVersion > lastStateVersion` to drop late ones, and it ends every read in `.catch(() => undefined)`, so a failing read delivers nothing and tells nobody.
- **Mechanism:** a Planning owner with live views (its plan file, its versions) needs the same machinery and will write a third version with a third set of rules. The two existing versions already disagree on what a subscriber learns when a read fails. In Reviewing the projection's views say "failed", while the Message-status view just stops updating (see Carried forward 2).
- **Proposed disposition:** fix when WF-291 or WF-213 lands — one internal `LiveViews` helper (subscriptions, coalescing, monotonic delivery, failure reporting) used by both owners and by Planning.
- **Confidence:** confirmed by reading.

Continued in [Findings, part 2](2b-findings.md).
