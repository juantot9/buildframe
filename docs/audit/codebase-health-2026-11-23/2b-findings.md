# Codebase health ledger (2026-11-23): Findings, part 2

Part of [the ledger](../codebase-health-2026-11-23.md); [part 1](2-findings.md).

#### AD-01 — The app tells users to connect with `/buildframe` in Pi or Claude Code, which is wrong for Codex

- **Area / file:** App — `apps/buildframe/src/developerArguments.ts:22-26` (`--help`), `doctor.ts:195` (next step when no agent is connected), `reviewingReasons.ts:13` (`attachment-not-found`), `:15` (`attachment-not-live`), `:53` (`harness-index-limit-reached`)
- **Category:** documentation
- **Severity:** low
- **Evidence:** `--help` says "Connect an agent by running /buildframe in a Pi or Claude Code session" and "doctor checks … the installed Pi and Claude Code". Doctor actually checks four hosts (`doctor.ts:278-288`). Doctor's next step says "Run /buildframe in a Pi or Claude Code session". `reasonSentence` says "Start Claude Code or Pi with the BuildFrame plugin here", "(or run /buildframe in Pi)" and "Run /buildframe in ${agent} again", which for Codex reads "Run /buildframe in Codex again". Codex's trigger is `!buildframe` (`developerExecutable.ts:59-60`; `assemble-release.mjs:201`). `a8c7b13` announces all four connectors.
- **Mechanism:** an OpenCode or Codex user following the app's own instruction is told to use the wrong agent or a command Codex does not run, at the moment they are trying to recover from a refused Send. The cause is structural: how to connect a host is a per-host fact, and the app writes it into sentences by hand, so every new connector must find these strings. OpenCode and Codex both missed them.
- **Proposed disposition:** fix — add the display name and the connect command to each `HostSupport` in `supportFacts.ts`, and build these five sentences from the list of supported hosts.
- **Confidence:** confirmed by reading.

#### AD-02 — Each connector's supported versions are written in about five places, only partly tied together

- **Area / file:** Connectors and app — `packages/opencode-adapter/src/capability.ts:8-15`, `packages/codex-adapter/src/capability.ts:10-16`, `packages/claude-adapter/src/direct/capability.ts`, `packages/pi-adapter/src/piHostCompatibility.ts:4-16`; each `package.json` `buildframe` field; `apps/buildframe/src/supportFacts.ts:16-42`; tests `apps/buildframe/test/fast/doctor.test.ts:189-222`, `packages/claude-adapter/test/fast/source-island.test.ts:20-33`, `packages/pi-adapter/test/contracts/piHostCompatibility.test.ts:24-27`, `packages/opencode-adapter/test/contracts/openCodeAdapter.test.ts:164-168`
- **Category:** maintainability
- **Severity:** low
- **Evidence:** per connector, the range is a human string (`OPENCODE_HOST_COMPATIBILITY_RANGE`), the admission is separate code (`MINIMUM_*` constants plus a regex in `isReviewed…HostVersion`), the package manifest repeats range and verified list, and the app's `supportFacts.ts` repeats both again as tuples plus a string. The manifest field names differ per connector (`supportedPiVersions`, `supportedClaudeDirectHostVersions`/`reviewedClaudeDirectHostVersions`, `supportedOpenCodeVersions`, `supportedCodexVersions`). Tests tie app ↔ manifest for all four and Claude's code ↔ manifest. Pi's and OpenCode's code is pinned to literals. Nothing ties OpenCode's or Codex's code constants to anything else. `VERIFIED_OPENCODE_HOST_VERSIONS` and `VERIFIED_CODEX_HOST_VERSIONS` are exported and used nowhere. `supportFacts.ts:3` says "a contract test keeps the two in step", which is true only for the manifest. Four hand-written version comparators exist (one per connector) besides the app's.
- **Mechanism:** raising OpenCode's minimum in `capability.ts` without editing `supportFacts.ts` makes `buildframe doctor` report a version as accepted that the plugin refuses ("BuildFrame supports OpenCode >=2.3.2 <3.0.0; this is …"). The reverse also happens. A fifth connector copies the pattern and picks a sixth field name. This includes and narrows carried lead 22 from 2026-11-16.
- **Proposed disposition:** fix — one `HostSupport`-shaped constant per connector (range, bounds, verified, connect command) in a dependency-free module of the connector. Derive the admission check from the bounds. Add one test that reads every connector's constant, manifest field (one field name for all) and `supportFacts` entry and requires them equal. Tests may import connectors.
- **Confidence:** confirmed by reading.

#### AD-03 — Inside a Codex session every `buildframe` command becomes the Codex helper, including `doctor`

- **Area / file:** App / Codex connector — `apps/buildframe/src/developerExecutable.ts:59-64`; `packages/codex-adapter/src/helper.ts:54-83`
- **Category:** correctness
- **Severity:** low
- **Evidence:** `run()` sends the process to the Codex helper whenever `CODEX_THREAD_ID` is set, before parsing arguments. `runCodexCommand` accepts only `''`, `status` and `disconnect`. Anything else prints "Usage: !buildframe, !buildframe status, or !buildframe disconnect" and exits 2. So `buildframe doctor`, `buildframe --version` and `buildframe --help` are unreachable in any shell that Codex started, and plain `buildframe` starts the helper instead of the app.
- **Mechanism:** a user who asks Codex to run `buildframe doctor`, or types `!buildframe doctor`, gets a usage line and no diagnosis. The README and doctor's own messages point users to doctor when something is wrong. Connecting from Codex is deliberate; losing doctor and version there looks like a side effect, not a decision.
- **Proposed disposition:** fix — let `doctor`, `--version` and `--help` through before the Codex check, or route `!buildframe doctor` to doctor.
- **Confidence:** confirmed by reading (not run inside Codex).

#### TEST-01 — App scenario tests have no shared harness, and the frozen suite forces copies

- **Area / file:** Tests — `apps/buildframe/test/scenarios/reviewingApplication.test.ts` (273,264 bytes, 5,932 lines, 61 tests, frozen); `reviewingAllFiles.test.ts:21-31`, `reviewingHomeRows.test.ts:47-57`, `shell.test.ts` (own `git` and `waitFor`); `packages/workspace/test/scenarios/` (17 files define their own `git` helper despite `driver.ts`); relative reach-ins to `packages/workspace/src/gitProcess.js` from 4 test files
- **Category:** testing
- **Severity:** low
- **Evidence:** the two scenario files split out of the frozen suite this week each carry byte-identical `waitFor` (6,000 × 10 ms polls) and `git` helpers, `XDG_STATE_HOME` save and restore, and runtime-owner setup. 21 test files across packages define their own `git` helper and 6 define `waitFor`. No `test/support/` exists in the app. WF-297 step 8 (a renderer-free `screenTest`) is still to come. The four `../../../../packages/workspace/src/gitProcess.js` imports bypass the package's `exports`, which the firewall does not check for relative paths (noted in the previous ledger's observations).
- **Mechanism:** the frozen suite cannot grow, so every new Reviewing or Planning behaviour needs a new file, and today each new file starts by copying setup. A fix to the poll budget, the state-home restore or the fixture repository must then be made in every copy, and a missed copy shows up as a flaky test in one file only. Planning's tests will be the next copies.
- **Proposed disposition:** fix — an `apps/buildframe/test/support/` with the repository fixture, runtime owner, renderer setup and `waitFor`, used by new files first. Make it the base for WF-301's renderer-free screen tests. Export `resolveGitExecutable` through a test-only subpath, or copy it into the support module, instead of reaching into another package's `src`.
- **Confidence:** confirmed by measurement (grep counts, diff of the helpers).

#### X-06 — The newcomer's entry documents describe the code before this delta

- **Area / file:** Docs — `HANDOFF.md` (whole file, "Last updated: 2026-11-13"); `CONTEXT.md` (no entries for Connector, Shell, Screen)
- **Category:** documentation
- **Severity:** low
- **Evidence:** `HANDOFF.md`'s source graph lists two connector packages, says BuildFrame is published as `@buildframe/cli` and `@buildframe/pi` (now also `@buildframe/opencode`, and Codex through the CLI), and gives "publish 0.1.0" as the frontier. It does not mention the connector kit, the shell and screens, the `planning`/`main` branch split, or WF-289 as the plan in progress. `CONTEXT.md` has 0 matches for "connector" while `README.md` uses it 5 times and the kit's types are all `Connector*`. The glossary's word is Adapter (`ReviewedHarnessAdapter`, the `harness-adapter` subpath, `*-adapter` packages).
- **Mechanism:** `HANDOFF.md` is the first file a new session reads. It currently sends a newcomer to a two-connector, one-application picture and leaves out the two seams that new work must use. A search of the glossary for the words the code uses finds nothing.
- **Proposed disposition:** fix — refresh `HANDOFF.md` (packages, publishing, branches, WF-289/WF-301/WF-300 as the frontier, "to add a connector read `local-runtime/src/connector/contracts.ts`; to add a screen read `shellScreen.ts`"). Add Connector (the package-level name of a reviewed Adapter), Shell and Screen to `CONTEXT.md`.
- **Confidence:** confirmed by reading.
