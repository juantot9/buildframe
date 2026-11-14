---
id: WF-287
title: "Ship the 0.1.0 public preview"
status: open
labels:
  - wayfinder:map
parent: WF-051
assignee: juanan
blocked_by: []
created: 2026-11-11
---

## Destination

BuildFrame (formerly Neoflow; see Notes) `0.1.0` is publicly installable as a
quiet, Reviewing-only preview: `npm i -g` or `pnpm add -g` installs a working
`buildframe` (and its short name `bframe`) on macOS or Linux with Node
`>=26.4 <27`, and Review Messages reach a Claude Code or Pi session that the
user connected once with `/buildframe`. The release is cut when the children below are done, not
on a date. The packed release was used for real, then those same tarballs were
published as `latest` without rebuilding.

## Owner decisions (grilling session, 2026-11-11)

**Audience and identity**

- A quiet public preview, not announced. Feedback goes through GitHub Issues.
- Version `0.1.0`. `1.0` waits for the full stable bar.
- MIT, as WF-050 already settled. The source repository becomes public with
  its full history and `.issues/`, after the hygiene child.
- Release when the scope below is done. There is no date.

**Scope: amends WF-051's sequence and WF-050's release bar for this release
only**

- Reviewing only. Planning (P31–P41), route selection and Manual Handoff
  (P27), the v1 composition packages (P42–P50) and Neovim (P28/P29/P40) come
  after 0.1.0. WF-051's strict ordering and P59's Planning walkthroughs do not
  gate this release.
- Three coordinated artifacts on one version: the `neoflow` app, the
  `neoflow-pi` Pi package, and the `neoflow` Claude Code plugin served from a
  marketplace in the main repository. The `neoflow.nvim` mirror is out.
- Installation is npm and pnpm only. The curl bootstrap and Homebrew are
  deferred to a later release. Homebrew reverses WF-050's "no Homebrew in v1".
- Platforms are macOS and Linux. WSL2 is not claimed.
- Node `>=26.4 <27`, with CI covering the oldest and newest 26.x on both
  platforms. The `<26.6.0` ceiling is retired, because WF-095 found 26.6 and
  26.7 no longer known-bad. Node 27 is added once tested. Node 26 is the floor
  because the renderer needs `node:ffi`.
- A small read-only `neoflow doctor`, which reports Node, product and protocol
  versions, detected hosts and compatibility, and the Claude Code version. No
  `neoflow setup`: the install guide carries setup.
- No migration or rollback rehearsal for 0.1.0, since no predecessor release
  exists. WF-050's data-safety rules (no reverse migration, and no rollback
  that hides a post-migration Durable Commit) are binding from 0.2.0.
- No `next` channel for 0.1.0 (owner decision 2026-11-13): npm makes a
  package's first publish `latest` whatever the tag, so the gate below runs
  on the packed tarballs instead, and those exact files are published. The
  owner publishes locally with 2FA, so 0.1.0 has no provenance attestation.
  `next` → `latest` returns from 0.2.0.

**Harness connection: connect once, then Send goes straight there**

(Owner decisions 2026-11-12, replacing the 2026-11-11 "User Pull only"
decisions, which misread the owner's intent; see Notes.)

- In a harness session the user runs `/neoflow` once. That session connects
  to the open Neoflow for the same repository, including its subfolders and
  linked worktrees. From then on every Send in Neoflow goes directly to that
  session until the user disconnects it or the session ends.
- A session outside that repository is refused with a plain explanation. A
  session in another repository connects to that repository's own Neoflow.
  Connecting across repositories may come later; it needs a way to find
  running Neoflow windows.
- **One connected session per repository; the newest `/neoflow` wins.**
  Connecting a second session takes over the connection, and the first
  session is told it was disconnected. Neoflow never asks the user to pick a
  session.
- `/neoflow disconnect` ends the connection from the harness side.
- **Both connectors work in 0.1.0: Pi and Claude Code.** Pi's existing
  connect-once Direct route is the base. Claude Code uses the native Mod
  connector from WF-259, which is reopened and must finish its remaining
  acceptance, safety work included, for 0.1.0.
- The Claude Code host range is the 2.x family from the tested floor upward:
  `>=2.1.310 <3.0.0`, the oldest live-verified build (raised from `>=2.0.0`
  on 2026-11-13).
  `doctor` labels versions newer than the last live-verified one as
  "untested" (WF-257 amendment).
- Messages go as written. The answer comes back as the Response where the
  host can capture it reliably (Pi does today).

**Release gate (before publishing)**

1. The owner reviews with the packed build installed globally
   (`npm i -g ./buildframe-cli-0.1.0.tgz`), not the checkout, for about a week.
2. A clean install from the README alone, on a fresh macOS user account and on
   a Linux machine.
3. One complete round trip each from Claude Code and Pi against the installed
   build: `/neoflow` connects, Send reaches the session, and the Response
   comes back.

Nothing else from WF-050's candidate gate list is required for 0.1.0.

**After 0.1.0**

- Native Windows is the next platform goal. This reverses WF-015's post-v1
  placement; WSL2 is not pursued. It is estimated at 4–7 weeks, and the IPC
  transport, permission/ACL model, git inspection overlay and file
  locking/rename semantics are the large parts. The `node:ffi` + OpenTUI
  `win32` probe runs early, alongside this map, because a failure reopens
  WF-059's renderer decision.
- Curl bootstrap, Homebrew, Node 27, connecting across repositories.
- WF-213 and WF-214 (splitting the two 3.5k-line modules) wait until after
  the release.

## Children (to be filed)

1. ~~**Amend the plan of record.**~~ Done 2026-11-11, corrected 2026-11-12
   for the connect-once model: amendment notes in WF-051, WF-050, WF-015 and
   WF-257, and PRODUCT.md.
2. **Connection rules for both hosts.** Same repository only (subfolders and
   worktrees included) with a plain refusal otherwise; the newest `/neoflow`
   replaces the current connection and tells the old session; `/neoflow
   disconnect`; Neoflow never asks which session. Done 2026-11-12 in code:
   - When a session connects, the core releases every other live session.
   - The runtime sends a new `harness.adapter.released` frame and closes that
     connection as `replaced`.
   - Pi stops retrying and tells the user. The Claude helper detaches its Mod
     with the same reason.
   - Pi's messages for "not in a repository" and "Neoflow not open yet" are
     plain.

   Live check passed 2026-11-12 (owner, Pi 1.3.0, two sessions in one
   scratch repo). All ten cases passed: refused Send with nothing connected;
   connect and send; a second session takes over and the first is told; a
   send reaches the newest; the first takes it back; disconnect; a folder
   outside a repository; and connecting before Neoflow opens. Claude's side
   is covered by child 3.
3. ~~**Finish Claude Direct (WF-259).**~~ Done 2026-11-12; the owner's live checks passed and WF-259 is closed. Close the open acceptance items: the
   live bytes contract, runtime-to-Mod authorization and Native Dispatch
   Provenance (the adversarial matrix), reload, an interrupt control in the
   app, the historical-Review `review-basis-not-found` gap, Response capture
   if Claude exposes the answer reliably, and a production Resolution. The
   Mod's plugin becomes the one `neoflow` Claude plugin. Progress 2026-11-12
   (safety bar Q37: same-user programs are trusted, as for Pi):
   - The plugin is renamed `neoflow` and lives in `plugin/`.
   - Helper refusal tests cover every caller without the exact token.
   - Old Reviews explain `review-predates-messages`.
   - Live checks remain (see WF-259).
4. ~~**Remove Claude User Pull.**~~ Done 2026-11-12. Owner decision: the per-message
   `/neoflow:review` plugin and its status-line attach leave 0.1.0. The owner
   used them only in early testing, and the connect-once connector is the one
   Claude plugin. Remove the `plugin/` User Pull assets, the bridge commands
   that only it uses, and its tests and smoke. Close WF-251, WF-254, WF-255 and
   WF-256 as superseded. The Workspace User Pull lifecycle stays readable for
   any recorded history.
5. ~~**Live round trips.**~~ Done 2026-11-12. The owner's live round trips passed on Pi 1.3.0 and Claude Code 2.1.322. `risk:pi` now expects the pinned Pi and reads Pi 1.x's tool declarations from system messages; it passes on Pi 1.5.0 and 1.3.0. `risk:dogfood` matches the current Home, Review header, composer, preview, discard and outcome wording, and passes. Pi and Claude Code each connect with `/neoflow`,
   receive a Send, and return a Response, against the reviewed host ranges.
   Rewrite `risk:pi` and `risk:dogfood`. Both already failed before this
   work: `risk:pi` expects Pi 0.80.6 but the pinned Pi is 1.5.0, and
   `risk:dogfood` hangs on "Loading Home" at a00923a.
6. ~~**Node range and CI.**~~ Done 2026-11-13. CI run 43466473376 is green on
   all four jobs (0d2c272).
   - Engines (root, app, four packages) and the launcher check are
     `>=26.4.0 <27.0.0`. Node 26.6+ runs without the warning; 27.x warns and
     continues; below 26.4 is refused.
   - The 26.6 spawn slowdown is gone: `git --version` through `execFile`
     costs 6.9ms on 26.5.1, 7.6ms on 26.7.0 and 7.1ms on 26.13.1 (macOS,
     2026-11-13). The stale regression text is removed from
     `check-node-version.mjs` and the workflow.
   - CI runs `pnpm verify` on macOS and Ubuntu × Node 26.4.0 and 26.13.1
     (the newest 26.x, LTS). Development stays on 26.5.1 (`.nvmrc`).
   - The first matrix run failed one test on each 26.4.0 job, both timing
     flakes on slow runners: the paused-commit tests gave setup requests a
     100ms State limit (now 1s), and the Diff glide test used a fixed count
     instead of the notches it sent. Both held 12 runs under parallel load.
     One macOS job was later cancelled for lack of a runner and passed on
     rerun.
   Original scope: engines and the launcher check become `>=26.4 <27`, stale
   "26.6 regression" text is removed, and CI runs a macOS + Linux matrix on
   the oldest and newest 26.x.
7. ~~**`neoflow doctor` and readable failures.**~~ Done 2026-11-12, as `neoflow-dogfood doctor [--json]` until child 8 names the public bin. It is read-only and checks:
   - Node;
   - Neoflow's versions;
   - the repository;
   - the running background process, without starting one, flagging one from another build;
   - each part of the saved data;
   - connected agents;
   - the installed Pi and Claude Code against the app's support table, which a contract test keeps equal to both connectors' declarations.

   The failed screen now keeps its failure text, and an unreadable-data failure points to `doctor`. Original scope: `doctor`: read-only, with
   human and JSON output, scoped as above. Found 2026-11-12: when saved state
   can't be read, the app shows only "The Reviewing surface could not open".
   It should name the part that failed and the next step, and `doctor` should
   report it.
8. ~~**Release assembly.**~~ Done 2026-11-12 (`pnpm release:assemble`).

   Owner decisions on names and packaging (names superseded 2026-11-14 by the
   BuildFrame rename; see Notes):
   - Every package lives under an npm organization `@neoflow` that the owner creates, on the free plan, before publishing.
   - The app is `@neoflow/cli`, and its command is `neoflow`.
   - Pi is `@neoflow/pi`; its `pi-package` keyword lists it on pi.dev.
   - Claude Code is the `neoflow` plugin from the `neoflow` marketplace (`.claude-plugin/marketplace.json` in this repository).
   - Everything stays in this one repository on one version, and the internal code is bundled with esbuild 0.28.1, already in the lockfile through tsx.
   - LICENSE is MIT, "Copyright (c) 2026 JuanAn Aranda Triana".

   What `@neoflow/cli` contains:
   - `neoflow`, the runtime process, `neoflow-claude-helper`, and the State worker.
   - The bundle is split so that the launcher and the runtime share one chunk and fingerprint the same build.
   - OpenTUI and the tree-sitter grammars stay npm dependencies.

   What `@neoflow/pi` contains:
   - One bundle.
   - Pi's packages as `*` peers.

   The installed Claude plugin hands over to `neoflow-claude-helper` and says so when the CLI is missing. `support/manifest.json` is generated from the app's support facts (schema 2), and a test and the build smoke keep it in step.

   Checks the assembly runs:
   - only allowed files are published;
   - no private `@neoflow/*` imports remain;
   - every file loaded by `new URL('./…', import.meta.url)` is shipped;
   - every piece carries the same version;
   - packaged `--help` and `doctor --json` run;
   - `@neoflow/pi` loads.

   A live run of the packaged app started its runtime, read its State, and `doctor` recognised the runtime as the same build. Bundling first broke the State worker, which was a sibling file; the shipped-file check now guards against that. Original scope: A public `neoflow` bin (replacing
   `neoflow-dogfood`), package coordinates (recheck the unscoped names, else
   adopt the `@juantot9` fallback everywhere at once), versions, LICENSE and
   `license` fields, the `files` allowlist, packed-content and
   import-from-tarball checks, a real `support/manifest.json`, CHANGELOG, the
   `neoflow-pi` package, and the Claude `marketplace.json`.
9. ~~**Make the repository public.**~~ Done 2026-11-13. The owner published a
   fresh public `juantot9/neoflow` whose history starts at one commit,
   `Neoflow 0.1.0 preview`; the earlier history stays private. Prepared
   2026-11-13:
   - Personal absolute paths are removed from tracked files.
   - `.claude/` and `.pi/` are gitignored.
   - The full history was scanned for credential patterns; it holds none.
   - README is rewritten for public readers: install, connect, use, doctor,
     data, update and remove, then development.
   - HANDOFF and PRODUCT are refreshed.

   A public-readiness review the same day added `SECURITY.md`, an issue
   template, public npm metadata (`publishConfig`, `os`, `homepage`, `bugs`),
   `neoflow --version`, and an owner-private check on the shared `/tmp`
   runtime base. Original scope: Remove absolute personal paths from
   tracked files (`.impeccable/critique/*.md`, WF-149, the unused-export
   research note), have the owner review the release-coordinate ownership
   checklist (deleted 2026-11-13; it described private setup), gitignore `.claude/` and `.pi/`,
   write the README install guide (start Neoflow before the harness on the
   dev route: `pnpm dogfood` rebuilds `dist/` on launch), and refresh
   HANDOFF.md.
10. **Gate and publish.** From one clean commit, `pnpm release:assemble` and
    `npm pack` both packages, run the release gate above on those tarballs,
    then `npm publish` the same tarballs (as `latest`) and push the commit
    the plugin marketplace serves. Date the CHANGELOG entry first.

    Tarballs packed 2026-11-14 from 42f37ff (byte-identical on a second
    pack), SHA-256:
    - `buildframe-cli-0.1.0.tgz`
      `0f0c2571882f3a85d0e18cdbecfd32af64102d5a429dd36fe8021d55d085c587`
    - `buildframe-pi-0.1.0.tgz`
      `f3ed23d86195047b28d80cae7786235ad3a1ec15c3de2a722124903d94128722`

    A scratch global install from npmjs.com took 14s and gave `buildframe`,
    `bframe` and `buildframe-claude-helper`; `--version`, `--help` and
    `doctor --json` ran. `npm publish --dry-run` targets
    `https://registry.npmjs.org/` with public access for both packages; the
    registry is pinned in `publishConfig` because the owner's user `.npmrc`
    points at a company mirror. npm 11 skips the tree-sitter install scripts;
    BuildFrame uses the grammars' bundled `.wasm` files, so they aren't needed.

Order: 1 → (2, 3, 4) → 5 → 7 → 8 → 9 → 6 → 10. Child 9 must land before
child 6's CI, and both before child 10.

## Acceptance

- [ ] All children closed with their own recorded evidence.
- [ ] `@buildframe/cli@0.1.0`, `@buildframe/pi@0.1.0` and the
      Claude plugin `0.1.0` are published from one commit as `latest`.
- [ ] The release gate's three checks are recorded.
- [x] The source repository is public, and CI is green on macOS and Linux.

## Constraints

- Truthfulness rules hold: a Send commits before anything leaves Neoflow,
  nothing is replayed, an unresolved outcome stays unresolved, and no
  Response is fabricated.
- Removing code never removes user State, Configuration or legacy data.
- No placeholder npm publishes to hold a name.
- No Neoflow-owned network calls or telemetry (WF-050).

## Notes

- **2026-11-14 rename to BuildFrame.** The `@neoflow` npm organization
  belongs to another account, so the owner renamed the product before the
  first publish and created `@buildframe`. Packages: `@buildframe/cli`
  (commands `buildframe` and `bframe`) and `@buildframe/pi`; the Claude plugin
  and marketplace are `buildframe`; the repository is `juantot9/buildframe`;
  the slash command is `/buildframe`. State lives in `buildframe` folders.
  Kept as they were, because saved data or hashes depend on them: the
  `neoflow-…-v1` hash domain tags, the `neoflow.…/1` format names (except the
  doctor schema), `.git/neoflow-workspace-identity.json`, and the legacy
  `.neoflow/review.json` and `neoflow/workspaces/` import locations. Tickets
  and docs written before the rename keep the old name. The public history
  was squashed again into one commit, `BuildFrame 0.1.0 preview`.

- **2026-11-12 reversal.** On 2026-11-11 the owner's "work on the user pull"
  was read as pulling every message with a harness command, and six commits
  built that (4c47813, 0dbe390, 1a95eb1, b5ac517, 1af4b25, 77c253e). The owner
  meant connecting once from the harness and then sending directly. Commit
  386fac8 reverts all six, so the source is identical to a00923a, including
  the restored Claude Direct code.
