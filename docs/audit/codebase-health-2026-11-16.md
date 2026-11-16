# Codebase health ledger — BuildFrame

Opened: 2026-11-16
Last reviewed: 2026-11-16 at `7f4e037` (public repo `juantot9/buildframe`; history before `2f77e97` lives in the private archive)
Run status: complete (six area sweeps; most leads beyond the eleven findings carried forward untested)
Scope: every package and app (`apps/buildframe`, `packages/workspace`, `packages/local-runtime`, `packages/pi-adapter`, `packages/claude-adapter`) plus release and build scripts. Question asked by the owner: which code is critical, and which can become a problem now or as the project grows.

## How to read a finding

Each finding names its area, file and line, a category, a severity, the evidence, the mechanism, and a proposed disposition. The vocabulary matches the project's earlier ledgers in `docs/audit/`.

**Categories:** correctness, durability, concurrency, performance, security, testing, duplication, maintainability, documentation.

**Severity:**
- **high** — can lose or corrupt saved State, mislead the user about something they act on (sent / answered / unknown, current / stale), breach the same-user trust boundary, or break a documented guarantee.
- **medium** — degrades correctness, safety or resource use under conditions this product will actually meet (large repositories, long sessions, two agents, slow machines).
- **low** — real but bounded; costs clarity or future effort more than behaviour.
- **not a defect** — a fact worth knowing.

**Proposed disposition** (the owner decides): **fix** (scope named), **accept** (why), **defer** (to named planned work), **delete-bound** (code scheduled for removal).

IDs: `HI-` harness interaction, `RT-` local runtime, `AD-` Pi and Claude connectors, `ST-` State and durability, `WS-` Workspace evidence/projection/reviewing, `APP-` the terminal app, `X-` cross-cutting. IDs are never reused.

## Review log

| Date | Commit range | Areas covered | Added | Closed |
| --- | --- | --- | --- | --- |
| 2026-11-16 | baseline at `7f4e037` (HEAD unchanged at the end; tree clean) | all six areas, partial depth (see Coverage) | 11 | — |

## Project intent brief

**What it is.** BuildFrame (renamed from Neoflow on 2026-11-14) is a terminal app for reviewing what a coding agent changed. The developer reads a Review (current changes, a commit or a range) as Files and a Diff, writes Messages anchored to exact lines, and sends them to one connected Pi or Claude Code session. The agent's Response comes back under the Message. 0.1.0 is a quiet, Reviewing-only preview for macOS and Linux on Node 26.

**Processes.** The app (OpenTUI on Node 26 with `--experimental-ffi`) launches, if needed, one detached **runtime process per repository** (Workspace Identity). The runtime owns the Workspace core and the only writer of **Authoritative State**: SQLite (`node:sqlite`) inside a worker thread. Clients reach the runtime over an owner-private Unix socket with a framed JSON protocol and client roles (`tui`, `cli`, `harness-adapter`, `editor-adapter`). The Pi connector (`@buildframe/pi`, a Pi extension) connects as `harness-adapter`. Claude Code uses a native Mod plugin that talks to a helper daemon (`buildframe-claude-helper`) over loopback HTTP with a launch token; the helper connects to the runtime as `harness-adapter`.

**Layering.** `packages/workspace` depends on nothing of ours. `packages/local-runtime` depends on workspace. The app and both adapters depend on workspace and local-runtime. `scripts/check-dependencies.mjs` enforces a dependency firewall. The Workspace Interface is exactly `execute`, `read`, `subscribe`.

**Claimed invariants (the product's truth rules).**
- A Send commits locally (Durable Commit) before anything leaves BuildFrame.
- Messages go to the agent exactly as written; BuildFrame never scans them for secrets.
- Nothing is replayed. An outcome that can't be confirmed stays unknown. No Response is fabricated.
- Truth-critical distinctions are never collapsed: prepared / started / ended / unresolved; current / stale / unverified; discussion versus mutation.
- One connected harness session per repository; the newest `/buildframe` wins and the released session is told and does not reconnect.
- Removing code never removes user State, Configuration, `.neoflow/review.json`, or legacy receipts.
- Same-user programs are trusted (0.1.0 safety bar); the Claude helper still refuses callers without its launch token.
- Reads are bounded (windows, limits); no unbounded projection.
- Every action is keyboard-reachable; `--no-color` and `--ascii` are full modes; light and dark terminals.

**Kept on purpose (not defects).**
- Internal identifiers still spelled `neoflow`: hash domain tags (`neoflow-…-v1`), versioned format names (`neoflow.…/1`), `.git/neoflow-workspace-identity.json`, and the legacy import locations (`.neoflow/review.json`, `<state root>/neoflow/workspaces/`). Changing them would orphan saved data.
- Retired **User Pull** code in `packages/workspace/src/harness-interaction/userPull.ts` and its State records: the Claude User Pull route was removed from the connectors on 2026-11-12, but Workspace-side records may exist on disk and must stay readable. Whether the remaining code is still needed is a fair question; its existence alone is not a finding.
- Legacy Review import (`legacyReviewImport/`) reads files written by older versions.
- `.issues/`, `docs/`, `CONTEXT.md`, `HANDOFF.md` are the working method (WF-205 ruled relocation out). Old tickets keep the old name.
- No telemetry, no network calls of BuildFrame's own.
- Windows is not supported in 0.1.0.

**Planned work that already owns known problems.**
- WF-213: split `harness-interaction/harnessInteraction.ts` along its internal seams.
- WF-214: split the Reviewing view (`reviewingView.ts`) and its scenario test along pane seams.
- WF-205: the September repository-health findings (god modules, root barrel, nesting, monolithic scenario tests, `v1` naming).
- WF-216, WF-225, WF-229: later Reviewing features (context curation, reframing, applying a tree leaf).

**Prior audits (read, not re-reported).** `docs/audit/pre-p17-codebase-findings.md` (Aug), `docs/audit/active-v1-antipatterns-2026-09-01.md` (five blocking defects, since fixed), `docs/audit/repo-health-findings-2026-09-07.md` (F1–F8, owned by WF-205). Growth since then is in scope; the original findings are not new.

**Checks at this commit.** `pnpm verify` (lint, format, dependency firewall, 67 test files / 541 tests, typecheck, build, smokes) passed on 2026-11-16 at `ef3bbdf` (HEAD `7f4e037` adds only a ticket edit). Lint baseline: 36 warnings. CI green on macOS and Linux, Node 26.4.0 and 26.13.1. No credential files or private-key headers in the tree or in `release/`.

## Coverage

| Area | Status | Notes |
| --- | --- | --- |
| Harness interaction core (`packages/workspace/src/harness-interaction/`) | partial | Limits, commit/dispatch order, evidence ordering, User Pull reachability read. Not reached: `#askReviewQuestion`, `#commitReviewHandoff`, `#prepareReviewResponse` bodies, `commitmentPolicy.ts`, `anchors.ts`, most of `parsing.ts`/`normalization.ts`. |
| Local runtime + connectors | partial | Lifecycle, bootstrap, framing, permissions, helper HTTP surface, reconnect loops read. Not reached: full protocol validators, `client.ts` discovery/reconnect, Pi no-start/settle/interrupt paths, `launcher.ts`. |
| State and durability | partial | Worker schema/open/migration/lease/commit, identity marker, registry and lock read. Not reached: most of `legacyReviewImport/index.ts`, `legacyReviewSource.ts`, `workspace.ts`, content reads with `includeContent`. |
| Workspace evidence, projection, reviewing, git process | partial (~30%) | `gitProcess.ts`, invalidation, inspection, capture/verify paths, `reviewing/diff.ts`. Not reached: `reviewing/index.ts`, `parsingReview.ts`, `comparisonFacts.ts`, most of `projection/index.ts`, LFS pointers. |
| Terminal app (`apps/buildframe/src`) | partial | Application wiring, render loop, diff pane, highlight, caches, config save read. Not reached: editor/basis-picker/modal handlers, `reviewingInput.ts`, `reviewingScroll.ts`, `launcher.ts`, `doctor.ts`. |
| Cross-cutting | done | Import direction, exports, dead User Pull code, release scripts, dependency declarations, docs after the rename. Not reached: intra-package cycles, unused exports in general. |
| Tests (quality) | not covered | Only noted where a finding has no test. |

## Summary

The code is careful where the product's truth rules live: no path sends before the Durable Commit, evidence is checked and never overwritten, the State worker commits atomically, and the socket and helper surfaces are tight. The serious problems are **limits and edges that only show up after weeks of real use or in other people's repositories**, which is exactly what a public preview will meet first.

Confirmed findings: **4 high, 7 medium, 0 low** (11). Carried forward, untested: 24 leads.

The three that matter most before 0.1.0 is published:
1. **HI-01** — after 64 `/buildframe` connections, or 512 Messages, in one repository's lifetime, connecting or sending is refused for good, with a message that says "try again".
2. **WS-01** — any repository whose own `.git/config` sets a common key such as husky's `core.hooksPath` can't be opened at all (measured).
3. **APP-01** — in a Review with more than 64 handoffs, later Messages show "waiting" or "not sent" whatever really happened.

RT-01 (doctor from another install shuts down the running runtime) breaks a promise the README makes and bites the owner's current dev-plus-installed setup.

## Findings

#### HI-01 — Lifetime limits on connections and Messages never free up

- **Area / file:** Harness interaction — `packages/workspace/src/harness-interaction/limits.ts:17-23`; `harnessInteraction.ts:601`, `:1512-1517`, appends at `:2461-2462`, `:2810-2811`, `:3417`, `:3816`, `:4616-4617`; `records.ts:51-62`
- **Category:** correctness
- **Severity:** high
- **Evidence:** `MAX_ATTACHMENTS = 64`, `MAX_HANDOFFS = 512`, `MAX_INVOCATIONS = 512` apply to the whole repository's harness index. Establishing a new attachment is refused with `state-conflict` once `attachments.length >= 64` (`:601`); a Send is refused with `state-conflict` once handoffs or invocations reach 512 (`:1512-1517`). Every write to these lists appends (`[...index.payload.handoffs, handoffEntry]` etc.); `replaceAttachment` only appends or replaces; no code removes entries. Each `/buildframe` in Pi creates a new attachment because the identity includes `sessionEpoch: randomUUID()` (`pi-adapter/src/extension.ts:242`, `piAdapter.ts:264-271`); each Claude helper launch does the same (`claude-adapter/src/direct/helperEntry.ts:168`). No test references any of the three limits.
- **Mechanism:** the 65th `/buildframe` ever run in a repository is refused; after 512 Messages and Asks in its lifetime, every Send is unavailable. The app shows "Something changed while you were working. Try again." (`apps/buildframe/src/reviewingReasons.ts:75-76`), which no retry fixes. A daily user reaches 64 connections in weeks.
- **Proposed disposition:** fix — scope limits to live data (retire released/terminal attachments and settled invocations from the index, or bound per Review/attachment instead of per repository), map the limit to its own reason with honest copy, and add a scenario test that crosses each limit. Plan the index format change with the State format version.
- **Confidence:** confirmed by reading (all write sites listed; settles fully with a test that connects 65 adapters).

#### WS-01 — A repository with a common local Git setting can't be opened

- **Area / file:** Git process — `packages/workspace/src/gitProcess.ts:599-603` (default branch of `structuralConfiguration`), allowlist `:479-576`
- **Category:** correctness
- **Severity:** high
- **Evidence:** any repository-local `core.*`, `extensions.*` or `index.*` key not on the allowlist throws `unsupported-checkout-config`. Only the repository's own config is read (global and system are blanked, `:352-353`, `:388`). **Measured:** two identical throwaway repositories with one changed file; the plain one bootstraps `ready`, the one with `git config core.hooksPath .husky/_` is `rejected` with `git-inspection-failed`.
- **Mechanism:** husky (v5+) writes `core.hooksPath` into `.git/config`; other common local keys (`core.editor`, `core.excludesFile`, `core.pager`, `core.whitespace`, `core.sshCommand`, scalar's keys) do the same. BuildFrame then can't open the repository at all, and says Git couldn't read it. Hooks never run during inspection, so `core.hooksPath` is harmless here. WF-096 deliberately rejects unknown *structural* settings; these keys aren't structural.
- **Proposed disposition:** fix — allowlist keys that can't change what Git reports for the inspection (hooks path, editor, pager, excludes file, whitespace, ssh command, and similar), keep refusing unknown structural ones; add the husky case to the inspection tests.
- **Confidence:** confirmed by measurement.

#### APP-01 — Messages after the 64th handoff in a Review show the wrong status

- **Area / file:** App — `apps/buildframe/src/reviewingApplication.ts:1323-1328`, `:1490-1496`; `reviewingModel.ts:78`, `:1003-1043`; Workspace slice `harness-interaction/harnessInteraction.ts:5686-5687`
- **Category:** correctness
- **Severity:** high
- **Evidence:** both the read and the subscription for `harness.review-interaction` use `offset: 0, limit: HARNESS_INTERACTION_WINDOW_SIZE` (64); no other offset is ever requested. The Workspace returns `allHandoffs.slice(offset, offset + limit)` in stored order. `messageInvocation` returns `undefined` when no handoff matches, and `messageState` then falls to `default: return 'waiting'`.
- **Mechanism:** once a Review has more than 64 handoffs (resends count), every later Message shows "Waiting for the agent to start" (and the view's Questions label shows "Not sent"), whatever the record says: working, failed, ended or unknown. Stop isn't offered. This collapses "not loaded" into a state the record doesn't hold.
- **Proposed disposition:** fix — read the newest window (or page by the Messages on screen), and show "not loaded" rather than "waiting" when a Message's handoff isn't in the loaded window.
- **Confidence:** confirmed by reading.

#### RT-01 — `doctor` from another install shuts down the running runtime

- **Area / file:** Local runtime — `packages/local-runtime/src/lifecycle.ts:591-607`, `client.ts:492-497`, `server.ts:425-426`, `:861-880`
- **Category:** correctness
- **Severity:** high
- **Evidence:** `inspectWorkspaceRuntime` is documented as "Read-only … it never stops, replaces, or starts a process". It calls `discoverWorkspaceRuntime` with a `runtimeCodeIdentity`, and the client always adds `runtimeCodeMismatch: 'retire'`. A runtime with a different code identity rejects the bootstrap and calls `#onRuntimeCodeMismatch`, which is `replacement.abort()`; the runtime then drains and exits.
- **Mechanism:** running `buildframe doctor` from a different install (a dev checkout beside the installed CLI, or an older version) retires the other install's runtime, dropping its open app and connected agents. In-flight Messages become unknown. The README says doctor "changes nothing". The code identity hashes path, inode and mtime, so any two installs differ.
- **Proposed disposition:** fix — let a bootstrap say "report a mismatch, don't retire" and use it from doctor; keep `retire` for app launches.
- **Confidence:** confirmed by reading.

#### WS-02 — Repositories with more than 100,000 tracked files can't be captured

- **Area / file:** Workspace evidence — `packages/workspace/src/workspaceEvidence/enumeration.ts:58`, `:244-260`; `contracts.ts:20`
- **Category:** correctness
- **Severity:** medium
- **Evidence:** every capture runs `enumerateIndex` (`git ls-files --stage` of the whole index) with `maximumFiles = limits.maxManifestFiles` (100,000) and throws `manifest-file-limit` when the index has more paths.
- **Mechanism:** a large monorepo can't be reviewed even with one changed file; the cap meant for the changed manifest is applied to the whole index.
- **Proposed disposition:** fix — bound by changed and affected paths, not total tracked files, or document the limit and show a specific message.
- **Confidence:** confirmed by reading.

#### ST-01 — A crash while creating State for the first time blocks that repository

- **Area / file:** State — `packages/workspace/src/authoritativeStateWorker.ts:374-391`, `:322-324`, `:1086-1105`
- **Category:** durability
- **Severity:** medium
- **Evidence:** first creation renames a candidate to `generation-0001-<uuid>.sqlite`, fsyncs the folder, then writes `CURRENT`. When `CURRENT` is missing at the next open, the code adopts a lone generation only if it is named `generation-1.sqlite`; anything else throws `state-invalid`.
- **Mechanism:** a kill or power loss between the rename and the `CURRENT` write leaves a valid, empty database that every later start refuses. The user sees that saved data is damaged; recovery is by hand. No data is lost.
- **Proposed disposition:** fix — when `CURRENT` is missing and exactly one new-style generation exists with the expected schema and no records, adopt it; add a failpoint test for interrupted first creation.
- **Confidence:** confirmed by reading.

#### ST-02 — No frozen fixture of the State format 0.1.0 users will have

- **Area / file:** State tests — `packages/workspace/test/fixtures/authoritative-state/` (only `format-1/`); `authoritativeStateWorker.ts:41` (`STORE_FORMAT_VERSION = 2`); `scripts/generate-authoritative-state-golden.mjs`
- **Category:** testing
- **Severity:** medium
- **Evidence:** the only golden store is format 1; the current format is 2.
- **Mechanism:** once 0.1.0 ships, format-2 databases exist on users' machines. The next format change has no fixed 0.1.0-era store to migrate from, so a change to the codec or checksums could break real stores while tests that build their own fixtures still pass.
- **Proposed disposition:** fix — generate and commit a format-2 golden store (with representative Reviews, Messages, handoffs) before publishing 0.1.0, and add an open-and-read test against it.
- **Confidence:** confirmed by listing.

#### HI-02 — A crash between the Durable Commit and the hand-off leaves a Message "waiting" forever

- **Area / file:** Harness interaction — `harnessInteraction.ts:2597-2612`, `:4782-4787`, `:1483-1493`; runtime `packages/local-runtime/src/server.ts:182-214`
- **Category:** correctness
- **Severity:** medium
- **Evidence:** the directive is handed to the connector after the commit; errors from `perform` are swallowed (`catch { return; }`). An invocation leaves `awaiting-start` only through connector evidence. The runtime marks *sent* invocations `unresolved` on a normal disconnect (`server.ts:199-212`), but that list lives in memory.
- **Mechanism:** if the runtime dies between the commit and sending the directive, the connector never learns of the invocation and nothing resolves it. The Message shows "Waiting to start" forever (the truth is "unknown"), and that attachment's Sends are refused with `active-invocation-exists` until a fresh `/buildframe`. Narrowed from the sweep's broader claim: a normal disconnect, and a connector that survives a runtime crash, both recover.
- **Proposed disposition:** fix — at runtime start, mark `awaiting-start` invocations from a previous runtime generation as `unresolved` (start evidence lost).
- **Confidence:** partly confirmed, narrowed by reading.

#### APP-02 — The Diff pane does quadratic work, twice, on every render

- **Area / file:** App — `apps/buildframe/src/reviewingView.ts:3144`, `:3191`, `:3208-3212`
- **Category:** performance
- **Severity:** medium
- **Evidence:** `items.map((_, index) => items.slice(0, index).reduce(...))` computes row offsets in O(n²) time and allocations; with up to 1,024 loaded rows plus cards that is about half a million additions per build. When the pane overflows, `buildItems(paneContentWidth)` is called a second time with the same width.
- **Mechanism:** the whole view rebuilds on each render, and glides render every 16 ms, so long files cost frame time where "feel" matters most.
- **Proposed disposition:** fix — a running total, and reuse `preliminary` (or pass the narrower width the second build was presumably meant to use).
- **Confidence:** confirmed by reading (not timed).

#### APP-03 — The app's diff and content caches never evict

- **Area / file:** App — `apps/buildframe/src/reviewingModel.ts:1140`, `:1142`
- **Category:** performance
- **Severity:** medium
- **Evidence:** `#diffCache` and `#contentCache` are only ever `set` (5 sites); no `delete`, `clear` or size bound. Keys include the State version, which every commit and Send bumps.
- **Mechanism:** a long session keeps every diff window it has shown at every version, so memory grows for as long as BuildFrame stays open.
- **Proposed disposition:** fix — a small LRU, or drop entries from older State versions.
- **Confidence:** confirmed by reading.

#### X-01 — Retired User Pull still accepts new writes and runs on every interaction read

- **Area / file:** Harness interaction — `harnessInteraction.ts:337-350` (seven `harness.user-pull.*` commands dispatched), `:5685` (`#expireUserPullStartObservations` in the read path), `:5706-5708`; runtime `server.ts:389`
- **Category:** maintainability
- **Severity:** medium
- **Evidence:** no connector or app code sends `harness.user-pull.*` any more, but `execute` still dispatches all seven, and any `tui` or `cli` client can reach them. Every interaction view also runs User Pull expiry (which can commit) and projects User Pull state per attachment.
- **Mechanism:** about 2,000 lines of unused write paths stay in the protocol surface and must be kept correct through WF-213's split; the read path does extra record reads per attachment and can throw from a commit race inside a read. Saved User Pull records must stay readable; the write commands needn't.
- **Proposed disposition:** fix — refuse the write commands as unsupported, keep parsing and read-only projection; fold into WF-213.
- **Confidence:** confirmed by reading (hot-path cost not measured).

## Carried forward

Not findings. Each has evidence and a named mechanism, and none has been tested. Do not act on one without confirming it first; do not count them among the findings.

1. **Live Changes re-capture forever when one file is incomplete** — `workspaceEvidence/index.ts:1049`, `reviewing/transition.ts:1036`, `projection/index.ts` `#verifyLiveChangesNow`. An untracked file over 128 MiB (or an unavailable gitlink) makes the capture incomplete, so verify never says current and every 2 s tick re-captures, re-reads and re-diffs everything and churns the 4-entry capture LRU. *Settles by:* a 200 MB untracked file, count `captureAttempt` calls and CPU over a minute.
2. **Each verify re-hashes all modified files and re-lists the whole index** — `workspaceEvidence/index.ts:1060-1110`; no stat (mtime/size) shortcut; every 2 s in the foreground plus watcher events. *Settles by:* profile an idle 50k-file repo with 50 MB of changes.
3. **The recursive watcher has no filter** — `workspaceInvalidation.ts:14`; on Linux one inotify watch per directory, including `node_modules` and build output; errors swallowed. *Settles by:* Linux checkout with a large `node_modules`, count watches and startup time.
4. **CRLF / `working-tree-encoding` makes whole files look rewritten** — `reviewing/diff.ts` compares raw bytes; no eol handling found. *Settles by:* `.gitattributes` with `*.txt text eol=crlf`, edit one line, count rows.
5. **Top-level `git status` descends into submodules with their own unsanitized config** — `workspaceEvidence/enumeration.ts:33-44` lacks `--ignore-submodules`. *Settles by:* a submodule with `core.fsmonitor` set to a marker script.
6. **Rename fallback retries after a timeout** — `enumeration.ts:45-54`; a 30 s timeout becomes ~60 s. *Settles by:* a fake git that times out.
7. **A Pi or Claude connector gives up for good on a brief "insecure endpoint" window** — socket exists before `chmod` (`runtimeLocation.ts:216-218`, `server.ts:887-895`); `retryable()` in `pi-adapter/src/extension.ts:50-57` and `claude-adapter/src/direct/helperEntry.ts:38-45` excludes `insecure-runtime`. *Settles by:* chmod the socket in a test and watch the attach loop exit.
8. **Establishment timeouts can strand both sessions** — the adapter gives up after 5 s (`harnessAdapter.ts:455-460`) while the server may still commit and release the old session; the Claude launcher allows 12 s for up to 15 s of steps (`helperEntry.ts:20,87-89`). *Settles by:* delay `establish` 6 s with a prior attachment.
9. **Claude: the user's own prompt during BuildFrame's running turn doesn't make the outcome unknown** — `claudeDirectAdapter.ts:209-211`, `:225`; contradicts the documented correlation limitation. *Settles by:* event-sequence test submit → resolved → foreign-prompt → turn-complete.
10. **Pi: input typed during a BuildFrame turn is silently consumed** — `piAdapter.ts:299-316` returns `handled` for all input. May be deliberate; check intent. *Settles by:* type during a live Invocation.
11. **Claude helper hands a command to a request nobody is waiting on** — `helperServer.ts:178-207` holds `ServerResponse` with no `close` listener. *Settles by:* abort a held `/next`, then `deliver()`.
12. **The `replaced` notice can be lost before `destroy()`** — `server.ts:140-144`; two sessions could keep taking the connection from each other. *Settles by:* fill the socket's write buffer before release.
13. **A reconnect of a known attachment wins over the newest `/buildframe` after a runtime restart** — `harnessInteraction.ts:572-590`. *Settles by:* an interleaving test.
14. **A read can write and throw** — `#interactionView` commits via User Pull expiry; `read()` doesn't catch `HarnessProjectionVersionChanged`; `#schedule` swallows errors (`:5935`, `:5946`), so a bad saved User Pull record silently stops interaction updates. *Settles by:* corrupt one `harness.user-pull-arm` record in a fixture and subscribe.
15. **Startup time grows with all history** — no garbage collection of `content_objects` or `command_ledger`, no `VACUUM`, and `PRAGMA quick_check` on every macOS open (`authoritativeStateWorker.ts:439`, `:1042`). *Settles by:* time an open of a few-hundred-MB store.
16. **Registry and marker require an exact format version** — `workspaceIdentity.ts:910`, `:828`; a future bump locks older builds out of every repository (State has `read-only-newer`; identity doesn't). *Settles by:* decide a forward-compatibility policy before 0.2.0.
17. **macOS: `CURRENT`, marker and registry use plain fsync while SQLite uses F_FULLFSYNC** — a lost marker with a durable registry entry gives `workspace-marker-missing` with no in-app recovery. *Settles by:* read the recovery story for that diagnostic.
18. **Registry lock judges liveness by PID alone when the start time is missing** — `workspaceIdentity.ts:717-729`; PID reuse makes the lock look held. *Settles by:* owner file without `processIdentity` and a live unrelated PID.
19. **A cached live diff may be stale** — the app's cache key omits `liveChangesIdentity` (`reviewingModel.ts:3870`, `:3925`). *Settles by:* find how live `fileIdentity` is derived.
20. **A failed older refresh can overwrite a newer screen with an error** — `reviewingApplication.ts:1069-1074` checks generation but not sequence. *Settles by:* an ordering test.
21. **A local error after a successful command is shown as "Lost contact"** — `reviewingApplication.ts:1603-1628`. *Settles by:* make `render` throw after an accepted execute.
22. **Node range and Pi verified versions are copied in several places with no check tying them** — engines in six manifests, `nodeSupport.ts`, `.nvmrc`, CI; Pi verified list in `piHostCompatibility.ts`, `supportFacts.ts`, `pi-adapter/package.json`; the pinned Pi 1.5.0 isn't in the verified list. *Settles by:* change one copy and run verify.
23. **The Claude plugin ships from `main`, not from a release** — `.claude-plugin/marketplace.json` points at the repo path; plugin changes reach users before the matching CLI. *Settles by:* check Claude Code's marketplace update rules and whether the Mod protocol version refuses skew.
24. **Release assembly doesn't require a verified, clean tree** — `release:assemble` runs no tests and checks no tree state. *Settles by:* read WF-287's gate steps (the owner packs from a clean commit by hand today).

## Observations

- **The two connectors duplicate their attach loop, retry rules and evidence flushing** (`pi-adapter/src/extension.ts`, `piAdapter.ts:740-815`; `claude-adapter/src/direct/helperEntry.ts`, `claudeDirectAdapter.ts:526-596`). Carried-forward lead 7 is the same bug in both copies. A third connector would copy it again; worth a shared module when one is planned.
- **Growth since September:** `harnessInteraction.ts` 3,744 → 5,950 lines; the app 9,359 → 17,456 lines (`reviewingView.ts` 6,759, `reviewingModel.ts` 5,892). Owned by WF-213 and WF-214.
- **Theme values live in three places** (view presets, `COLOR_ROLES` in `userConfiguration.ts`, DESIGN.md); adding a role or preset touches all three.
- **The dependency firewall misses relative-path reach-ins and doesn't scan `scripts/`** (`scripts/check-dependencies.mjs:234-243`); no production violation exists today.
- **`@buildframe/cli` is both a retired workspace package name and the live release name** in `check-dependencies.mjs:9`; harmless until something names it.
- **Docs drift:** `CONTEXT.md:380-400` still describes User Pull as live; `claude-adapter/src/direct/capability.ts:5` mentions "the User Pull hook bridge"; dev builds print version `0.0.0`.

## Ruled out

- **Sending before the Durable Commit:** not found; `perform` runs only after `committed.status === 'committed'`, and a duplicate command never sends again.
- **Evidence overwriting or crossing attachments:** duplicates are compared with the saved copy, conflicting terminals refused, other attachments' evidence refused.
- **A Response without evidence:** prepared only on `ended-normally` with a result.
- **Unbounded per-invocation evidence or interruption lists, inspection cache:** bounded (1,024 / 128 / 32).
- **Helper listening beyond loopback, weak token check, unbounded bodies:** loopback only, Host header checked, POST only, `timingSafeEqual` after a length check, 256 KiB body cap.
- **Socket and folder permissions, stale socket removal:** 0700/0600 with lstat owner/type checks; stale sockets removed only after ECONNREFUSED under the writer lease.
- **Frame handling:** 1 MiB frame cap both ways, strict UTF-8, output backpressure cap, bootstrap timeout.
- **Single writer per repository:** a SQLite `BEGIN EXCLUSIVE` lease the OS releases on process death; no PID-reuse problem there.
- **Half-applied migrations:** copy → validate → rename → switch `CURRENT`, with tests for every checkpoint.
- **Commit atomicity:** `BEGIN IMMEDIATE`, `journal_mode=DELETE`, `synchronous=FULL`, `fullfsync`.
- **Key-order-dependent checksums in State:** the worker hashes ordered arrays with domain tags.
- **Git environment leaks:** `GIT_*` stripped, global/system config blanked, `LC_ALL=C`, `-z` paths, pager off, no prompts; timeouts kill the child.
- **Unbounded Git output:** every command's output is capped.
- **Projection caches:** bounded (history 4, search 4, live captures 2, evidence 4).
- **App subscriptions and timers:** cleaned up on route change and stop; glide timers stop when idle.
- **Config:** a newer or unknown version turns saving off; a malformed file is never overwritten; saves are atomic.
- **Wrong-direction package imports and imports past `exports`:** none in production code.
- **Credentials:** no key, certificate or `.env` files and no private-key headers in the tree or in `release/`.
- **zod and the dev-only security alerts:** none reach the published packages.

## Closed
